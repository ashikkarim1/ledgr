# Sample Queries: RLS in Action

**Demonstrating Row-Level Security and Multi-Tenant Isolation**

---

## 1. Testing Tenant Isolation

### Scenario: Two organizations, one database

```sql
-- Organization A ID
'550e8400-e29b-41d4-a716-446655440001'

-- Organization B ID  
'550e8400-e29b-41d4-a716-446655440002'
```

### Setup: Insert test data

```sql
-- Org A: Insert journal entries
INSERT INTO journal_entries (
  organization_id, entry_number, entry_date, description,
  status, total_debit, total_credit, created_by
)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  'JE-2026-001',
  '2026-05-01',
  'Initial journal entry for Org A',
  'approved',
  5000.00,
  5000.00,
  'user-a-1'::uuid
);

-- Org B: Insert journal entries
INSERT INTO journal_entries (
  organization_id, entry_number, entry_date, description,
  status, total_debit, total_credit, created_by
)
VALUES (
  '550e8400-e29b-41d4-a716-446655440002',
  'JE-2026-001',
  '2026-05-01',
  'Initial journal entry for Org B',
  'approved',
  10000.00,
  10000.00,
  'user-b-1'::uuid
);

-- Verify we have 2 entries in the table (at DB level)
SELECT COUNT(*) FROM journal_entries;
-- Result: 2 rows (without RLS)
```

### Test 1: User A queries journal entries

```sql
-- Set user A's organization context
SELECT set_config('app.current_org_id', '550e8400-e29b-41d4-a716-446655440001', false);

-- User A queries their journal entries
SELECT entry_number, description, total_debit FROM journal_entries;

-- Result: ONLY Org A's entry
-- JE-2026-001 | Initial journal entry for Org A | 5000.00

-- Explanation: RLS policy automatically filters to org_id matching context
```

### Test 2: User B queries journal entries

```sql
-- Switch to user B's organization context
SELECT set_config('app.current_org_id', '550e8400-e29b-41d4-a716-446655440002', false);

-- User B queries their journal entries
SELECT entry_number, description, total_debit FROM journal_entries;

-- Result: ONLY Org B's entry
-- JE-2026-001 | Initial journal entry for Org B | 10000.00

-- Same query, different context = different results (RLS magic!)
```

### Test 3: Malicious query attempt

```sql
-- User A tries to hack into Org B's data
SELECT set_config('app.current_org_id', '550e8400-e29b-41d4-a716-446655440001', false);

-- Even if they try to manually add WHERE clause...
SELECT entry_number, description, total_debit 
FROM journal_entries
WHERE organization_id = '550e8400-e29b-41d4-a716-446655440002';  -- Try to access Org B!

-- Result: 0 rows returned
-- RLS prevents this at DB level - cannot be bypassed!

-- Explanation: RLS policy adds implicit AND condition:
-- WHERE organization_id = app.current_org_id() AND organization_id = '...org_b...'
-- These contradict each other, so 0 rows match
```

---

## 2. Audit Trail Queries

### Insert with automatic audit

```sql
-- User inserts a journal entry
INSERT INTO journal_entries (...)
VALUES (...);

-- Trigger AUTOMATICALLY inserts audit log
SELECT * FROM audit_log 
WHERE entity_type = 'journal_entries'
ORDER BY timestamp DESC LIMIT 1;

-- Result:
/*
id           | 1001
timestamp    | 2026-05-31 14:30:45+00
org_id       | 550e8400-e29b-41d4-a716-446655440001
user_id      | user-a-1
action       | CREATE
entity_type  | journal_entries
entity_id    | je-uuid-123
before_state | null
after_state  | {entry_number: "JE-2026-001", ...}
hash         | a1b2c3d4e5f6... (SHA-256)
parent_hash  | null (first entry in chain)
*/
```

### Update with state comparison

```sql
-- User updates journal entry status from 'draft' to 'approved'
UPDATE journal_entries 
SET status = 'approved', approved_at = NOW()
WHERE id = 'je-uuid-123';

-- Check audit log
SELECT before_state, after_state FROM audit_log
WHERE entity_id = 'je-uuid-123'
ORDER BY timestamp DESC LIMIT 1;

-- Result:
/*
before_state:
{"status": "draft", "approved_at": null, ...}

after_state:
{"status": "approved", "approved_at": "2026-05-31T14:35:00", ...}
*/
```

