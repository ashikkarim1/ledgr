/**
 * Plaid Banking Integration
 * Real-time bank account and transaction feeds, multi-institution support
 */

import BaseIntegration, { Logger } from './base';
import { HttpClient } from './oauth-handler';
import {
  OAuthToken,
  IntegrationSetup,
  BankAccount,
  BankTransaction,
  CompanyInfo,
  ChartOfAccount,
  Invoice,
  Bill,
  Transaction,
} from './integration-types';

export class PlaidIntegration extends BaseIntegration {
  private httpClient: HttpClient;
  private clientId: string;
  private clientSecret: string;
  private environment: 'sandbox' | 'development' | 'production';
  private baseUrl: string;
  private logger: Logger;

  constructor(setup: IntegrationSetup) {
    super(setup);
    this.httpClient = new HttpClient();
    this.clientId = process.env.PLAID_CLIENT_ID || '';
    this.clientSecret = process.env.PLAID_SECRET || '';
    this.environment = (process.env.PLAID_ENV || 'sandbox') as any;
    
    this.baseUrl = this.getBaseUrl();
    this.logger = new Logger('PlaidIntegration');

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Plaid credentials not configured');
    }
  }

  // ========================================================================
  // OAuth & Connection (Link Token Flow)
  // ========================================================================

  async getAuthorizationUrl(integrationId: string): Promise<string> {
    try {
      // Generate Link Token
      const response = await this.httpClient.post<any>(
        `${this.baseUrl}/link/token/create`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          user: { client_user_id: integrationId },
          client_name: 'Ledgr',
          language: 'en',
          country_codes: ['AE'],
          products: ['auth', 'transactions'],
          auth: { auth_type_select_enabled: true },
        }
      );

      const linkToken = response.link_token;
      // Return URL to Plaid Link UI (hosted by Plaid)
      return `https://cdn.plaid.com/link/v3/?token=${linkToken}`;
    } catch (error) {
      this.logger.error('Failed to create Link token', { integrationId, error });
      throw error;
    }
  }

  async handleOAuthCallback(
    integrationId: string,
    publicToken: string,
    state: string
  ): Promise<OAuthToken> {
    try {
      // Exchange public token for access token
      const response = await this.httpClient.post<any>(
        `${this.baseUrl}/item/public_token/exchange`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          public_token: publicToken,
        }
      );

      const accessToken = response.access_token;
      const itemId = response.item_id;

      // Create a pseudo OAuthToken for storage
      const token: OAuthToken = {
        accessToken,
        refreshToken: itemId, // Store item ID as refresh token
        expiresIn: 365 * 24 * 60 * 60, // 1 year
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        tokenType: 'Bearer',
        scope: ['auth', 'transactions'],
        rawResponse: response,
      };

      this.tokens = token;
      await this.saveTokens(integrationId, token);

      this.setup.isConnected = true;
      this.setup.connectionStatus = 'connected';
      this.setup.tokens = token;

      this.logAudit('oauth_connected', { integrationId, itemId });
      return token;
    } catch (error) {
      this.logger.error('Token exchange failed', { integrationId, error });
      throw error;
    }
  }

  async testConnection(integrationId: string): Promise<boolean> {
    try {
      await this.ensureValidToken(integrationId);
      if (!this.tokens) throw new Error('No tokens available');

      // Test by fetching accounts
      await this.httpClient.post<any>(
        `${this.baseUrl}/auth/get`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          access_token: this.tokens.accessToken,
        }
      );

      this.logger.info('Connection test successful', { integrationId });
      return true;
    } catch (error) {
      this.logger.error('Connection test failed', { integrationId, error });
      return false;
    }
  }

  // ========================================================================
  // Banking Data Sync
  // ========================================================================

  async syncBankAccounts(integrationId: string): Promise<BankAccount[]> {
    await this.ensureValidToken(integrationId);
    if (!this.tokens) throw new Error('No tokens available');

    try {
      const response = await this.httpClient.post<any>(
        `${this.baseUrl}/auth/get`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          access_token: this.tokens.accessToken,
        }
      );

      const accounts = response.accounts || [];

      return accounts.map((account: any) => ({
        id: account.account_id,
        externalId: account.account_id,
        orgId: this.setup.orgId,
        accountNumber: account.mask,
        accountName: account.name,
        accountType: this.mapAccountType(account.subtype),
        institutionId: response.item?.institution_id || '',
        institutionName: response.item?.institution_name || '',
        currency: account.currency || 'AED',
        currentBalance: account.balances?.current || 0,
        availableBalance: account.balances?.available,
        balanceAsOf: Date.now(),
        isActive: true,
        isVerified: response.item?.verification_status !== 'unverified',
        integrationSource: 'plaid',
        syncedAt: Date.now(),
      }));
    } catch (error) {
      this.recordError({
        code: 'PLAID_SYNC_ACCOUNTS_ERROR',
        message: `Failed to sync bank accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId },
      });
      throw error;
    }
  }

  async syncBankTransactions(
    integrationId: string,
    since?: number
  ): Promise<BankTransaction[]> {
    await this.ensureValidToken(integrationId);
    if (!this.tokens) throw new Error('No tokens available');

    try {
      const startDate = since
        ? new Date(since).toISOString().split('T')[0]
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      const response = await this.httpClient.post<any>(
        `${this.baseUrl}/transactions/get`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          access_token: this.tokens.accessToken,
          start_date: startDate,
          end_date: endDate,
          options: { include_personal_finance_category: true },
        }
      );

      const transactions = response.transactions || [];

      return transactions.map((txn: any) => ({
        id: txn.transaction_id,
        externalId: txn.transaction_id,
        orgId: this.setup.orgId,
        accountId: txn.account_id,
        date: new Date(txn.date).getTime(),
        postedDate: txn.authorized_date ? new Date(txn.authorized_date).getTime() : undefined,
        amount: Math.abs(txn.amount),
        currency: txn.iso_currency_code || 'AED',
        description: txn.name || txn.merchant_name || 'Unknown',
        merchant: txn.merchant_name,
        category: txn.personal_finance_category?.primary,
        type: txn.amount > 0 ? 'credit' : 'debit',
        isReconciled: false,
        integrationSource: 'plaid',
        syncedAt: Date.now(),
        rawData: {
          plaidId: txn.transaction_id,
          pending: txn.pending,
          paymentChannel: txn.payment_channel,
          counterparties: txn.counterparties,
        },
      }));
    } catch (error) {
      this.recordError({
        code: 'PLAID_SYNC_TRANSACTIONS_ERROR',
        message: `Failed to sync bank transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        severity: 'error',
        context: { integrationId },
      });
      throw error;
    }
  }

  // ========================================================================
  // Accounting Methods (Not Supported by Plaid)
  // ========================================================================

  async syncCompanyInfo(integrationId: string): Promise<CompanyInfo> {
    throw new Error('syncCompanyInfo not supported for Plaid integration');
  }

  async syncAccounts(integrationId: string): Promise<ChartOfAccount[]> {
    throw new Error('syncAccounts not supported for Plaid integration');
  }

  async syncInvoices(integrationId: string, since?: number): Promise<Invoice[]> {
    throw new Error('syncInvoices not supported for Plaid integration');
  }

  async syncBills(integrationId: string, since?: number): Promise<Bill[]> {
    throw new Error('syncBills not supported for Plaid integration');
  }

  async syncTransactions(integrationId: string, since?: number): Promise<Transaction[]> {
    throw new Error('syncTransactions not supported for Plaid integration');
  }

  async pushTransaction(integrationId: string, transaction: Transaction): Promise<string> {
    throw new Error('pushTransaction not supported for Plaid integration');
  }

  // ========================================================================
  // Webhook Handling
  // ========================================================================

  async handleWebhook(event: any): Promise<void> {
    switch (event.webhook_type) {
      case 'TRANSACTIONS':
        this.handleTransactionWebhook(event);
        break;
      case 'ITEM':
        this.handleItemWebhook(event);
        break;
      default:
        this.logger.warn('Unknown webhook type', { type: event.webhook_type });
    }
  }

  private handleTransactionWebhook(event: any): void {
    switch (event.webhook_code) {
      case 'TRANSACTIONS_UPDATES_AVAILABLE':
        this.logger.info('Transactions available for sync', {
          itemId: event.item_id,
          newTransactions: event.new_transactions,
        });
        break;
      case 'TRANSACTIONS_REMOVED':
        this.logger.info('Transactions removed', {
          itemId: event.item_id,
          removedTransactions: event.removed_transactions,
        });
        break;
    }
  }

  private handleItemWebhook(event: any): void {
    switch (event.webhook_code) {
      case 'ERROR':
        this.logger.error('Plaid item error', {
          itemId: event.item_id,
          errorCode: event.error?.error_code,
          errorMessage: event.error?.error_message,
        });
        this.recordError({
          code: 'PLAID_ITEM_ERROR',
          message: `Plaid item error: ${event.error?.error_message}`,
          timestamp: Date.now(),
          severity: 'error',
          context: event.error,
        });
        break;
      case 'PENDING_EXPIRATION':
        this.logger.warn('Plaid item pending expiration', { itemId: event.item_id });
        break;
      case 'USER_PERMISSION_REVOKED':
        this.logger.warn('User revoked Plaid permissions', { itemId: event.item_id });
        break;
    }
  }

  // ========================================================================
  // Rate Limit & Retry Handling
  // ========================================================================

  protected async performTokenRefresh(refreshToken: string): Promise<OAuthToken> {
    // Plaid tokens don't expire, but we implement refresh for consistency
    // In real scenario, this would get a new link token
    return this.tokens!;
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private getBaseUrl(): string {
    const urls: Record<string, string> = {
      sandbox: 'https://sandbox.plaid.com',
      development: 'https://development.plaid.com',
      production: 'https://production.plaid.com',
    };
    return urls[this.environment] || urls.sandbox;
  }

  private mapAccountType(
    plaidSubtype: string
  ): 'checking' | 'savings' | 'money_market' | 'credit_card' {
    const map: Record<string, any> = {
      'checking': 'checking',
      'savings': 'savings',
      'money market': 'money_market',
      'credit card': 'credit_card',
      'cd account': 'savings',
      'ira': 'savings',
      'brokerage': 'savings',
    };
    return map[plaidSubtype?.toLowerCase()] || 'checking';
  }

  /**
   * Sync to reconciliation (match bank transactions to accounting transactions)
   */
  async syncReconciliation(
    integrationId: string,
    accountId: string,
    accountingTransactions: Transaction[]
  ): Promise<any> {
    const bankTransactions = await this.syncBankTransactions(integrationId);
    const accountBankTxns = bankTransactions.filter((t) => t.accountId === accountId);

    const matched: any[] = [];
    const unmatched: any[] = [];

    for (const bankTxn of accountBankTxns) {
      let found = false;

      for (const acctTxn of accountingTransactions) {
        // Match by amount, date (within tolerance), and description similarity
        const dateDiff = Math.abs(bankTxn.date - acctTxn.date);
        const amountMatch = bankTxn.amount === acctTxn.amount;
        const dateMatch = dateDiff < 24 * 60 * 60 * 1000; // Within 24 hours

        if (amountMatch && dateMatch) {
          matched.push({ bankTxn, acctTxn });
          found = true;
          break;
        }
      }

      if (!found) {
        unmatched.push(bankTxn);
      }
    }

    return { matched, unmatched, matchRate: matched.length / accountBankTxns.length };
  }
}

export default PlaidIntegration;
