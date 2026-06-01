# QuickBooks to Ledgr API Schema Mapping

This document details the field transformations and data flow from QuickBooks Online API to Ledgr's PostgreSQL database schema.

## Overview

The QuickBooks integration syncs four primary data entities:
1. **Chart of Accounts** - QB Account objects → Ledgr accounts table
2. **Invoices** - QB Invoice objects → Ledgr invoices table
3. **Bills** - QB Bill objects → Ledgr bills table
4. **Transactions** - Synthesized from Invoices and Bills → Ledgr transactions table

All data flows through the `IntegrationManager` sync scheduler with error handling, deduplication, and incremental sync support.

---

## 1. Chart of Accounts Mapping

### QB Account Object → Ledgr Account Record

| QB Field | Ledgr Field | Type | Transformation | Notes |
|----------|-------------|------|-----------------|-------|
| `id` | `qb_account_id` | string | Direct copy | QB Account ID (external ref) |
| `id` | `external_id` | string | Prefixed as `qb_account_{id}` | Unique identifier for deduplication |
| `name` | `account_name` | string | Direct copy | Max 255 chars |
| `accountNumber` | `account_number` | string | Direct copy | Optional QB account number |
| `accountType` | `account_type` | enum | **Type Mapping** (see below) | Standardized to Ledgr types |
| `currentBalance` | `balance` | decimal(19,4) | Direct copy | Current account balance |
| `description` | `description` | text | Direct copy | Optional descriptive text |
| `active` | `is_active` | boolean | Direct copy | Filter: only sync if `active = true` |
| `subAccount` | `parent_account_id` | UUID | Join to parent account | If subaccount, reference parent |
| N/A | `currency` | string | Fixed to config.baseCurrency | Defaults to 'AED' |
| N/A | `organization_id` | UUID | From auth context | Workspace/org isolation |
| `metaData.createTime` | `created_at` | timestamp | Parse ISO string | QB record creation time |
| `metaData.updateTime` | `updated_at` | timestamp | Parse ISO string | QB record last modification |
| N/A | `synced_at` | timestamp | now() | Ledgr sync timestamp |

### QB Account Type Mapping

```
QB AccountType → Ledgr account_type Enum:
- Asset              → 'asset'
- Liability          → 'liability'
- Equity             → 'equity'
- Income             → 'income'
- Expense            → 'expense'
- OtherCurrentAsset  → 'asset'
- OtherCurrentLiab   → 'liability'
- FixedAsset         → 'asset'
- Bank               → 'asset'
- CreditCard         → 'liability'
- OtherIncomeType    → 'income'
- OtherExpenseType   → 'expense'
```

### SQL Target (Schema: `/backend/migrations/002_core_tables.sql`)

```sql
INSERT INTO accounts (
  organization_id, account_name, account_number, account_type, 
  balance, description, is_active, parent_account_id, currency,
  qb_account_id, external_id, created_at, updated_at, synced_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now()
)
ON CONFLICT (organization_id, external_id) DO UPDATE SET
  account_name = EXCLUDED.account_name,
  balance = EXCLUDED.balance,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at,
  synced_at = now();
```

### Incremental Sync Filter

```
Query: SELECT * FROM Account WHERE MetaData.UpdatedTime >= '{lastSyncDate}'
Parameters: lastSyncDate = integration.setup.lastSyncDate or '1970-01-01'
```

---

## 2. Invoices Mapping

### QB Invoice Object → Ledgr Invoice Record

