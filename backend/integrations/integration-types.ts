/**
 * Integration Layer Types
 * Defines TypeScript interfaces for all accounting and banking integrations
 */

// ============================================================================
// OAuth & Authentication Types
// ============================================================================

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
  authorizationUrl: string;
  tokenUrl: string;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  expiresAt: number;
  tokenType: 'Bearer';
  scope: string[];
  rawResponse?: Record<string, any>;
}

export interface OAuthFlowState {
  state: string;
  codeVerifier?: string;
  createdAt: number;
  expiresAt: number;
  integrationId: string;
}

// ============================================================================
// Integration Setup & Configuration
// ============================================================================

export interface IntegrationSetup {
  id: string;
  orgId: string;
  type: 'quickbooks' | 'xero' | 'freshbooks' | 'plaid';
  name: string;
  description?: string;
  isActive: boolean;
  isConnected: boolean;
  connectionStatus: 'pending' | 'connected' | 'error' | 'expired';
  
  // OAuth tokens (encrypted at rest)
  tokens?: OAuthToken;
  
  // Integration-specific config
  config: Record<string, any>;
  
  // Sync settings
  syncSettings: SyncSettings;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  lastSyncAt?: number;
  errorLog?: IntegrationError[];
}

export interface SyncSettings {
  autoSync: boolean;
  syncFrequency: 'hourly' | 'daily' | 'weekly' | 'manual';
  syncTime?: string; // HH:mm format, UTC
  retryOnError: boolean;
  maxRetries: number;
  retryDelayMs: number;
  batchSize: number;
}

// ============================================================================
// Accounting Data Types
// ============================================================================

export interface ChartOfAccount {
  id: string;
  name: string;
  code: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  subType?: string;
  balance: number;
  currency: string;
  isActive: boolean;
  parentAccountId?: string;
  description?: string;
  taxCategory?: string;
  externalId: string; // ID from external system (QB, Xero, etc)
}

export interface Transaction {
  id: string;
  externalId: string;
  orgId: string;
  type: 'invoice' | 'bill' | 'payment' | 'expense' | 'journal_entry' | 'transfer';
  
  // Core transaction data
  date: number;
  amount: number;
  currency: string;
  description: string;
  referenceNumber?: string;
  
  // Relationships
  accountId: string;
  contactId?: string; // Customer/Vendor ID
  projectId?: string;
  
  // Line items
  lineItems: LineItem[];
  
  // Tax information
  taxAmount?: number;
  taxPercentage?: number;
  
  // Status
  status: 'draft' | 'posted' | 'paid' | 'cleared';
  isReconciled?: boolean;
  
  // Metadata
  integrationSource: string;
  sourceSystemId: string;
  syncedAt: number;
  lastModifiedAt?: number;
  isDuplicate?: boolean;
  duplicateOf?: string;
}

export interface LineItem {
  id: string;
  description: string;
  accountId?: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
  taxAmount?: number;
  taxRate?: number;
  itemCode?: string;
}

export interface Invoice {
  id: string;
  externalId: string;
  orgId: string;
  
  // Invoice details
  invoiceNumber: string;
  date: number;
  dueDate: number;
  amount: number;
  currency: string;
  
  // Customer info
  customerId: string;
  customerName: string;
  customerEmail?: string;
  
  // Line items
  lineItems: LineItem[];
  
  // Tax
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  
  // Status
  status: 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled';
  paidAmount?: number;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  
  // Metadata
  integrationSource: string;
  syncedAt: number;
}

export interface Bill {
  id: string;
  externalId: string;
  orgId: string;
  
  // Bill details
  billNumber: string;
  date: number;
  dueDate: number;
  amount: number;
  currency: string;
  
  // Vendor info
  vendorId: string;
  vendorName: string;
  vendorEmail?: string;
  
  // Line items
  lineItems: LineItem[];
  
  // Tax
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  
  // Status
  status: 'draft' | 'open' | 'overdue' | 'paid' | 'cancelled';
  paidAmount?: number;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  
  // Metadata
  integrationSource: string;
  syncedAt: number;
}

