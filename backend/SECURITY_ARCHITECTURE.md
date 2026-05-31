# Ledgr Security Architecture

**Version:** 1.0  
**Last Updated:** 2026-05-31  
**Classification:** INTERNAL - Confidential  

Enterprise-grade security and compliance framework for Ledgr, the financial operations platform.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Security Principles](#security-principles)
3. [Multi-Tenant Isolation](#multi-tenant-isolation)
4. [Authentication & Authorization](#authentication--authorization)
5. [Encryption Strategy](#encryption-strategy)
6. [Network Security](#network-security)
7. [Data Protection](#data-protection)
8. [Audit Logging](#audit-logging)
9. [API Security](#api-security)
10. [Incident Response](#incident-response)
11. [Compliance](#compliance)
12. [Security Checklist](#security-checklist)

---

## Executive Summary

Ledgr handles sensitive financial data for UAE-based organizations (GL entries, VAT, tax, payroll). This document outlines enterprise-grade security controls across:

- **Multi-tenant isolation** (zero cross-tenant data leakage)
- **Encryption** (data at rest, in transit, tokens)
- **Authentication** (2FA, session management, rate limiting)
- **Authorization** (8-role RBAC, fine-grained permissions)
- **Audit logging** (immutable tamper-evident audit trail)
- **Infrastructure** (VPC isolation, RDS hardening, TLS 1.3)
- **Incident response** (30-minute response SLA, forensics procedures)
- **Compliance** (SOC 2 Type II, GDPR, CCPA, UAE regulatory requirements)

---

## Security Principles

### 1. **Defense in Depth**
Multiple layers of security: network → application → data → audit.

### 2. **Zero Trust Architecture**
- Verify every request (no implicit trust based on IP/session)
- Enforce multi-factor authentication for admins
- Validate org_id on all data operations
- Use short-lived tokens with regular refresh rotation

### 3. **Principle of Least Privilege**
- Roles have minimal permissions needed for function
- Temporary privilege escalation (e.g., `admin_until` timestamp)
- Regular permission audits (quarterly)
- Revoke unused roles immediately

### 4. **Encryption by Default**
- All PII and financial data encrypted at rest (AES-256-GCM)
- All API connections TLS 1.3+ (no unencrypted channels)
- Passwords hashed with bcrypt (salt rounds ≥ 12)
- Sensitive tokens encrypted in database

### 5. **Immutable Audit Trail**
- All mutations logged (CREATE, UPDATE, DELETE, APPROVE, FILE)
- User actions logged (login, export, permission changes)
- System events logged (backup, maintenance, key rotation)
- Cryptographic hash chain prevents tampering (tamper-evident via SHA-256)
- Retention: 7 years minimum

### 6. **Continuous Monitoring**
- Real-time security event alerts (anomalous login, permission changes)
- Automated breach detection (failed login attempts, rate limit violations)
- Regular security audits (monthly)
- Quarterly penetration testing

---

## Multi-Tenant Isolation

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                            │
│                   (Validate org_id)                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Authentication Middleware                       │
│   (JWT verification, session lookup, tenant context)        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│             Authorization Middleware                         │
│  (RBAC enforcement, permission checks, RLS enforcement)     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Application Logic                          │
│         (All queries filtered by org_id via RLS)            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│            PostgreSQL Database (RLS Policies)               │
│  (Final enforcement: all queries scoped to current_org_id)  │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

**1. Database Row-Level Security (RLS)**

```sql
-- All tables have org_id column
ALTER TABLE gl_entries ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see data for their org
CREATE POLICY gl_entries_org_isolation ON gl_entries
  FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid);
```

**2. API Layer Validation**

```typescript
// All route handlers validate org_id from JWT
app.get('/api/gl/:entityId', (req, res, next) => {
  const { org_id } = req.user; // From JWT
  const entity = GL.findById(req.params.entityId);
  
  // Reject if entity belongs to different org
  if (entity.org_id !== org_id) {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json(entity);
});
```

**3. Search/Filtering Isolation**

```typescript
// Search results never leak between orgs
const results = await GL.find({
  $and: [
    { account_id: req.query.account },
    { org_id: req.user.org_id } // Always filter by current org
  ]
});
```

### Penetration Test Scenarios

1. **Token Manipulation**: Attacker modifies JWT `org_id` claim
   - **Defense**: Signature verified with RS256; tampering detected
   - **Test**: Modify `org_id` in JWT → Signature fails → 401 Unauthorized

2. **SQL Injection**: Attacker injects `'; DROP TABLE...`
   - **Defense**: Parameterized queries; RLS policy on table
   - **Test**: `?account="; DROP TABLE gl_entries--` → Error (no data leaked)

3. **API Enumeration**: Attacker guesses competitor's `org_id`
   - **Defense**: Blind querie attempt returns 403 (not 404)
   - **Test**: Request `/api/gl?org_id=<competitor>` → 403 Forbidden

4. **Cross-Tenant Data Access**: Attacker obtains another org's JWT
   - **Defense**: JWT's `org_id` enforced in RLS + API layer
   - **Test**: Use stolen JWT for org B → All queries filtered to org A → No data

### Audit Proof

```sql
-- Query to prove isolation is working
SELECT 
  user_id, 
  org_id, 
  COUNT(*) as queries_attempted
FROM audit_log
WHERE action = 'PERMISSION_DENIED'
GROUP BY user_id, org_id;
```

---

## Authentication & Authorization

### Authentication Flow

```
1. User Login (POST /api/auth/login)
   └─ Validate email/password (bcrypt verify)
   └─ If valid, check 2FA requirement
      ├─ If required: Send TOTP challenge
      └─ If optional: Proceed to token generation

2. Two-Factor Authentication (POST /api/auth/2fa/verify)
   └─ Validate 6-digit TOTP code
   └─ Generate session token (valid 30 min)

3. Token Generation (POST /api/auth/token)
   ├─ Create JWT (RS256)
   │  ├─ access_token: 15-minute expiry
   │  ├─ refresh_token: 7-day expiry
   │  └─ Claims: org_id, user_id, roles, permissions
   ├─ Log LoginAttempt (success=true)
   └─ Return tokens in JSON response

4. Token Refresh (POST /api/auth/refresh)
   ├─ Validate refresh_token signature
   ├─ Check token_jti not in revocation set
   ├─ Rotate token_jti (new unique ID)
   └─ Issue new access + refresh tokens

5. Logout (POST /api/auth/logout)
   ├─ Add token_jti to revocation set (Redis, 7-day TTL)
   ├─ Invalidate all sessions for user
   └─ Log SecurityEvent (type=LOGOUT)
```

### Authentication Security

**2FA Mandatory for Admins**
- `client_admin`, `finance_controller`, `cfo` roles: 2FA required
- Method: TOTP (Google Authenticator) or SMS fallback
- Backup codes: 10 one-time recovery codes
- Setup: QR code + manual entry option

**Session Management**
- Max 5 active sessions per user
- Inactivity timeout: 30 minutes
- Device tracking: IP address + User-Agent
- IP change detection: New session required if IP changes

**Login Rate Limiting**
- 5 failed attempts → 15-minute lockout
- 10 failed attempts → 1-hour lockout
- Exponential backoff: 15min → 1hr → 24hr
- Track by email + IP address combination

### Authorization (RBAC)

**8 Role Architecture**

| Role | Permissions | 2FA | Can Approve | Can File |
|------|-------------|-----|-------------|----------|
| `office_manager` | User mgmt, org settings, dashboard | Required | Yes | No |
| `finance_controller` | GL entries, journal posting, reports | Required | Yes | No |
| `vat_specialist` | VAT compliance, VAT returns, FTA filing | Optional | No | Yes |
| `tax_specialist` | Tax planning, tax returns, deductions | Optional | No | Yes |
| `cfo` | All permissions (wildcard) | Required | Yes | Yes |
| `audit_manager` | Audit logs, compliance reports (read-only) | Optional | No | No |
| `payroll_officer` | Payroll processing, MOHRE filing | Optional | No | Yes |
| `regulatory_officer` | Compliance monitoring, data governance | Optional | No | No |

**Permission Model**

```typescript
// Format: category:resource:action
export type Permission = 
  | 'read:gl' | 'write:gl' | 'approve:gl'
  | 'read:vat' | 'write:vat' | 'file:vat'
  | 'read:tax' | 'write:tax' | 'file:tax'
  | 'read:payroll' | 'write:payroll' | 'file:payroll'
  | 'read:users' | 'write:users' | 'write:user_roles'
  | 'read:org' | 'write:org'
  | 'read:audit_log'
  | 'read:compliance' | 'write:compliance'
  // ... (100+ total permissions)
```

**Permission Assignment**
- Admins assign roles to users (not individual permissions)
- User inherits all permissions from all assigned roles
- Temporary escalations: `role_assignment.expires_at` timestamp
- Permission audits: Monthly review of who has what

---

## Encryption Strategy

### At Rest (Storage)

**Sensitive Data Fields**
- SSN / Personal ID numbers → AES-256-GCM
- Bank account numbers → AES-256-GCM
- OAuth tokens → AES-256-GCM
- TOTP secrets → AES-256-GCM
- Passport numbers (if collected) → AES-256-GCM

**Implementation**

```typescript
// Encryption with AES-256-GCM
import crypto from 'crypto';

export function encryptSensitiveData(plaintext: string, dek: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  
  // Return: iv || authTag || ciphertext (base64)
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptSensitiveData(ciphertext: string, dek: Buffer): string {
  const buffer = Buffer.from(ciphertext, 'base64');
  const iv = buffer.subarray(0, 16);
  const authTag = buffer.subarray(16, 32);
  const encrypted = buffer.subarray(32);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
  decipher.setAuthTag(authTag);
  
  return decipher.update(encrypted) + decipher.final('utf-8');
}
```

**Envelope Encryption (Key Management)**

```
┌─────────────────────────────────────────┐
│   AWS KMS Master Key (HSM-backed)       │
│   (Rotate annually, audit access)       │
└──────────────┬──────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────┐
│  AWS Secrets Manager                     │
│  ├─ DEK (Data Encryption Key)           │
│  ├─ JWT Signing Key (RS256)             │
│  └─ OAuth Client Secrets                │
└──────────────┬──────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────┐
│  Application Memory (at runtime)         │
│  (DEK loaded at startup, never logged)   │
└──────────────────────────────────────────┘
```

### In Transit (Network)

**TLS 1.3+ on All Channels**
- ALB enforces TLS 1.3 minimum
- Cipher suites: ECDHE + AES-256-GCM + SHA-384
- Certificate: AWS ACM (auto-renew)
- HSTS: 1 year, includeSubdomains
- No mixed content (HTTP resources on HTTPS page)

**HTTP Headers**

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
```

### Passwords

**Bcrypt Hashing**

```typescript
import bcrypt from 'bcrypt';

// On registration/password change
const hash = await bcrypt.hash(password, 12); // 12 salt rounds

// On login
const valid = await bcrypt.compare(password, hash);
```

**Password Policy**
- Minimum 12 characters
- Require uppercase, lowercase, digit, special character
- No common passwords (check against OWASP list)
- Expire every 90 days (with grace period)

### Tokens

**JWT (RS256)**

```typescript
const payload: JWTPayload = {
  iss: 'https://api.ledgr.finance',
  sub: `org:${org_id}:user:${user_id}`,
  aud: 'ledgr-api',
  exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 min
  iat: Math.floor(Date.now() / 1000),
  jti: crypto.randomUUID(), // Unique token ID
  org_id,
  user_id,
  email,
  roles: ['finance_controller'],
  permissions: ['read:gl', 'write:gl', 'approve:gl'],
  token_type: 'access'
};

const token = jwt.sign(payload, private_key, { 
  algorithm: 'RS256',
  keyid: 'ledgr-key-2026-v1'
});
```

**Token Revocation (Redis)**

```typescript
// On logout, add token_jti to revocation set
redis.sadd(`revoked_tokens`, payload.jti);
redis.expire(`revoked_tokens:${payload.jti}`, 7 * 24 * 60 * 60); // 7 days TTL

// On token validation, check revocation
const isRevoked = await redis.sismember(`revoked_tokens`, jti);
if (isRevoked) {
  throw new AuthError('TOKEN_REVOKED', 'Token has been revoked', 401);
}
```

**OAuth Token Storage**

```typescript
// Store OAuth tokens encrypted in database
const encryptedToken = encryptSensitiveData(oauth_access_token, dek);
await User.update({
  oauth_provider: 'google',
  oauth_token_encrypted: encryptedToken,
  oauth_token_expires_at: new Date(Date.now() + 3600000)
});
```

---

## Network Security

### VPC Architecture

```
Internet
    │
    ↓ (Port 80/443)
┌─────────────────────────────────────┐
│  AWS Application Load Balancer      │
│  (Public Subnets, 2 AZs)            │
│  ├─ Security Group: Allow 80,443    │
│  └─ TLS 1.3 termination             │
└──────────┬──────────────────────────┘
           │
           ↓ (Internal only)
┌─────────────────────────────────────┐
│  ECS Cluster (Private Subnets)       │
│  ├─ Security Group: ALB → Port 3000 │
│  ├─ No direct internet access       │
│  └─ NAT Gateway for egress          │
└──────────┬──────────────────────────┘
           │
           ↓ (Internal only, Port 5432)
┌─────────────────────────────────────┐
│  RDS Aurora PostgreSQL (Private)     │
│  ├─ Security Group: ECS → Port 5432 │
│  ├─ Multi-AZ deployment             │
│  ├─ Encrypted with AWS KMS          │
│  └─ No public endpoint               │
└─────────────────────────────────────┘
```

### Security Groups

**ALB Security Group**
```
Ingress:
  - Port 80 (HTTP) from 0.0.0.0/0
  - Port 443 (HTTPS) from 0.0.0.0/0

Egress:
  - All to ECS Security Group
```

**ECS Security Group**
```
Ingress:
  - Port 3000 (app) from ALB Security Group only

Egress:
  - RDS: Port 5432 to RDS Security Group
  - Internet: Port 443 for AWS Secrets Manager, SNS
```

**RDS Security Group**
```
Ingress:
  - Port 5432 from ECS Security Group only

Egress:
  - Deny all (RDS doesn't initiate outbound)
```

### DDoS Protection

- AWS Shield Standard (included with ALB)
- AWS WAF (optional layer): Rate limiting, geo-blocking, bot detection
- CloudFront (optional): Distributed cache, edge DDoS mitigation

---

## Data Protection

### PII Masking in Logs

**Never log:**
- SSN / National ID numbers
- Bank account numbers
- Passport numbers
- Credit card numbers
- Passwords (ever)
- OAuth tokens
- API keys

**Masking function:**

```typescript
export function maskSensitiveData(obj: any): any {
  const mask = (value: string) => {
    if (typeof value !== 'string' || value.length < 4) return '***';
    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
  };

  const sensitive = [
    'ssn', 'national_id', 'passport', 'account_number',
    'password', 'oauth_token', 'api_key', 'credit_card'
  ];

  for (const key of sensitive) {
    if (obj[key]) {
      obj[key] = mask(obj[key]);
    }
  }
  return obj;
}
```

### Secure Data Deletion

**Database:**
```sql
-- Soft delete with tombstone
UPDATE gl_entries SET 
  deleted_at = now(),
  is_active = false
WHERE id = $1;

-- Hard delete (after 30 days, by scheduled job)
DELETE FROM gl_entries WHERE deleted_at < now() - interval '30 days';
```

**File System:**
```bash
# Secure file deletion (overwrite 3 passes)
shred -vfz -n 3 /path/to/sensitive/file

# Verify deletion
find /path -name "*backup*" -o -name "*temp*" | xargs shred -vfz -n 3
```

**Encryption Keys:**
```typescript
// On key rotation, old keys stay in Secrets Manager (for decryption)
// But new encryptions use new key
// After 90 days, old key access revoked
```

### Right to Delete (GDPR)

```typescript
// Export endpoint for GDPR data export
export async function gdprExport(user_id: string, org_id: string): Promise<Buffer> {
  const user = await User.findById(user_id);
  const data = await GL.find({ org_id }); // All org data
  
  const zip = new AdmZip();
  zip.addFile('user.json', JSON.stringify(user));
  zip.addFile('gl_entries.json', JSON.stringify(data));
  
  return zip.toBuffer();
}

// Delete endpoint (anonymize personal data)
export async function gdprDelete(user_id: string, org_id: string) {
  await User.update({
    email: `deleted_${crypto.randomUUID()}@deleted.local`,
    display_name: 'DELETED_USER',
    avatar_url: null,
    is_active: false
  });
  
  // Keep GL entries (financial records), but remove user association
  await GL.update({ created_by: user_id }, {
    created_by: null
  });
}
```

### Data Retention Policy

| Data Type | Retention | Reason |
|-----------|-----------|--------|
| GL entries | 7 years | UAE corporate law |
| VAT records | 6 years | FTA requirement |
| Tax records | 7 years | Tax law |
| Payroll records | 3 years | Labor law + MOHRE |
| Audit logs | 7 years | Compliance requirement |
| User sessions | 90 days | Security audit window |
| Failed login attempts | 1 year | Breach investigation |

---

## Audit Logging

### Immutable Audit Trail

**Schema:**

```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT now(),
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL, -- CREATE, UPDATE, DELETE, APPROVE, FILE, LOGIN, LOGOUT, MFA_SETUP
  entity_type VARCHAR(50) NOT NULL, -- 'gl_entry', 'user', 'journal_entry'
  entity_id UUID NOT NULL,
  before_state JSONB,
  after_state JSONB,
  ip_address INET,
  user_agent TEXT,
  hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256
  parent_hash VARCHAR(64), -- Previous hash for chain
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Tamper-Evident Hash Chain:**

```typescript
import crypto from 'crypto';

export function generateAuditHash(
  event: AuditEvent,
  parentHash: string
): string {
  const data = JSON.stringify({
    timestamp: event.timestamp,
    org_id: event.org_id,
    action: event.action,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    user_id: event.user_id,
    ip_address: event.ip_address,
    parent_hash: parentHash || '0'.repeat(64) // Genesis block
  });
  
  return crypto.createHash('sha256').update(data).digest('hex');
}

export async function verifyAuditTrail(org_id: string) {
  const events = await AuditLog.find({ org_id }).sort({ id: 1 });
  
  let expectedHash = '0'.repeat(64); // Genesis
  for (const event of events) {
    const calculatedHash = generateAuditHash(event, expectedHash);
    
    if (calculatedHash !== event.hash) {
      throw new Error(`Audit tamper detected at event ${event.id}`);
    }
    expectedHash = event.hash;
  }
}
```

**Events Logged:**

- **User Actions**: Login, logout, password change, MFA setup, permission change
- **Data Mutations**: CREATE, UPDATE, DELETE on all GL/VAT/tax/payroll records
- **Approvals**: Approval of journal entries, VAT returns, tax returns
- **Filings**: VAT filing, tax filing, payroll filing, MOHRE submission
- **Administrative**: User creation, role assignment, org settings change
- **Security**: MFA disabled, session timeout, failed login attempt (5+)
- **System**: Backup completion, maintenance window, key rotation

**Audit Event Example:**

```json
{
  "id": 123456,
  "timestamp": "2026-05-31T14:23:45.123Z",
  "org_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "660e8400-e29b-41d4-a716-446655440111",
  "action": "APPROVE",
  "entity_type": "journal_entry",
  "entity_id": "770e8400-e29b-41d4-a716-446655440222",
  "before_state": {
    "status": "pending_approval",
    "approver_id": null
  },
  "after_state": {
    "status": "approved",
    "approver_id": "660e8400-e29b-41d4-a716-446655440111",
    "approved_at": "2026-05-31T14:23:45.123Z"
  },
  "ip_address": "203.0.113.45",
  "user_agent": "Mozilla/5.0...",
  "hash": "abc123def456...",
  "parent_hash": "xyz789uvw012...",
  "created_at": "2026-05-31T14:23:45.123Z"
}
```

### Query Audit Trail

```sql
-- Find all changes by a user
SELECT * FROM audit_log 
WHERE user_id = $1 AND org_id = $2
ORDER BY timestamp DESC;

-- Find tamper attempts
SELECT * FROM audit_log 
WHERE hash != (SELECT hash FROM audit_log parent 
               WHERE parent.id = audit_log.id - 1);

-- Compliance report: All data mutations (90 days)
SELECT 
  user_id, 
  COUNT(*) as mutations,
  ARRAY_AGG(DISTINCT action) as actions
FROM audit_log
WHERE org_id = $1 AND timestamp > now() - interval '90 days'
GROUP BY user_id
ORDER BY mutations DESC;
```

---

## API Security

### Rate Limiting

**Per-User Limits:**
- 100 requests / 1 minute
- 1000 requests / 1 hour
- 10000 requests / 1 day

**Per-IP Limits:**
- 500 requests / 1 minute (shared across all users from IP)
- 5000 requests / 1 hour

**Burst Protection:**
- Token bucket algorithm
- Allow up to 20 requests in 10 seconds
- Exceed → 429 Too Many Requests

**Implementation:**

```typescript
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Max 100 requests per minute per user
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    auditLog({
      action: 'RATE_LIMIT_EXCEEDED',
      ip_address: req.ip,
      user_id: req.user?.id
    });
    res.status(429).json({ error: 'Too many requests' });
  },
  skip: (req) => req.user?.role === 'internal_service' // Whitelist internal services
});
```

### CSRF Protection

**Token-Based CSRF:**
```typescript
app.use(csrf());

// Middleware: Validate CSRF token on state-changing requests
app.post('/api/gl', csrfProtection, (req, res) => {
  // CSRF token verified automatically
});
```

**SameSite Cookies:**
```typescript
app.use(cookieParser());
app.use(sessionMiddleware({
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 30 * 60 * 1000 // 30 minutes
  }
}));
```

### XSS Prevention

**Input Sanitization:**

```typescript
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeInput(input: string): string {
  return DOMPurify.sanitize(input, { 
    ALLOWED_TAGS: [], // No HTML tags allowed
    ALLOWED_ATTR: []
  });
}
```

**Output Encoding:**

```typescript
// Always escape on output
app.get('/api/gl/:id', (req, res) => {
  const entity = { name: `<script>alert('xss')</script>` };
  
  // Express automatically escapes JSON output
  res.json(entity); // Becomes: {\"name\":\"<script>...\"}
});
```

**CSP Headers:**

```typescript
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"], // Inline styles for inline CSS
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"],
    frameSrc: ["'none'"],
    formAction: ["'self'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"]
  }
}));
```

### SQL Injection Prevention

**Parameterized Queries:**

```typescript
// ❌ VULNERABLE
const query = `SELECT * FROM gl_entries WHERE account_id = '${accountId}'`;
db.query(query);

// ✅ SAFE (parameterized)
const query = `SELECT * FROM gl_entries WHERE account_id = $1`;
db.query(query, [accountId]);
```

**ORM Usage:**

```typescript
// Using Prisma (type-safe, prevents SQL injection)
const entries = await prisma.glEntry.findMany({
  where: {
    accountId: accountId,
    orgId: orgId // Always filter by org_id
  }
});
```

### API Versioning & Deprecation

```typescript
app.use('/api/v1', require('./routes/v1'));
app.use('/api/v2', require('./routes/v2'));

// V1 endpoints deprecated as of 2027-01-01
// V1 disabled as of 2027-07-01
app.use('/api/v1', (req, res) => {
  res.status(410).json({
    error: 'gone',
    message: 'API v1 has been discontinued. Please use /api/v2',
    deprecation_date: '2027-01-01',
    discontinue_date: '2027-07-01'
  });
});
```

---

## Incident Response

### 30-Minute Response SLA

**Incident Severity Levels**

| Level | Impact | Response | Example |
|-------|--------|----------|---------|
| **Critical** | Data breach, all users offline | 15 min | RDS failure, key compromise |
| **High** | Partial outage, auth broken | 30 min | Secrets Manager timeout |
| **Medium** | Single feature down | 2 hours | API rate limit misconfiguration |
| **Low** | Minor bug, cosmetic issue | 24 hours | UI text overflow |

**Incident Response Procedure:**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. DETECT (0 min)                                           │
│    ├─ CloudWatch alert triggers                             │
│    ├─ Slack notification sent to #security                  │
│    └─ On-call engineer paged (PagerDuty)                    │
└──────────────────┬────────────────────────────────────────┘
                   │
┌──────────────────────────────────────────────────────────────┐
│ 2. RESPOND (0-15 min for Critical)                           │
│    ├─ Log into war room (Zoom + Slack thread)               │
│    ├─ Identify root cause (logs, metrics)                    │
│    ├─ Implement immediate mitigation                         │
│    │  └─ E.g., disable affected API endpoint, failover      │
│    └─ Prevent further damage                                 │
└──────────────────┬────────────────────────────────────────┘
                   │
┌──────────────────────────────────────────────────────────────┐
│ 3. INVESTIGATE (15 min - 2 hours)                            │
│    ├─ Gather logs, metrics, audit trail                      │
│    ├─ Determine scope (which orgs affected?)                 │
│    ├─ Identify root cause                                    │
│    └─ Confirm fix before deploying                           │
└──────────────────┬────────────────────────────────────────┘
                   │
┌──────────────────────────────────────────────────────────────┐
│ 4. RESOLVE (2-6 hours)                                       │
│    ├─ Deploy fix to production                               │
│    ├─ Verify all systems operational                         │
│    ├─ Notify affected customers                              │
│    └─ Monitor for 30 min (watch error rates)                 │
└──────────────────┬────────────────────────────────────────┘
                   │
┌──────────────────────────────────────────────────────────────┐
│ 5. POST-MORTEM (24 hours)                                    │
│    ├─ Document timeline of events                            │
│    ├─ Root cause analysis (5 whys)                           │
│    ├─ Action items to prevent recurrence                     │
│    └─ Publish post-mortem (internal wiki)                    │
└──────────────────────────────────────────────────────────────┘
```

### Breach Notification

**Regulatory Requirements:**
- **UAE**: Inform authorities + affected parties within 72 hours (if >10 records)
- **EU (GDPR)**: Notify DPA + affected individuals without undue delay (72 hours)
- **US (CCPA)**: Notify California AG + residents (no specific timeline)

**Breach Notification Template:**

```
Subject: Data Breach Notification - [Date]

Dear [Organization],

We are writing to inform you of a security incident discovered on [DATE].

INCIDENT DETAILS:
- Date: [YYYY-MM-DD]
- Scope: [X] financial records affected
- Data: [SSNs, account numbers, etc.]

WHAT WE'RE DOING:
1. Contained the breach (shut down affected systems)
2. Secured all systems (keys rotated, patches applied)
3. Investigating root cause (forensics team assigned)
4. Monitoring for misuse (24/7 monitoring enabled)

WHAT YOU SHOULD DO:
1. Change your password to Ledgr
2. Monitor bank accounts for suspicious activity
3. Consider credit monitoring for 1 year
4. Contact us with any questions

SUPPORT:
- Hotline: +971 4 XXX XXXX
- Email: security-incident@ledgr.finance

Sincerely,
[Security Team]
```

### Post-Mortem Template

```markdown
# Post-Mortem: [Incident Title]

## Timeline
- 14:00 - Alert triggered (high error rate on /api/gl)
- 14:05 - Engineer acknowledged, identified RDS failover
- 14:12 - Root cause: connection pool exhaustion due to slow query
- 14:20 - Deployed fix (reverted slow query optimization)
- 14:23 - System returned to normal

## Impact
- Duration: 23 minutes
- Affected orgs: 12 of 150
- Downtime: Complete data operation failure

## Root Cause
Query optimization introduced N+1 problem, causing connection pool exhaustion.
Missing integration test to validate query performance.

## Lessons Learned
1. Load testing required before optimization changes
2. Connection pool monitoring should alert at 80% capacity
3. Slow query log should have caught this

## Action Items
1. Add query performance test to CI pipeline (Owner: DevOps, Due: 2026-06-07)
2. Set up connection pool alerts at 80% (Owner: Infra, Due: 2026-06-07)
3. Add slow query logging alerting (Owner: DevOps, Due: 2026-06-14)

## Prevention
- RCA Date: 2026-06-01
- Review Date: 2026-06-15 (verify all action items complete)
```

---

## Compliance

### SOC 2 Type II

**Controls Tested:**
- Access control (user provisioning, RBAC, MFA)
- Encryption (TLS, at-rest encryption)
- Audit logging (immutable trail, retention)
- Incident response (procedures, training)
- Change management (code review, testing before deployment)

**Auditor:** Big 4 firm (Deloitte / EY / KPMG)  
**Frequency:** Annual  
**Report Access:** Provided to enterprise customers under NDA

### GDPR Compliance

**Rights Implemented:**
1. **Right to Access** (`POST /api/gdpr/export`) - Download all personal data
2. **Right to Delete** (`POST /api/gdpr/delete`) - Anonymize personal data
3. **Right to Portability** - Export data in machine-readable format (JSON/CSV)
4. **Right to Rectification** - Correct inaccurate data
5. **Right to Object** - Opt out of processing
6. **Right to Restrict** - Pause processing (e.g., during investigation)

**Data Protection Officer:** DPO@ledgr.finance  
**Privacy Impact Assessment:** Completed annually

### CCPA Compliance (US Customers)

**Consumer Rights:**
- Access: `/api/ccpa/access` endpoint
- Deletion: `/api/ccpa/delete` endpoint (non-reversible)
- Opt-Out: `/api/ccpa/opt-out` from sale of data

**Disclosures:**
- Privacy Policy: Updated to CCPA requirements
- Data Sale Consent: Opt-in before any data monetization
- Retention Periods: Documented (see Data Retention Policy section)

### UAE Regulatory Requirements

**Compliance Areas:**
- Ministry of Labor (MOHRE): Payroll records, employee data
- Federal Tax Authority (FTA): VAT compliance, filing procedures
- Central Bank of UAE: Financial data security standards
- Dubai Statistics Center: Data reporting requirements

**Key Compliance Items:**
- VAT returns filed to FTA automatically (when user clicks "File")
- Payroll records retained 3 years + current year (labor law)
- GL entries retained 7 years (corporate law)
- GDPR-like data protection (local privacy law)

---

## Security Checklist

### Development

- [ ] All inputs validated (length, format, type)
- [ ] All outputs sanitized (no raw HTML/SQL)
- [ ] Parameterized queries (no string concatenation)
- [ ] Secrets stored in AWS Secrets Manager (not .env)
- [ ] Sensitive data encrypted (SSN, account numbers, tokens)
- [ ] bcrypt used for password hashing (12+ rounds)
- [ ] CORS properly configured (whitelist specific origins)
- [ ] CSRF tokens on state-changing endpoints
- [ ] Rate limiting implemented (per-user + per-IP)
- [ ] API versioning ready (deprecation path planned)

### Deployment

- [ ] TLS 1.3 enabled on ALB
- [ ] Security groups properly configured (least privilege)
- [ ] RDS encrypted (AWS KMS)
- [ ] RDS backup retention configured (30+ days)
- [ ] ECS tasks run as non-root user
- [ ] Secrets injected via Secrets Manager (not environment variables)
- [ ] CloudWatch logs configured (7+ day retention)
- [ ] CloudTrail enabled (audit all AWS API calls)
- [ ] VPC Flow Logs enabled (track network traffic)
- [ ] WAF rules configured (optional but recommended)

### Operations

- [ ] Audit logs reviewed weekly (search for anomalies)
- [ ] Failed login attempts monitored (excessive = breach indicator)
- [ ] Secrets rotated monthly (keys, tokens, credentials)
- [ ] Unused credentials removed
- [ ] IAM permissions audited quarterly (principle of least privilege)
- [ ] Database backups tested monthly (recovery drill)
- [ ] Incident response plan reviewed annually
- [ ] Security training completed by all team members
- [ ] Penetration testing scheduled annually
- [ ] Compliance audit scheduled (SOC 2, GDPR)

### Monitoring & Alerting

- [ ] CloudWatch alarms configured:
  - RDS CPU > 80%
  - RDS storage > 80%
  - ECS task failures
  - ALB 5xx errors > 1%
  - Auth failures > 10/minute
- [ ] Security alerts configured:
  - Unauthorized access attempts
  - Secrets Manager access
  - IAM policy changes
  - Encryption key access
- [ ] PagerDuty integration for critical alerts
- [ ] Slack integration for non-critical alerts

---

## References

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **NIST Cybersecurity Framework**: https://www.nist.gov/cyberframework
- **AWS Well-Architected Security Pillar**: https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/
- **SOC 2 Trust Service Criteria**: https://www.aicpa.org/content/dam/aicpasites/publications/auditcommletters/aicpasoc2-tsc.pdf
- **GDPR Compliance Guide**: https://gdpr-info.eu/
- **CCPA Consumer Privacy Act**: https://cppa.ca.gov/

---

**Document Version:** 1.0  
**Last Reviewed:** 2026-05-31  
**Next Review:** 2026-08-31  
**Approved By:** [CISO / Security Lead]