| QB Field | Ledgr Field | Type | Transformation | Notes |
|----------|-------------|------|-----------------|-------|
| `id` | `qb_invoice_id` | string | Direct copy | QB Invoice ID |
| `id` | `external_id` | string | Prefixed as `qb_invoice_{id}` | For deduplication |
| `docNumber` | `invoice_number` | string | Direct copy | QB invoice number |
| `txnDate` | `invoice_date` | date | Parse date string | Date invoice was issued |
| `dueDate` | `due_date` | date | Parse date string | Payment due date |
| `totalAmt` | `total_amount` | decimal(19,4) | Direct copy | Invoice total |
| `balance` | `amount_due` | decimal(19,4) | Direct copy | Outstanding balance |
| `docStatus` | `status` | enum | **Status Mapping** (see below) | Invoice state |
| `customerRef.value` | `customer_id` | string | Direct copy | QB Customer ID |
| `customerRef.name` | `customer_name` | string | Direct copy | Customer name |
| N/A | `payment_status` | enum | **Payment Status** (derived) | See calculation below |
| `line[].itemRef.value` | `line_items[].item_id` | string | Array of QB Item IDs | Line item references |
| `line[].description` | `line_items[].description` | string | Array of descriptions | Line item descriptions |
| `line[].amount` | `line_items[].amount` | decimal(19,4) | Array of amounts | Line item amounts |
| `currencyRef.value` | `currency` | string | Direct copy | Defaults to USD in QB |
| `metaData.updateTime` | `updated_at` | timestamp | Parse ISO string | Last modification time |
| N/A | `organization_id` | UUID | From auth context | Workspace isolation |
| N/A | `synced_at` | timestamp | now() | Ledgr sync timestamp |

### QB Invoice Status Mapping

```
QB docStatus → Ledgr status:
- Draft      → 'draft'
- Submitted  → 'sent'
- Paid       → 'paid'
- Canceled   → 'cancelled'
```

### Payment Status Derivation

```
if balance == 0:
  payment_status = 'paid'
else if balance == totalAmt:
  payment_status = 'unpaid'
else:
  payment_status = 'partially_paid'
```

### SQL Target (Schema)

```sql
INSERT INTO invoices (
  organization_id, invoice_number, invoice_date, due_date,
  total_amount, amount_due, status, payment_status,
  customer_id, customer_name, line_items, currency,
  qb_invoice_id, external_id, created_at, updated_at, synced_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), $15, now()
)
ON CONFLICT (organization_id, external_id) DO UPDATE SET
  amount_due = EXCLUDED.amount_due,
  status = EXCLUDED.status,
  payment_status = EXCLUDED.payment_status,
  updated_at = EXCLUDED.updated_at,
  synced_at = now();
```

### Incremental Sync Filter

```
Query: SELECT * FROM Invoice WHERE MetaData.UpdatedTime >= '{lastSyncDate}'
Parameters: lastSyncDate = integration.setup.lastSyncDate or '1970-01-01'
```

---

## 3. Bills Mapping

### QB Bill Object → Ledgr Bill Record

| QB Field | Ledgr Field | Type | Transformation | Notes |
|----------|-------------|------|-----------------|-------|
| `id` | `qb_bill_id` | string | Direct copy | QB Bill ID |
| `id` | `external_id` | string | Prefixed as `qb_bill_{id}` | For deduplication |
| `docNumber` | `bill_number` | string | Direct copy | QB bill/PO number |
| `txnDate` | `bill_date` | date | Parse date string | Date bill was received |
| `dueDate` | `due_date` | date | Parse date string | Payment due date |
| `totalAmt` | `total_amount` | decimal(19,4) | Direct copy | Bill total |
| `balance` | `amount_due` | decimal(19,4) | Direct copy | Outstanding balance |
| `docStatus` | `status` | enum | **Status Mapping** (see below) | Bill state |
| `vendorRef.value` | `vendor_id` | string | Direct copy | QB Vendor ID |
| `vendorRef.name` | `vendor_name` | string | Direct copy | Vendor name |
| N/A | `payment_status` | enum | **Payment Status** (derived) | Same logic as invoices |
| `line[].itemRef.value` | `line_items[].item_id` | string | Array of QB Item IDs | Line item references |
| `line[].description` | `line_items[].description` | string | Array of descriptions | Line item descriptions |
| `line[].amount` | `line_items[].amount` | decimal(19,4) | Array of amounts | Line item amounts |
| `currencyRef.value` | `currency` | string | Direct copy | Defaults to USD in QB |
| `metaData.updateTime` | `updated_at` | timestamp | Parse ISO string | Last modification time |
| N/A | `organization_id` | UUID | From auth context | Workspace isolation |
| N/A | `synced_at` | timestamp | now() | Ledgr sync timestamp |

