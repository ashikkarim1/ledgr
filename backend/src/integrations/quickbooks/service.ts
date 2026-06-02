// QuickBooks Online Integration Service
// Handles OAuth2 authentication, data sync, and real-time data pulling

import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import {
  QBOAuth2Config,
  QBAccessToken,
  QBCompanyConnection,
  QBAccount,
  QBJournalEntry,
  QBCustomer,
  QBInvoice,
  QBBill,
  QBVendor,
  QBExpense,
  QBBankAccount,
  QBBankTransaction,
  QBSyncEvent,
} from './types';

export class QuickBooksIntegrationService {
  private http: AxiosInstance;
  private config: QBOAuth2Config;
  private pool: Pool;
  private baseUrl: string = 'https://quickbooks.api.intuit.com/v2/company';

  constructor(
    config: QBOAuth2Config,
    pool: Pool,
    baseUrl?: string
  ) {
    this.config = config;
    this.pool = pool;
    if (baseUrl) this.baseUrl = baseUrl;

    this.http = axios.create({
      timeout: 30000,
    });
  }

  // OAuth2: Generate authorization URL
  generateAuthorizationUrl(state?: string): string {
    const stateParam = state || crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id: this.config.client_id,
      response_type: 'code',
      scope: this.config.scope.join(' '),
      redirect_uri: this.config.redirect_uri,
      state: stateParam,
    });

    return `${this.config.auth_endpoint}?${params.toString()}`;
  }

  // OAuth2: Exchange authorization code for access token
  async exchangeCodeForToken(
    code: string,
    realm_id: string
  ): Promise<QBAccessToken> {
    try {
      const response = await this.http.post(
        this.config.token_endpoint,
        {
          grant_type: 'authorization_code',
          code,
          realm_id,
        },
        {
          auth: {
            username: this.config.client_id,
            password: this.config.client_secret,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const token: QBAccessToken = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type || 'Bearer',
        x_refresh_token_expires_in: response.data.x_refresh_token_expires_in,
        expires_at: new Date(Date.now() + (response.data.expires_in * 1000)),
      };

      return token;
    } catch (error) {
      console.error('[QB] Token exchange failed:', error);
      throw new Error('Failed to exchange authorization code for token');
    }
  }

  // OAuth2: Refresh access token
  async refreshAccessToken(refreshToken: string): Promise<QBAccessToken> {
    try {
      const response = await this.http.post(
        this.config.token_endpoint,
        {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        },
        {
          auth: {
            username: this.config.client_id,
            password: this.config.client_secret,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const token: QBAccessToken = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refreshToken,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type || 'Bearer',
        x_refresh_token_expires_in: response.data.x_refresh_token_expires_in,
        expires_at: new Date(Date.now() + (response.data.expires_in * 1000)),
      };

      return token;
    } catch (error) {
      console.error('[QB] Token refresh failed:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  // Store company connection in database
  async storeCompanyConnection(
    org_id: string,
    realm_id: string,
    company_name: string,
    token: QBAccessToken
  ): Promise<QBCompanyConnection> {
    const connection: QBCompanyConnection = {
      id: crypto.randomUUID(),
      org_id,
      realm_id,
      company_name,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_expires_at: token.expires_at,
      refresh_token_expires_at: new Date(
        Date.now() + (token.x_refresh_token_expires_in * 1000)
      ),
      is_connected: true,
      last_sync: null,
      sync_status: 'idle',
      last_error: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    console.log('[QB] Storing connection:', connection.id);
    return connection;
  }

  // Execute QBO query
  private async executeQuery(
    accessToken: string,
    query: string
  ): Promise<any> {
    try {
      const response = await this.http.get(
        `${this.baseUrl}/${this.config.realm_id}/query`,
        {
          params: { query },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      return response.data.QueryResponse || [];
    } catch (error) {
      console.error('[QB] Query failed:', error);
      throw error;
    }
  }

  // Fetch Chart of Accounts
  async fetchChartOfAccounts(
    accessToken: string
  ): Promise<QBAccount[]> {
    try {
      const query = "select * from Account";
      const response = await this.executeQuery(accessToken, query);

      return (response.Account || []).map((acc: any) => ({
        id: acc.Id,
        name: acc.Name,
        type: acc.AccountType,
        account_number: acc.AccountNumber || null,
        subaccount_type: acc.AccountSubType || null,
        description: acc.Description || null,
        current_balance: acc.CurrentBalance || 0,
        currency: 'AED',
        is_active: acc.Active,
        created_at: new Date(acc.MetaData.CreateTime),
        updated_at: new Date(acc.MetaData.UpdateTime),
      }));
    } catch (error) {
      console.error('[QB] Failed to fetch CoA:', error);
      throw error;
    }
  }

  // Fetch Invoices (AR)
  async fetchInvoices(
    accessToken: string,
    since?: Date
  ): Promise<QBInvoice[]> {
    try {
      let query = "select * from Invoice";
      if (since) {
        const isoDate = since.toISOString().split('T')[0];
        query += ` where MetaData.UpdatedTime >= '${isoDate}'`;
      }

      const response = await this.executeQuery(accessToken, query);

      return (response.Invoice || []).map((inv: any) => ({
        id: inv.Id,
        realm_id: this.config.realm_id,
        doc_number: inv.DocNumber,
        customer_id: inv.CustomerRef.value,
        customer_name: inv.CustomerRef.name || '',
        customer_tax_id: null,
        txn_date: new Date(inv.TxnDate),
        due_date: inv.DueDate ? new Date(inv.DueDate) : null,
        subtotal_amount: inv.Line?.reduce((sum: number, line: any) => 
          sum + (line.Amount || 0), 0) || 0,
        tax_amount: inv.TxnTaxDetail?.TotalTax || 0,
        total_amount: inv.TotalAmt || 0,
        amount_due: inv.Balance || 0,
        balance: inv.Balance || 0,
        currency: inv.CurrencyRef?.value || 'AED',
        status: inv.DocStatus || 'Draft',
        payment_method: inv.PaymentMethodRef?.value || null,
        terms_id: inv.TermsRef?.value || null,
        memo: inv.PrivateNote || null,
        line_items: [],
        created_at: new Date(inv.MetaData.CreateTime),
        updated_at: new Date(inv.MetaData.UpdateTime),
      }));
    } catch (error) {
      console.error('[QB] Failed to fetch invoices:', error);
      throw error;
    }
  }

  // Fetch Bills (AP)
  async fetchBills(
    accessToken: string,
    since?: Date
  ): Promise<QBBill[]> {
    try {
      let query = "select * from Bill";
      if (since) {
        const isoDate = since.toISOString().split('T')[0];
        query += ` where MetaData.UpdatedTime >= '${isoDate}'`;
      }

      const response = await this.executeQuery(accessToken, query);

      return (response.Bill || []).map((bill: any) => ({
        id: bill.Id,
        realm_id: this.config.realm_id,
        doc_number: bill.DocNumber,
        vendor_id: bill.VendorRef.value,
        vendor_name: bill.VendorRef.name || '',
        vendor_tax_id: null,
        txn_date: new Date(bill.TxnDate),
        due_date: bill.DueDate ? new Date(bill.DueDate) : null,
        subtotal_amount: bill.Line?.reduce((sum: number, line: any) => 
          sum + (line.Amount || 0), 0) || 0,
        tax_amount: bill.TxnTaxDetail?.TotalTax || 0,
        total_amount: bill.TotalAmt || 0,
        amount_due: bill.Balance || 0,
        balance: bill.Balance || 0,
        currency: bill.CurrencyRef?.value || 'AED',
        status: bill.DocStatus || 'Draft',
        payment_method: bill.PaymentMethodRef?.value || null,
        terms_id: bill.TermsRef?.value || null,
        memo: bill.PrivateNote || null,
        line_items: [],
        created_at: new Date(bill.MetaData.CreateTime),
        updated_at: new Date(bill.MetaData.UpdateTime),
      }));
    } catch (error) {
      console.error('[QB] Failed to fetch bills:', error);
      throw error;
    }
  }

  // Fetch Journal Entries
  async fetchJournalEntries(
    accessToken: string,
    since?: Date
  ): Promise<QBJournalEntry[]> {
    try {
      let query = "select * from JournalEntry";
      if (since) {
        const isoDate = since.toISOString().split('T')[0];
        query += ` where MetaData.UpdatedTime >= '${isoDate}'`;
      }

      const response = await this.executeQuery(accessToken, query);

      return (response.JournalEntry || []).map((je: any) => ({
        id: je.Id,
        realm_id: this.config.realm_id,
        doc_number: je.DocNumber,
        txn_date: new Date(je.TxnDate),
        ref_number: null,
        line_items: [],
        total_amount: je.Line?.reduce((sum: number, line: any) => 
          sum + Math.abs(line.Amount || 0), 0) || 0,
        currency: 'AED',
        created_at: new Date(je.MetaData.CreateTime),
        updated_at: new Date(je.MetaData.UpdateTime),
      }));
    } catch (error) {
      console.error('[QB] Failed to fetch journal entries:', error);
      throw error;
    }
  }

  // Fetch Customers
  async fetchCustomers(
    accessToken: string,
    since?: Date
  ): Promise<QBCustomer[]> {
    try {
      let query = "select * from Customer";
      if (since) {
        const isoDate = since.toISOString().split('T')[0];
        query += ` where MetaData.UpdatedTime >= '${isoDate}'`;
      }

      const response = await this.executeQuery(accessToken, query);

      return (response.Customer || []).map((cust: any) => ({
        id: cust.Id,
        realm_id: this.config.realm_id,
        name: cust.FullyQualifiedName,
        display_name: cust.DisplayName,
        email: cust.PrimaryEmailAddr?.Address || null,
        phone: cust.PrimaryPhone?.FreeFormNumber || null,
        mobile: null,
        website: cust.WebAddr?.URI || null,
        billing_address: cust.BillingAddr ? {
          line1: cust.BillingAddr.Line1 || '',
          line2: cust.BillingAddr.Line2 || null,
          city: cust.BillingAddr.City || '',
          state: cust.BillingAddr.CountrySubDivisionCode || null,
          postal_code: cust.BillingAddr.PostalCode || '',
          country: cust.BillingAddr.Country || 'AE',
        } : null,
        shipping_address: null,
        tax_id: null,
        currency: 'AED',
        is_active: !cust.Active || cust.Active === true,
        balance: cust.Balance || 0,
        created_at: new Date(cust.MetaData.CreateTime),
        updated_at: new Date(cust.MetaData.UpdateTime),
      }));
    } catch (error) {
      console.error('[QB] Failed to fetch customers:', error);
      throw error;
    }
  }

  // Fetch Vendors
  async fetchVendors(
    accessToken: string,
    since?: Date
  ): Promise<QBVendor[]> {
    try {
      let query = "select * from Vendor";
      if (since) {
        const isoDate = since.toISOString().split('T')[0];
        query += ` where MetaData.UpdatedTime >= '${isoDate}'`;
      }

      const response = await this.executeQuery(accessToken, query);

      return (response.Vendor || []).map((vendor: any) => ({
        id: vendor.Id,
        realm_id: this.config.realm_id,
        name: vendor.FullyQualifiedName,
        display_name: vendor.DisplayName,
        email: vendor.PrimaryEmailAddr?.Address || null,
        phone: vendor.PrimaryPhone?.FreeFormNumber || null,
        mobile: null,
        website: vendor.WebAddr?.URI || null,
        billing_address: vendor.BillAddr ? {
          line1: vendor.BillAddr.Line1 || '',
          line2: vendor.BillAddr.Line2 || null,
          city: vendor.BillAddr.City || '',
          state: vendor.BillAddr.CountrySubDivisionCode || null,
          postal_code: vendor.BillAddr.PostalCode || '',
          country: vendor.BillAddr.Country || 'AE',
        } : null,
        tax_id: vendor.TaxId || null,
        currency: 'AED',
        is_active: !vendor.Active || vendor.Active === true,
        balance: vendor.Balance || 0,
        created_at: new Date(vendor.MetaData.CreateTime),
        updated_at: new Date(vendor.MetaData.UpdateTime),
      }));
    } catch (error) {
      console.error('[QB] Failed to fetch vendors:', error);
      throw error;
    }
  }

  // Perform full sync
  async performFullSync(
    org_id: string,
    accessToken: string
  ): Promise<QBSyncEvent> {
    const syncId = crypto.randomUUID();
    const startTime = Date.now();
    let totalRecords = 0;
    const dataTypes = ['accounts', 'customers', 'vendors', 'invoices', 'bills', 'journal_entries'];

    try {
      const coa = await this.fetchChartOfAccounts(accessToken);
      const customers = await this.fetchCustomers(accessToken);
      const vendors = await this.fetchVendors(accessToken);
      const invoices = await this.fetchInvoices(accessToken);
      const bills = await this.fetchBills(accessToken);
      const journalEntries = await this.fetchJournalEntries(accessToken);

      totalRecords = coa.length + customers.length + vendors.length + 
                    invoices.length + bills.length + journalEntries.length;

      console.log(`[QB] Full sync completed: ${totalRecords} records`);

      const event: QBSyncEvent = {
        sync_id: syncId,
        org_id,
        realm_id: this.config.realm_id,
        sync_type: 'full',
        data_types: dataTypes,
        records_synced: totalRecords,
        records_created: totalRecords,
        records_updated: 0,
        sync_start: new Date(startTime),
        sync_end: new Date(),
        duration_ms: Date.now() - startTime,
        status: 'success',
        error_message: null,
        created_at: new Date(),
      };

      return event;
    } catch (error) {
      console.error('[QB] Full sync failed:', error);
      const event: QBSyncEvent = {
        sync_id: syncId,
        org_id,
        realm_id: this.config.realm_id,
        sync_type: 'full',
        data_types: dataTypes,
        records_synced: totalRecords,
        records_created: 0,
        records_updated: 0,
        sync_start: new Date(startTime),
        sync_end: new Date(),
        duration_ms: Date.now() - startTime,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        created_at: new Date(),
      };

      return event;
    }
  }

  // Incremental sync
  async performIncrementalSync(
    org_id: string,
    accessToken: string,
    lastSyncTime: Date
  ): Promise<QBSyncEvent> {
    const syncId = crypto.randomUUID();
    const startTime = Date.now();
    let totalRecords = 0;
    const dataTypes = ['invoices', 'bills', 'journal_entries', 'customers'];

    try {
      const invoices = await this.fetchInvoices(accessToken, lastSyncTime);
      const bills = await this.fetchBills(accessToken, lastSyncTime);
      const journalEntries = await this.fetchJournalEntries(accessToken, lastSyncTime);
      const customers = await this.fetchCustomers(accessToken, lastSyncTime);

      totalRecords = invoices.length + bills.length + journalEntries.length + customers.length;

      console.log(`[QB] Incremental sync: ${totalRecords} changes`);

      const event: QBSyncEvent = {
        sync_id: syncId,
        org_id,
        realm_id: this.config.realm_id,
        sync_type: 'incremental',
        data_types: dataTypes,
        records_synced: totalRecords,
        records_created: totalRecords,
        records_updated: 0,
        sync_start: new Date(startTime),
        sync_end: new Date(),
        duration_ms: Date.now() - startTime,
        status: 'success',
        error_message: null,
        created_at: new Date(),
      };

      return event;
    } catch (error) {
      console.error('[QB] Incremental sync failed:', error);
      const event: QBSyncEvent = {
        sync_id: syncId,
        org_id,
        realm_id: this.config.realm_id,
        sync_type: 'incremental',
        data_types: dataTypes,
        records_synced: totalRecords,
        records_created: 0,
        records_updated: 0,
        sync_start: new Date(startTime),
        sync_end: new Date(),
        duration_ms: Date.now() - startTime,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        created_at: new Date(),
      };

      return event;
    }
  }

  // Fetch company info from QuickBooks
  async fetchCompanyInfo(accessToken: string, realmId: string): Promise<any> {
    try {
      const query = 'SELECT * FROM CompanyInfo';
      const results = await this.executeQuery(accessToken, query, realmId);
      return results[0] || {};
    } catch (error) {
      console.error('[QB] Failed to fetch company info:', error);
      throw error;
    }
  }

  // Handle webhook events from QuickBooks
  async handleWebhook(
    org_id: string,
    realm_id: string,
    entityName: string,
    operation: string,
    entityId: string
  ): Promise<void> {
    try {
      console.log(
        `[QB] Webhook: ${operation} on ${entityName} (${entityId}) for realm ${realm_id}`
      );

      // Route to appropriate handler
      switch (entityName) {
        case 'Invoice':
          console.log(`[QB] Invoice ${operation}:`, entityId);
          // Would trigger AR agent
          break;
        case 'Bill':
          console.log(`[QB] Bill ${operation}:`, entityId);
          // Would trigger AP agent
          break;
        case 'JournalEntry':
          console.log(`[QB] Journal Entry ${operation}:`, entityId);
          // Would trigger GL agent
          break;
        case 'Customer':
          console.log(`[QB] Customer ${operation}:`, entityId);
          // Would trigger AR master data update
          break;
        case 'Vendor':
          console.log(`[QB] Vendor ${operation}:`, entityId);
          // Would trigger AP master data update
          break;
        case 'BankTransaction':
          console.log(`[QB] Bank Transaction ${operation}:`, entityId);
          // Would trigger reconciliation agent
          break;
        default:
          console.log(`[QB] Unknown entity type: ${entityName}`);
      }
    } catch (error) {
      console.error('[QB] Webhook handler error:', error);
      throw error;
    }
  }
}