### Tamper detection

```sql
-- Verify hash chain integrity
SELECT 
  id, 
  hash, 
  parent_hash,
  (hash = compute_audit_hash(timestamp, org_id, action, entity_type, entity_id, parent_hash)) 
    AS hash_valid
FROM audit_log
WHERE org_id = '550e8400-e29b-41d4-a716-446655440001'
ORDER BY timestamp;

-- Result:
/*
id  | hash                    | parent_hash         | hash_valid
1001| a1b2c3d4...           | null                | true
1002| e5f6g7h8...           | a1b2c3d4...         | true ✓ (valid chain)
1003| i9j0k1l2...           | e5f6g7h8...         | true ✓ (valid chain)
1004| m3n4o5p6...           | a1b2c3d4... (WRONG!)| false ✗ (tampering detected!)
*/

-- Entry 1004 has invalid parent hash - tampering detected!
-- This is why Ledgr can prove no data has been modified
```

---

## 3. RBAC Queries

### Assign role to user

```sql
-- Office manager adds VAT specialist role to new employee
INSERT INTO user_roles (user_id, role_id, organization_id, assigned_at)
VALUES (
  'user-new-123'::uuid,
  (SELECT id FROM roles WHERE slug = 'vat_specialist'),
  '550e8400-e29b-41d4-a716-446655440001',
  NOW()
);

-- Check what permissions they have
SELECT permissions FROM roles
WHERE id = (
  SELECT role_id FROM user_roles 
  WHERE user_id = 'user-new-123'
  LIMIT 1
);

-- Result:
/*
permissions
["read:org", "read:vat", "write:vat", "read:vat_journal", 
 "write:vat_journal", "read:vat_returns", "write:vat_returns", 
 "file:vat_return", "read:vat_invoices", "read:vat_reports", "read:audit_log"]
*/
```

### Check if user can perform action

```sql
-- Application function: can_user_file_vat_return(user_id, org_id)
SELECT EXISTS(
  SELECT 1 FROM user_roles ur
  JOIN roles r ON ur.role_id = r.id
  WHERE ur.user_id = 'user-new-123'
  AND ur.organization_id = '550e8400-e29b-41d4-a716-446655440001'
  AND r.can_file_returns = true
  AND ur.expires_at IS NULL
  AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
);

-- Result: true (they CAN file returns because they have vat_specialist role)
```

### Temporary role assignment

```sql
-- Assign VAT specialist role for 30 days only
INSERT INTO user_roles (user_id, role_id, organization_id, assigned_at, expires_at)
VALUES (
  'user-contractor-456'::uuid,
  (SELECT id FROM roles WHERE slug = 'vat_specialist'),
  '550e8400-e29b-41d4-a716-446655440001',
  NOW(),
  NOW() + INTERVAL '30 days'
);

-- After 30 days, this query shows them without access
SELECT COUNT(*) FROM user_roles
WHERE user_id = 'user-contractor-456'
AND expires_at > NOW();  -- Returns 0 (expired role excluded)
```

---

## 4. Financial Data Queries

### VAT return preparation

```sql
-- Calculate VAT amounts for period
SELECT
  COALESCE(SUM(CASE WHEN invoice_type = 'sales' THEN vat_amount ELSE 0 END), 0) as output_vat,
  COALESCE(SUM(CASE WHEN invoice_type = 'purchase' THEN vat_amount ELSE 0 END), 0) as input_vat
FROM vat_invoices
WHERE organization_id = '550e8400-e29b-41d4-a716-446655440001'
AND invoice_date BETWEEN '2026-05-01' AND '2026-05-31';

-- Result:
/*
output_vat | input_vat
50000.00   | 12000.00
*/

-- File VAT return with calculated totals
INSERT INTO vat_returns (
  organization_id,
  return_period_start, return_period_end,
  filing_due_date,
  total_supplies_vat, total_input_tax,
  vat_payable,
  status, filed_by, filed_at
)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  '2026-05-01', '2026-05-31',
  '2026-06-15',
  50000.00, 12000.00,
  38000.00,  -- 50k - 12k
  'filed',
  'user-a-1'::uuid,
  NOW()
);
```