### QB Bill Status Mapping

```
QB docStatus → Ledgr status:
- Draft      → 'draft'
- Submitted  → 'received'
- Paid       → 'paid'
- Canceled   → 'cancelled'
```

### SQL Target (Schema)

```sql
INSERT INTO bills (
  organization_id, bill_number, bill_date, due_date,
  total_amount, amount_due, status, payment_status,
  vendor_id, vendor_name, line_items, currency,
  qb_bill_id, external_id, created_at, updated_at, synced_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), $15, now()
)
ON CONFLICT (organization_id, external_id) DO UPDATE SET
  amount_due = EXCLUDED.amount_due,
  status = EXCLUDED.status,
  payment_status = EXCLUDED.payment_status,
  updated_at = EXCLUDED.updated_at,
  synced_at = now();
```

### Incremental Sync Filter

```
Query: SELECT * FROM Bill WHERE MetaData.UpdatedTime >= '{lastSyncDate}'
Parameters: lastSyncDate = integration.setup.lastSyncDate or '1970-01-01'
```

---

## 4. Transactions Mapping (Synthesized)

### Transaction Synthesis Strategy

QB API does not expose a direct `Transaction` entity. Ledgr synthesizes transactions from:
- **Source 1**: Invoices (customer sales)
- **Source 2**: Bills (vendor purchases)

Each invoice/bill line item creates a transaction record representing the financial exchange.

### QB Invoice Line → Ledgr Transaction Record

| QB Field | Ledgr Field | Type | Transformation | Notes |
|----------|-------------|------|-----------------|-------|
| `invoice.id` + `line[index]` | `external_id` | string | Prefixed as `qb_txn_inv_{invoiceId}_{lineIndex}` | Composite key for dedup |
| N/A | `type` | enum | Fixed to 'invoice' | Source type identifier |
| `invoice.txnDate` | `transaction_date` | date | Direct copy | Transaction date |
| `invoice.totalAmt` | `amount` | decimal(19,4) | `line.amount` for line-level txns | Amount involved |
| `invoice.customerRef.name` | `counterparty` | string | Direct copy | Customer name |
| `invoice.id` | `source_id` | string | QB Invoice ID | Reference back to source |
| N/A | `source_type` | string | Fixed to 'quickbooks' | Integration source |
| `invoice.docStatus` | `status` | enum | Map from Invoice status → txn status | Draft, Sent, Paid, Cancelled |
| `line[].description` | `description` | string | Line item description | What was purchased/sold |
| `line[]` | `line_items` | JSONB | Array of line objects | Complete line item details |
| `invoice.currencyRef.value` | `currency` | string | Direct copy | Currency code |
| N/A | `organization_id` | UUID | From auth context | Workspace isolation |
| `invoice.metaData.updateTime` | `updated_at` | timestamp | Parse ISO string | Last modification |
| N/A | `synced_at` | timestamp | now() | Ledgr sync timestamp |

### QB Bill Line → Ledgr Transaction Record

