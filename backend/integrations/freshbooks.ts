// FreshBooks Integration Handler
// Implements OAuth 2.0 Client Credentials flow with FreshBooks API v3
// Supports invoice/bill management, transaction sync, account hierarchy

import { BaseIntegration } from './base';
import { 
  IIntegrationService, 
  OAuthToken, 
  CompanyInfo, 
  ChartOfAccount, 
  Invoice, 
  Bill, 
  Transaction,
  SyncJob,
  SyncError
} from './integration-types';
import { OAuthHandler } from './oauth-handler';
import { HttpClient } from './oauth-handler';

/**
 * FreshBooks Integration Service
 * API: v3 REST API (https://api.freshbooks.com/accounting/account/...)
 * 
 * Authentication: OAuth 2.0 Authorization Code flow
 * Base URL: https://api.freshbooks.com/accounting/account/{accountId}/...
 * 
 * Key Concepts:
 * - Account ID required for all API calls (obtained from /me endpoint)
 * - Invoices (outgoing), Bills (incoming, expense tracking)
 * - Categories for expense tracking (Maps to Chart of Accounts)
 * - Clients/Vendors for parties
 * - Line items support quantity, rate, tax
 * 
 * Limitations:
 * - No direct bank account sync (uses transaction categorization)
 * - Bill status: 'draft', 'submitted', 'accepted', 'partially_paid', 'paid', 'auto_paid', 'overdue'
 * - No real-time webhook support for all data types
 */

interface FreshBooksAccount {
  id: number;
  name: string;
  currency: string;
  businessType?: string;
}

interface FreshBooksResponse<T> {
  response: {
    result: T;
  };
}

interface FreshBooksInvoice {
  id: number;
  accountid: number;
  invoice_number: string;
  customerid: number;
  customer: {
    id: number;
    fname: string;
    lname: string;
    email: string;
  };
  date: string;
  due_date?: string;
  amount: number;
  status: string; // 'draft', 'sent', 'viewed', 'partial', 'paid', 'overdue'
  lines: Array<{
    id: number;
    amount: number;
    description: string;
    quantity: number;
    unitcost: number;
    taxname1?: string;
    tax1: number;
  }>;
  notes?: string;
}

interface FreshBooksBill {
  id: number;
  accountid: number;
  billnumber: string;
  vendorid: number;
  vendor: {
    id: number;
    fname: string;
    lname: string;
    email: string;
  };
  date: string;
  due_date?: string;
  amount: number;
  status: string;
  lines: Array<{
    id: number;
    amount: number;
    description: string;
    categoryid: number;
    quantity: number;
    unitcost: number;
    taxname1?: string;
    tax1: number;
  }>;
}

interface FreshBooksCategory {
  id: number;
  accountid: number;
  category: string;
  categorytype: string; // 'income', 'expense'
  parentid?: number;
}

export class FreshBooksIntegration extends BaseIntegration implements IIntegrationService {
  private oauthHandler: OAuthHandler;
  private httpClient: HttpClient;
  private baseUrl: string = 'https://api.freshbooks.com/accounting/account';
  private accountId: string | null = null;

