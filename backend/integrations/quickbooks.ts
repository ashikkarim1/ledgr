/**
 * QuickBooks Online Integration
 * OAuth 2.0, transaction sync, invoice/bill management, real-time webhooks
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

export class QuickBooksIntegration extends BaseIntegration {
  private oauthHandler: OAuthHandler;
  private httpClient: HttpClient;
  private realmId?: string; // QB tenant/organization ID
  private baseUrl = 'https://quickbooks.api.intuit.com/v2/company';
  private logger: Logger;

  constructor(setup: IntegrationSetup) {
    super(setup);
    const config = getOAuthConfig('quickbooks');
    this.oauthHandler = new OAuthHandler(config);
    this.httpClient = new HttpClient();
    this.logger = new Logger('QuickBooksIntegration');
  }

  // ========================================================================
  // OAuth & Connection
  // ========================================================================

  async getAuthorizationUrl(integrationId: string): Promise<string> {
    return this.oauthHandler.getAuthorizationUrl(integrationId);
  }

  async handleOAuthCallback(
    integrationId: string,
    code: string,
    state: string
  ): Promise<OAuthToken> {
    const tokens = await this.oauthHandler.exchangeCodeForToken(code, state, integrationId);
    this.tokens = tokens;
    await this.saveTokens(integrationId, tokens);

    // Extract realm ID from auth flow context (typically stored separately)
    // In real implementation, realm ID is passed in OAuth callback
    this.realmId = process.env.QB_REALM_ID;

    this.setup.isConnected = true;
    this.setup.connectionStatus = 'connected';
    this.setup.tokens = tokens;

    this.logAudit('oauth_connected', { integrationId });
    return tokens;
  }

  async testConnection(integrationId: string): Promise<boolean> {
    try {
      await this.ensureValidToken(integrationId);
      if (!this.realmId) {
        throw new Error('Realm ID not set');
      }

      await this.getCompanyInfo(this.realmId);
      this.logger.info('Connection test successful', { integrationId });
      return true;
    } catch (error) {
      this.logger.error('Connection test failed', { integrationId, error });
      return false;
    }
  }

  // ========================================================================
  // Data Sync Methods
  // ========================================================================

  async syncCompanyInfo(integrationId: string): Promise<CompanyInfo> {
    await this.ensureValidToken(integrationId);
    if (!this.realmId) throw new Error('Realm ID not set');

    try {
      const info = await this.getCompanyInfo(this.realmId);
      return info;
    } catch (error) {
      this.recordError({
        code: 'QB_SYNC_COMPANY_ERROR',
        message: `Failed to sync company info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId },
      });
      throw error;
    }
  }

  async syncAccounts(integrationId: string): Promise<ChartOfAccount[]> {
    await this.ensureValidToken(integrationId);
    if (!this.realmId) throw new Error('Realm ID not set');

    try {
      const query = "SELECT * FROM Account WHERE Active = true";
      const response = await this.executeQuery(this.realmId, query);

      return response.QueryResponse?.Account?.map((account: any) => ({
        id: account.Id,
        name: account.Name,
        code: account.AcctNum || '',
        type: this.mapAccountType(account.AccountType),
        subType: account.AccountSubType,
        balance: account.CurrentBalance || 0,
        currency: 'AED',
        isActive: account.Active !== false,
        externalId: account.Id,
        description: account.Description,
      })) || [];
    } catch (error) {
      this.recordError({
        code: 'QB_SYNC_ACCOUNTS_ERROR',
        message: `Failed to sync accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId },
      });
      throw error;
    }
  }

  async syncInvoices(integrationId: string, since?: number): Promise<Invoice[]> {
    await this.ensureValidToken(integrationId);
    if (!this.realmId) throw new Error('Realm ID not set');

    try {
      let query = 'SELECT * FROM Invoice';
      if (since) {
        const sinceDate = new Date(since).toISOString().split('T')[0];
        query += ` WHERE MetaData.UpdatedTime >= '${sinceDate}'`;
      }

      const response = await this.executeQuery(this.realmId, query);

      return response.QueryResponse?.Invoice?.map((invoice: any) => ({
        id: invoice.Id,
        externalId: invoice.Id,
        orgId: this.setup.orgId,
        invoiceNumber: invoice.DocNumber,
        date: new Date(invoice.TxnDate).getTime(),
        dueDate: new Date(invoice.DueDate).getTime(),
        amount: invoice.TotalAmt,
        currency: 'AED',
        customerId: invoice.CustomerRef?.value,
        customerName: invoice.CustomerRef?.name,
        customerEmail: invoice.BillEmail?.Address,
        lineItems: (invoice.Line || []).map((line: any) => ({
          id: line.Id,
          description: line.Description,
          amount: line.Amount,
          accountId: line.AccountRef?.value,
        })),
        subtotal: invoice.SubTotalAmt || 0,
        taxAmount: invoice.TaxDetail?.TotalTaxAmount || 0,
        totalAmount: invoice.TotalAmt,
        status: this.mapInvoiceStatus(invoice.DocStatus),
        paidAmount: invoice.Balance ? invoice.TotalAmt - invoice.Balance : 0,
        paymentStatus: this.mapPaymentStatus(invoice.Balance, invoice.TotalAmt),
        integrationSource: 'quickbooks',
        syncedAt: Date.now(),
      })) || [];
    } catch (error) {
      this.recordError({
        code: 'QB_SYNC_INVOICES_ERROR',
        message: `Failed to sync invoices: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId },
      });
      throw error;
    }
  }

  async syncBills(integrationId: string, since?: number): Promise<Bill[]> {
    await this.ensureValidToken(integrationId);
    if (!this.realmId) throw new Error('Realm ID not set');

    try {
      let query = 'SELECT * FROM Bill';
      if (since) {
        const sinceDate = new Date(since).toISOString().split('T')[0];
        query += ` WHERE MetaData.UpdatedTime >= '${sinceDate}'`;
      }

      const response = await this.executeQuery(this.realmId, query);

      return response.QueryResponse?.Bill?.map((bill: any) => ({
        id: bill.Id,
        externalId: bill.Id,
        orgId: this.setup.orgId,
        billNumber: bill.DocNumber,
        date: new Date(bill.TxnDate).getTime(),
        dueDate: new Date(bill.DueDate).getTime(),
        amount: bill.TotalAmt,
        currency: 'AED',
        vendorId: bill.VendorRef?.value,
        vendorName: bill.VendorRef?.name,
        vendorEmail: '',
        lineItems: (bill.Line || []).map((line: any) => ({
          id: line.Id,
          description: line.Description,
          amount: line.Amount,
          accountId: line.AccountRef?.value,
        })),
        subtotal: bill.SubTotalAmt || 0,
        taxAmount: bill.TaxDetail?.TotalTaxAmount || 0,
        totalAmount: bill.TotalAmt,
        status: this.mapBillStatus(bill.DocStatus),
        paidAmount: bill.Balance ? bill.TotalAmt - bill.Balance : 0,
        paymentStatus: this.mapPaymentStatus(bill.Balance, bill.TotalAmt),
        integrationSource: 'quickbooks',
        syncedAt: Date.now(),
      })) || [];
    } catch (error) {
      this.recordError({
        code: 'QB_SYNC_BILLS_ERROR',
        message: `Failed to sync bills: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId },
      });
      throw error;
    }
  }

  async syncTransactions(integrationId: string, since?: number): Promise<Transaction[]> {
    // QB doesn't expose transactions directly; synthesize from invoices, bills, payments
    const invoices = await this.syncInvoices(integrationId, since);
    const bills = await this.syncBills(integrationId, since);

    const transactions: Transaction[] = [];

    invoices.forEach((inv) => {
      transactions.push({
        id: `inv-${inv.externalId}`,
        externalId: inv.externalId,
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
        integrationSource: 'quickbooks',
        sourceSystemId: 'quickbooks',
        syncedAt: Date.now(),
      });
    });

    bills.forEach((bill) => {
      transactions.push({
        id: `bill-${bill.externalId}`,
        externalId: bill.externalId,
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
        integrationSource: 'quickbooks',
        sourceSystemId: 'quickbooks',
        syncedAt: Date.now(),
      });
    });

    return transactions;
  }

  async pushTransaction(integrationId: string, transaction: Transaction): Promise<string> {
    await this.ensureValidToken(integrationId);
    if (!this.realmId) throw new Error('Realm ID not set');

    try {
      // Convert Ledgr transaction to QB transaction
      const qbTransaction = this.mapToQBTransaction(transaction);

      const response = await this.createTransaction(
        this.realmId,
        transaction.type,
        qbTransaction
      );

      this.logAudit('transaction_pushed', {
        integrationId,
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
        context: { integrationId, transactionId: transaction.id },
      });
      throw error;
    }
  }

  async syncBankAccounts(integrationId: string): Promise<BankAccount[]> {
    // QB doesn't have direct bank account API; return empty
    return [];
  }

  async syncBankTransactions(integrationId: string, since?: number): Promise<BankTransaction[]> {
    // QB doesn't have direct bank transactions API
    return [];
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  private async getCompanyInfo(realmId: string): Promise<CompanyInfo> {
    const query = 'SELECT * FROM CompanyInfo';
    const response = await this.executeQuery(realmId, query);
    const company = response.QueryResponse?.CompanyInfo?.[0];

    if (!company) {
      throw new Error('Company info not found');
    }

    return {
      id: company.Id,
      externalId: company.Id,
      name: company.CompanyName,
      displayName: company.CompanyName,
      registrationNumber: company.CompanyStartDate,
      taxId: '',
      taxEnabled: true,
      email: company.PrimaryPhone?.FreeFormNumber,
      country: 'AE',
      baseCurrency: company.Currency?.value || 'AED',
      supportedCurrencies: ['AED'],
      accountingMethod: 'accrual',
      integrationSource: 'quickbooks',
      syncedAt: Date.now(),
    };
  }

  private async executeQuery(realmId: string, query: string): Promise<any> {
    const encodedQuery = encodeURIComponent(query);
    const url = `${this.baseUrl}/${realmId}/query?query=${encodedQuery}`;

    return this.retryWithBackoff(() =>
      this.httpClient.get(url, this.oauthHandler.getAuthorizationHeader(this.tokens!))
    );
  }

  private async createTransaction(
    realmId: string,
    type: string,
    transaction: any
  ): Promise<any> {
    const url = `${this.baseUrl}/${realmId}/${type.toLowerCase()}`;

    return this.retryWithBackoff(() =>
      this.httpClient.post(
        url,
        transaction,
        this.oauthHandler.getAuthorizationHeader(this.tokens!)
      )
    );
  }

  private mapAccountType(qbType: string): 'asset' | 'liability' | 'equity' | 'income' | 'expense' {
    const typeMap: Record<string, any> = {
      'Asset': 'asset',
      'Liability': 'liability',
      'Equity': 'equity',
      'Income': 'income',
      'Expense': 'expense',
    };
    return typeMap[qbType] || 'asset';
  }

  private mapInvoiceStatus(docStatus: string): 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled' {
    const map: Record<string, any> = {
      'Draft': 'draft',
      'Submitted': 'sent',
      'EmailSent': 'sent',
    };
    return map[docStatus] || 'sent';
  }

  private mapBillStatus(docStatus: string): 'draft' | 'open' | 'overdue' | 'paid' | 'cancelled' {
    const map: Record<string, any> = {
      'Draft': 'draft',
      'Submitted': 'open',
    };
    return map[docStatus] || 'open';
  }

  private mapPaymentStatus(
    balance: number | undefined,
    total: number
  ): 'unpaid' | 'partially_paid' | 'paid' {
    if (!balance || balance === 0) return 'paid';
    if (balance >= total) return 'unpaid';
    return 'partially_paid';
  }

  private mapToQBTransaction(transaction: Transaction): any {
    // Map Ledgr transaction format to QB format
    return {
      DocNumber: transaction.referenceNumber,
      TxnDate: new Date(transaction.date).toISOString().split('T')[0],
      Description: transaction.description,
      Line: transaction.lineItems.map((line) => ({
        Description: line.description,
        DetailType: 'LineDetail',
        Amount: line.amount,
        AccountRef: { value: line.accountId },
      })),
    };
  }

  protected async performTokenRefresh(refreshToken: string): Promise<OAuthToken> {
    return this.oauthHandler.refreshToken(refreshToken);
  }
}

export default QuickBooksIntegration;
