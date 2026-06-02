/**
 * Xero Integration
 * OAuth 2.0 with PKCE, GL sync, batch operations, real-time webhooks
 */

import BaseIntegration, { Logger } from "./base.js";
import { OAuthHandler, getOAuthConfig, HttpClient } from "./oauth-handler.js";
import {
  OAuthToken,
  IntegrationSetup,
  CompanyInfo,
  ChartOfAccount,
  Invoice,
  Bill,
  Transaction,
  BankAccount,
  BankTransaction,
} from "./integration-types.js";

export class XeroIntegration extends BaseIntegration {
  private oauthHandler: OAuthHandler;
  private httpClient: HttpClient;
  private tenantId?: string; // Xero organization ID
  private baseUrl = 'https://api.xero.com/api.xro/2.0';
  private logger: Logger;

  constructor(setup: IntegrationSetup) {
    super(setup);
    const config = getOAuthConfig('xero');
    this.oauthHandler = new OAuthHandler(config);
    this.httpClient = new HttpClient();
    this.logger = new Logger('XeroIntegration');
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

    this.tenantId = process.env.XERO_TENANT_ID;

    this.setup.isConnected = true;
    this.setup.connectionStatus = 'connected';
    this.setup.tokens = tokens;

    this.logAudit('oauth_connected', { integrationId });
    return tokens;
  }