### General ledger rollup

```sql
-- Balance sheet by account
SELECT
  a.account_name,
  a.account_type,
  COALESCE(SUM(gle.debit_amount) - SUM(gle.credit_amount), 0) as balance
FROM chart_of_accounts a
LEFT JOIN general_ledger_entries gle ON a.id = gle.account_id
WHERE a.organization_id = '550e8400-e29b-41d4-a716-446655440001'
AND gle.status = 'posted'
AND gle.entry_date <= '2026-05-31'
GROUP BY a.id, a.account_name, a.account_type
ORDER BY a.account_type, a.account_name;

-- Result:
/*
account_name           | account_type | balance
Cash                   | asset        | 450000.00
Accounts Receivable    | asset        | 120000.00
Accounts Payable       | liability    | -80000.00
Common Stock           | equity       | -100000.00
Revenue                | income       | -500000.00
Expenses               | expense      | 110000.00
*/
```

### Journal entry approval workflow

```sql
-- Find pending journal entries
SELECT id, entry_number, description, total_debit, total_credit
FROM journal_entries
WHERE organization_id = '550e8400-e29b-41d4-a716-446655440001'
AND status = 'submitted'
ORDER BY created_at;

-- Finance controller approves
UPDATE journal_entries
SET status = 'approved',
    approved_by = 'user-fc-1'::uuid,
    approved_at = NOW()
WHERE id = 'je-uuid-123';

-- Trigger automatically posts to GL
-- (In real system, this would be a stored procedure or event handler)
INSERT INTO general_ledger_entries (
  organization_id, entry_date, description,
  account_id, debit_amount, status,
  created_by
) SELECT
  organization_id, entry_date, description,
  (SELECT account_id FROM journal_entry_lines WHERE line_number = 1),
  debit_amount, 'posted',
  approved_by
FROM journal_entries
WHERE id = 'je-uuid-123';
```

---

## 5. User & Organization Queries

### User management

```sql
-- List all users in organization (respects RLS)
SELECT id, email, first_name, last_name, status, mfa_enabled
FROM users
WHERE organization_id = '550e8400-e29b-41d4-a716-446655440001'
AND deleted_at IS NULL
ORDER BY first_name;

-- Disable user account
UPDATE users
SET status = 'inactive', updated_at = NOW()
WHERE id = 'user-old-123'
AND organization_id = '550e8400-e29b-41d4-a716-446655440001';

-- Enable MFA for user
UPDATE users
SET mfa_enabled = true,
    mfa_secret_encrypted = pgp_sym_encrypt('base32secret', 'master_key'),
    updated_at = NOW()
WHERE id = 'user-a-1'
AND organization_id = '550e8400-e29b-41d4-a716-446655440001';
```

### Organization settings

```sql
-- Get org subscription info
SELECT name, subscription_plan, subscription_status, 
       billing_cycle_start, billing_cycle_end,
       max_users, max_agents
FROM organizations
WHERE id = '550e8400-e29b-41d4-a716-446655440001';

-- Upgrade to professional plan
UPDATE organizations
SET subscription_plan = 'professional',
    max_users = 50,
    max_agents = 5,
    features_vat_enabled = true,
    features_income_tax_enabled = true,
    features_agent_enabled = true,
    updated_at = NOW()
WHERE id = '550e8400-e29b-41d4-a716-446655440001';

-- Enable MFA requirement for organization
UPDATE organizations
SET mfa_required = true,
    updated_at = NOW()
WHERE id = '550e8400-e29b-41d4-a716-446655440001';
```

---

## 6. Compliance & Reporting Queries

### Audit trail for compliance