| QB Field | Ledgr Field | Type | Transformation | Notes |
|----------|-------------|------|-----------------|-------|
| `bill.id` + `line[index]` | `external_id` | string | Prefixed as `qb_txn_bill_{billId}_{lineIndex}` | Composite key for dedup |
| N/A | `type` | enum | Fixed to 'bill' | Source type identifier |
| `bill.txnDate` | `transaction_date` | date | Direct copy | Transaction date |
| `bill.totalAmt` | `amount` | decimal(19,4) | `line.amount` for line-level txns | Amount involved |
| `bill.vendorRef.name` | `counterparty` | string | Direct copy | Vendor name |
| `bill.id` | `source_id` | string | QB Bill ID | Reference back to source |
| N/A | `source_type` | string | Fixed to 'quickbooks' | Integration source |
| `bill.docStatus` | `status` | enum | Map from Bill status → txn status | Draft, Received, Paid, Cancelled |
| `line[].description` | `description` | string | Line item description | What was purchased |
| `line[]` | `line_items` | JSONB | Array of line objects | Complete line item details |
| `bill.currencyRef.value` | `currency` | string | Direct copy | Currency code |
| N/A | `organization_id` | UUID | From auth context | Workspace isolation |
| `bill.metaData.updateTime` | `updated_at` | timestamp | Parse ISO string | Last modification |
| N/A | `synced_at` | timestamp | now() | Ledgr sync timestamp |

### Transaction Status Mapping

```
From Invoice:
  Draft      → 'draft'
  Sent       → 'pending'
  Paid       → 'completed'
  Cancelled  → 'cancelled'

From Bill:
  Draft      → 'draft'
  Received   → 'pending'
  Paid       → 'completed'
  Cancelled  → 'cancelled'
```

### SQL Target (Schema)

```sql
INSERT INTO transactions (
  organization_id, external_id, type, transaction_date,
  amount, counterparty, source_id, source_type, status,
  description, line_items, currency, created_at, updated_at, synced_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13, now()
)
ON CONFLICT (organization_id, external_id) DO UPDATE SET
  status = EXCLUDED.status,
  updated_at = EXCLUDED.updated_at,
  synced_at = now();
```

### Incremental Sync Filter

```
For Invoices:
  Query: SELECT * FROM Invoice WHERE MetaData.UpdatedTime >= '{lastSyncDate}'
  
For Bills:
  Query: SELECT * FROM Bill WHERE MetaData.UpdatedTime >= '{lastSyncDate}'
  
Combined: Transactions are synthesized only from invoices/bills that meet the filter
```

---

## 5. Data Deduplication

All synced records use SHA-256 fingerprinting stored in the `data_deduplication_index` table.

### Fingerprint Generation

```
For Accounts:
  Fingerprint = SHA256(
    normalize(account_number) + '|' +
    normalize(account_name) + '|' +
    account_type
  )

For Invoices:
  Fingerprint = SHA256(
    normalize(invoice_number) + '|' +
    customer_id + '|' +
    total_amount + '|' +
    invoice_date
  )

For Bills:
  Fingerprint = SHA256(
    normalize(bill_number) + '|' +
    vendor_id + '|' +
    total_amount + '|' +
    bill_date
  )

For Transactions:
  Fingerprint = SHA256(
    source_type + '|' +
    source_id + '|' +
    transaction_date + '|' +
    amount + '|' +
    counterparty
  )

normalize() = Lowercase, trim whitespace, remove special chars
```

### Deduplication Index Insertion

```sql
INSERT INTO data_deduplication_index (
  organization_id, entity_type, entity_id, fingerprint,
  source_integration_id, source_timestamp, ledgr_entity_id,
  is_duplicate, duplicate_of, dedup_confidence
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
ON CONFLICT (organization_id, entity_type, fingerprint) DO UPDATE SET
  is_duplicate = CASE WHEN excluded.is_duplicate THEN true ELSE is_duplicate END,
  duplicate_of = COALESCE(duplicate_of, excluded.duplicate_of),
  dedup_confidence = GREATEST(dedup_confidence, excluded.dedup_confidence),
  updated_at = now();
```

---

## 6. Error Handling & Retry Logic

All sync operations record errors in the `sync_errors` table via `recordError()` method:

```typescript
recordError({
  code: string;                // 'sync_accounts_failed', 'sync_invoices_failed', etc.
  message: string;             // Error message from QB API or system
  retryable: boolean;          // true for 429 (rate limit), 503 (service unavailable)
  context?: {                  // Additional context
    entityType?: string;       // 'account', 'invoice', 'bill', 'transaction'
    apiEndpoint?: string;      // '/accounts', '/invoices', '/bills'
    statusCode?: number;       // HTTP status from QB API
  }
})
```

