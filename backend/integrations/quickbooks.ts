/**
 * QuickBooks Online Integration
 * OAuth 2.0, transaction sync, invoice/bill management, real-time webhooks
 * Production-ready implementation for Ledgr accounting platform
 */

import BaseIntegration, { Logger } from './base';
import { OAuthHandler, getOAuthConfig, HttpClient } from './oauth-handler';
import {
  OAuthToken,
  IntegrationSetup,
  CompanyInfo,
  ChartOfAccount,
  Invoice,
  Bill,
  Transaction,
  LineItem,
  BankAccount,
  BankTransaction,
  IntegrationError,
} from './integration-types';

/**
 * QuickBooks OAuth configuration
 * Includes client credentials, endpoints, and OAuth flow settings
 */
export const QB_OAUTH_CONFIG = {
  clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
  redirectUri: `${process.env.API_URL}/v1/integrations/quickbooks/callback`,
  authorizationEndpoint: 'https://appcenter.intuit.com/connect/oauth2',
  tokenEndpoint: 'https://oauth.platform.intuit.com/oauth2/tokens',
  scope: 'com.intuit.quickbooks.accounting',
  state: '', // Generated per request
};

export class QuickBooksIntegration extends BaseIntegration {
  private oauthHandler: OAuthHandler;
  private httpClient: HttpClient;
  private realmId?: string; // QB tenant/organization ID
  private baseUrl = 'https://quickbooks.api.intuit.com/v2/company';
  private logger: Logger;

  constructor(integrationId: string, orgId: string) {
    const setup: IntegrationSetup = {
      integrationId,
      orgId,
      type: 'quickbooks',
      config: {},
      syncSettings: {
        autoSync: true,
        syncFrequency: 'daily',
        retryOnError: true,
        maxRetries: 3,
      },
      isConnected: false,
      connectionStatus: 'disconnected',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    super(setup);

    const config = getOAuthConfig('quickbooks');
    this.oauthHandler = new OAuthHandler(config);
    this.httpClient = new HttpClient();
    this.logger = new Logger('QuickBooksIntegration');
  }

  get type(): string {
    return 'quickbooks';
  }

  get id(): string {
    return this.setup.integrationId;
  }

  // ========================================================================
  // OAuth & Connection
  // ========================================================================

  /**
   * Generate OAuth authorization URL for user consent flow
   */
  async getAuthorizationUrl(): Promise<string> {
    return this.oauthHandler.getAuthorizationUrl(this.setup.integrationId);
  }

  /**
   * Handle OAuth callback after user authorizes
   * Exchange authorization code for tokens and extract realm ID
   */
  async handleOAuthCallback(code: string, state: string): Promise<OAuthToken> {
    try {
      const tokens = await this.oauthHandler.exchangeCodeForToken(
        code,
        state,
        this.setup.integrationId
      );

      this.tokens = tokens;
      await this.saveTokens(tokens);

      // Extract realm ID from OAuth response context
      // QB requires realm ID for all API calls
      this.realmId = this.extractRealmIdFromTokenResponse(tokens);
      if (!this.realmId) {
        throw new Error('Failed to extract realm ID from OAuth response');
      }

      this.setup.isConnected = true;
      this.setup.connectionStatus = 'connected';
      this.setup.tokens = tokens;

      this.logAudit('oauth_connected', {
        integrationId: this.setup.integrationId,
        realmId: this.realmId,
      });

      return tokens;
    } catch (error) {
      this.setup.connectionStatus = 'error';
      this.recordError({
        code: 'QB_OAUTH_FAILED',
        message: `OAuth callback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId: this.setup.integrationId },
      });
      throw error;
    }
  }

  /**
   * Test connection by fetching company info
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.ensureValidToken();
      if (!this.realmId) {
        this.logger.warn('Connection test skipped: realm ID not set');
        return false;
      }

      await this.getCompanyInfo();
      this.logger.info('Connection test successful', {
        integrationId: this.setup.integrationId,
      });
      return true;
    } catch (error) {
      this.logger.error('Connection test failed', {
        integrationId: this.setup.integrationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Disconnect integration and revoke tokens
   */
  async disconnect(): Promise<void> {
    try {
      // Revoke tokens with QB API
      if (this.tokens?.refresh_token) {
        await this.revokeTokens(this.tokens.refresh_token);
      }

      this.setup.isConnected = false;
      this.setup.connectionStatus = 'disconnected';
      this.logAudit('oauth_disconnected', {
        integrationId: this.setup.integrationId,
      });
    } catch (error) {
      this.logger.warn('Token revocation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with disconnect even if revocation fails
      this.setup.isConnected = false;
      this.setup.connectionStatus = 'disconnected';
    }
  }

  // ========================================================================
  // Data Sync Methods
  // ========================================================================

  /**
   * Sync company information from QuickBooks
   */
  async syncCompanyInfo(): Promise<CompanyInfo> {
    await this.ensureValidToken();
    if (!this.realmId) throw new Error('Realm ID not set');

    try {
      const info = await this.getCompanyInfo();
      this.logger.info('Company info synced', {
        integrationId: this.setup.integrationId,
        companyName: info.name,
      });
      return info;
    } catch (error) {
      this.recordError({
        code: 'QB_SYNC_COMPANY_ERROR',
        message: `Failed to sync company info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId: this.setup.integrationId },
      });
      throw error;
    }
  }

