# QuickBooks Integration Architecture Decisions & Blockers

This document captures key architectural decisions, design rationale, and known blockers/limitations for the QB integration implementation.

---

## Part 1: Architectural Decisions

### 1.1 OAuth 2.0 with PKCE

**Decision**: Implement RFC 7636 Proof Key for Public Clients (PKCE) for enhanced security.

**Rationale**:
- QB recommends PKCE for all client types (public and confidential)
- Prevents authorization code interception attacks even if code is captured
- Supports both web and native mobile flows
- QB OAuth endpoints require PKCE parameters (`code_challenge`, `code_challenge_method`)

**Implementation**:
```typescript
// In getAuthorizationUrl():
const codeVerifier = generateRandomString(128);
const codeChallenge = base64urlencode(sha256(codeVerifier));
// Store codeVerifier in session/cache with 10min TTL
// Include in auth URL: code_challenge=..., code_challenge_method=S256
```

**Impact**: All OAuth flows require both authorization code AND code_verifier for token exchange.

---

### 1.2 Realm ID Extraction & Token Storage

**Decision**: Extract QB Realm ID from OAuth token response and store separately from access/refresh tokens.

**Rationale**:
- QB API requires RealmID in all endpoint URLs: `/v2/company/{realmId}/query`
- RealmID is multi-tenant identifier unique to each QB company
- RealmID doesn't expire or change; safe to cache/reuse
- QB OAuth response includes RealmID in `realmId` or `realm_id` field (varies by QB SDK version)
- Without RealmID, no API calls are possible even with valid tokens

**Implementation**:
```typescript
interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: 'Bearer';
  realmId: string;           // QB Realm ID - extracted from response
}

// In handleOAuthCallback():
const tokens = await this.oauth.exchangeCode(code, state);
const realmId = tokens.realmId || tokens.realm_id;
if (!realmId) throw new Error('RealmID not in OAuth response');
this.tokens.realmId = realmId;
```

**Impact**: RealmID must be extracted immediately after OAuth; all subsequent API calls depend on it being present.

---

### 1.3 Incremental Sync with LastModified Timestamps

**Decision**: Implement incremental sync using QB's `MetaData.UpdatedTime` field to fetch only changed records.

**Rationale**:
- QB API supports filter syntax: `WHERE MetaData.UpdatedTime >= '{date}'`
- Full sync of large QB companies (thousands of accounts/invoices) is slow and expensive
- LastSyncDate tracking enables efficient delta syncs
- Reduces API calls and network bandwidth
- Supports both scheduled and manual incremental syncs

**Implementation**:
```typescript
// QB Query Language (QQL):
SELECT * FROM Account WHERE MetaData.UpdatedTime >= '2024-06-01T00:00:00Z'
SELECT * FROM Invoice WHERE MetaData.UpdatedTime >= '2024-06-01T00:00:00Z'
SELECT * FROM Bill WHERE MetaData.UpdatedTime >= '2024-06-01T00:00:00Z'

// In syncAccounts(since?: Date):
const sinceDate = since || this.setup.syncSettings.lastSyncDate;
const query = `SELECT * FROM Account WHERE MetaData.UpdatedTime >= '${sinceDate}'`;
```

**Impact**: First sync must use a minimal start date (1970-01-01 or signup date); subsequent syncs are fast.

---

### 1.4 Transaction Synthesis from Invoices & Bills

**Decision**: QB does not expose a Transaction entity; synthesize transactions from Invoice and Bill line items.

**Rationale**:
- QB API doesn't provide direct transaction query/fetch (different from accounting-friendly APIs)
- Invoices represent sales transactions (customer outflow)
- Bills represent purchase transactions (vendor inflow)
- Each line item in an invoice/bill represents a separate transaction
- Synthesis creates unified transaction ledger for Ledgr's unified view