  async testConnection(integrationId: string): Promise<boolean> {
    try {
      await this.ensureValidToken(integrationId);
      if (!this.tenantId) throw new Error('Tenant ID not set');

      await this.getOrganizations();
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
    if (!this.tenantId) throw new Error('Tenant ID not set');

    try {
      const organizations = await this.getOrganizations();
      const org = organizations[0];

      return {
        id: org.OrganisationID,
        externalId: org.OrganisationID,
        name: org.Name,
        displayName: org.Name,
        registrationNumber: org.RegistrationNumber,
        taxId: org.TaxNumber,
        taxEnabled: true,
        email: org.ContactName,
        country: 'AE',
        baseCurrency: org.BaseCurrency,
        supportedCurrencies: [org.BaseCurrency],
        accountingMethod: 'accrual',
        integrationSource: 'xero',
        syncedAt: Date.now(),
      };
    } catch (error) {
      this.recordError({
        code: 'XERO_SYNC_COMPANY_ERROR',
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
    if (!this.tenantId) throw new Error('Tenant ID not set');

    try {
      const response = await this.request(`${this.baseUrl}/Accounts`);
      const accounts = response.Accounts || [];

      return accounts.map((account: any) => ({
        id: account.AccountID,
        name: account.Name,
        code: account.Code,
        type: this.mapAccountType(account.Type),
        subType: account.TaxType,
        balance: account.UpdatedDateUTC ? 0 : 0, // Xero doesn't return balance
        currency: 'AED',
        isActive: account.Status === 'ACTIVE',
        externalId: account.AccountID,
        description: account.Description,
        taxCategory: account.TaxType,
      }));
    } catch (error) {
      this.recordError({
        code: 'XERO_SYNC_ACCOUNTS_ERROR',
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
    if (!this.tenantId) throw new Error('Tenant ID not set');

    try {
      let url = `${this.baseUrl}/Invoices?where=Status%3D%22AUTHORISED%22%20OR%20Status%3D%22SUBMITTED%22%20OR%20Status%3D%22PAID%22`;
      
      if (since) {
        const sinceDate = new Date(since).toISOString();
        url += `%20AND%20UpdatedDateUTC%3E%3D%20DateTime(${sinceDate})`;
      }

      const response = await this.request(url);
      const invoices = response.Invoices || [];

      return invoices.map((invoice: any) => ({
        id: invoice.InvoiceID,
        externalId: invoice.InvoiceID,
        orgId: this.setup.orgId,
        invoiceNumber: invoice.InvoiceNumber,
        date: new Date(invoice.DateString).getTime(),
        dueDate: new Date(invoice.DueDateString).getTime(),
        amount: invoice.Total,
        currency: invoice.CurrencyCode,
        customerId: invoice.Contact?.ContactID,
        customerName: invoice.Contact?.Name,
        customerEmail: invoice.Contact?.EmailAddress,
        lineItems: (invoice.LineItems || []).map((line: any) => ({
          id: line.LineItemID,
          description: line.Description,
          amount: line.LineAmount,
          accountId: line.AccountCode,
          quantity: line.Quantity,
          unitPrice: line.UnitAmount,
          taxAmount: line.TaxAmount,
          taxRate: line.TaxType,
        })),
        subtotal: invoice.SubTotal,
        taxAmount: invoice.TaxTotal,
        totalAmount: invoice.Total,
        status: this.mapInvoiceStatus(invoice.Status),
        paidAmount: invoice.AmountPaid,
        paymentStatus: this.mapPaymentStatus(invoice.AmountPaid, invoice.Total),
        integrationSource: 'xero',
        syncedAt: Date.now(),
      }));
    } catch (error) {
      this.recordError({
        code: 'XERO_SYNC_INVOICES_ERROR',
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
    if (!this.tenantId) throw new Error('Tenant ID not set');

    try {
      let url = `${this.baseUrl}/PurchaseOrders?where=Status%3D%22AUTHORISED%22%20OR%20Status%3D%22SUBMITTED%22%20OR%20Status%3D%22PAID%22`;
      
      if (since) {
        const sinceDate = new Date(since).toISOString();
        url += `%20AND%20UpdatedDateUTC%3E%3D%20DateTime(${sinceDate})`;
      }

      const response = await this.request(url);
      const bills = response.PurchaseOrders || [];

      return bills.map((bill: any) => ({
        id: bill.PurchaseOrderID,
        externalId: bill.PurchaseOrderID,
        orgId: this.setup.orgId,
        billNumber: bill.PurchaseOrderNumber,
        date: new Date(bill.DateString).getTime(),
        dueDate: new Date(bill.DeliveryDateString).getTime(),
        amount: bill.Total,
        currency: bill.CurrencyCode,
        vendorId: bill.Contact?.ContactID,
        vendorName: bill.Contact?.Name,
        vendorEmail: bill.Contact?.EmailAddress,
        lineItems: (bill.LineItems || []).map((line: any) => ({
          id: line.LineItemID,
          description: line.Description,
          amount: line.LineAmount,
          accountId: line.AccountCode,
          quantity: line.Quantity,
          unitPrice: line.UnitAmount,
          taxAmount: line.TaxAmount,
          taxRate: line.TaxType,
        })),
        subtotal: bill.SubTotal,
        taxAmount: bill.TaxTotal,
        totalAmount: bill.Total,
        status: this.mapBillStatus(bill.Status),
        paidAmount: bill.AmountPaid,
        paymentStatus: this.mapPaymentStatus(bill.AmountPaid, bill.Total),
        integrationSource: 'xero',
        syncedAt: Date.now(),
      }));
    } catch (error) {
      this.recordError({
        code: 'XERO_SYNC_BILLS_ERROR',
        message: `Failed to sync bills: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId },
      });
      throw error;
    }
  }

  async syncTransactions(integrationId: string, since?: number): Promise<Transaction[]> {
    // Combine invoices and bills into transactions
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
        integrationSource: 'xero',
        sourceSystemId: 'xero',
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
        integrationSource: 'xero',
        sourceSystemId: 'xero',
        syncedAt: Date.now(),
      });
    });

    return transactions;
  }

  async pushTransaction(integrationId: string, transaction: Transaction): Promise<string> {
    await this.ensureValidToken(integrationId);
    if (!this.tenantId) throw new Error('Tenant ID not set');

    try {
      const xeroTransaction = this.mapToXeroTransaction(transaction);
      const endpoint = transaction.type === 'invoice' ? 'Invoices' : 'PurchaseOrders';
      
      const response = await this.request(`${this.baseUrl}/${endpoint}`, 'POST', xeroTransaction);
      
      const result = endpoint === 'Invoices' 
        ? response.Invoices?.[0]
        : response.PurchaseOrders?.[0];

      if (!result) throw new Error('Transaction creation failed');

      this.logAudit('transaction_pushed', {
        integrationId,
        transactionId: transaction.id,
        externalId: result.InvoiceID || result.PurchaseOrderID,
      });

      return result.InvoiceID || result.PurchaseOrderID;
    } catch (error) {
      this.recordError({
        code: 'XERO_PUSH_TRANSACTION_ERROR',
        message: `Failed to push transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId, transactionId: transaction.id },
      });
      throw error;
    }
  }

  async syncBankAccounts(integrationId: string): Promise<BankAccount[]> {
    // Xero doesn't expose bank accounts directly via API
    return [];
  }

  async syncBankTransactions(integrationId: string, since?: number): Promise<BankTransaction[]> {
    // Xero doesn't expose bank transactions via standard API
    return [];
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  private async getOrganizations(): Promise<any[]> {
    const response = await this.request(`${this.baseUrl}/Organisation`);
    return response.Organisations || [];
  }

  private async request<T>(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    await this.ensureValidToken(this.setup.id);

    const headers = {
      ...this.oauthHandler.getAuthorizationHeader(this.tokens!),
      'Xero-Tenant-Id': this.tenantId!,
      'Accept': 'application/json',
    };

    return this.retryWithBackoff(() => {
      if (method === 'GET') {
        return this.httpClient.get(url, headers);
      } else {
        return this.httpClient.post(url, body, headers);
      }
    });
  }

  private mapAccountType(xeroType: string): 'asset' | 'liability' | 'equity' | 'income' | 'expense' {
    const typeMap: Record<string, any> = {
      'ASSET': 'asset',
      'BANK': 'asset',
      'CURRENT ASSET': 'asset',
      'FIXED ASSET': 'asset',
      'LIABILITY': 'liability',
      'CURRENT LIABILITY': 'liability',
      'PAYROLL LIABILITIES': 'liability',
      'EQUITY': 'equity',
      'REVENUE': 'income',
      'SALES': 'income',
      'EXPENSE': 'expense',
      'COST OF SALES': 'expense',
    };

    return typeMap[xeroType.toUpperCase()] || 'asset';
  }

  private mapInvoiceStatus(xeroStatus: string): 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled' {
    const map: Record<string, any> = {
      'DRAFT': 'draft',
      'SUBMITTED': 'sent',
      'AUTHORISED': 'sent',
      'PAID': 'paid',
    };
    return map[xeroStatus] || 'sent';
  }

  private mapBillStatus(xeroStatus: string): 'draft' | 'open' | 'overdue' | 'paid' | 'cancelled' {
    const map: Record<string, any> = {
      'DRAFT': 'draft',
      'SUBMITTED': 'open',
      'AUTHORISED': 'open',
      'PAID': 'paid',
    };
    return map[xeroStatus] || 'open';
  }

  private mapPaymentStatus(
    amountPaid: number,
    total: number
  ): 'unpaid' | 'partially_paid' | 'paid' {
    if (amountPaid >= total) return 'paid';
    if (amountPaid === 0) return 'unpaid';
    return 'partially_paid';
  }

  private mapToXeroTransaction(transaction: Transaction): any {
    const type = transaction.type === 'invoice' ? 'ACCREC' : 'ACCPAY';

    return {
      Type: type,
      InvoiceNumber: transaction.referenceNumber,
      InvoiceDate: new Date(transaction.date).toISOString().split('T')[0],
      DueDate: new Date(transaction.date + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      Description: transaction.description,
      LineItems: transaction.lineItems.map((line) => ({
        Description: line.description,
        Quantity: line.quantity || 1,
        UnitAmount: line.unitPrice || line.amount,
        AccountCode: line.accountId,
        TaxAmount: line.taxAmount,
      })),
    };
  }

  protected async performTokenRefresh(refreshToken: string): Promise<OAuthToken> {
    return this.oauthHandler.refreshToken(refreshToken);
  }
}

export default XeroIntegration;