  /**
   * Sync chart of accounts from QuickBooks
   * Maps QB account types to Ledgr types: asset, liability, equity, income, expense
   */
  async syncAccounts(): Promise<ChartOfAccount[]> {
    await this.ensureValidToken();
    if (!this.realmId) throw new Error('Realm ID not set');

    try {
      const query = "SELECT * FROM Account WHERE Active = true";
      const response = await this.executeQuery(query);

      const accounts = (response.QueryResponse?.Account || []).map((account: any) => ({
        id: `qb-${account.Id}`,
        name: account.Name,
        code: account.AcctNum || '',
        type: this.mapAccountType(account.AccountType),
        subType: account.AccountSubType,
        balance: account.CurrentBalance || 0,
        currency: 'AED',
        isActive: account.Active !== false,
        externalId: account.Id,
        externalSource: 'quickbooks',
        description: account.Description || '',
      }));

      this.logger.info('Accounts synced', {
        integrationId: this.setup.integrationId,
        count: accounts.length,
      });

      return accounts;
    } catch (error) {
      this.recordError({
        code: 'QB_SYNC_ACCOUNTS_ERROR',
        message: `Failed to sync accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId: this.setup.integrationId },
      });
      throw error;
    }
  }

  /**
   * Sync invoices from QuickBooks
   * Supports incremental sync with since timestamp
   */
  async syncInvoices(since?: number): Promise<Invoice[]> {
    await this.ensureValidToken();
    if (!this.realmId) throw new Error('Realm ID not set');

    try {
      let query = 'SELECT * FROM Invoice';
      if (since) {
        const sinceDate = new Date(since).toISOString().split('T')[0];
        query += ` WHERE MetaData.UpdatedTime >= '${sinceDate}'`;
      }

      const response = await this.executeQuery(query);

      const invoices = (response.QueryResponse?.Invoice || []).map((invoice: any) => ({
        id: `qb-inv-${invoice.Id}`,
        externalId: invoice.Id,
        externalSource: 'quickbooks',
        orgId: this.setup.orgId,
        invoiceNumber: invoice.DocNumber,
        date: new Date(invoice.TxnDate).getTime(),
        dueDate: invoice.DueDate ? new Date(invoice.DueDate).getTime() : undefined,
        amount: invoice.TotalAmt,
        currency: 'AED',
        customerId: invoice.CustomerRef?.value,
        customerName: invoice.CustomerRef?.name,
        customerEmail: invoice.BillEmail?.Address,
        lineItems: (invoice.Line || []).map((line: any) => ({
          id: line.Id,
          description: line.Description,
          amount: line.Amount,
          quantity: line.Qty,
          unitPrice: line.UnitPrice,
          accountId: line.AccountRef?.value,
        })),
        subtotal: invoice.SubTotalAmt || 0,
        taxAmount: invoice.TaxDetail?.TotalTaxAmount || 0,
        totalAmount: invoice.TotalAmt,
        status: this.mapInvoiceStatus(invoice.DocStatus),
        paidAmount: invoice.Balance ? invoice.TotalAmt - invoice.Balance : 0,
        paymentStatus: this.mapPaymentStatus(invoice.Balance, invoice.TotalAmt),
        notes: invoice.CustomerMemo?.value,
        syncedAt: Date.now(),
      }));

      this.logger.info('Invoices synced', {
        integrationId: this.setup.integrationId,
        count: invoices.length,
      });

      return invoices;
    } catch (error) {
      this.recordError({
        code: 'QB_SYNC_INVOICES_ERROR',
        message: `Failed to sync invoices: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId: this.setup.integrationId },
      });
      throw error;
    }
  }

  /**
   * Sync bills from QuickBooks
   * Supports incremental sync with since timestamp
   */
  async syncBills(since?: number): Promise<Bill[]> {
    await this.ensureValidToken();
    if (!this.realmId) throw new Error('Realm ID not set');

    try {
      let query = 'SELECT * FROM Bill';
      if (since) {
        const sinceDate = new Date(since).toISOString().split('T')[0];
        query += ` WHERE MetaData.UpdatedTime >= '${sinceDate}'`;
      }

      const response = await this.executeQuery(query);

      const bills = (response.QueryResponse?.Bill || []).map((bill: any) => ({
        id: `qb-bill-${bill.Id}`,
        externalId: bill.Id,
        externalSource: 'quickbooks',
        orgId: this.setup.orgId,
        billNumber: bill.DocNumber,
        date: new Date(bill.TxnDate).getTime(),
        dueDate: bill.DueDate ? new Date(bill.DueDate).getTime() : undefined,
        amount: bill.TotalAmt,
        currency: 'AED',
        vendorId: bill.VendorRef?.value,
        vendorName: bill.VendorRef?.name,
        vendorEmail: '',
        lineItems: (bill.Line || []).map((line: any) => ({
          id: line.Id,
          description: line.Description,
          amount: line.Amount,
          quantity: line.Qty,
          unitPrice: line.UnitPrice,
          accountId: line.AccountRef?.value,
        })),
        subtotal: bill.SubTotalAmt || 0,
        taxAmount: bill.TaxDetail?.TotalTaxAmount || 0,
        totalAmount: bill.TotalAmt,
        status: this.mapBillStatus(bill.DocStatus),
        paidAmount: bill.Balance ? bill.TotalAmt - bill.Balance : 0,
        paymentStatus: this.mapPaymentStatus(bill.Balance, bill.TotalAmt),
        notes: bill.PrivateNote?.value,
        syncedAt: Date.now(),
      }));

      this.logger.info('Bills synced', {
        integrationId: this.setup.integrationId,
        count: bills.length,
      });

      return bills;
    } catch (error) {
      this.recordError({
        code: 'QB_SYNC_BILLS_ERROR',
        message: `Failed to sync bills: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId: this.setup.integrationId },
      });
      throw error;
    }
  }

  /**
   * Sync transactions synthesized from invoices and bills
   * QB doesn't expose transactions directly; we create unified view
   */
  async syncTransactions(since?: number): Promise<Transaction[]> {
    const invoices = await this.syncInvoices(since);
    const bills = await this.syncBills(since);

    const transactions: Transaction[] = [];

    // Synthesize invoice transactions
    invoices.forEach((inv) => {
      transactions.push({
        id: `qb-txn-inv-${inv.externalId}`,
        externalId: inv.externalId,
        externalSource: 'quickbooks',
        orgId: this.setup.orgId,
        type: 'invoice',
        date: inv.date,
        amount: inv.totalAmount,
        currency: inv.currency,
        description: `Invoice ${inv.invoiceNumber}`,
        referenceNumber: inv.invoiceNumber,
        accountId: 'accounts-receivable',
        contactId: inv.customerId,
        lineItems: inv.lineItems,
        status: inv.status === 'paid' ? 'cleared' : 'posted',
        syncedAt: Date.now(),
      });
    });

    // Synthesize bill transactions
    bills.forEach((bill) => {
      transactions.push({
        id: `qb-txn-bill-${bill.externalId}`,
        externalId: bill.externalId,
        externalSource: 'quickbooks',
        orgId: this.setup.orgId,
        type: 'bill',
        date: bill.date,
        amount: bill.totalAmount,
        currency: bill.currency,
        description: `Bill ${bill.billNumber}`,
        referenceNumber: bill.billNumber,
        accountId: 'accounts-payable',
        contactId: bill.vendorId,
        lineItems: bill.lineItems,
        status: bill.status === 'paid' ? 'cleared' : 'posted',
        syncedAt: Date.now(),
      });
    });

    this.logger.info('Transactions synced', {
      integrationId: this.setup.integrationId,
      count: transactions.length,
    });

    return transactions;
  }

  /**
   * Push transaction to QuickBooks
   */
  async pushTransaction(transaction: Transaction): Promise<string> {
    await this.ensureValidToken();
    if (!this.realmId) throw new Error('Realm ID not set');

    try {
      const qbTransaction = this.mapToQBTransaction(transaction);
      const response = await this.createTransaction(
        transaction.type,
        qbTransaction
      );

      this.logAudit('transaction_pushed', {
        integrationId: this.setup.integrationId,
        transactionId: transaction.id,
        externalId: response.id,
      });

      return response.id;
    } catch (error) {
      this.recordError({
        code: 'QB_PUSH_TRANSACTION_ERROR',
        message: `Failed to push transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: {
          integrationId: this.setup.integrationId,
          transactionId: transaction.id,
        },
      });
      throw error;
    }
  }

  /**
   * Bank accounts not directly supported by QB API
   */
  async syncBankAccounts(): Promise<BankAccount[]> {
    this.logger.warn('Bank accounts sync not supported for QuickBooks');
    return [];
  }

  /**
   * Bank transactions not directly supported by QB API
   */
  async syncBankTransactions(since?: number): Promise<BankTransaction[]> {
    this.logger.warn('Bank transactions sync not supported for QuickBooks');
    return [];
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Fetch company information from QB
   */
  private async getCompanyInfo(): Promise<CompanyInfo> {
    const query = 'SELECT * FROM CompanyInfo';
    const response = await this.executeQuery(query);
    const company = response.QueryResponse?.CompanyInfo?.[0];

    if (!company) {
      throw new Error('Company info not found');
    }

    return {
      id: company.Id,
      externalId: company.Id,
      externalSource: 'quickbooks',
      name: company.CompanyName,
      displayName: company.CompanyName,
      registrationNumber: company.CompanyStartDate || '',
      taxId: '',
      taxEnabled: true,
      email: company.PrimaryPhone?.FreeFormNumber,
      country: 'AE',
      baseCurrency: company.Currency?.value || 'AED',
      supportedCurrencies: ['AED'],
      accountingMethod: 'accrual',
      syncedAt: Date.now(),
    };
  }

  /**
   * Execute QB Query Language query
   */
  private async executeQuery(query: string): Promise<any> {
    if (!this.realmId) throw new Error('Realm ID not set');

    const encodedQuery = encodeURIComponent(query);
    const url = `${this.baseUrl}/${this.realmId}/query?query=${encodedQuery}`;

    return this.retryWithBackoff(() =>
      this.httpClient.get(
        url,
        this.getAuthHeaders()
      )
    );
  }

  /**
   * Create transaction (invoice, bill, etc.) in QB
   */
  private async createTransaction(
    type: string,
    transaction: any
  ): Promise<any> {
    if (!this.realmId) throw new Error('Realm ID not set');

    const url = `${this.baseUrl}/${this.realmId}/${type.toLowerCase()}`;

    return this.retryWithBackoff(() =>
      this.httpClient.post(
        url,
        transaction,
        this.getAuthHeaders()
      )
    );
  }

  /**
   * Get authorization headers for API calls
   */
  private getAuthHeaders(): Record<string, string> {
    if (!this.tokens) throw new Error('No tokens available');
    return {
      Authorization: `Bearer ${this.tokens.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Map QB account type to Ledgr type
   */
  private mapAccountType(
    qbType: string
  ): 'asset' | 'liability' | 'equity' | 'income' | 'expense' {
    const typeMap: Record<string, any> = {
      Asset: 'asset',
      Liability: 'liability',
      Equity: 'equity',
      Income: 'income',
      Expense: 'expense',
    };
    return typeMap[qbType] || 'asset';
  }

  /**
   * Map QB invoice status to Ledgr status
   */
  private mapInvoiceStatus(
    docStatus: string
  ): 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled' {
    const map: Record<string, any> = {
      Draft: 'draft',
      Submitted: 'sent',
      EmailSent: 'sent',
    };
    return map[docStatus] || 'sent';
  }

  /**
   * Map QB bill status to Ledgr status
   */
  private mapBillStatus(
    docStatus: string
  ): 'draft' | 'open' | 'overdue' | 'paid' | 'cancelled' {
    const map: Record<string, any> = {
      Draft: 'draft',
      Submitted: 'open',
    };
    return map[docStatus] || 'open';
  }

  /**
   * Determine payment status based on balance
   */
  private mapPaymentStatus(
    balance: number | undefined,
    total: number
  ): 'unpaid' | 'partially_paid' | 'paid' {
    if (!balance || balance === 0) return 'paid';
    if (balance >= total) return 'unpaid';
    return 'partially_paid';
  }

  /**
   * Map Ledgr transaction format to QB format
   */
  private mapToQBTransaction(transaction: Transaction): any {
    return {
      DocNumber: transaction.referenceNumber,
      TxnDate: new Date(transaction.date).toISOString().split('T')[0],
      Description: transaction.description,
      Line: transaction.lineItems.map((line: any) => ({
        Description: line.description,
        DetailType: 'LineDetail',
        Amount: line.amount,
        AccountRef: { value: line.accountId },
      })),
    };
  }

  /**
   * Extract realm ID from OAuth response
   * Realm ID is required for all QB API calls
   */
  private extractRealmIdFromTokenResponse(token: OAuthToken): string | undefined {
    // Realm ID is typically stored in the token response metadata
    // It may be in the extra_parameters field or should be fetched separately
    return (token as any).realmId || (token as any).realm_id;
  }

  /**
   * Revoke tokens with QB API
   */
  private async revokeTokens(refreshToken: string): Promise<void> {
    try {
      await this.httpClient.post(
        QB_OAUTH_CONFIG.tokenEndpoint,
        {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: QB_OAUTH_CONFIG.clientId,
          client_secret: QB_OAUTH_CONFIG.clientSecret,
        },
        { 'Content-Type': 'application/x-www-form-urlencoded' }
      );
    } catch (error) {
      this.logger.warn('Failed to revoke tokens', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Perform token refresh using refresh_token grant
   */
  protected async performTokenRefresh(refreshToken: string): Promise<OAuthToken> {
    const response = await this.httpClient.post(
      QB_OAUTH_CONFIG.tokenEndpoint,
      {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: QB_OAUTH_CONFIG.clientId,
        client_secret: QB_OAUTH_CONFIG.clientSecret,
      },
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );

    return {
      access_token: response.access_token,
      refresh_token: response.refresh_token || refreshToken,
      expires_at: Date.now() + response.expires_in * 1000,
      token_type: response.token_type || 'Bearer',
    };
  }
}

export default QuickBooksIntegration;