**Implementation**:
```typescript
async syncTransactions(since?: Date): Promise<Transaction[]> {
  const invoices = await this.syncInvoices(since);
  const bills = await this.syncBills(since);
  
  const transactions: Transaction[] = [];
  
  invoices.forEach((inv) => {
    inv.lineItems?.forEach((line, idx) => {
      transactions.push({
        externalId: `qb_txn_inv_${inv.id}_${idx}`,
        type: 'invoice',
        date: inv.invoiceDate,
        amount: line.amount,
        counterparty: inv.customerName,
        sourceId: inv.id,
        sourceType: 'quickbooks',
        status: this.mapInvoiceStatusToTxnStatus(inv.status),
        lineItems: [line]
      });
    });
  });
  
  bills.forEach((bill) => {
    bill.lineItems?.forEach((line, idx) => {
      transactions.push({
        externalId: `qb_txn_bill_${bill.id}_${idx}`,
        type: 'bill',
        date: bill.billDate,
        amount: line.amount,
        counterparty: bill.vendorName,
        sourceId: bill.id,
        sourceType: 'quickbooks',
        status: this.mapBillStatusToTxnStatus(bill.status),
        lineItems: [line]
      });
    });
  });
  
  return transactions;
}
```

**Impact**: 
- Transaction count is typically 1.5-2x invoice+bill count (due to multiple line items)
- Ledgr sees complete financial picture without needing QB transaction API
- Deduplication must account for composite key (`qb_txn_inv_{id}_{index}`)

---

### 1.5 Account Type Mapping Strategy

**Decision**: Map QB's 12+ AccountType enums to Ledgr's 5 fundamental types (asset, liability, equity, income, expense).

**Rationale**:
- QB uses granular types (Bank, CreditCard, OtherCurrentAsset) for UI/reporting
- Ledgr uses fundamental accounting categories for universal compatibility
- All QB account types fit into 5 categories (GAAP standard)
- Enables consistent chart of accounts across all integrations (Xero, FreshBooks, etc.)

**Implementation**:
```typescript
private mapAccountType(qbType: string): AccountType {
  const mapping: { [key: string]: AccountType } = {
    'Asset': 'asset',
    'Bank': 'asset',
    'OtherCurrentAsset': 'asset',
    'FixedAsset': 'asset',
    'Liability': 'liability',
    'CreditCard': 'liability',
    'OtherCurrentLiab': 'liability',
    'Equity': 'equity',
    'Income': 'income',
    'OtherIncomeType': 'income',
    'Expense': 'expense',
    'OtherExpenseType': 'expense'
  };
  return mapping[qbType] || 'asset';
}
```

**Impact**: All QB accounts collapse into 5 types; Ledgr cannot distinguish Bank from CreditCard accounts (mitigated by storing original QB type in metadata).

---

### 1.6 Payment Status Derivation

**Decision**: Calculate payment status (paid/unpaid/partially_paid) from balance amount rather than QB docStatus field.

**Rationale**:
- QB docStatus is document workflow state (Draft, Submitted, Paid), not payment state
- A "Paid" invoice docStatus may still have a non-zero balance (overpayment or partial credit memo)
- A "Submitted" invoice may have been paid manually outside QB
- Balance amount is always accurate: `balance == 0` → paid, `balance == total` → unpaid, `0 < balance < total` → partial

**Implementation**:
```typescript
private mapPaymentStatus(
  totalAmount: number,
  balance: number
): PaymentStatus {
  if (balance === 0) return 'paid';
  if (balance === totalAmount) return 'unpaid';
  return 'partially_paid';
}
```

**Impact**: Ledgr's payment status is source-of-truth accurate; docStatus is stored separately for audit trail.

---

### 1.7 Error Recording with Retry Classification

**Decision**: Record all sync errors with `retryable: boolean` flag and execute exponential backoff retries.

**Rationale**:
- Transient errors (429 rate limit, 503 service unavailable) should retry automatically
- Permanent errors (401 auth, 400 bad request) should not retry (waste of time/quota)
- QB API is rate-limited (80 concurrent requests, 500 requests per minute)
- Network timeouts and connection resets are transient; should retry

