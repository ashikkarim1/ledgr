// Wafeq Integration Service
// Handles OAuth2 authentication, data sync, and real-time data pulling

import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import {
  WafeqOAuth2Config,
  WafeqAccessToken,
  WafeqCompanyConnection,
  WafeqChartOfAccounts,
  WafeqGLEntry,
  WafeqInvoice,
  WafeqBill,
  WafeqBankTransaction,
  WafeqVATReturn,
  WafeqSyncEvent,
} from './types';

export class WafeqIntegrationService {
  private http: AxiosInstance;
  private config: WafeqOAuth2Config;
  private pool: Pool;
  private baseUrl: string = 'https://api.wafeq.com/api/v2';

  constructor(
    config: WafeqOAuth2Config,
    pool: Pool,
    baseUrl?: string
  ) {
    this.config = config;
    this.pool = pool;
    if (baseUrl) this.baseUrl = baseUrl;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  // OAuth2: Generate authorization URL
  generateAuthorizationUrl(state?: string): string {
    const stateParam = state || crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id: this.config.client_id,
      redirect_uri: this.config.redirect_uri,
      response_type: 'code',
      scope: this.config.scope.join(' '),
      state: stateParam,
    });

    return `${this.config.auth_endpoint}?${params.toString()}`;
  }

  // OAuth2: Exchange authorization code for access token
  async exchangeCodeForToken(code: string): Promise<WafeqAccessToken> {
    try {
      const response = await this.http.post(this.config.token_endpoint, {
        grant_type: 'authorization_code',
        code,
        client_id: this.config.client_id,
        client_secret: this.config.client_secret,
        redirect_uri: this.config.redirect_uri,
      });

      const token: WafeqAccessToken = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type || 'Bearer',
        scope: response.data.scope,
        expires_at: new Date(Date.now() + (response.data.expires_in * 1000)),
      };

      return token;
    } catch (error) {
      console.error('[Wafeq] Token exchange failed:', error);
      throw new Error('Failed to exchange authorization code for token');
    }
  }

  // OAuth2: Refresh access token
  async refreshAccessToken(refreshToken: string): Promise<WafeqAccessToken> {
    try {
      const response = await this.http.post(this.config.token_endpoint, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.client_id,
        client_secret: this.config.client_secret,
      });

      const token: WafeqAccessToken = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refreshToken,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type || 'Bearer',
        scope: response.data.scope,
        expires_at: new Date(Date.now() + (response.data.expires_in * 1000)),
      };

      return token;
    } catch (error) {
      console.error('[Wafeq] Token refresh failed:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  // Store company connection in database
  async storeCompanyConnection(
    org_id: string,
    company_id: string,
    company_name: string,
    token: WafeqAccessToken
  ): Promise<WafeqCompanyConnection> {
    const connection: WafeqCompanyConnection = {
      id: crypto.randomUUID(),
      org_id,
      company_id,
      company_name,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_expires_at: token.expires_at,
      is_connected: true,
      last_sync: null,
      sync_status: 'idle',
      last_error: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Note: This would be stored in a wafeq_connections table
    console.log('[Wafeq] Storing connection:', connection.id);
    return connection;
  }

  // Get stored company connection
  async getCompanyConnection(
    org_id: string,
    company_id: string
  ): Promise<WafeqCompanyConnection | null> {
    // Query wafeq_connections table
    const query = `
      SELECT * FROM wafeq_connections
      WHERE org_id = $1 AND company_id = $2
    `;
    
    try {
      const result = await this.pool.query(query, [org_id, company_id]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('[Wafeq] Failed to get connection:', error);
      return null;
    }
  }

  // Fetch Chart of Accounts
  async fetchChartOfAccounts(
    accessToken: string,
    company_id: string
  ): Promise<WafeqChartOfAccounts[]> {
    try {
      const response = await this.http.get(
        `/companies/${company_id}/chart-of-accounts`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      return response.data.accounts || [];
    } catch (error) {
      console.error('[Wafeq] Failed to fetch CoA:', error);
      throw error;
    }
  }

  // Fetch General Ledger Entries (incremental)
  async fetchGLEntries(
    accessToken: string,
    company_id: string,
    since?: Date,
    limit: number = 1000
  ): Promise<WafeqGLEntry[]> {
    try {
      const params: Record<string, any> = {
        limit,
        offset: 0,
      };

      if (since) {
        params.since = since.toISOString();
      }

      const response = await this.http.get(
        `/companies/${company_id}/general-ledger`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params,
        }
      );

      return response.data.entries || [];
    } catch (error) {
      console.error('[Wafeq] Failed to fetch GL entries:', error);
      throw error;
    }
  }

  // Fetch Invoices (AR)
  async fetchInvoices(
    accessToken: string,
    company_id: string,
    since?: Date,
    status?: string,
    limit: number = 500
  ): Promise<WafeqInvoice[]> {
    try {
      const params: Record<string, any> = { limit, offset: 0 };
      if (since) params.since = since.toISOString();
      if (status) params.status = status;

      const response = await this.http.get(
        `/companies/${company_id}/invoices`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params,
        }
      );

      return response.data.invoices || [];
    } catch (error) {
      console.error('[Wafeq] Failed to fetch invoices:', error);
      throw error;
    }
  }

  // Fetch Bills (AP)
  async fetchBills(
    accessToken: string,
    company_id: string,
    since?: Date,
    status?: string,
    limit: number = 500
  ): Promise<WafeqBill[]> {
    try {
      const params: Record<string, any> = { limit, offset: 0 };
      if (since) params.since = since.toISOString();
      if (status) params.status = status;

      const response = await this.http.get(
        `/companies/${company_id}/bills`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params,
        }
      );

      return response.data.bills || [];
    } catch (error) {
      console.error('[Wafeq] Failed to fetch bills:', error);
      throw error;
    }
  }

  // Fetch Bank Transactions
  async fetchBankTransactions(
    accessToken: string,
    company_id: string,
    bank_account_id: string,
    since?: Date,
    limit: number = 1000
  ): Promise<WafeqBankTransaction[]> {
    try {
      const params: Record<string, any> = { limit, offset: 0 };
      if (since) params.since = since.toISOString();

      const response = await this.http.get(
        `/companies/${company_id}/bank-accounts/${bank_account_id}/transactions`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params,
        }
      );

      return response.data.transactions || [];
    } catch (error) {
      console.error('[Wafeq] Failed to fetch bank transactions:', error);
      throw error;
    }
  }

  // Fetch VAT Returns
  async fetchVATReturns(
    accessToken: string,
    company_id: string
  ): Promise<WafeqVATReturn[]> {
    try {
      const response = await this.http.get(
        `/companies/${company_id}/vat-returns`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      return response.data.returns || [];
    } catch (error) {
      console.error('[Wafeq] Failed to fetch VAT returns:', error);
      throw error;
    }
  }

  // Sync all data for a company (full sync)
  async performFullSync(
    org_id: string,
    company_id: string,
    accessToken: string
  ): Promise<WafeqSyncEvent> {
    const syncId = crypto.randomUUID();
    const startTime = Date.now();
    let totalRecords = 0;
    const dataTypes = ['coa', 'gl', 'invoices', 'bills', 'bank', 'vat'];

    try {
      // Fetch all data types
      const coa = await this.fetchChartOfAccounts(accessToken, company_id);
      const gl = await this.fetchGLEntries(accessToken, company_id);
      const invoices = await this.fetchInvoices(accessToken, company_id);
      const bills = await this.fetchBills(accessToken, company_id);
      // Bank transactions would be fetched for each bank account
      const vat = await this.fetchVATReturns(accessToken, company_id);

      totalRecords = coa.length + gl.length + invoices.length + bills.length + vat.length;

      // Store in database (would insert into respective tables)
      console.log(`[Wafeq] Synced ${totalRecords} records for company ${company_id}`);

      const event: WafeqSyncEvent = {
        sync_id: syncId,
        org_id,
        company_id,
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
      console.error('[Wafeq] Full sync failed:', error);
      const event: WafeqSyncEvent = {
        sync_id: syncId,
        org_id,
        company_id,
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

  // Incremental sync (only fetch changes since last sync)
  async performIncrementalSync(
    org_id: string,
    company_id: string,
    accessToken: string,
    lastSyncTime: Date
  ): Promise<WafeqSyncEvent> {
    const syncId = crypto.randomUUID();
    const startTime = Date.now();
    let totalRecords = 0;
    const dataTypes = ['gl', 'invoices', 'bills', 'bank'];

    try {
      // Fetch only changes since last sync
      const gl = await this.fetchGLEntries(accessToken, company_id, lastSyncTime);
      const invoices = await this.fetchInvoices(accessToken, company_id, lastSyncTime);
      const bills = await this.fetchBills(accessToken, company_id, lastSyncTime);

      totalRecords = gl.length + invoices.length + bills.length;

      console.log(`[Wafeq] Incremental sync: ${totalRecords} changes`);

      const event: WafeqSyncEvent = {
        sync_id: syncId,
        org_id,
        company_id,
        sync_type: 'incremental',
        data_types: dataTypes,
        records_synced: totalRecords,
        records_created: totalRecords,
        records_updated: 0,
        sync_start: new Date(startTime),
        sync_end: new Date(),
        duration_ms: Date.now() - startTime,
        status: totalRecords > 0 ? 'success' : 'success',
        error_message: null,
        created_at: new Date(),
      };

      return event;
    } catch (error) {
      console.error('[Wafeq] Incremental sync failed:', error);
      const event: WafeqSyncEvent = {
        sync_id: syncId,
        org_id,
        company_id,
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

  // Real-time webhook listener (would be called by Wafeq when data changes)
  async handleWebhook(
    org_id: string,
    company_id: string,
    eventType: string,
    data: any
  ): Promise<void> {
    console.log(`[Wafeq] Webhook received: ${eventType} for company ${company_id}`);

    // Route to appropriate handler based on event type
    switch (eventType) {
      case 'invoice.created':
      case 'invoice.updated':
        await this.handleInvoiceChange(org_id, company_id, data);
        break;
      case 'bill.created':
      case 'bill.updated':
        await this.handleBillChange(org_id, company_id, data);
        break;
      case 'bank.transaction':
        await this.handleBankTransaction(org_id, company_id, data);
        break;
      case 'gl.entry':
        await this.handleGLEntry(org_id, company_id, data);
        break;
      default:
        console.log(`[Wafeq] Unknown event type: ${eventType}`);
    }
  }

  private async handleInvoiceChange(org_id: string, company_id: string, data: any): Promise<void> {
    console.log('[Wafeq] Invoice change:', data);
    // Would trigger AR agent to process invoice
  }

  private async handleBillChange(org_id: string, company_id: string, data: any): Promise<void> {
    console.log('[Wafeq] Bill change:', data);
    // Would trigger AP agent to process bill
  }

  private async handleBankTransaction(org_id: string, company_id: string, data: any): Promise<void> {
    console.log('[Wafeq] Bank transaction:', data);
    // Would trigger reconciliation agent
  }

  private async handleGLEntry(org_id: string, company_id: string, data: any): Promise<void> {
    console.log('[Wafeq] GL entry:', data);
    // Would trigger audit/compliance agent
  }

  // Fetch company details from Wafeq API
  async fetchCompanyDetails(accessToken: string): Promise<any> {
    try {
      const response = await this.http.get('/companies/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data.data || response.data;
    } catch (error) {
      console.error('[Wafeq] Failed to fetch company details:', error);
      throw error;
    }
  }
}