  constructor(integrationId: string, orgId: string) {
    super(integrationId, orgId, 'freshbooks');
    
    this.oauthHandler = new OAuthHandler({
      clientId: process.env.FRESHBOOKS_CLIENT_ID || '',
      clientSecret: process.env.FRESHBOOKS_CLIENT_SECRET || '',
      redirectUri: process.env.FRESHBOOKS_REDIRECT_URI || 'http://localhost:3000/integrations/callback',
      authorizationUrl: 'https://my.freshbooks.com/service/auth/oauth/authorize',
      tokenUrl: 'https://api.freshbooks.com/oauth/token',
      revokeUrl: 'https://api.freshbooks.com/oauth/token',
      scope: ['admin:accounting:read', 'admin:accounting:write', 'admin:client:read']
    });

    this.httpClient = new HttpClient({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async getAuthorizationUrl(): Promise<string> {
    const { state, codeVerifier, codeChallenge } = this.oauthHandler.generateState(this.integrationId);
    
    // Store PKCE verifier for callback
    this.stateManager.set(state, {
      codeVerifier,
      codeChallenge,
      integrationId: this.integrationId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    return this.oauthHandler.getAuthorizationUrl(state, codeChallenge);
  }

  async handleOAuthCallback(code: string, state: string): Promise<void> {
    try {
      // Validate state and get code verifier
      const stateData = this.stateManager.get(state);
      if (!stateData || stateData.integrationId !== this.integrationId) {
        throw new Error('Invalid or expired state');
      }

      // Exchange code for token
      const token = await this.oauthHandler.exchangeCodeForToken(
        code,
        state,
        stateData.codeVerifier
      );

      // Get account ID via /me endpoint
      const meResponse = await this.httpClient.get(
        'https://api.freshbooks.com/accounting/account/users/me',
        {
          headers: {
            'Authorization': `Bearer ${token.accessToken}`
          }
        }
      );

      const meData = meResponse as any;
      const accounts = meData.response?.result?.accounts || [];
      if (accounts.length === 0) {
        throw new Error('No FreshBooks accounts found');
      }

      // Use first account (typically primary)
      this.accountId = accounts[0].id.toString();

      // Store encrypted token
      const encryptedToken = this.tokenEncryption.encrypt(JSON.stringify(token));
      this.setup.tokens = encryptedToken;
      this.setup.connectionStatus = 'connected';
      this.setup.isConnected = true;

      this.logger.info(`FreshBooks callback successful. Account ID: ${this.accountId}`);
      this.logAudit('oauth_callback_success', { accountId: this.accountId });

      // Clean up state
      this.stateManager.delete(state);
    } catch (error) {
      const syncError = this.createSyncError(
        'oauth_callback_failed',
        `OAuth callback failed: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
      this.errorLog.push(syncError);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ensureValidToken();

      const response = await this.httpClient.get(
        `${this.baseUrl}/${this.accountId}/users/me`,
        {
          headers: {
            'Authorization': `Bearer ${this.getCurrentToken().accessToken}`
          }
        }
      );

      this.logger.info('FreshBooks connection test successful');
      return true;
    } catch (error) {
      this.logger.error(`FreshBooks connection test failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async syncCompanyInfo(): Promise<CompanyInfo> {
    try {
      await this.ensureValidToken();

      const response = await this.request(
        `${this.baseUrl}/${this.accountId}/users/me`,
        'GET'
      ) as any;

      const account = response.response?.result?.accounts?.[0];
      if (!account) {
        throw new Error('No account data found');
      }

      return {
        id: `fb-${account.id}`,
        externalId: `${account.id}`,
        name: account.name,
        baseCurrency: account.currency,
        integrationSource: 'freshbooks'
      };
    } catch (error) {
      const syncError = this.createSyncError(
        'sync_company_info_failed',
        `Failed to sync company info: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
      this.errorLog.push(syncError);
      throw error;
    }
  }

  async syncAccounts(): Promise<ChartOfAccount[]> {
    try {
      await this.ensureValidToken();

      // Fetch all categories (expense, income)
      const categoriesResponse = await this.request(
        `${this.baseUrl}/${this.accountId}/categories`,
        'GET',
        { limit: 100 }
      ) as any;

      const categories: FreshBooksCategory[] = categoriesResponse.response?.result?.categories || [];
      const accounts: ChartOfAccount[] = [];

      // Create accounts from categories
      for (const category of categories) {
        const accountType = this.mapCategoryType(category.categorytype);
        accounts.push({
          id: `fb-cat-${category.id}`,
          externalId: `${category.id}`,
          name: category.category,
          code: `CAT-${category.id}`,
          type: accountType,
          integrationSource: 'freshbooks',
          parentId: category.parentid ? `fb-cat-${category.parentid}` : undefined
        });
      }

      this.logger.info(`Synced ${accounts.length} accounts from FreshBooks`);
      return accounts;
    } catch (error) {
      const syncError = this.createSyncError(
        'sync_accounts_failed',
        `Failed to sync accounts: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
      this.errorLog.push(syncError);
      return [];
    }
  }

  async syncInvoices(lastSyncDate?: Date): Promise<Invoice[]> {
    try {
      await this.ensureValidToken();

      const params: any = { limit: 100 };
      if (lastSyncDate) {
        params.updated_after = lastSyncDate.toISOString().split('T')[0];
      }

      const response = await this.request(
        `${this.baseUrl}/${this.accountId}/invoices/invoices`,
        'GET',
        params
      ) as any;

      const fbInvoices: FreshBooksInvoice[] = response.response?.result?.invoices || [];
      const invoices: Invoice[] = [];

      for (const fbInv of fbInvoices) {
        const lineItems = fbInv.lines.map(line => ({
          id: `${fbInv.id}-${line.id}`,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitcost,
          amount: line.amount,
          taxRate: line.tax1 ? (line.tax1 / line.amount) * 100 : 0,
          taxAmount: line.tax1
        }));

        invoices.push({
          id: `fb-inv-${fbInv.id}`,
          externalId: `${fbInv.id}`,
          invoiceNumber: fbInv.invoice_number,
          customerId: `fb-cust-${fbInv.customerid}`,
          customerName: `${fbInv.customer.fname} ${fbInv.customer.lname}`,
          customerEmail: fbInv.customer.email,
          date: new Date(fbInv.date),
          dueDate: fbInv.due_date ? new Date(fbInv.due_date) : undefined,
          totalAmount: fbInv.amount,
          status: this.mapInvoiceStatus(fbInv.status),
          paymentStatus: this.mapPaymentStatus(fbInv.status),
          lineItems,
          notes: fbInv.notes,
          integrationSource: 'freshbooks'
        });
      }

      this.logger.info(`Synced ${invoices.length} invoices from FreshBooks`);
      return invoices;
    } catch (error) {
      const syncError = this.createSyncError(
        'sync_invoices_failed',
        `Failed to sync invoices: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
      this.errorLog.push(syncError);
      return [];
    }
  }

  async syncBills(lastSyncDate?: Date): Promise<Bill[]> {
    try {
      await this.ensureValidToken();

      const params: any = { limit: 100 };
      if (lastSyncDate) {
        params.updated_after = lastSyncDate.toISOString().split('T')[0];
      }

      const response = await this.request(
        `${this.baseUrl}/${this.accountId}/bills/bills`,
        'GET',
        params
      ) as any;

      const fbBills: FreshBooksBill[] = response.response?.result?.bills || [];
      const bills: Bill[] = [];

      for (const fbBill of fbBills) {
        const lineItems = fbBill.lines.map(line => ({
          id: `${fbBill.id}-${line.id}`,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitcost,
          amount: line.amount,
          accountId: `fb-cat-${line.categoryid}`,
          taxRate: line.tax1 ? (line.tax1 / line.amount) * 100 : 0,
          taxAmount: line.tax1
        }));

        bills.push({
          id: `fb-bill-${fbBill.id}`,
          externalId: `${fbBill.id}`,
          billNumber: fbBill.billnumber,
          vendorId: `fb-vend-${fbBill.vendorid}`,
          vendorName: `${fbBill.vendor.fname} ${fbBill.vendor.lname}`,
          vendorEmail: fbBill.vendor.email,
          date: new Date(fbBill.date),
          dueDate: fbBill.due_date ? new Date(fbBill.due_date) : undefined,
          totalAmount: fbBill.amount,
          status: this.mapBillStatus(fbBill.status),
          paymentStatus: this.mapPaymentStatus(fbBill.status),
          lineItems,
          integrationSource: 'freshbooks'
        });
      }

      this.logger.info(`Synced ${bills.length} bills from FreshBooks`);
      return bills;
    } catch (error) {
      const syncError = this.createSyncError(
        'sync_bills_failed',
        `Failed to sync bills: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
      this.errorLog.push(syncError);
      return [];
    }
  }

  async syncTransactions(lastSyncDate?: Date): Promise<Transaction[]> {
    try {
      // FreshBooks doesn't have a direct transactions endpoint
      // Synthesize from invoices and bills
      const invoices = await this.syncInvoices(lastSyncDate);
      const bills = await this.syncBills(lastSyncDate);

      const transactions: Transaction[] = [];

      // Convert invoices to transactions (revenue)
      for (const invoice of invoices) {
        transactions.push({
          id: invoice.id,
          externalId: invoice.externalId,
          type: 'invoice',
          date: invoice.date,
          amount: invoice.totalAmount,
          currency: this.setup.config?.baseCurrency || 'AED',
          description: `Invoice ${invoice.invoiceNumber}`,
          lineItems: invoice.lineItems.map(li => ({
            amount: li.amount,
            description: li.description,
            accountId: 'accounts-receivable' // Default AR account
          })),
          status: invoice.status,
          integrationSource: 'freshbooks'
        });
      }

      // Convert bills to transactions (expenses)
      for (const bill of bills) {
        transactions.push({
          id: bill.id,
          externalId: bill.externalId,
          type: 'bill',
          date: bill.date,
          amount: bill.totalAmount,
          currency: this.setup.config?.baseCurrency || 'AED',
          description: `Bill ${bill.billNumber}`,
          lineItems: bill.lineItems.map(li => ({
            amount: li.amount,
            description: li.description,
            accountId: li.accountId
          })),
          status: bill.status,
          integrationSource: 'freshbooks'
        });
      }

      this.logger.info(`Synthesized ${transactions.length} transactions from invoices and bills`);
      return transactions;
    } catch (error) {
      const syncError = this.createSyncError(
        'sync_transactions_failed',
        `Failed to sync transactions: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
      this.errorLog.push(syncError);
      return [];
    }
  }

  async pushTransaction(transaction: Transaction): Promise<void> {
    try {
      await this.ensureValidToken();

      if (transaction.type === 'invoice') {
        await this.createInvoiceFromTransaction(transaction);
      } else if (transaction.type === 'bill') {
        await this.createBillFromTransaction(transaction);
      } else {
        throw new Error(`Unsupported transaction type: ${transaction.type}`);
      }

      this.logger.info(`Pushed ${transaction.type} ${transaction.id} to FreshBooks`);
    } catch (error) {
      const syncError = this.createSyncError(
        'push_transaction_failed',
        `Failed to push transaction: ${error instanceof Error ? error.message : String(error)}`,
        false
      );
      this.errorLog.push(syncError);
      throw error;
    }
  }

  async syncBankAccounts() {
    // FreshBooks doesn't expose bank accounts via API
    // Return empty array
    return [];
  }

  async syncBankTransactions() {
    // FreshBooks doesn't expose bank transactions via API
    // Return empty array
    return [];
  }

  // Private helper methods

  private async request(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: any
  ): Promise<any> {
    const token = this.getCurrentToken();
    const headers = {
      'Authorization': `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json'
    };

    try {
      if (method === 'GET') {
        return await this.httpClient.get(url, { headers, params: data });
      } else if (method === 'POST') {
        return await this.httpClient.post(url, data, { headers });
      } else if (method === 'PUT') {
        return await this.httpClient.post(url, data, { headers });
      } else if (method === 'DELETE') {
        return await this.httpClient.get(url, { headers });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('401')) {
        // Token expired, refresh and retry
        await this.performTokenRefresh();
        return this.request(url, method, data);
      }
      throw error;
    }
  }

  private async createInvoiceFromTransaction(transaction: Transaction): Promise<void> {
    const payload = {
      invoice: {
        customerid: parseInt(transaction.id.split('-')[1] || '0'),
        invoicenumber: transaction.description || 'Generated Invoice',
        date: transaction.date.toISOString().split('T')[0],
        lines: transaction.lineItems.map(li => ({
          description: li.description,
          unitcost: li.amount,
          quantity: 1,
          amount: li.amount
        }))
      }
    };

    await this.request(
      `${this.baseUrl}/${this.accountId}/invoices/invoices`,
      'POST',
      payload
    );
  }

  private async createBillFromTransaction(transaction: Transaction): Promise<void> {
    const payload = {
      bill: {
        vendorid: parseInt(transaction.id.split('-')[1] || '0'),
        billnumber: transaction.description || 'Generated Bill',
        date: transaction.date.toISOString().split('T')[0],
        lines: transaction.lineItems.map(li => ({
          description: li.description,
          unitcost: li.amount,
          quantity: 1,
          amount: li.amount,
          categoryid: parseInt(li.accountId?.split('-')[1] || '0')
        }))
      }
    };

    await this.request(
      `${this.baseUrl}/${this.accountId}/bills/bills`,
      'POST',
      payload
    );
  }

  private mapCategoryType(fbType: string): 'income' | 'expense' | 'asset' | 'liability' | 'equity' {
    const typeMap: { [key: string]: any } = {
      'income': 'income',
      'expense': 'expense'
    };
    return typeMap[fbType] || 'expense';
  }

  private mapInvoiceStatus(fbStatus: string): 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' {
    const statusMap: { [key: string]: any } = {
      'draft': 'draft',
      'sent': 'sent',
      'viewed': 'sent',
      'partial': 'sent',
      'paid': 'paid',
      'overdue': 'overdue'
    };
    return statusMap[fbStatus] || 'draft';
  }

  private mapBillStatus(fbStatus: string): 'draft' | 'submitted' | 'paid' | 'overdue' | 'cancelled' {
    const statusMap: { [key: string]: any } = {
      'draft': 'draft',
      'submitted': 'submitted',
      'accepted': 'submitted',
      'partially_paid': 'submitted',
      'paid': 'paid',
      'auto_paid': 'paid',
      'overdue': 'overdue'
    };
    return statusMap[fbStatus] || 'draft';
  }

  private mapPaymentStatus(status: string): 'unpaid' | 'partial' | 'paid' {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('paid') || statusLower === 'auto_paid') return 'paid';
    if (statusLower.includes('partial')) return 'partial';
    return 'unpaid';
  }

  protected async performTokenRefresh(): Promise<void> {
    try {
      const currentToken = this.getCurrentToken();
      const newToken = await this.oauthHandler.refreshToken(currentToken.refreshToken);
      
      const encryptedToken = this.tokenEncryption.encrypt(JSON.stringify(newToken));
      this.setup.tokens = encryptedToken;
      
      this.logger.info('FreshBooks token refreshed successfully');
      this.logAudit('token_refresh_success');
    } catch (error) {
      const syncError = this.createSyncError(
        'token_refresh_failed',
        `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
      this.errorLog.push(syncError);
      throw error;
    }
  }

  private stateManager = new Map<string, any>();
}