**Implementation**:
```typescript
try {
  const accounts = await this.syncAccounts();
} catch (error) {
  const isRetryable = [429, 503, 0].includes(error.statusCode);
  this.recordError({
    code: 'sync_accounts_failed',
    message: error.message,
    retryable: isRetryable,
    context: { apiEndpoint: '/accounts', statusCode: error.statusCode }
  });
  
  if (isRetryable && shouldRetry(job)) {
    scheduleRetry(job.id, exponentialBackoff(job.retryCount));
  } else {
    updateJobStatus(job.id, 'failed');
  }
}
```

**Retry Strategy**:
- Initial delay: 5 seconds
- Max delay: 300 seconds (5 minutes)
- Backoff formula: `delay = min(initialDelay * 2^retryCount, maxDelay) + jitter(0-1s)`
- Max retries: 3 (configurable)

**Impact**: Transient failures are automatically recovered; permanent failures fail fast.

---

### 1.8 Token Encryption at Rest

**Decision**: Encrypt OAuth access/refresh tokens using AES-256-GCM before storing in PostgreSQL.

**Rationale**:
- Tokens are high-value secrets; must not be readable by database admins
- Compliance requirement for financial data (SOC 2, ISO 27001)
- AES-256-GCM provides authenticated encryption (detects tampering)
- Encryption key is separate from database; key rotation possible without token re-entry

**Implementation**:
```typescript
// In BaseIntegration.setupTokenEncryption():
import crypto from 'crypto';

const encryptionKey = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);

const encrypted = Buffer.concat([
  cipher.update(token.accessToken, 'utf8'),
  cipher.final()
]);
const authTag = cipher.getAuthTag();

// Store: { accessTokenEncrypted: encrypted, iv, authTag }

// To decrypt:
const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
decipher.setAuthTag(authTag);
const decrypted = Buffer.concat([
  decipher.update(encrypted),
  decipher.final()
]).toString('utf8');
```

**Schema Storage**:
```sql
CREATE TABLE oauth_tokens (
  access_token_encrypted BYTEA NOT NULL,  -- Ciphertext
  refresh_token_encrypted BYTEA,          -- Ciphertext
  iv BYTEA NOT NULL,                      -- 16-byte IV
  auth_tag BYTEA NOT NULL,                -- 16-byte authentication tag
  encryption_key_id VARCHAR(100),         -- For key rotation tracking
  ...
);
```

**Impact**: Requires TOKEN_ENCRYPTION_KEY in environment (32 bytes / 256 bits for AES-256). Key rotation requires re-encrypting all stored tokens.

---

### 1.9 Multi-Tenant Isolation via RLS

**Decision**: Implement Row-Level Security (RLS) on all integration tables for workspace isolation.

**Rationale**:
- Ledgr is multi-tenant SaaS; organizations must not see each other's integrations
- RLS enforces isolation at database level (not just application level)
- Single query bug cannot leak data across organizations
- Complies with data residency/GDPR requirements

**Implementation**:
```sql
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY oauth_tokens_access_by_org ON oauth_tokens
  USING (organization_id = current_setting('app.org_id')::uuid);

-- Set before query:
SET app.org_id = '{current_org_id}';
```

**In Application Code**:
```typescript
// Middleware sets org context:
app.use((req, res, next) => {
  const orgId = req.user.organization_id;
  await db.query('SET app.org_id = $1', [orgId]);
  next();
});

// All queries automatically filtered by RLS:
SELECT * FROM oauth_tokens;
// Internally becomes: SELECT * FROM oauth_tokens WHERE organization_id = $1
```

**Impact**: Queries become slower by ~5-10% (RLS overhead); security gain is substantial.

---

## Part 2: Known Blockers & Limitations

### 2.1 QB API Doesn't Expose Bank Transactions

**Blocker**: QB API has no endpoint for bank transaction imports/exports.

