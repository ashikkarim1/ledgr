# Ledgr Integration Layer - Developer Guide

## Overview

The Ledgr integration layer provides a production-grade, extensible framework for connecting to accounting software (QuickBooks Online, Xero, FreshBooks) and banking platforms (Plaid). This guide covers architecture, implementation patterns, security considerations, and practical usage examples.

## Table of Contents

1. [Architecture](#architecture)
2. [Core Concepts](#core-concepts)
3. [OAuth 2.0 Implementation](#oauth-20-implementation)
4. [Using Integrations](#using-integrations)
5. [Data Sync Patterns](#data-sync-patterns)
6. [Error Handling & Retry Logic](#error-handling--retry-logic)
7. [Security & Token Management](#security--token-management)
8. [Webhook Integration](#webhook-integration)
9. [Extending with New Integrations](#extending-with-new-integrations)
10. [Troubleshooting](#troubleshooting)

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                  Ledgr Application                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Integration Manager (HTTP API)                 │
│  - Route handlers for OAuth callbacks                       │
│  - Integration lifecycle management                         │
│  - Sync job orchestration                                   │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      ┌─────────┐  ┌─────────┐  ┌──────────┐
      │   QB    │  │  Xero   │  │ Plaid    │
      │  OAuth  │  │  OAuth  │  │  OAuth   │
      │ Handler │  │ Handler │  │ Handler  │
      └─────────┘  └─────────┘  └──────────┘
           │               │               │
           ▼               ▼               ▼
    ┌──────────────────────────────────────────┐
    │      BaseIntegration (Abstract)          │
    │  - Token encryption/decryption           │
    │  - OAuth flow management                 │
    │  - Error handling & retry logic          │
    │  - Audit logging & data sanitization     │
    │  - Rate limiting                         │
    └──────────────────────────────────────────┘
           │               │               │
           ▼               ▼               ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │ QuickBooks│   │   Xero    │   │ FreshBooks│
    │ Integration    │ Integration    │ Integration
    └───────────┘   └───────────┘   └───────────┘
```

### Module Breakdown

- **integration-types.ts**: TypeScript interfaces defining contracts for all integrations
- **base.ts**: Abstract BaseIntegration class with common functionality
- **oauth-handler.ts**: OAuth 2.0 handler with PKCE support and HTTP client
- **{quickbooks,xero,freshbooks,plaid}.ts**: Integration-specific implementations
- **sync-scheduler.ts**: Queue-based sync job scheduler with retry logic

## Core Concepts

### 1. OAuthToken Structure

Tokens are encrypted at rest and contain:

```typescript
{
  accessToken: string;      // Bearer token for API requests
  refreshToken?: string;    // Token to refresh expired access tokens
  expiresIn: number;        // Validity period in seconds
  expiresAt: number;        // Absolute expiration timestamp
  tokenType: 'Bearer';      // Standard OAuth token type
  scope: string[];          // Granted scopes/permissions
}
```

### 2. Integration Setup

Each integration instance maintains:

```typescript
{
  id: string;                    // Unique integration ID (UUID)
  orgId: string;                 // Organization context
  type: 'quickbooks' | 'xero' | ...;
  isConnected: boolean;          // OAuth authorization complete
  connectionStatus: string;      // 'pending' | 'connected' | 'error'
  tokens: string;                // Encrypted OAuthToken (AES-256-GCM)
  config: {
    baseCurrency?: string;       // Organization's base currency
    timezone?: string;
    syncSettingsId?: string;
  };
  syncSettings: {
    autoSync: boolean;
    syncFrequency: 'hourly' | 'daily' | 'weekly' | 'manual';
    retryOnError: boolean;
    maxRetries: 3;
    batchSize: 100;
  };
}
```

### 3. Sync Job Lifecycle

```
PENDING → RUNNING → COMPLETED/PARTIAL/FAILED
            │
            └─→ (error + retryable) → QUEUED FOR RETRY
```

Each sync job tracks:

```typescript
{
  id: string;                    // Unique job ID
  integrationId: string;
  status: SyncJobStatus;         // Current execution state
  initiatedBy: string;           // 'system' | 'user' | 'manual'
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;             // Milliseconds
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  itemsFailed: number;
  errors: SyncError[];
  retryCount: number;
  nextRetryAt?: Date;            // For scheduled retries
}
```

## OAuth 2.0 Implementation

### Authorization Code Flow with PKCE

Ledgr uses OAuth 2.0 Authorization Code flow with PKCE (Proof Key for Code Exchange) for enhanced security:

```
Step 1: Generate PKCE Parameters
  codeVerifier = random 128-character string
  codeChallenge = base64url(sha256(codeVerifier))

Step 2: Redirect to Authorization Server
  GET /authorize?
    client_id=...&
    redirect_uri=...&
    scope=...&
    code_challenge=...&
    code_challenge_method=S256&
    state=...

Step 3: User Authorizes → Browser Redirects to Callback
  GET /callback?code=...&state=...

Step 4: Exchange Code for Token (Backend)
  POST /token
    code=...&
    client_id=...&
    client_secret=...&
    code_verifier=...&  ← Proves possession of code_verifier
    grant_type=authorization_code

Step 5: Token Stored Encrypted
  token → AES-256-GCM encryption → stored in database
```

### Implementing OAuth for a New Integration

```typescript
async getAuthorizationUrl(): Promise<string> {
  const { state, codeVerifier, codeChallenge } = 
    this.oauthHandler.generateState(this.integrationId);
  
  // Store state metadata (10-minute expiry)
  this.stateManager.set(state, {
    codeVerifier,
    codeChallenge,
    integrationId: this.integrationId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  return this.oauthHandler.getAuthorizationUrl(state, codeChallenge);
}

async handleOAuthCallback(code: string, state: string): Promise<void> {
  // Validate state
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

  // Extract any account/tenant IDs needed
  const accountInfo = await this.getAccountInfo(token);

  // Encrypt and store
  const encryptedToken = this.tokenEncryption.encrypt(
    JSON.stringify(token)
  );
  this.setup.tokens = encryptedToken;
  this.setup.isConnected = true;

  // Clean up state
  this.stateManager.delete(state);
}
```

## Using Integrations

### Basic Setup

```typescript
import { QuickBooksIntegration } from './integrations/quickbooks';

// Create integration instance
const qbIntegration = new QuickBooksIntegration('int-123', 'org-456');

// Step 1: Get authorization URL and redirect user
const authUrl = await qbIntegration.getAuthorizationUrl();
// → Redirect browser to authUrl

// Step 2: Handle OAuth callback
app.get('/integrations/callback', async (req, res) => {
  const { code, state } = req.query;
  
  try {
    await qbIntegration.handleOAuthCallback(code as string, state as string);
    res.json({ success: true });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Step 3: Test connection
const isConnected = await qbIntegration.testConnection();
if (isConnected) {
  console.log('Connected to QuickBooks');
}
```

### Syncing Data

```typescript
// Manual sync
const accounts = await qbIntegration.syncAccounts();
const invoices = await qbIntegration.syncInvoices();

// Sync with date filter
const lastSync = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
const recentInvoices = await qbIntegration.syncInvoices(lastSync);

// Push data to integration
const transaction = {
  id: 'txn-001',
  type: 'invoice',
  date: new Date(),
  amount: 1000,
  // ... other fields
};
await qbIntegration.pushTransaction(transaction);
```

### Integration Manager Pattern

```typescript
class IntegrationManager {
  private integrations: Map<string, BaseIntegration> = new Map();
  private scheduler: SyncScheduler;

  async createIntegration(type: string, orgId: string): Promise<BaseIntegration> {
    const integrationId = crypto.randomUUID();
    
    let integration: BaseIntegration;
    switch (type) {
      case 'quickbooks':
        integration = new QuickBooksIntegration(integrationId, orgId);
        break;
      case 'xero':
        integration = new XeroIntegration(integrationId, orgId);
        break;
      case 'plaid':
        integration = new PlaidIntegration(integrationId, orgId);
        break;
      default:
        throw new Error(`Unknown integration type: ${type}`);
    }

    this.integrations.set(integrationId, integration);
    return integration;
  }

  async scheduleSync(integrationId: string, frequency: 'hourly' | 'daily'): Promise<void> {
    const integration = this.integrations.get(integrationId);
    if (!integration) throw new Error('Integration not found');

    this.scheduler.scheduleIntegration(integrationId, frequency, async (job) => {
      try {
        await integration.syncCompanyInfo();
        await integration.syncAccounts();
        await integration.syncInvoices();
        await integration.syncBills();
        
        this.scheduler.updateJobStatus(job.id, 'completed');
      } catch (error) {
        this.scheduler.addJobError(job.id, {
          code: 'sync_failed',
          message: error.message,
          retryable: true
        });
        
        if (this.scheduler.shouldRetry(job)) {
          this.scheduler.scheduleRetry(job.id);
        } else {
          this.scheduler.updateJobStatus(job.id, 'failed');
        }
      }
    });
  }
}
```

## Data Sync Patterns

### Account Sync Pattern

Each integration maps its account/category structure to Ledgr's standardized format:

```typescript
interface ChartOfAccount {
  id: string;              // Ledgr ID (e.g., 'qb-123')
  externalId: string;      // Integration's ID (e.g., '123')
  name: string;
  code: string;            // Account code
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  integrationSource: 'quickbooks' | 'xero' | ...;
  parentId?: string;       // For hierarchical accounts
}
```

**QuickBooks Mapping**:
- Asset → 'asset'
- Liability → 'liability'
- Equity → 'equity'
- Income → 'income'
- Expense → 'expense'

**Xero Mapping**:
- BANK, CURRENT ASSET, FIXED ASSET → 'asset'
- LIABILITY, CURRENT LIABILITY → 'liability'
- EQUITY → 'equity'
- REVENUE → 'income'
- EXPENSE → 'expense'

**FreshBooks Mapping**:
- Categories marked 'income' → 'income'
- Categories marked 'expense' → 'expense'

### Invoice/Bill Sync Pattern

```typescript
// After syncing, invoices contain:
{
  id: string;              // Ledgr ID
  externalId: string;      // Integration's ID
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  date: Date;
  dueDate?: Date;
  totalAmount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  lineItems: LineItem[];
  notes?: string;
  integrationSource: 'quickbooks' | 'xero' | ...;
}
```

### Transaction Synthesis

Integrations without direct transaction endpoints (QB, Xero, FreshBooks) synthesize transactions from invoices and bills:

```typescript
async syncTransactions(): Promise<Transaction[]> {
  const invoices = await this.syncInvoices();
  const bills = await this.syncBills();
  
  const transactions: Transaction[] = [];
  
  // Invoices = revenue (debit AR, credit revenue)
  for (const invoice of invoices) {
    transactions.push({
      id: invoice.id,
      type: 'invoice',
      date: invoice.date,
      amount: invoice.totalAmount,
      currency: this.baseCurrency,
      description: `Invoice ${invoice.invoiceNumber}`,
      lineItems: invoice.lineItems.map(li => ({
        amount: li.amount,
        description: li.description,
        accountId: 'accounts-receivable'
      })),
      status: invoice.status,
      integrationSource: this.type
    });
  }
  
  // Bills = expenses (debit expense, credit AP)
  for (const bill of bills) {
    transactions.push({
      id: bill.id,
      type: 'bill',
      // ... similar mapping
    });
  }
  
  return transactions;
}
```

## Error Handling & Retry Logic

### Error Categories

```typescript
interface SyncError {
  code: string;           // 'oauth_invalid', 'rate_limit', etc.
  message: string;
  timestamp: Date;
  retryable: boolean;     // Can this error be recovered?
  details?: {
    apiEndpoint?: string;
    httpStatus?: number;
    rawError?: string;
  };
}
```

**Retryable Errors**:
- `rate_limit`: Hit API rate limit (retry after backoff)
- `timeout`: Network timeout (retry)
- `temporary_error`: Transient server error (retry)
- `token_expired`: Token expired (refresh and retry)

**Non-Retryable Errors**:
- `oauth_invalid`: Invalid OAuth credentials
- `auth_revoked`: User revoked authorization
- `invalid_data`: Malformed input data
- `integration_disabled`: Integration removed

### Exponential Backoff Retry

```typescript
// Sync scheduler uses exponential backoff with max 3 retries
{
  maxRetries: 3,
  initialDelayMs: 5000,      // 5 seconds
  maxDelayMs: 300000         // 5 minutes
}

// Retry schedule:
// Attempt 1: Immediate
// Attempt 2: Wait 5000ms (5s)
// Attempt 3: Wait 10000ms (10s)
// Attempt 4: Wait 20000ms (20s)
// Max backoff: 300000ms (5 min)
```

### Error Handling Example

```typescript
async syncInvoices(): Promise<Invoice[]> {
  try {
    await this.ensureValidToken();
    
    const response = await this.request('/invoices');
    return response.invoices.map(inv => this.mapToInvoice(inv));
  } catch (error) {
    if (error instanceof RateLimitError) {
      // Retryable - scheduler will handle retry
      const syncError = this.createSyncError(
        'rate_limit',
        `Rate limit hit: ${error.message}`,
        true  // retryable = true
      );
      this.errorLog.push(syncError);
      throw error;
    } else if (error instanceof AuthError) {
      // Non-retryable - needs user action
      const syncError = this.createSyncError(
        'auth_revoked',
        'Authorization was revoked',
        false  // retryable = false
      );
      this.errorLog.push(syncError);
      this.setup.isConnected = false;
      throw error;
    }
    
    // Re-throw other errors
    throw error;
  }
}
```

### Monitoring Sync Health

```typescript
// Get sync statistics
const stats = scheduler.getStats();
console.log(`
  Queue: ${stats.queueSize} pending
  Processing: ${stats.processing} in flight
  Scheduled: ${stats.scheduled} recurring
  Failure rate: ${(stats.failureRate * 100).toFixed(2)}%
  Avg duration: ${stats.averageDuration}ms
`);

// Check recent errors
const errors = integration.getErrors();
const retryableErrors = errors.filter(e => e.retryable);
const failedErrors = errors.filter(e => !e.retryable);
```

## Security & Token Management

### Token Encryption (AES-256-GCM)

Tokens are encrypted using AES-256-GCM before storage:

```
Input:  {"accessToken": "..."}
        ↓
Step 1: Generate random 16-byte IV
Step 2: Encrypt with AES-256-GCM using masterKey
Step 3: Generate authentication tag (16 bytes)
        ↓
Output: "iv:authTag:encrypted"
```

**Encryption Flow**:

```typescript
class TokenEncryption {
  encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decrypt(encrypted: string): string {
    const [ivHex, tagHex, ciphertext] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

**Key Management**:

```
Environment: process.env.ENCRYPTION_KEY (base64-encoded 32 bytes)

In Production:
  ├─ AWS Secrets Manager stores encryption key
  ├─ Fetched at application startup
  ├─ Rotated via AWS key rotation policies
  └─ Never logged or exposed

In Development:
  ├─ Stored in .env file (git-ignored)
  └─ 32-byte random key for testing
```

### Token Expiry & Refresh

```typescript
// Tokens have built-in expiry
{
  expiresAt: 1234567890,  // Unix timestamp
  expiresIn: 3600          // Validity in seconds
}

// Ensured fresh before each API call
async ensureValidToken(): Promise<void> {
  const token = this.getCurrentToken();
  
  // 5-minute buffer for safety
  if (this.oauthHandler.isTokenExpired(token)) {
    await this.performTokenRefresh();
  }
}

// Automatic refresh on demand
async performTokenRefresh(): Promise<void> {
  const token = this.getCurrentToken();
  const newToken = await this.oauthHandler.refreshToken(token.refreshToken);
  
  const encrypted = this.tokenEncryption.encrypt(JSON.stringify(newToken));
  this.setup.tokens = encrypted;
}
```

### Data Sanitization

All logs automatically redact sensitive data:

```typescript
sanitizeData(obj: any): any {
  const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'clientSecret'];
  const sanitized = JSON.parse(JSON.stringify(obj));
  
  const redact = (o: any) => {
    for (const key in o) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        o[key] = '***redacted***';
      } else if (typeof o[key] === 'object' && o[key] !== null) {
        redact(o[key]);
      }
    }
  };
  
  redact(sanitized);
  return sanitized;
}

// In logs:
// Before: {"clientSecret": "abc123def456"}
// After:  {"clientSecret": "***redacted***"}
```

### Audit Logging

Every authentication and data modification is logged:

```typescript
logAudit(action: string, details?: any): void {
  const auditEntry = {
    timestamp: new Date(),
    integrationId: this.integrationId,
    action,
    details: this.sanitizeData(details || {}),
    userId: details?.userId,
    orgId: this.orgId
  };
  
  // Stored to audit trail (database)
  // Example entries:
  // - oauth_callback_success {accountId, connectionTime}
  // - token_refresh_success {tokenAge}
  // - invoice_sync_complete {itemsProcessed: 45}
  // - sync_error {code: 'rate_limit', retryable: true}
}
```

## Webhook Integration

### Plaid Webhooks

Plaid sends real-time updates for bank transactions and account changes:

```typescript
// Webhook signature verification
interface WebhookSignature {
  timestamp: number;
  hmacSha256: string;  // HMAC-SHA256 of request body
}

// Server validates:
const hmac = crypto
  .createHmac('sha256', PLAID_WEBHOOK_SECRET)
  .update(requestBody)
  .digest('hex');

if (hmac !== signature) {
  throw new Error('Invalid webhook signature');
}
```

**Webhook Types**:

```typescript
// TRANSACTIONS updates
{
  webhook_type: 'TRANSACTIONS',
  webhook_code: 'TRANSACTIONS_UPDATES_AVAILABLE',
  item_id: 'item_abc123',
  new_transactions: 2,
  removed_transactions: 0
}

// ITEM events
{
  webhook_type: 'ITEM',
  webhook_code: 'PENDING_EXPIRATION',
  item_id: 'item_abc123'
}
```

**Webhook Handler**:

```typescript
app.post('/webhooks/plaid', async (req, res) => {
  try {
    // Verify signature
    const isValid = validateWebhookSignature(
      req.body,
      req.headers['x-webhook-timestamp'],
      req.headers['x-webhook-signature']
    );
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Route to handler
    const integration = integrationManager.get(req.body.item_id);
    
    if (req.body.webhook_type === 'TRANSACTIONS') {
      await integration.handleTransactionWebhook(req.body);
    } else if (req.body.webhook_type === 'ITEM') {
      await integration.handleItemWebhook(req.body);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Extending with New Integrations

### Creating a New Integration

**Step 1: Define Types** (integration-types.ts)

```typescript
// Add integration type to union types if needed
type IntegrationProvider = 'quickbooks' | 'xero' | 'freshbooks' | 'newplatform';
```

**Step 2: Create Implementation** (newplatform.ts)

```typescript
import { BaseIntegration } from './base';
import { IIntegrationService } from './integration-types';

export class NewPlatformIntegration extends BaseIntegration implements IIntegrationService {
  private oauthHandler: OAuthHandler;
  private httpClient: HttpClient;

  constructor(integrationId: string, orgId: string) {
    super(integrationId, orgId, 'newplatform');
    
    this.oauthHandler = new OAuthHandler({
      clientId: process.env.NEWPLATFORM_CLIENT_ID || '',
      clientSecret: process.env.NEWPLATFORM_CLIENT_SECRET || '',
      redirectUri: process.env.NEWPLATFORM_REDIRECT_URI || '',
      authorizationUrl: 'https://auth.newplatform.com/oauth/authorize',
      tokenUrl: 'https://auth.newplatform.com/oauth/token',
      scope: ['accounting.read', 'accounting.write']
    });

    this.httpClient = new HttpClient({ timeout: 30000 });
  }

  // Implement required methods
  async getAuthorizationUrl(): Promise<string> { /* ... */ }
  async handleOAuthCallback(code: string, state: string): Promise<void> { /* ... */ }
  async testConnection(): Promise<boolean> { /* ... */ }
  async syncCompanyInfo(): Promise<CompanyInfo> { /* ... */ }
  async syncAccounts(): Promise<ChartOfAccount[]> { /* ... */ }
  async syncInvoices(lastSyncDate?: Date): Promise<Invoice[]> { /* ... */ }
  async syncBills(lastSyncDate?: Date): Promise<Bill[]> { /* ... */ }
  async syncTransactions(lastSyncDate?: Date): Promise<Transaction[]> { /* ... */ }
  async pushTransaction(transaction: Transaction): Promise<void> { /* ... */ }
  async syncBankAccounts() { return []; }
  async syncBankTransactions() { return []; }
  protected async performTokenRefresh(): Promise<void> { /* ... */ }
}
```

**Step 3: Register in Manager**

```typescript
// In IntegrationManager.createIntegration()
case 'newplatform':
  integration = new NewPlatformIntegration(integrationId, orgId);
  break;
```

**Step 4: Configure Environment**

```bash
# .env
NEWPLATFORM_CLIENT_ID=...
NEWPLATFORM_CLIENT_SECRET=...
NEWPLATFORM_REDIRECT_URI=http://localhost:3000/integrations/callback
```

### Data Mapping Strategy

Create mapping utilities for new platforms:

```typescript
// Map platform account types to Ledgr types
private mapAccountType(platformType: string): AccountType {
  const typeMap: { [key: string]: AccountType } = {
    'asset': 'asset',
    'bank': 'asset',
    'liability': 'liability',
    'equity': 'equity',
    'revenue': 'income',
    'expense': 'expense'
  };
  return typeMap[platformType.toLowerCase()] || 'asset';
}

// Map status codes
private mapInvoiceStatus(platformStatus: string): InvoiceStatus {
  const statusMap: { [key: string]: InvoiceStatus } = {
    'DRAFT': 'draft',
    'SENT': 'sent',
    'PAID': 'paid',
    'OVERDUE': 'overdue'
  };
  return statusMap[platformStatus] || 'draft';
}
```

## Troubleshooting

### Common Issues

**Issue: Token Refresh Fails**

```
Error: Invalid refresh token
```

**Cause**: Refresh token expired or revoked by provider

**Solution**:
```typescript
// Check token age
const tokenAge = Date.now() - token.iat * 1000;
if (tokenAge > REFRESH_THRESHOLD) {
  // Re-authenticate required
  integration.setup.isConnected = false;
}
```

**Issue: Rate Limit Exceeded**

```
Error: 429 Too Many Requests
```

**Cause**: Hitting API rate limit

**Solution**:
- Scheduler automatically retries with exponential backoff
- Check rate limit headers in response
- Adjust sync frequency or batch size

```typescript
// Respect rate limit headers
const retryAfter = parseInt(response.headers['retry-after']) || 60;
await this.delay(retryAfter * 1000);
```

**Issue: OAuth State Expired**

```
Error: Invalid or expired state
```

**Cause**: User took > 10 minutes to authorize

**Solution**: Restart OAuth flow - user clicks "Connect" again

**Issue: Encrypted Token Corrupt**

```
Error: Authentication tag verification failed
```

**Cause**: Token encrypted with different key or corrupted in transit

**Solution**:
- Verify ENCRYPTION_KEY environment variable
- Check database storage integrity
- Disconnect and re-authorize integration

### Debug Logging

```typescript
// Enable detailed logging
process.env.DEBUG_INTEGRATIONS = 'true';

// Logs include:
// [QB] GET /company/123 → 200 OK
// [QB] Response time: 245ms
// [QB] Processed 50 invoices
// [QB] Error code: RATE_LIMIT (retryable)
// [QB] Scheduling retry in 5000ms
```

### Health Checks

```typescript
async function healthCheck(): Promise<Health> {
  const integrations = integrationManager.getAll();
  
  return {
    status: 'ok',
    integrations: await Promise.all(
      integrations.map(async (i) => ({
        id: i.id,
        type: i.type,
        connected: await i.testConnection(),
        lastSync: i.getLatestJob(),
        nextSync: scheduler.getNextSync(i.id)
      }))
    ),
    queue: scheduler.getStats()
  };
}
```

## API Reference

### BaseIntegration Methods

- `getAuthorizationUrl(): Promise<string>` - OAuth redirect URL
- `handleOAuthCallback(code, state): Promise<void>` - Process callback
- `testConnection(): Promise<boolean>` - Verify credentials
- `syncCompanyInfo(): Promise<CompanyInfo>` - Sync organization
- `syncAccounts(): Promise<ChartOfAccount[]>` - Sync chart of accounts
- `syncInvoices(lastSyncDate?): Promise<Invoice[]>` - Sync invoices
- `syncBills(lastSyncDate?): Promise<Bill[]>` - Sync bills
- `syncTransactions(lastSyncDate?): Promise<Transaction[]>` - Sync transactions
- `pushTransaction(tx): Promise<void>` - Create transaction in platform
- `syncBankAccounts(): Promise<BankAccount[]>` - Sync bank accounts
- `syncBankTransactions(): Promise<BankTransaction[]>` - Sync bank transactions
- `getSyncStatus(jobId): Promise<SyncJob>` - Get job status
- `triggerSync(type): Promise<SyncJob>` - Start manual sync
- `getErrors(): SyncError[]` - Get recent errors
- `disconnect(): Promise<void>` - Revoke authorization

### SyncScheduler Methods

- `scheduleIntegration(id, freq, callback): void` - Schedule recurring sync
- `unscheduleIntegration(id): void` - Stop scheduled sync
- `createSyncJob(integId, initiator): SyncJob` - Queue manual sync
- `shouldRetry(job): boolean` - Check if error is retryable
- `scheduleRetry(jobId): void` - Schedule exponential backoff retry
- `getStats(): SchedulerStats` - Queue and job statistics

---

**Version**: 1.0.0  
**Last Updated**: 2026-05-31  
**Maintained By**: Ledgr Engineering Team