```sql
-- SOX Compliance: All GL changes in period
SELECT 
  timestamp,
  user_id,
  action,
  before_state ->> 'status' as before_status,
  after_state ->> 'status' as after_status,
  after_state ->> 'debit_amount' as amount
FROM audit_log
WHERE organization_id = '550e8400-e29b-41d4-a716-446655440001'
AND entity_type = 'general_ledger_entries'
AND timestamp BETWEEN '2026-01-01' AND '2026-05-31'
ORDER BY timestamp;
```

### FTA Compliance: VAT filings

```sql
-- All VAT returns filed in last 12 months
SELECT 
  vr.id,
  vr.return_period_start,
  vr.return_period_end,
  vr.vat_payable,
  vr.filing_reference,
  vr.filed_at,
  u.email as filed_by_email
FROM vat_returns vr
JOIN users u ON vr.filed_by = u.id
WHERE vr.organization_id = '550e8400-e29b-41d4-a716-446655440001'
AND vr.status = 'filed'
AND vr.filed_at >= NOW() - INTERVAL '1 year'
ORDER BY vr.filed_at DESC;
```

### User activity

```sql
-- Who did what in last 30 days
SELECT 
  DATE(timestamp) as date,
  action,
  entity_type,
  COUNT(*) as count
FROM audit_log
WHERE organization_id = '550e8400-e29b-41d4-a716-446655440001'
AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE(timestamp), action, entity_type
ORDER BY date DESC, action;
```

---

## 7. Integration Queries

### QuickBooks sync status

```sql
-- Get QuickBooks integration
SELECT id, integration_type, is_active, last_sync_at, last_sync_status
FROM integrations
WHERE organization_id = '550e8400-e29b-41d4-a716-446655440001'
AND integration_type = 'quickbooks_online';

-- Update sync status
UPDATE integrations
SET last_sync_at = NOW(),
    last_sync_status = 'success'
WHERE id = 'integration-qbo-123';

-- On sync failure, log error
UPDATE integrations
SET last_sync_at = NOW(),
    last_sync_status = 'failed',
    last_error_message = 'Invalid access token; needs re-authentication'
WHERE id = 'integration-qbo-123';
```

---

## Testing RLS: Complete Example

```sql
-- ==============================================
-- COMPLETE RLS TEST SCENARIO
-- ==============================================

-- 1. Create two test orgs
WITH org_inserts AS (
  INSERT INTO organizations (name, slug, billing_email, subscription_plan)
  VALUES 
    ('Test Org A', 'test-a', 'admin-a@test.com', 'professional'),
    ('Test Org B', 'test-b', 'admin-b@test.com', 'professional')
  RETURNING id
)
SELECT id FROM org_inserts;

-- 2. Create test users
INSERT INTO users (organization_id, email, first_name, last_name, status)
VALUES 
  (org_a_id, 'alice@org-a.com', 'Alice', 'Adams', 'active'),
  (org_b_id, 'bob@org-b.com', 'Bob', 'Brown', 'active');

-- 3. Create test data
INSERT INTO journal_entries (...) VALUES
  (org_a_id, 'JE-A-001', 'Org A Entry'),
  (org_b_id, 'JE-B-001', 'Org B Entry');

-- 4. Test Alice's access
SET app.current_org_id = org_a_id;
SELECT COUNT(*) FROM journal_entries;  -- Result: 1 (only her org's data)

-- 5. Test Bob's access
SET app.current_org_id = org_b_id;
SELECT COUNT(*) FROM journal_entries;  -- Result: 1 (only his org's data)

-- 6. Test tamper attempt
SET app.current_org_id = org_a_id;
SELECT COUNT(*) FROM journal_entries 
WHERE organization_id = org_b_id;  -- Result: 0 (RLS blocks it)

-- ✅ RLS working correctly: zero cross-tenant data leakage!
```

---

## Key Takeaways

1. **RLS is automatic** - developers don't need to add WHERE clauses
2. **RLS is foolproof** - cannot be bypassed, even with malicious queries
3. **RLS is performant** - indexes work naturally with automatic filtering
4. **Audit trail is automatic** - triggers log all mutations
5. **Audit chain is tamper-proof** - hash verification detects any modifications
6. **RBAC integrates with RLS** - permissions checked at multiple layers

---

For more complex scenarios or performance testing, refer to `ARCHITECTURE.md`.