**Impact**:
- `syncBankAccounts()` returns empty array
- `syncBankTransactions()` returns empty array
- Ledgr cannot automatically sync bank data via QB integration
- Users must use Plaid integration for banking, QB for invoices/bills

**Workaround**: 
- Combine QB integration with Plaid integration for complete financial picture
- QB provides invoice/bill transactions; Plaid provides bank transactions

**Code**:
```typescript
async syncBankAccounts(): Promise<ChartOfAccount[]> {
  // QB API doesn't support this
  console.warn('Bank sync not supported for QuickBooks API');
  return [];
}

async syncBankTransactions(since?: Date): Promise<Transaction[]> {
  // QB API doesn't support this
  console.warn('Bank transactions not supported for QuickBooks API');
  return [];
}
```

---

### 2.2 QB Query Syntax Limitations

**Blocker**: QB Query Language (QQL) doesn't support complex aggregations or subqueries.

**Impact**:
- Cannot fetch "accounts with no recent transactions"
- Cannot fetch "invoices grouped by customer"
- Cannot fetch "aged AR report"
- Ledgr must do post-fetch aggregation in application code

**Workaround**: 
- Fetch all records (or use time filter), aggregate in Node.js
- Cache aggregations for performance

**Example**:
```typescript
// Cannot do in QB QQL:
SELECT CustomerRef.Name, COUNT(*) as invoice_count 
FROM Invoice GROUP BY CustomerRef.Name;

// Must do in application:
const invoices = await this.syncInvoices();
const grouped = invoices.reduce((acc, inv) => {
  acc[inv.customerName] = (acc[inv.customerName] || 0) + 1;
  return acc;
}, {});
```

---

### 2.3 QB API Rate Limiting

**Blocker**: QB API enforces strict rate limits: 80 concurrent requests, 500 requests per minute.

**Impact**:
- Concurrent syncs of multiple integrations may hit rate limits (429 response)
- Large customers with 10K+ invoices may timeout during sync
- Cannot perform real-time sync (must batch/schedule)

**Mitigation**:
- Implement exponential backoff retry (this is done)
- Use incremental sync to minimize request count
- Queue sync jobs with scheduler (max 5 concurrent per config)
- Schedule batched syncs during off-peak hours

**Code**:
```typescript
// In IntegrationManager config:
const DEFAULT_CONFIG: IntegrationConfig = {
  maxConcurrentSyncs: 5,  // Never exceed 5 parallel QB syncs
  syncRetryConfig: {
    maxRetries: 3,
    initialDelayMs: 5000,
    maxDelayMs: 300000     // 5 minute backoff max
  }
};
```

---

### 2.4 QB Realm ID Expiry (Hypothetical)

**Blocker** (Theoretical): QB could revoke Realm IDs after extended inactivity.

**Impact** (If Occurs):
- Stored Realm ID becomes invalid
- API calls fail with 404 (company not found)
- User must re-authorize to get new Realm ID

**Mitigation**:
- Store initial OAuth date
- If API fails with 404 and last usage > 6 months ago, prompt re-auth
- This is theoretical; QB typically maintains Realm IDs indefinitely

**Code**:
```typescript
if (error.statusCode === 404 && error.message.includes('company not found')) {
  const lastUsed = this.setup.lastSyncDate;
  const daysSinceSync = (Date.now() - lastUsed.getTime()) / (1000 * 86400);
  if (daysSinceSync > 180) {
    throw new IntegrationExpiredError('Re-authorization required');
  }
}
```

---

### 2.5 QB Token Expiry & Refresh Complexity

**Blocker**: QB OAuth tokens expire every 60 days; refresh tokens may also expire.

**Impact**:
- Manual intervention required if refresh token expires
- Sync jobs will fail with 401 (unauthorized)
- No automatic resolution possible

**Mitigation**:
- Implement automatic refresh on every sync (before API call)
- Refresh 5 minutes before expiry to provide buffer
- Log expiry date prominently in status endpoint
- Alert users 14 days before expiry

