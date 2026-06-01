/**
 * QuickBooks Integration Test Suite
 * Tests OAuth flow, data sync, incremental sync, and error handling
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { IntegrationManager } from '../integrations/integration-factory';
import { QuickBooksIntegration } from '../integrations/quickbooks';
import { OAuthHandler } from '../integrations/oauth-handler';

// Mock setup
vi.mock('../integrations/oauth-handler');
vi.mock('../integrations/base', () => ({
  default: class BaseIntegration {
    protected tokens: any;
    protected setup: any;
    protected errorLog: any[] = [];
    
    constructor(setup: any) {
      this.setup = setup;
    }
    
    async ensureValidToken() {
      return true;
    }
    
    async saveTokens(tokens: any) {
      this.tokens = tokens;
    }
    
    recordError(error: any) {
      this.errorLog.push(error);
    }
    
    logAudit(action: string, data: any) {
      console.log(`[AUDIT] ${action}:`, data);
    }
    
    getErrors() {
      return this.errorLog;
    }
    
    getSyncStatus(jobId?: string) {
      return {
        id: jobId || 'job-123',
        status: 'completed',
        itemsProcessed: 100,
        itemsCreated: 95,
        itemsUpdated: 5,
        startedAt: new Date(),
        completedAt: new Date(),
      };
    }
    
    async retryWithBackoff(fn: () => Promise<any>) {
      return fn();
    }
  },
}));

describe('QuickBooks Integration', () => {
  let manager: IntegrationManager;
  let qbIntegration: QuickBooksIntegration;
  const testOrgId = 'org-test-123';
  const testIntegrationId = 'int-qb-test-123';

  beforeAll(async () => {
    // Initialize integration manager
    manager = new IntegrationManager({
      enableAutoSync: true,
      defaultSyncFrequency: 'daily',
      maxConcurrentSyncs: 5,
    });
  });

  afterAll(async () => {
    // Cleanup
    await manager.shutdown();
  });

  // =========================================================================
  // OAuth Flow Tests
  // =========================================================================

  describe('OAuth Flow', () => {
    it('should create QB integration instance', async () => {
      qbIntegration = await manager.createIntegration('quickbooks', testOrgId);

      expect(qbIntegration).toBeDefined();
      expect(qbIntegration.type).toBe('quickbooks');
      expect(qbIntegration.setup.orgId).toBe(testOrgId);
      expect(qbIntegration.setup.isConnected).toBe(false);
    });

    it('should generate authorization URL', async () => {
      const authUrl = await qbIntegration.getAuthorizationUrl();

      expect(authUrl).toBeDefined();
      expect(authUrl).toContain('oauth');
      expect(authUrl).toContain('client_id');
      expect(authUrl).toContain('redirect_uri');
      expect(authUrl).toContain('response_type=code');
    });

    it('should handle OAuth callback and extract tokens', async () => {
      const mockTokens = {
        access_token: 'mock_access_token_123',
        refresh_token: 'mock_refresh_token_456',
        expires_at: Date.now() + 3600000,
        token_type: 'Bearer',
      };

      // Mock OAuth handler
      vi.mocked(OAuthHandler).prototype.exchangeCodeForToken = vi
        .fn()
        .mockResolvedValue(mockTokens);

      const tokens = await qbIntegration.handleOAuthCallback(
        'auth_code_123',
        'state_token_456'
      );

      expect(tokens).toBeDefined();
      expect(tokens.access_token).toBe('mock_access_token_123');
      expect(qbIntegration.setup.isConnected).toBe(true);
      expect(qbIntegration.setup.connectionStatus).toBe('connected');
    });

    it('should test connection successfully', async () => {
      const isConnected = await qbIntegration.testConnection();
      expect(isConnected).toBe(true);
    });

    it('should fail when realm ID is not set', async () => {
      const newIntegration = new QuickBooksIntegration(
        'int-test-no-realm',
        testOrgId
      );

      const isConnected = await newIntegration.testConnection();
      expect(isConnected).toBe(false);
    });
  });

  // =========================================================================
  // Account Sync Tests
  // =========================================================================

  describe('Chart of Accounts Sync', () => {
    it('should sync 5+ accounts from QuickBooks', async () => {
      // Mock QB API response
      const mockQBResponse = {
        QueryResponse: {
          Account: [
            {
              Id: '1',
              Name: 'Checking Account',
              AcctNum: '1010',
              AccountType: 'Asset',
              CurrentBalance: 50000,
              Active: true,
            },
            {
              Id: '2',
              Name: 'Savings Account',
              AcctNum: '1020',
              AccountType: 'Asset',
              CurrentBalance: 100000,
              Active: true,
            },
            {
              Id: '3',
              Name: 'Accounts Payable',
              AcctNum: '2010',
              AccountType: 'Liability',
              CurrentBalance: -15000,
              Active: true,
            },
            {
              Id: '4',
              Name: 'Revenue',
              AcctNum: '4000',
              AccountType: 'Income',
              CurrentBalance: -250000,
              Active: true,
            },
            {
              Id: '5',
              Name: 'Operating Expenses',
              AcctNum: '5000',
              AccountType: 'Expense',
              CurrentBalance: 50000,
              Active: true,
            },
            {
              Id: '6',
              Name: 'Cost of Goods Sold',
              AcctNum: '5100',
              AccountType: 'Expense',
              CurrentBalance: 75000,
              Active: true,
            },
          ],
        },
      };

      // Mock executeQuery method
      vi.spyOn(qbIntegration as any, 'executeQuery').mockResolvedValue(
        mockQBResponse
      );

      const accounts = await qbIntegration.syncAccounts();

      expect(accounts).toBeDefined();
      expect(accounts.length).toBeGreaterThanOrEqual(5);
      expect(accounts[0]).toHaveProperty('id');
      expect(accounts[0]).toHaveProperty('name');
      expect(accounts[0]).toHaveProperty('code');
      expect(accounts[0]).toHaveProperty('type');
      expect(accounts[0]).toHaveProperty('externalId');
      expect(accounts[0].externalSource).toBe('quickbooks');
    });

    it('should map QB account types to Ledgr types', async () => {
      const mockQBResponse = {
        QueryResponse: {
          Account: [
            {
              Id: '1',
              Name: 'Bank',
              AcctNum: '1010',
              AccountType: 'Asset',
              Active: true,
            },
            {
              Id: '2',
              Name: 'Loan',
              AcctNum: '2010',
              AccountType: 'Liability',
              Active: true,
            },
            {
              Id: '3',
              Name: 'Retained Earnings',
              AcctNum: '3000',
              AccountType: 'Equity',
              Active: true,
            },
            {
              Id: '4',
              Name: 'Sales',
              AcctNum: '4000',
              AccountType: 'Income',
              Active: true,
            },
            {
              Id: '5',
              Name: 'Salaries',
              AcctNum: '5000',
              AccountType: 'Expense',
              Active: true,
            },
          ],
        },
      };

      vi.spyOn(qbIntegration as any, 'executeQuery').mockResolvedValue(
        mockQBResponse
      );

      const accounts = await qbIntegration.syncAccounts();

      const typeMap = accounts.reduce((acc, account) => {
        acc[account.code] = account.type;
        return acc;
      }, {} as Record<string, any>);

      expect(typeMap['1010']).toBe('asset');
      expect(typeMap['2010']).toBe('liability');
      expect(typeMap['3000']).toBe('equity');
      expect(typeMap['4000']).toBe('income');
      expect(typeMap['5000']).toBe('expense');
    });

    it('should skip inactive accounts', async () => {
      const mockQBResponse = {
        QueryResponse: {
          Account: [
            {
              Id: '1',
              Name: 'Active Account',
              AcctNum: '1010',
              AccountType: 'Asset',
              Active: true,
            },
            {
              Id: '2',
              Name: 'Inactive Account',
              AcctNum: '1020',
              AccountType: 'Asset',
              Active: false,
            },
          ],
        },
      };

      vi.spyOn(qbIntegration as any, 'executeQuery').mockResolvedValue(
        mockQBResponse
      );

      const accounts = await qbIntegration.syncAccounts();

      expect(accounts.length).toBe(1);
      expect(accounts[0].isActive).toBe(true);
    });
  });

  // =========================================================================
  // Invoice & Bill Sync Tests
  // =========================================================================

  describe('Invoice Sync', () => {
    it('should sync invoices from QuickBooks', async () => {
      const mockQBResponse = {
        QueryResponse: {
          Invoice: [
            {
              Id: 'inv-1',
              DocNumber: 'INV-001',
              TxnDate: '2026-01-15',
              DueDate: '2026-02-15',
              TotalAmt: 10000,
              Balance: 0,
              DocStatus: 'Submitted',
              CustomerRef: { value: 'cust-1', name: 'Customer One' },
              Line: [
                {
                  Id: '1',
                  Description: 'Service',
                  Amount: 10000,
                  AccountRef: { value: '4000' },
                },
              ],
            },
            {
              Id: 'inv-2',
              DocNumber: 'INV-002',
              TxnDate: '2026-01-20',
              DueDate: '2026-02-20',
              TotalAmt: 5000,
              Balance: 5000,
              DocStatus: 'Submitted',
              CustomerRef: { value: 'cust-2', name: 'Customer Two' },
              Line: [
                {
                  Id: '2',
                  Description: 'Product',
                  Amount: 5000,
                  AccountRef: { value: '4000' },
                },
              ],
            },
          ],
        },
      };

      vi.spyOn(qbIntegration as any, 'executeQuery').mockResolvedValue(
        mockQBResponse
      );

      const invoices = await qbIntegration.syncInvoices();

      expect(invoices).toBeDefined();
      expect(invoices.length).toBe(2);
      expect(invoices[0]).toHaveProperty('invoiceNumber');
      expect(invoices[0]).toHaveProperty('customerId');
      expect(invoices[0]).toHaveProperty('lineItems');
      expect(invoices[0].externalSource).toBe('quickbooks');
      expect(invoices[0].paymentStatus).toBe('paid'); // Balance = 0
      expect(invoices[1].paymentStatus).toBe('unpaid'); // Balance = Total
    });

    it('should support incremental invoice sync', async () => {
      const mockQBResponse = {
        QueryResponse: {
          Invoice: [
            {
              Id: 'inv-new-1',
              DocNumber: 'INV-003',
              TxnDate: '2026-05-20',
              DueDate: '2026-06-20',
              TotalAmt: 7500,
              Balance: 0,
              DocStatus: 'Submitted',
              CustomerRef: { value: 'cust-3', name: 'Customer Three' },
              Line: [],
            },
          ],
        },
      };

      vi.spyOn(qbIntegration as any, 'executeQuery').mockResolvedValue(
        mockQBResponse
      );

      const sinceTimestamp = new Date('2026-05-01').getTime();
      const invoices = await qbIntegration.syncInvoices(sinceTimestamp);

      expect(invoices).toBeDefined();
      expect(invoices.length).toBe(1);
      expect(invoices[0].invoiceNumber).toBe('INV-003');
    });
  });

  describe('Bill Sync', () => {
    it('should sync bills from QuickBooks', async () => {
      const mockQBResponse = {
        QueryResponse: {
          Bill: [
            {
              Id: 'bill-1',
              DocNumber: 'BILL-001',
              TxnDate: '2026-01-10',
              DueDate: '2026-02-10',
              TotalAmt: 3000,
              Balance: 0,
              DocStatus: 'Submitted',
              VendorRef: { value: 'vendor-1', name: 'Vendor One' },
              Line: [
                {
                  Id: '1',
                  Description: 'Supplies',
                  Amount: 3000,
                  AccountRef: { value: '5000' },
                },
              ],
            },
          ],
        },
      };

      vi.spyOn(qbIntegration as any, 'executeQuery').mockResolvedValue(
        mockQBResponse
      );

      const bills = await qbIntegration.syncBills();

      expect(bills).toBeDefined();
      expect(bills.length).toBe(1);
      expect(bills[0]).toHaveProperty('billNumber');
      expect(bills[0]).toHaveProperty('vendorId');
      expect(bills[0].externalSource).toBe('quickbooks');
    });
  });

  // =========================================================================
  // Transaction Sync Tests
  // =========================================================================

  describe('Transaction Sync', () => {
    it('should synthesize 20+ transactions from invoices and bills', async () => {
      // Mock invoices response
      const mockInvoicesResponse = {
        QueryResponse: {
          Invoice: Array.from({ length: 12 }, (_, i) => ({
            Id: `inv-${i}`,
            DocNumber: `INV-${String(i).padStart(3, '0')}`,
            TxnDate: `2026-0${Math.floor(i / 3) + 1}-${String((i % 3) * 10 + 1).padStart(2, '0')}`,
            DueDate: `2026-0${Math.floor(i / 3) + 2}-${String((i % 3) * 10 + 1).padStart(2, '0')}`,
            TotalAmt: (i + 1) * 1000,
            Balance: 0,
            DocStatus: 'Submitted',
            CustomerRef: { value: `cust-${i}`, name: `Customer ${i}` },
            Line: [{ Id: '1', Description: 'Service', Amount: (i + 1) * 1000 }],
          })),
        },
      };

      // Mock bills response
      const mockBillsResponse = {
        QueryResponse: {
          Bill: Array.from({ length: 10 }, (_, i) => ({
            Id: `bill-${i}`,
            DocNumber: `BILL-${String(i).padStart(3, '0')}`,
            TxnDate: `2026-0${Math.floor(i / 3) + 1}-${String((i % 3) * 10 + 5).padStart(2, '0')}`,
            DueDate: `2026-0${Math.floor(i / 3) + 2}-${String((i % 3) * 10 + 5).padStart(2, '0')}`,
            TotalAmt: (i + 1) * 500,
            Balance: 0,
            DocStatus: 'Submitted',
            VendorRef: { value: `vendor-${i}`, name: `Vendor ${i}` },
            Line: [{ Id: '1', Description: 'Expense', Amount: (i + 1) * 500 }],
          })),
        },
      };

      const executeQuerySpy = vi.spyOn(
        qbIntegration as any,
        'executeQuery'
      );
      executeQuerySpy.mockResolvedValueOnce(mockInvoicesResponse);
      executeQuerySpy.mockResolvedValueOnce(mockBillsResponse);

      const transactions = await qbIntegration.syncTransactions();

      expect(transactions).toBeDefined();
      expect(transactions.length).toBeGreaterThanOrEqual(20);
      expect(transactions.length).toBe(22); // 12 invoices + 10 bills

      // Verify invoice transactions
      const invoiceTransactions = transactions.filter(t => t.type === 'invoice');
      expect(invoiceTransactions.length).toBe(12);

      // Verify bill transactions
      const billTransactions = transactions.filter(t => t.type === 'bill');
      expect(billTransactions.length).toBe(10);

      // Verify all transactions have required fields
      transactions.forEach(tx => {
        expect(tx).toHaveProperty('id');
        expect(tx).toHaveProperty('externalId');
        expect(tx).toHaveProperty('type');
        expect(tx).toHaveProperty('date');
        expect(tx).toHaveProperty('amount');
        expect(tx).toHaveProperty('description');
        expect(tx.externalSource).toBe('quickbooks');
      });
    });

    it('should support incremental transaction sync', async () => {
      const mockInvoicesResponse = {
        QueryResponse: { Invoice: [] },
      };

      const mockBillsResponse = {
        QueryResponse: {
          Bill: [
            {
              Id: 'bill-new',
              DocNumber: 'BILL-101',
              TxnDate: '2026-05-25',
              DueDate: '2026-06-25',
              TotalAmt: 2000,
              Balance: 0,
              DocStatus: 'Submitted',
              VendorRef: { value: 'vendor-new', name: 'New Vendor' },
              Line: [{ Id: '1', Description: 'New Expense', Amount: 2000 }],
            },
          ],
        },
      };

      const executeQuerySpy = vi.spyOn(
        qbIntegration as any,
        'executeQuery'
      );
      executeQuerySpy.mockResolvedValueOnce(mockInvoicesResponse);
      executeQuerySpy.mockResolvedValueOnce(mockBillsResponse);

      const sinceTimestamp = new Date('2026-05-01').getTime();
      const transactions = await qbIntegration.syncTransactions(sinceTimestamp);

      expect(transactions.length).toBe(1);
      expect(transactions[0].type).toBe('bill');
    });
  });

  // =========================================================================
  // Integration Management Tests
  // =========================================================================

  describe('Integration Manager', () => {
    it('should create and list integrations', async () => {
      const testIntegration = await manager.createIntegration(
        'quickbooks',
        'org-list-test'
      );

      const integrations = manager.listIntegrations('org-list-test');

      expect(integrations.length).toBeGreaterThan(0);
      expect(
        integrations.some(i => i.id === testIntegration.id)
      ).toBe(true);
    });

    it('should schedule sync frequency', async () => {
      const testIntegration = await manager.createIntegration(
        'quickbooks',
        'org-schedule-test'
      );

      // Manually set as connected for scheduling
      testIntegration.setup.isConnected = true;

      await manager.scheduleSync(testIntegration.id, 'daily');

      expect(testIntegration.setup.syncSettings.syncFrequency).toBe('daily');
      expect(testIntegration.setup.syncSettings.autoSync).toBe(true);
    });

    it('should trigger manual sync', async () => {
      const testIntegration = await manager.createIntegration(
        'quickbooks',
        'org-sync-test'
      );

      testIntegration.setup.isConnected = true;

      const job = await manager.triggerSync(testIntegration.id, 'user-123');

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.status).toBeDefined();
    });

    it('should get integration statistics', async () => {
      // Create test integrations
      await manager.createIntegration('quickbooks', 'org-stats-test');

      const stats = manager.getStats();

      expect(stats).toHaveProperty('totalIntegrations');
      expect(stats).toHaveProperty('integrationsByType');
      expect(stats).toHaveProperty('activeSchedules');
      expect(stats).toHaveProperty('queueSize');
      expect(stats.totalIntegrations).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    it('should handle account sync errors', async () => {
      const errorIntegration = new QuickBooksIntegration(
        'int-error-test',
        'org-error-test'
      );

      vi.spyOn(errorIntegration as any, 'executeQuery').mockRejectedValue(
        new Error('API rate limited')
      );

      try {
        await errorIntegration.syncAccounts();
      } catch (error) {
        expect(error).toBeDefined();
      }

      const errors = errorIntegration.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe('QB_SYNC_ACCOUNTS_ERROR');
    });

    it('should handle invoice sync errors gracefully', async () => {
      const errorIntegration = new QuickBooksIntegration(
        'int-invoice-error-test',
        'org-error-test'
      );

      vi.spyOn(errorIntegration as any, 'executeQuery').mockRejectedValue(
        new Error('Authentication failed')
      );

      try {
        await errorIntegration.syncInvoices();
      } catch (error) {
        expect(error).toBeDefined();
      }

      const errors = errorIntegration.getErrors();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should record errors with proper context', async () => {
      const errorIntegration = new QuickBooksIntegration(
        'int-context-test',
        'org-error-test'
      );

      vi.spyOn(errorIntegration as any, 'executeQuery').mockRejectedValue(
        new Error('Connection timeout')
      );

      try {
        await errorIntegration.syncBills();
      } catch (error) {
        // Error is expected
      }

      const errors = errorIntegration.getErrors();
      expect(errors[0]).toHaveProperty('code');
      expect(errors[0]).toHaveProperty('message');
      expect(errors[0]).toHaveProperty('timestamp');
      expect(errors[0]).toHaveProperty('context');
    });
  });
});