export interface CompanyInfo {
  id: string;
  externalId: string;
  name: string;
  displayName: string;
  registrationNumber?: string;
  taxId?: string;
  taxEnabled: boolean;
  
  // Address
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  
  // Contact
  email?: string;
  phone?: string;
  website?: string;
  
  // Fiscal settings
  fiscalYearStart?: number; // Month (1-12)
  fiscalYearEnd?: number;
  accountingMethod: 'accrual' | 'cash';
  
  // Multi-currency
  baseCurrency: string;
  supportedCurrencies: string[];
  
  // Metadata
  integrationSource: string;
  syncedAt: number;
}

// ============================================================================
// Banking Data Types
// ============================================================================

export interface BankAccount {
  id: string;
  externalId: string;
  orgId: string;
  
  // Account details
  accountNumber: string;
  accountName: string;
  accountType: 'checking' | 'savings' | 'money_market' | 'credit_card';
  
  // Institution
  institutionId: string;
  institutionName: string;
  routingNumber?: string;
  
  // Currency & balance
  currency: string;
  currentBalance: number;
  availableBalance?: number;
  balanceAsOf: number;
  
  // Status
  isActive: boolean;
  isVerified: boolean;
  
  // Metadata
  integrationSource: string;
  syncedAt: number;
}

export interface BankTransaction {
  id: string;
  externalId: string;
  orgId: string;
  accountId: string;
  
  // Transaction details
  date: number;
  postedDate?: number;
  amount: number;
  currency: string;
  
  // Description & categorization
  description: string;
  merchant?: string;
  category?: string;
  
  // Transaction type
  type: 'debit' | 'credit';
  transactionCode?: string;
  
  // Reconciliation
  isReconciled: boolean;
  reconciledAt?: number;
  
  // Matching
  matchedTransactionId?: string; // Link to accounting transaction
  
  // Metadata
  integrationSource: string;
  syncedAt: number;
  rawData?: Record<string, any>;
}

// ============================================================================
// Sync & Reconciliation Types
// ============================================================================

export interface SyncJob {
  id: string;
  integrationId: string;
  orgId: string;
  
  // Job info
  type: 'full' | 'incremental' | 'manual';
  dataTypes: ('accounts' | 'invoices' | 'bills' | 'transactions' | 'bank_accounts' | 'bank_transactions')[];
  
  // Status tracking
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  startedAt: number;
  completedAt?: number;
  duration?: number; // milliseconds
  
  // Results
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  itemsFailed: number;
  
  // Error handling
  errors: SyncError[];
  warnings: string[];
  
  // Retry info
  retryCount: number;
  nextRetryAt?: number;
  
  // Metadata
  initiatedBy: 'system' | 'user' | 'webhook';
}

export interface SyncError {
  code: string;
  message: string;
  dataId?: string;
  timestamp: number;
  retryable: boolean;
  details?: Record<string, any>;
}

export interface IntegrationError {
  code: string;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
  severity: 'info' | 'warning' | 'error' | 'critical';
  resolved?: boolean;
}

export interface Reconciliation {
  id: string;
  orgId: string;
  accountId: string;
  
  // Period
  startDate: number;
  endDate: number;
  
  // Balances
  systemBalance: number;
  externalBalance: number;
  difference: number;
  
  // Status
  status: 'pending' | 'in_progress' | 'completed' | 'verified';
  
  // Matched transactions
  matchedCount: number;
  unmatchedCount: number;
  
  // Timestamp
  createdAt: number;
  completedAt?: number;
}

// ============================================================================
// Data Mapping & Deduplication
// ============================================================================

export interface AccountMapping {
  id: string;
  orgId: string;
  
  // Internal account
  internalAccountId: string;
  
  // External mappings (can map to multiple external accounts)
  externalMappings: {
    integrationId: string;
    externalAccountId: string;
    externalAccountCode: string;
  }[];
  
  // Metadata
  createdAt: number;
  updatedAt: number;
}

export interface TransactionDeduplicationRule {
  id: string;
  orgId: string;
  