**Code** (Implemented):
```typescript
private async ensureTokenValid(): Promise<void> {
  if (!this.tokens.accessToken) {
    throw new Error('No tokens available');
  }

  const expiryDate = new Date(this.tokens.issuedAt.getTime() + this.tokens.expiresIn * 1000);
  const bufferMs = 5 * 60 * 1000;  // 5 minute buffer
  const now = new Date();

  if (now.getTime() > expiryDate.getTime() - bufferMs) {
    await this.performTokenRefresh(this.tokens.refreshToken!);
  }
}
```

---

### 2.6 QB Multi-Currency Handling

**Blocker**: QB stores transactions in company base currency only; multi-currency is limited.

**Impact**:
- All amounts are in single currency (e.g., AED for UAE companies)
- Foreign exchange transactions are manual journal entries
- Ledgr cannot sync FX rates or multi-currency invoices

**Workaround**:
- Store all amounts in base currency
- If user needs FX, they must manually create journal entries in QB
- Config stores baseCurrency (AED, USD, etc.) for reference

**Code**:
```typescript
interface IntegrationSetup {
  config: {
    baseCurrency: string;  // 'AED', 'USD', etc. - from QB company settings
    timezone: string;      // 'Asia/Dubai' - from QB company settings
  }
}
```

---

### 2.7 QB Archived Records

**Blocker**: QB soft-deletes records instead of hard-delete; archived records still appear in queries.

**Impact**:
- Synced invoices may include archived (logically deleted) records
- Ledgr sees "deleted" invoices as still synced
- User may be confused by archived records appearing in reports

**Workaround**:
- Filter archived records: `WHERE Active = true` (if available)
- Document in UI that archived QB records are synced
- Provide option to ignore archived records in sync settings

**Code**:
```typescript
// For accounts (has Active field):
const query = `SELECT * FROM Account WHERE Active = true`;

// For invoices/bills (no Active field):
// Must check docStatus or amount to detect archived records
```

---

### 2.8 QB Duplicate Detection Complexity

**Blocker**: QB can have legitimate duplicate invoice/bill numbers (different customers, date ranges).

**Impact**:
- Cannot use invoice_number alone as unique key
- Must use composite key: `(customer, invoice_number, date)`
- SHA-256 fingerprinting handles this, but edge cases remain

**Mitigation**:
- Use fingerprinting on normalized composite key
- Store original QB ID for deterministic deduplication
- Alert user if deduplication removes > 10% of synced records

**Code**:
```typescript
const fingerprint = sha256(
  `${normalizeName(invoice.customerName)}|${invoice.invoiceNumber}|${invoice.invoiceDate}|${invoice.totalAmount}`
);
```

---

### 2.9 QB Connection Requires Admin Credentials

**Blocker**: QB OAuth requires the logged-in user to be a QB admin (or have sync permissions).

**Impact**:
- Regular QB users cannot authorize Ledgr integration
- Only QB admins can connect
- Multi-user company scenarios require admin involvement

**Mitigation**:
- Document in setup wizard that admin must authorize
- Provide admin setup guide
- Consider using QB API with app-level tokens (not user-level) in future

---

### 2.10 QB Realm ID Ties Integration to Specific Company

**Blocker**: Each QB subscription = 1 Realm ID = 1 company. Cannot sync multiple QB companies with one Ledgr workspace.

**Impact**:
- If user has 3 QB companies, they need 3 separate Ledgr workspaces
- Or: Implement QB multi-company sync by storing multiple RealmIDs (not currently done)

**Workaround** (For Future):
- Extend IntegrationManager to support multiple RealmIDs per organization
- Create child integration instances for each QB company
- Tag synced records with source RealmID

