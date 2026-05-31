# Ledgr Multi-Tenant Database Architecture

**Production-Grade Design for Financial Services with Row-Level Security**

Document Version: 1.0
Last Updated: May 31, 2026
Status: Ready for Implementation

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Multi-Tenancy Design](#multi-tenancy-design)
3. [Security Model](#security-model)
4. [Data Access Control (RLS)](#data-access-control)
5. [Audit & Compliance](#audit--compliance)
6. [Performance & Scalability](#performance--scalability)
7. [Migration Strategy](#migration-strategy)
8. [Disaster Recovery](#disaster-recovery)
9. [Operational Procedures](#operational-procedures)

---

## Architecture Overview

### System Goals

1. **Multi-Tenancy**: Support thousands of independent organizations with zero cross-tenant data leakage
2. **Security**: Enterprise-grade encryption, audit trails, and compliance (FTA, GDPR)
3. **Performance**: Sub-100ms query latency at scale with connection pooling
4. **Compliance**: Immutable audit logs, role-based access, data residency options
5. **Scalability**: Horizontal scaling via read replicas; vertical scaling to 100k+ organizations

### Database Architecture Tiers

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
│        (Node.js/Express + Connection Pool)               │
└────────────────┬────────────────────────────┬────────────┘
                 │                            │
         ┌───────▼──────────┐        ┌───────▼──────────┐
         │  Primary (Write) │        │  Read Replicas   │
         │   PostgreSQL 15+ │        │   (3x instances) │
         │  - RLS Policies  │        │  - Analytics     │
         │  - Audit Logs    │        │  - Backups       │
         │  - Encryption    │        │  - BI Queries    │
         └──────────────────┘        └──────────────────┘
         │
         └─► Secrets Manager (AWS)
             - DB passwords (rotated 90d)
             - OAuth credentials
             - API keys
             - Encryption keys
```

### Core Tables (14 entities)

| Table | Purpose | Tenant Isolation | Sensitive Data |
|-------|---------|------------------|-----------------|
| organizations | Workspaces/tenants | Base identifier | Yes (TRN, billing) |
| users | Team members | org_id | Yes (auth, MFA) |
| roles | Permission definitions | org_id | No |
| user_roles | RBAC mappings | org_id | No |
| agents | AI agents | org_id | No |
| chart_of_accounts | GL account master | org_id | No |
| general_ledger_entries | GL transactions | org_id | Yes (amounts) |
| journal_entries | Journal records | org_id | Yes (amounts) |
| vat_returns | VAT compliance | org_id | Yes (financial data) |
| vat_invoices | VAT invoice records | org_id | Yes (financial data) |
| help_tickets | Support tickets | org_id | No |
| integrations | 3rd-party connections | org_id | Yes (API keys) |
| subscriptions | Billing data | org_id | Yes (payment info) |
| audit_log | Immutable trail | org_id | No (references only) |

---

## Multi-Tenancy Design

### Isolation Model: Row-Level Security (RLS)

**Principle**: Every query automatically filters data to the current organization.

```sql
-- Example: User tries to read journal entries
SELECT * FROM journal_entries;

-- Behind the scenes, RLS adds:
-- ... WHERE organization_id = (SELECT org_id FROM auth_context())
```

### Why RLS?

1. **Database-level enforcement**: No application can bypass isolation
2. **Foolproof**: Even if code has bugs, DB enforces boundaries
3. **Transparent**: Developers don't need to add WHERE clauses
4. **Performance**: Indexes work naturally with RLS filtering
5. **Audit**: Every query is logged with tenant context

### Multi-Tenancy Pattern

```
┌──────────────────────────────────────────────────────┐
│ Organization A (Acme Corp)                           │
│ organization_id = 550e8400-e29b-41d4-a716-446655440001│
│                                                      │
│ ├─ 5 users                                           │
│ ├─ 2 agents (VAT, Tax)                               │
│ ├─ 450+ GL accounts                                  │
│ ├─ 12,000 journal entries                            │
│ └─ 4 VAT returns (annual)                            │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Organization B (Widget Inc)                          │
│ organization_id = 550e8400-e29b-41d4-a716-446655440002│
│                                                      │
│ ├─ 12 users                                          │
│ ├─ 4 agents (VAT, Tax, Accounting, CFO)              │
│ ├─ 800+ GL accounts                                  │
│ ├─ 45,000 journal entries                            │
│ └─ 12 VAT returns (quarterly)                        │
└──────────────────────────────────────────────────────┘

  ← No data leakage between orgs
  ← RLS enforces at database layer
  ← Queries 100x faster with partitioning
```

### Tenant Context Setup

```javascript
// Express middleware: set session context
app.use(async (req, res, next) => {
  const user = req.user; // From authentication
  
  // Set PostgreSQL session variables
  await db.query(
    `SELECT set_config('app.current_org_id', $1, false)`,
    [user.organization_id]
  );
  
  await db.query(
    `SELECT set_config('app.current_user_id', $1, false)`,
    [user.id]
  );
  
  next();
});
```

### Fallback Isolation (for bug safety)

Even if middleware fails, RLS policies provide a second line of defense:

```sql
-- If session context is missing, RLS default-denies access
CREATE POLICY users_access_by_org ON users
  FOR SELECT
  USING (
    organization_id = (SELECT org_id FROM auth_context())
    OR current_user = 'ledgr_app_admin' -- Only for migrations
  );

-- Query with missing context:
-- SELECT * FROM users;
-- Result: empty (0 rows) - safe!
```

---

## Security Model

### Encryption Strategy

#### 1. **Encryption in Transit**
- **TLS 1.3** for all database connections
- **Client certificates** for extra hardening
- **Connection pooling** with encrypted channels

#### 2. **Encryption at Rest**

**Sensitive columns** (encrypted via pgcrypto):
```sql
-- Sensitive data encrypted at column level
password_hash_encrypted          BYTEA  -- User passwords (bcrypt/argon2)
mfa_secret_encrypted            BYTEA  -- TOTP secrets
client_secret_encrypted         BYTEA  -- OAuth secrets
api_key_encrypted               BYTEA  -- Integration API keys
```

**Encryption key management**:
```
KMS Master Key (AWS)
    ↓
Data Encryption Keys (DEK) - rotated monthly
    ↓
Column-level encryption using pgcrypto
```

#### 3. **Application-Layer Encryption**

For maximum security, sensitive data is encrypted in the application before storage:

```javascript
const crypto = require('crypto');

// Encrypt before storing
const encrypted = crypto.encryptAES256(
  apiKey,
  masterKey
);

await db.query(
  'INSERT INTO integrations (api_key_encrypted) VALUES ($1)',
  [encrypted]
);

// Decrypt on retrieval (only if user has permission)
const decrypted = crypto.decryptAES256(
  row.api_key_encrypted,
  masterKey
);
```

### Role-Based Access Control (RBAC)

**8 role types** with fine-grained permissions:

```json
{
  "office_manager": {
    "permissions": ["read:org", "write:org", "read:users", "write:users"],
    "can_approve": true,
    "can_file_returns": false
  },
  "finance_controller": {
    "permissions": ["read:gl", "write:gl", "approve:journal_entries"],
    "can_approve": true,
    "can_file_returns": false
  },
  "vat_specialist": {
    "permissions": ["read:vat", "write:vat", "file:vat_return"],
    "can_approve": false,
    "can_file_returns": true
  },
  "cfo": {
    "permissions": ["*"],  // All permissions
    "can_approve": true,
    "can_file_returns": true
  }
}
```

**RBAC enforcement**:
- **Database layer**: RLS policies check user's role via permissions JSONB
- **Application layer**: Middleware validates permissions before operation
- **API layer**: Each endpoint declares required permission(s)

### Password Security

```sql
-- Passwords hashed with bcrypt (scram-sha256 for DB connections)
password_hash VARCHAR(255)  -- bcrypt hash: $2b$12$...

-- Verification
SELECT verify_password('user_input', password_hash);
-- Uses bcrypt internally for constant-time comparison
```

### MFA Implementation

```sql
-- TOTP support
mfa_enabled                  BOOLEAN
mfa_secret_encrypted        BYTEA      -- Base32-encoded TOTP secret
mfa_backup_codes_encrypted  BYTEA      -- JSON array of encrypted backup codes

-- MFA flow
1. User scans QR code with authenticator app (secret stored encrypted)
2. User provides 6-digit code to verify setup
3. On login: password → MFA challenge → JWT token
4. Backup codes for account recovery (one-time use)
```

### Audit Trail Integrity

**Tamper-evident hash chain**:

```
┌─────────────────────────────────────┐
│ Audit Entry 1                       │
│ - Action: CREATE                    │
│ - Entity: journal_entry             │
│ - Hash: SHA256(...)                 │
│ - Parent: null (genesis)            │
└─────────────────────────────────────┘
            ↓ (hash chain)
┌─────────────────────────────────────┐
│ Audit Entry 2                       │
│ - Action: UPDATE                    │
│ - Entity: journal_entry             │
│ - Hash: SHA256(...)                 │
│ - Parent: [Hash from Entry 1]       │ ← Can detect tampering!
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ Audit Entry 3                       │
│ - Action: APPROVE                   │
│ - Entity: journal_entry             │
│ - Hash: SHA256(...)                 │
│ - Parent: [Hash from Entry 2]       │ ← Chain integrity validated
└─────────────────────────────────────┘
```

---

## Data Access Control

### Row-Level Security Policies

#### Policy 1: Organizations
```sql
-- Each org only sees itself
CREATE POLICY orgs_self_access ON organizations
  FOR SELECT
  USING (id = (SELECT org_id FROM auth_context()));
```

#### Policy 2: Users
```sql
-- Users can see other users in their org, or admins see all
CREATE POLICY users_access_by_org ON users
  FOR SELECT
  USING (
    organization_id = (SELECT org_id FROM auth_context())
    OR current_user = 'ledgr_app_admin'
  );
```

#### Policy 3: Financial Data
```sql
-- GL entries visible only within organization
CREATE POLICY gle_access_by_org ON general_ledger_entries
  FOR SELECT
  USING (
    organization_id = (SELECT org_id FROM auth_context())
  );

-- INSERT/UPDATE also controlled by RBAC
-- E.g., only users with 'write:gl' permission can insert
```

#### Policy 4: Audit Logs (Read-only + Immutable)
```sql
-- Can read own org's audit logs or system audit role
CREATE POLICY audit_log_select_read ON audit_log
  FOR SELECT
  USING (
    organization_id = (SELECT org_id FROM auth_context())
    OR current_user = 'ledgr_audit'
  );

-- INSERT allowed (for audit trigger)
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT
  WITH CHECK (TRUE);

-- UPDATE/DELETE explicitly revoked
REVOKE UPDATE, DELETE ON audit_log FROM ledgr_app_write;
```

### Permission Hierarchy

```
┌─────────────────────────────────────────────┐
│ Database-Level (RLS Policies)               │
│ - Enforced automatically on every query     │
│ - Cannot be bypassed from application       │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│ Application-Level (Middleware)              │
│ - Checks user.role.permissions              │
│ - Early rejection before DB query           │
│ - Better UX (faster error messages)         │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│ API-Level (Controller Decorators)           │
│ @RequirePermission('write:gl')              │
│ @RequireRole('finance_controller', 'cfo')   │
└─────────────────────────────────────────────┘
```

---

## Audit & Compliance

### Audit Trail

**Every data mutation is logged**:

```sql
INSERT INTO audit_log (
  organization_id, user_id, action, entity_type, entity_id,
  before_state, after_state, hash, parent_hash
) VALUES (
  org_id, user_id, 'UPDATE', 'journal_entries', entry_id,
  '{old_data}', '{new_data}', 'hash123', 'parent_hash456'
);
```

**Triggers automatically audit**:
- All INSERT operations
- All UPDATE operations
- All DELETE operations
- On tables: journal_entries, vat_returns, general_ledger_entries, users, integrations

### Compliance Features

#### 1. **Financial Audit Trail**
- Who made each entry
- When (with timezone)
- What changed (before/after states)
- Why (user_agent, ip_address)

#### 2. **Access Audit Trail**
- LOGIN/LOGOUT events
- MFA setup
- Role assignments
- Permission changes

#### 3. **Data Retention**
- Keep all audit logs indefinitely (with archival)
- Monthly partitions for performance
- Archive old partitions to cold storage

#### 4. **Data Residency**
- Data stored in specified region (UAE by default)
- Backups stored in same region
- Exports/downloads comply with data localization

#### 5. **Compliance Reports**
```sql
-- SOX Compliance: Trail of all GL changes
SELECT * FROM audit_log
WHERE entity_type = 'general_ledger_entries'
  AND organization_id = org_id
  AND timestamp >= '2026-01-01'
ORDER BY timestamp;

-- FTA Compliance: All VAT return filings
SELECT * FROM audit_log
WHERE entity_type = 'vat_returns'
  AND action IN ('CREATE', 'APPROVE', 'FILE')
  AND organization_id = org_id;
```

### GDPR Compliance

**Data Subject Access Request (DSAR)**:
```sql
-- Find all data about a user
SELECT * FROM users WHERE id = user_id;
SELECT * FROM audit_log WHERE user_id = user_id;
SELECT * FROM help_tickets WHERE created_by = user_id;

-- Can export as JSON for DSAR response
```

**Right to be Forgotten**:
```sql
-- Mark user as deleted (soft delete)
UPDATE users SET deleted_at = NOW() WHERE id = user_id;

-- Anonymize audit logs (remove PII)
UPDATE audit_log 
  SET after_state = jsonb_delete(after_state, '{email}')
  WHERE user_id = user_id;
```

---

## Performance & Scalability

### Indexing Strategy

```sql
-- Tenant + timestamp (most common pattern)
CREATE INDEX idx_journal_entries_org_date 
  ON journal_entries(organization_id, entry_date DESC);

-- Single tenant + type
CREATE INDEX idx_audit_log_org_action 
  ON audit_log(organization_id, action);

-- Lookups
CREATE INDEX idx_users_oauth 
  ON users(oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL;

-- Uniqueness constraints (also act as indexes)
CREATE UNIQUE INDEX idx_users_org_email 
  ON users(organization_id, email) WHERE deleted_at IS NULL;
```

### Partitioning Strategy

**Audit log partitioned by month** (for retention/archival):

```sql
CREATE TABLE audit_log (...)
  PARTITION BY RANGE (created_at);

CREATE TABLE audit_log_2026_05 
  PARTITION OF audit_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE audit_log_2026_06 
  PARTITION OF audit_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

**Benefits**:
- Each partition < 500MB (faster queries)
- Drop old partitions for data retention
- Archive partitions to cold storage
- Parallel scans on read replicas

### Query Performance

**Expected latencies** (with proper indexes):

| Query Type | Latency | Notes |
|------------|---------|-------|
| Single record by ID | 1-5ms | Primary key lookup |
| List by org (100 records) | 10-30ms | Index scan |
| Aggregation (SUM amounts) | 50-100ms | Full partition scan |
| Cross-table JOIN (3 tables) | 30-80ms | Uses query planner |
| Audit trail search | 100-200ms | Partitioned scan |

### Connection Pooling

```javascript
// PgBouncer configuration (transaction mode)
pool_mode = transaction

// 10 backends per server × 3 servers = 30 connections
max_db_connections = 30
max_client_connections = 1000  // Many clients share 30 DB connections

// Ledger app connection pool
const pool = new Pool({
  max: 20,  // Max connections in app pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 30000,  // 30 second query timeout
});
```

### Caching Strategy

```javascript
// Cache layer: Redis
// Cache 1: User permissions (1 hour TTL)
const permissions = await cache.get(`user:${userId}:permissions`);
if (!permissions) {
  permissions = await db.query('SELECT permissions FROM ...');
  cache.set(`user:${userId}:permissions`, permissions, 3600);
}

// Cache 2: Organization settings (24 hour TTL)
const orgSettings = await cache.get(`org:${orgId}:settings`);
if (!orgSettings) {
  orgSettings = await db.query('SELECT * FROM organizations ...');
  cache.set(`org:${orgId}:settings`, orgSettings, 86400);
}
```

### Scalability Roadmap

| Scale | Approach | Implementation |
|-------|----------|-----------------|
| 0-1k orgs | Single server | 1 primary + 2 replicas |
| 1k-10k orgs | Vertical scaling | Larger instance (64GB RAM) |
| 10k-100k orgs | Sharding | Split by org_id hash |
| 100k+ orgs | Multi-region | Region-specific shards |

---

## Migration Strategy

### Zero-Downtime Deployments

**Phase 1: Prepare** (before deployment)
```sql
-- Create new column with DEFAULT
ALTER TABLE journal_entries ADD COLUMN new_field TEXT DEFAULT NULL;

-- Backfill data (if needed)
UPDATE journal_entries SET new_field = ... WHERE new_field IS NULL;
```

**Phase 2: Deploy** (application update)
```javascript
// App code handles both old and new columns
app.post('/journal-entries', (req, res) => {
  // Works with or without new_field
  const entry = {
    ...req.body,
    new_field: req.body.new_field || null
  };
});
```

**Phase 3: Cleanup** (after deployed to 100%)
```sql
-- Drop old column (if renaming)
ALTER TABLE journal_entries DROP COLUMN old_field;

-- Remove DEFAULT
ALTER TABLE journal_entries ALTER COLUMN new_field DROP DEFAULT;
```

### Initial Setup

1. **Create fresh database**
   ```bash
   createdb ledgr
   psql ledgr < backend/infrastructure/postgres-hardening.sql
   psql ledgr < backend/schemas/core-schema.sql
   ```

2. **Initialize superuser org**
   ```sql
   INSERT INTO organizations (id, name, slug, billing_email)
   VALUES ('00000000-0000-0000-0000-000000000000', 'Ledgr', 'ledgr', 'admin@ledgr.ae');
   ```

3. **Run audit trigger migrations**
   ```bash
   psql ledgr < backend/migrations/001_audit_trail.sql
   ```

4. **Create system roles**
   ```bash
   node backend/scripts/seed-system-roles.js
   ```

### Rollback Strategy

If deployment fails:

```sql
-- Rollback: BEFORE migration was applied
ROLLBACK;

-- OR: If already committed, remove manually
DROP COLUMN new_field;
```

---

## Disaster Recovery

### Backup Strategy

**Daily backups** (WAL-based + snapshots):

```bash
#!/bin/bash
# Daily full backup to S3
pg_dump ledgr \
  --format=directory \
  --jobs=4 \
  --compress=9 | \
  aws s3 cp - s3://ledgr-backups/ledgr-$(date +%Y-%m-%d).dump

# Continuous WAL archiving
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://ledgr-backups/wal/%f'
```

**Recovery Time Objective (RTO)**: < 15 minutes
**Recovery Point Objective (RPO)**: < 5 minutes (with WAL)

### Point-in-Time Recovery (PITR)

```sql
-- Recover to specific timestamp
SELECT pg_wal_replay_pause();  -- Pause recovery
-- Inspect data...
SELECT pg_wal_replay_resume(); -- Continue or stop here
```

### Failover Procedure

```bash
# Promote read replica to primary
pg_ctl promote -D /data/postgres

# Update connection strings
export DATABASE_URL=postgresql://user@new-primary:5432/ledgr

# Verify data integrity
SELECT count(*) FROM organizations;
SELECT max(timestamp) FROM audit_log;
```

---

## Operational Procedures

### Monitoring Queries

**Find slow queries**:
```sql
SELECT query, mean_time, calls
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_time DESC
LIMIT 10;
```

**Check table sizes**:
```sql
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size DESC;
```

**Check index bloat**:
```sql
SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Maintenance

**VACUUM (removes dead rows)**:
```sql
-- Manual
VACUUM ANALYZE organizations;

-- Automatic (already configured)
autovacuum = on
autovacuum_naptime = 1min
```

**Reindex (fix fragmented indexes)**:
```sql
REINDEX INDEX idx_journal_entries_org_date;
```

**Partition maintenance**:
```sql
-- Drop old audit log partitions (keep 24 months)
DROP TABLE audit_log_2024_05;

-- Archive to cold storage
pg_dump --table=audit_log_2024_06 ledgr | gzip > archive-2024-06.sql.gz
aws s3 cp archive-2024-06.sql.gz s3://ledgr-archives/
```

### Security Rotation

**Password rotation** (every 90 days):
```bash
# Update password in AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id ledgr/db/password \
  --secret-string $(openssl rand -base64 32)

# Update database password
psql -U postgres -d ledgr -c \
  "ALTER ROLE ledgr_app WITH PASSWORD 'new-password';"
```

**Encryption key rotation** (annually):
```bash
# Generate new KMS key
aws kms create-key

# Re-encrypt all encrypted columns
UPDATE integrations 
  SET api_key_encrypted = pgp_sym_encrypt(
    pgp_sym_decrypt(api_key_encrypted, old_key),
    new_key
  );
```

---

## Summary: Security Checklist

- [x] RLS policies enforce tenant isolation at DB layer
- [x] Encryption at rest for sensitive columns
- [x] Encryption in transit (TLS 1.3)
- [x] Immutable audit trail with hash chain
- [x] RBAC with 8+ role types
- [x] Password hashing with bcrypt
- [x] MFA support (TOTP + backup codes)
- [x] OAuth 2.0 integration
- [x] GDPR compliance features (DSAR, right to forget)
- [x] SOX-compliant audit logging
- [x] Data residency support
- [x] Connection pooling & query timeouts
- [x] Partitioned audit logs for performance
- [x] Backup/recovery procedures
- [x] Zero-downtime deployment strategy

---

## Next Steps

1. **Deploy schema**: Run `core-schema.sql` on fresh PostgreSQL instance
2. **Configure infrastructure**: Update `postgres-hardening.sql` with production values
3. **Seed initial data**: Insert organizations, users, roles
4. **Test RLS**: Verify tenant isolation with test queries
5. **Performance testing**: Load test with 1k+ concurrent users
6. **Backup testing**: Verify daily backups & recovery procedure
7. **Security audit**: Third-party penetration testing

---

**Architecture Designed For**: Ledgr Financial Management Platform
**Compliance Frameworks**: FTA (UAE), GDPR, SOX
**Target Scale**: 10k-100k organizations
**Target QPS**: 10,000+ queries per second (with read replicas)