  // Rule config
  matchFields: ('date' | 'amount' | 'description' | 'accountId')[];
  dateToleranceMs: number; // Match transactions within N ms
  descriptionMatchType: 'exact' | 'partial' | 'contains';
  
  // Applied to
  integrationIds: string[];
  accountIds?: string[];
  
  // Metadata
  createdAt: number;
  isActive: boolean;
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  duplicateOf?: string;
  confidence: number; // 0-1
  matchedFields: string[];
  explanation: string;
}

// ============================================================================
// Currency Conversion
// ============================================================================

export interface CurrencyRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  timestamp: number;
  source: string;
}

export interface CurrencyConversion {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  convertedCurrency: string;
  rate: number;
  rateDate: number;
  conversionMethod: 'spot' | 'period_average' | 'eod';
}

// ============================================================================
// Integration Service Interface
// ============================================================================

export interface IIntegrationService {
  /**
   * Initialize OAuth flow and return authorization URL
   */
  getAuthorizationUrl(integrationId: string): Promise<string>;
  
  /**
   * Handle OAuth callback and save tokens
   */
  handleOAuthCallback(integrationId: string, code: string, state: string): Promise<OAuthToken>;
  
  /**
   * Test connection to external system
   */
  testConnection(integrationId: string): Promise<boolean>;
  
  /**
   * Sync company/organization information
   */
  syncCompanyInfo(integrationId: string): Promise<CompanyInfo>;
  
  /**
   * Sync chart of accounts
   */
  syncAccounts(integrationId: string): Promise<ChartOfAccount[]>;
  
  /**
   * Sync invoices
   */
  syncInvoices(integrationId: string, since?: number): Promise<Invoice[]>;
  
  /**
   * Sync bills
   */
  syncBills(integrationId: string, since?: number): Promise<Bill[]>;
  
  /**
   * Sync transactions
   */
  syncTransactions(integrationId: string, since?: number): Promise<Transaction[]>;
  
  /**
   * Push transaction to external system
   */
  pushTransaction(integrationId: string, transaction: Transaction): Promise<string>;
  
  /**
   * Sync bank accounts (Plaid)
   */
  syncBankAccounts(integrationId: string): Promise<BankAccount[]>;
  
  /**
   * Sync bank transactions
   */
  syncBankTransactions(integrationId: string, since?: number): Promise<BankTransaction[]>;
  
  /**
   * Refresh OAuth tokens if expired
   */
  refreshTokens(integrationId: string): Promise<OAuthToken>;
  
  /**
   * Get sync status
   */
  getSyncStatus(integrationId: string): Promise<SyncJob | null>;
  
  /**
   * Trigger manual sync
   */
  triggerSync(integrationId: string, dataTypes: string[]): Promise<SyncJob>;
  
  /**
   * Disconnect integration
   */
  disconnect(integrationId: string): Promise<void>;
}

// ============================================================================
// Webhook Types
// ============================================================================

export interface WebhookEvent {
  id: string;
  integrationId: string;
  orgId: string;
  
  // Event details
  type: string;
  dataType: string;
  action: 'created' | 'updated' | 'deleted';
  
  // Payload
  payload: Record<string, any>;
  
  // Signature verification
  signature: string;
  
  // Timestamp
  timestamp: number;
}

export interface WebhookSubscription {
  id: string;
  integrationId: string;
  orgId: string;
  
  // Endpoint
  webhookUrl: string;
  isActive: boolean;
  
  // Events
  events: string[];
  
  // Security
  secret: string;
  signingMethod: 'hmac-sha256' | 'rsa';
  
  // Retry
  maxRetries: number;
  retryDelayMs: number;
  
  // Metadata
  createdAt: number;
  lastTriggeredAt?: number;
  failureCount: number;
}

export type IntegrationType = 'quickbooks' | 'xero' | 'freshbooks' | 'plaid';
export type SyncType = 'full' | 'incremental' | 'manual';
export type TransactionStatus = 'draft' | 'posted' | 'paid' | 'cleared';
export type ReconciliationStatus = 'pending' | 'in_progress' | 'completed' | 'verified';