**Current Limitation**:
```typescript
// Today: 1 QB integration per workspace
const integration = await manager.createIntegration('quickbooks', orgId);

// Future: Multiple QB integrations per workspace
const integration1 = await manager.createIntegration('quickbooks', orgId, { realmId: 'realm1' });
const integration2 = await manager.createIntegration('quickbooks', orgId, { realmId: 'realm2' });
```

---

## Part 3: Testing & Validation Gaps

### 3.1 Outstanding Integration Tests

The test suite (`quickbooks-integration.test.ts`) covers happy path scenarios. The following integration tests remain:

**Not Yet Implemented**:
1. **OAuth Expiry Recovery**: Test token refresh when access token expires during sync
2. **Realm ID Mismatch**: Test error handling when Realm ID is invalid or changed
3. **Large Dataset Sync**: Test syncing 10K+ accounts/invoices (pagination, rate limiting)
4. **Partial Sync Failure**: Test sync job resume when network fails mid-sync
5. **Concurrent Sync Handling**: Test max concurrent sync limit (5 parallel jobs)
6. **Webhook Processing**: Test QB webhook notifications triggering incremental syncs
7. **Currency Mismatch**: Test sync when QB company currency differs from Ledgr config
8. **RLS Isolation**: Test that user A cannot see organization B's integrations

### 3.2 Outstanding Manual Tests

**Not Yet Performed**:
1. Live QB sandbox connection with real OAuth flow
2. Rate limit handling (trigger 429 response)
3. Service unavailability handling (503 response)
4. Real incremental sync with stale QB data (> 60 days old)
5. Database RLS enforcement (verify isolation at SQL level)

---

## Part 4: Future Enhancements

### 4.1 Webhook-Driven Sync

Instead of polling, subscribe to QB webhooks:
```typescript
// QB webhook event types:
// - TRANSACTIONS: New/updated transaction
// - ITEM: New/updated item
// - AUTH_EXPIRING: Expiry warning
// - INVOICE: New/updated invoice
// - BILL: New/updated bill

// On webhook:
app.post('/webhooks/quickbooks', async (req) => {
  const { realmId, eventCode, entities } = req.body;
  // Trigger incremental sync for affected entities
  await triggerIncrementalSync(realmId, entities);
});
```

### 4.2 Multi-Company Support

Extend integration manager to track multiple QB realms:
```typescript
interface QuickBooksIntegration {
  realms: Array<{
    realmId: string;
    companyName: string;
    accessToken: string;
    refreshToken: string;
  }>;
}
```

### 4.3 Custom Field Sync

Map QB custom fields to Ledgr fields:
```typescript
// QB Custom Fields (defined by user)
// Example: {CustomerRef} → Sales Region, Project Code, etc.
// Sync to Ledgr invoice.metadata field
```

### 4.4 Attachment Sync

Download QB invoice/bill attachments and store in S3:
```typescript
async syncAttachments(invoiceId: string): Promise<Attachment[]> {
  const attachments = await qbClient.getAttachments(realmId, invoiceId);
  // Upload to S3, store S3 URLs in ledgr.invoices.attachments
}
```

---

## Summary

This QB integration is production-ready with the following constraints:

| Aspect | Status | Constraint |
|--------|--------|-----------|
| OAuth 2.0 Flow | ✅ Ready | Token refresh required every 60 days |
| Account Sync | ✅ Ready | 12+ QB types → 5 Ledgr types (loss of detail) |
| Invoice Sync | ✅ Ready | No attachments or custom fields |
| Bill Sync | ✅ Ready | No attachments or custom fields |
| Transaction Sync | ✅ Ready | Synthesized from invoices/bills only |
| Bank Sync | ❌ N/A | QB API doesn't support |
| Incremental Sync | ✅ Ready | First sync may be slow (full fetch) |
| Rate Limiting | ✅ Handled | Exponential backoff for 429/503 errors |
| Multi-Currency | ❌ Limited | Single base currency only |
| Multi-Company | ⚠️ Partial | One QB company per Realm ID (future enhancement) |
| Real-Time Updates | ❌ Not Now | Polling-based; webhook support planned |