### Retry Strategy

- **Max Retries**: 3 (configurable via sync.retryConfig.maxRetries)
- **Initial Delay**: 5 seconds (sync.retryConfig.initialDelayMs)
- **Max Delay**: 300 seconds (5 minutes, sync.retryConfig.maxDelayMs)
- **Backoff**: Exponential with jitter
- **Retryable Errors**: 429, 503, network timeouts, connection resets
- **Non-Retryable**: 400 (bad request), 401 (auth failed), 403 (forbidden), 404 (not found)

---

## 7. Sync Workflow & State Management

### Integration Setup State

```typescript
interface IntegrationSetup {
  isConnected: boolean;                      // OAuth token valid?
  connectionStatus: 'disconnected' | 'connected' | 'error';
  config: {
    baseCurrency: string;                    // 'AED', 'USD', etc.
    timezone: string;                        // 'Asia/Dubai', etc.
    realmId: string;                         // QB Realm ID from OAuth
  };
  syncSettings: {
    syncFrequency: 'hourly' | 'daily' | 'weekly' | 'manual';
    autoSync: boolean;                       // Enable scheduled syncs
    lastSyncDate: Date;                      // For incremental filters
    lastSyncStatus: 'pending' | 'running' | 'completed' | 'failed';
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### Sync Job Tracking

Tracked in `sync_jobs` table:

```sql
INSERT INTO sync_jobs (
  organization_id, integration_id, job_type, status,
  initiated_by, started_at, completed_at,
  accounts_synced, invoices_synced, bills_synced, transactions_synced,
  accounts_created, invoices_created, bills_created, transactions_created,
  error_count, metadata
) VALUES (...)
```

### Sync Job Metrics

- **accounts_synced**: Count of QB accounts fetched
- **accounts_created**: Count inserted to Ledgr
- **invoices_synced**: Count of QB invoices fetched
- **invoices_created**: Count inserted to Ledgr
- **bills_synced**: Count of QB bills fetched
- **bills_created**: Count inserted to Ledgr
- **transactions_synced**: Count of synthesized transactions
- **transactions_created**: Count inserted to Ledgr

---

## 8. Field Constraints & Validation

### Required Fields

```
Accounts: account_name, account_type, organization_id
Invoices: invoice_number, invoice_date, customer_id, total_amount, organization_id
Bills: bill_number, bill_date, vendor_id, total_amount, organization_id
Transactions: type, transaction_date, amount, organization_id
```

### Data Type Constraints

```
account_type ∈ ['asset', 'liability', 'equity', 'income', 'expense']
invoice.status ∈ ['draft', 'sent', 'paid', 'cancelled']
invoice.payment_status ∈ ['unpaid', 'partially_paid', 'paid']
bill.status ∈ ['draft', 'received', 'paid', 'cancelled']
transaction.type ∈ ['invoice', 'bill']
transaction.status ∈ ['draft', 'pending', 'completed', 'cancelled']

Decimal Fields: precision 19, scale 4 (up to 999,999,999,999,999.9999)
String Fields: typically VARCHAR(255) unless noted as TEXT
```

---

## 9. Testing & Validation

See `/backend/tests/quickbooks-integration.test.ts` for comprehensive test coverage:

- **OAuth Flow Tests**: Generate auth URLs, handle callbacks, extract realm IDs
- **Account Sync Tests**: Fetch 5+ accounts, verify type mappings, skip inactive accounts
- **Invoice Sync Tests**: Fetch invoices, verify payment status calculation, incremental filtering
- **Bill Sync Tests**: Fetch bills with vendor references
- **Transaction Sync Tests**: Synthesize 20+ transactions (12 invoices + 10 bills)
- **Incremental Sync Tests**: Verify lastSyncDate filtering works correctly
- **Error Handling Tests**: Record errors, verify retry logic
- **Integration Manager Tests**: Create, list, schedule, and trigger syncs

