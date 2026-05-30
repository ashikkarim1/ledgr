# Phase 1 Implementation: Weeks 1-6 Foundation Security

**Status:** Ready for multi-agent parallel execution  
**Duration:** 6 weeks (Feb 1 - Mar 14, 2026)  
**Gate Exit Criteria:** Auth tests pass, audit trail captures changes, no plaintext secrets, DB encrypted

---

## Multi-Agent Execution Model

### Team Composition & Agent Assignments

**Agent 1: Database & Infrastructure Specialist**
- Database hardening (PostgreSQL)
- Secrets Manager setup
- KMS key management & envelope encryption
- Immutable audit trail schema
- Infrastructure as Code (Terraform)
- **Lead:** Database architect

**Agent 2: Authentication & Authorization Specialist**
- OAuth 2.0 + OIDC implementation
- JWT generation & validation
- RBAC matrix & permission engine
- ABAC document-level access control
- MFA (TOTP + SMS)
- **Lead:** Security engineer / AuthN/AuthZ expert

**Agent 3: API & Application Security Specialist**
- TLS 1.3 termination & configuration
- Input validation (Joi schemas)
- Output encoding & sanitization
- Rate limiting (Redis-backed)
- CORS & HSTS configuration
- **Lead:** Backend security engineer

**Agent 4: Testing & Compliance Specialist**
- Test framework setup (Jest, Supertest)
- Auth integration tests
- Encryption validation tests
- Audit trail verification
- Compliance test harness
- **Lead:** QA engineer / Test architect

---

## Week 1-2: PostgreSQL Hardening + OAuth 2.0 + JWT + TLS

### Parallel Workstreams (Start simultaneously)

#### **Agent 1 Workstream: DB Hardening & Secrets**
**Deliverables:**
- PostgreSQL hardened configuration
- Secrets Manager setup (AWS Secrets Manager)
- Multi-tenant schema design (tenant-per-schema)
- Database user roles (least privilege)
- Network isolation (VPC security groups)

**Tasks:**
```sql
-- PostgreSQL hardening checklist:
1. Disable default accounts (postgres password change)
2. Enable SSL/TLS for all connections (ssl = on)
3. Configure pg_hba.conf for host authentication
4. Enable logging (log_statement = 'all', log_min_duration_statement = 1000)
5. Set password encryption (password_encryption = scram-sha-256)
6. Enable pgaudit extension for audit logging
7. Create database for multi-tenancy namespace isolation
8. Create minimal privilege roles:
   - ledgr_app_read (SELECT only)
   - ledgr_app_write (SELECT, INSERT, UPDATE, DELETE on allowed tables)
   - ledgr_app_admin (ALTER, CREATE on schema)
9. Configure max_connections, statement_timeout, idle_in_transaction_session_timeout
```

**Secrets Manager Setup:**
- Store DB credentials in AWS Secrets Manager
- Automatic rotation policy: 90 days
- Store JWT signing key (private key)
- Store OAuth 2.0 client secrets
- Audit CloudTrail for all secret access

**Database User Permissions:**
```
postgres (superuser) → locked except for maintenance
ledgr_app_write → application service account
ledgr_backup → backup-only service account
ledgr_audit → audit-log-reader service account
```

**Estimated effort:** 40 hours (5 days)

---

#### **Agent 2 Workstream: OAuth 2.0 + JWT Implementation**
**Deliverables:**
- OAuth 2.0 authorization server (client credentials flow)
- JWT generation & signing (RS256)
- JWT validation middleware
- JWKS endpoint (/.well-known/jwks.json)
- Token refresh flow

**OAuth 2.0 Flow:**
```
Service → POST /oauth/token
  {
    "grant_type": "client_credentials",
    "client_id": "org_123_service",
    "client_secret": "secret_xyz",
    "scope": "api:read api:write"
  }
← Response: access_token, expires_in, token_type

Service → GET /api/v1/transactions
  Header: Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
← Middleware validates JWT, extracts org_id, entity_ids, roles
```

**JWT Structure (RS256 signed):**
```json
{
  "iss": "https://auth.ledgr.ae",
  "sub": "org:12345:user:user789",
  "aud": "ledgr-api",
  "exp": 1708123200,
  "iat": 1708119600,
  "org_id": "org_12345",
  "entity_ids": ["entity_001", "entity_002"],
  "roles": ["finance_controller", "vat_specialist"],
  "scope": "api:read api:write"
}
```

**JWKS Endpoint:**
- Exposes public key for token validation
- Updated when keys are rotated
- Cached by clients for 1 hour

**Estimated effort:** 35 hours (4 days)

---

#### **Agent 3 Workstream: TLS 1.3 + API Security**
**Deliverables:**
- TLS 1.3 termination (ALB)
- Certificate management (Let's Encrypt + wildcard)
- HSTS header enforcement
- CORS policy
- CSP (Content Security Policy)
- Security headers

**TLS Configuration:**
```
ALB listener: 443
  Protocol: HTTPS
  TLS version: TLS 1.3 (minimum)
  Cipher suites: TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256
  Certificate: *.ledgr.ae (wildcard from Let's Encrypt)
  Certificate auto-renewal: 60 days before expiry
```

**Security Headers:**
```
HSTS: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
CORS: Access-Control-Allow-Origin: https://app.ledgr.ae
CSP: Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.ledgr.ae
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

**Estimated effort:** 25 hours (3 days)

---

#### **Agent 4 Workstream: Test Framework & Auth Tests**
**Deliverables:**
- Jest + Supertest setup
- OAuth 2.0 token generation tests
- JWT validation tests
- TLS connection tests
- Mock OAuth server for integration tests

**Test Structure:**
```
tests/
  auth/
    oauth.test.js        // Token generation, refresh, revocation
    jwt.test.js          // Token signing, validation, expiry
    jwks.test.js         // JWKS endpoint, key rotation
    rbac.test.js         // Role-based access control matrix
  integration/
    tls.test.js          // TLS 1.3 handshake, cipher suite
    headers.test.js      // Security header validation
    cors.test.js         // CORS policy enforcement
```

**Test Cases (OAuth):**
```
✓ Client credentials flow returns valid JWT
✓ Token expires after 15 minutes
✓ Refresh token extends access token
✓ Invalid credentials return 401
✓ Revoked token returns 401
✓ Token cannot be reused after revocation
```

**Test Cases (JWT Validation):**
```
✓ Valid JWT signature passes validation
✓ Tampered JWT signature fails validation
✓ Expired JWT returns 401
✓ Missing required claims returns 401
✓ org_id mismatch returns 403
✓ entity_id not in token returns 403
```

**Estimated effort:** 30 hours (4 days)

---

### Week 1-2 Synchronization Points

**Day 3 (Wed) - Checkpoint 1:**
- DB schema deployed to test environment (Agent 1)
- OAuth 2.0 server running locally (Agent 2)
- TLS cert generated for test domain (Agent 3)
- Auth test suite scaffolded (Agent 4)
- **Gate:** All agents confirm readiness to proceed

**Day 5 (Fri) - Checkpoint 2:**
- Database users created with proper permissions (Agent 1)
- JWT tokens generating with correct claims (Agent 2)
- TLS handshake working in test (Agent 3)
- 50% of auth tests passing (Agent 4)
- **Gate:** No plaintext secrets in code; all secrets in Secrets Manager

**Day 10 (Next Wed) - Week 1-2 Gate Review:**
- All DB hardening complete (Agent 1)
- OAuth 2.0 + JWT fully functional (Agent 2)
- TLS 1.3 + security headers deployed (Agent 3)
- 95%+ auth tests passing (Agent 4)
- **Gate Exit:** Proceed to Week 3-4 (Secrets Manager, encryption, audit trail, WAF)

---

## Week 3-4: Secrets Manager + KMS Encryption + Audit Trail + WAF

### Parallel Workstreams

#### **Agent 1 Workstream: KMS + Envelope Encryption + Audit Trail**

**KMS Setup:**
```
Master Key (HSM-backed):
  - Created in AWS KMS (eu-central-1)
  - Automatic 365-day rotation enabled
  - CloudTrail logging enabled
  - Never leaves HSM

Data Encryption Key (DEK):
  - Generated per data encryption operation
  - 256-bit key
  - Encrypted with master key via GenerateDataKey
  - Plaintext DEK shredded from memory after use
  - 90-day rotation policy
```

**Encryption at Rest (Tier 1 data):**
- EID, SSN, bank account numbers, passport numbers
- Algorithm: AES-256-GCM
- Format: [version_byte(1)] + [encrypted_dek(256)] + [iv(12)] + [ciphertext(variable)] + [auth_tag(16)]

**Immutable Audit Trail Schema:**
```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL, -- CREATE, UPDATE, DELETE, APPROVE, FILE
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  before_state JSONB,
  after_state JSONB,
  ip_address INET,
  user_agent TEXT,
  hash VARCHAR(64) NOT NULL, -- SHA-256(H(N-1) || this_record)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only INSERT allowed; no UPDATE/DELETE
REVOKE UPDATE, DELETE ON audit_log FROM ledgr_app_write;
GRANT INSERT ON audit_log TO ledgr_app_write;

-- Tamper-evident chain:
-- hash(record_N) = SHA256(hash(record_N-1) || concat(record_N_fields))
```

**Estimated effort:** 50 hours (6 days)

---

#### **Agent 2 Workstream: RBAC + ABAC Implementation**

**RBAC Matrix (8 roles):**
```
Role: Office Manager
  Permissions:
    - READ all departments
    - READ/WRITE own department inbox
    - APPROVE up to AED 5,000
    - Cannot FILE (CFO/compliance only)

Role: Finance Controller
  Permissions:
    - READ all GL, VAT, CT
    - WRITE GL entries (non-sensitive)
    - APPROVE up to AED 50,000
    - CANNOT FILE (CFO only)

Role: VAT Specialist
  Permissions:
    - READ all VAT transactions
    - WRITE VAT classifications
    - APPROVE VAT return
    - CANNOT FILE (CFO only)

Role: Tax Specialist
  Permissions:
    - READ all CT data
    - WRITE CT schedules
    - APPROVE CT return
    - CANNOT FILE (CFO only)

Role: CFO
  Permissions:
    - READ/WRITE all data
    - APPROVE all operations
    - FILE with FTA, MOHRE, CBU
    - CANNOT DELETE audit trail

Role: Audit Manager
  Permissions:
    - READ audit trail (immutable)
    - GENERATE compliance reports
    - EXPORT for audit (encrypted)
    - CANNOT modify operational data

[+ Payroll Officer, Regulatory Officer]
```

**ABAC Document-Level Access:**
```
Can User access Document if:
  AND org_id matches
  AND entity_ids contain document.entity_id
  AND roles include required permission
  AND token not expired
  AND IP not on blocklist
```

**Estimated effort:** 40 hours (5 days)

---

#### **Agent 3 Workstream: WAF + Rate Limiting**

**AWS WAF Rules:**
```
1. IP Reputation List:
   - Block known botnet IPs
   - Block IPs from high-risk countries
   - Update hourly from threat feeds

2. SQL Injection Prevention:
   - Pattern matching for SQL syntax
   - Block requests with SQL keywords + quotes
   - Exception: parameterized queries only

3. XSS Prevention:
   - Pattern matching for script tags
   - Block HTML/JavaScript in POST bodies
   - Exception: JSON content-type

4. Rate Limiting (per IP):
   - 100 requests per 15 minutes
   - 1000 requests per hour
   - Temporary block for 10 minutes after threshold
   - Exception: Authenticated users (org_id) higher limit

5. Geo-blocking:
   - Allow: UAE, EU (GDPR), select partner countries
   - Block: Iran, North Korea, Syria, Cuba
   - Monitor: Log all blocked requests
```

**Redis-backed Rate Limiter:**
```js
// Ledgr.getRateLimitKey(req)
// Returns: org_id (if auth'd) or ip_address

// Check rate limit before processing
if (rateLimiter.isBlocked(key)) return 429 Too Many Requests

// Increment counter
rateLimiter.increment(key, window = '15m')

// Reset after window
```

**Estimated effort:** 30 hours (4 days)

---

#### **Agent 4 Workstream: Encryption + Audit Trail Tests**

**Encryption Tests:**
```
✓ AES-256-GCM encryption/decryption round-trip
✓ Different plaintext produces different ciphertext
✓ Tampered ciphertext fails decryption
✓ DEK rotation produces new ciphertext for same plaintext
✓ Master key rotation succeeds without data loss
✓ Tier 1 data encrypted at rest (EID, SSN, bank account)
✓ Tier 2 data not encrypted (GL, VAT records)
```

**Audit Trail Tests:**
```
✓ Every CREATE operation logged
✓ Every UPDATE operation logs before_state + after_state
✓ Every DELETE operation logged with before_state
✓ Hash chain unbroken (each hash verifies previous)
✓ Audit trail cannot be modified (REVOKE UPDATE, DELETE)
✓ Query audit_log without auth fails
✓ Tamper-evident hash changes if record modified
```

**WAF Tests:**
```
✓ SQL injection payload blocked
✓ XSS payload blocked
✓ Rate limit enforced per IP
✓ Authenticated users get higher rate limit
✓ Blocked IP gets 403 Forbidden
✓ Geo-blocked request logged
```

**Estimated effort:** 35 hours (4 days)

---

### Week 3-4 Synchronization Points

**Day 17 (Wed) - Checkpoint 3:**
- Master key created in KMS (Agent 1)
- RBAC roles defined in code (Agent 2)
- WAF rules deployed to ALB (Agent 3)
- Encryption tests scaffolded (Agent 4)
- **Gate:** KMS key rotations working; no plaintext secrets

**Day 22 (Mon) - Checkpoint 4:**
- Audit trail schema deployed + immutable (Agent 1)
- ABAC engine evaluating document access (Agent 2)
- Rate limiter protecting all endpoints (Agent 3)
- 80%+ encryption tests passing (Agent 4)
- **Gate:** Audit trail captures all changes; encryption verified

**Day 28 (Next Wed) - Week 3-4 Gate Review:**
- KMS + envelope encryption fully operational (Agent 1)
- RBAC + ABAC providing document-level access control (Agent 2)
- WAF + rate limiting protecting API (Agent 3)
- 95%+ encryption, audit, WAF tests passing (Agent 4)
- **Gate Exit:** Proceed to Week 5-6 (MFA, input validation, output encoding)

---

## Week 5-6: MFA + Input Validation + Output Encoding

### Parallel Workstreams

#### **Agent 2 Workstream: MFA (TOTP + SMS)**

**TOTP Implementation:**
- Library: speakeasy or node-otp
- Algorithm: HMAC-SHA1
- Time step: 30 seconds
- Digit length: 6 digits
- Recovery codes: 10 backup codes per user

**SMS Fallback:**
- Provider: Twilio (SMS API)
- Delivery: 30-second timeout
- Retry: 3 attempts per SMS
- Fallback to recovery code after 3 failed SMS attempts

**MFA Registration Flow:**
```
1. User initiates MFA setup
2. Server generates secret (base32-encoded)
3. Server generates QR code (user scans with Authenticator app)
4. User enters 6-digit code from app
5. Server validates code
6. Server generates 10 recovery codes
7. User stores recovery codes securely
8. MFA enabled for user
```

**MFA Authentication Flow:**
```
1. User enters email/password
2. Server validates credentials
3. Server prompts for TOTP code
4. User enters 6-digit code from Authenticator
5. Server validates code (current + ±1 time step)
6. Server issues new JWT (includes mfa_verified: true)
7. If TOTP fails 3x, prompt for SMS code
8. If SMS fails 3x, prompt for recovery code
9. If all fail, account locked for 1 hour
```

**Estimated effort:** 30 hours (4 days)

---

#### **Agent 3 Workstream: Input Validation + Output Encoding**

**Input Validation (Joi):**
```js
// Every endpoint validates all inputs with Joi schema

const createGLEntrySchema = Joi.object({
  org_id: Joi.string().uuid().required(),
  entity_id: Joi.string().uuid().required(),
  date: Joi.date().iso().required(),
  account_code: Joi.string()
    .regex(/^\d{4}$/) // 4-digit GL account
    .required(),
  debit: Joi.number().positive(),
  credit: Joi.number().positive(),
  description: Joi.string()
    .max(500)
    .pattern(/^[a-zA-Z0-9\s\-,.:&()]+$/) // Only alphanumeric + punctuation
    .required(),
  reference: Joi.string().max(50).optional(),
});

// Joi validates: type, format, length, pattern, range
// Fails fast on invalid input
// Returns 400 Bad Request with error details
```

**External Constraint Validation:**
```js
// After Joi schema passes, validate external constraints

// GL Entry must balance (debits = credits)
if (input.debit && input.credit) {
  return 400 "Cannot have both debit and credit";
}

// Account code must exist for org
const account = await db.query(
  'SELECT * FROM chart_of_accounts WHERE org_id = $1 AND code = $2',
  [org_id, account_code]
);
if (!account) return 404 "Account not found";

// Entity must belong to org
const entity = await db.query(
  'SELECT * FROM entities WHERE org_id = $1 AND id = $2',
  [org_id, entity_id]
);
if (!entity) return 403 "Entity not found";
```

**Output Encoding:**
```js
// Frontend: DOMPurify for XSS protection
const sanitized = DOMPurify.sanitize(userInput);
document.getElementById('content').innerHTML = sanitized;

// Backend: JSON serialization (never concatenate strings)
res.json({
  status: 'success',
  data: {
    gl_entry_id: glEntry.id,
    description: glEntry.description, // Automatically JSON-encoded
    created_at: glEntry.created_at.toISOString()
  }
});
```

**Estimated effort:** 35 hours (4 days)

---

#### **Agent 4 Workstream: Validation + Encoding Tests**

**Input Validation Tests:**
```
✓ Valid GL entry accepted
✓ Missing required field returns 400
✓ Invalid UUID format returns 400
✓ Negative amount returns 400
✓ Description > 500 chars returns 400
✓ Invalid regex pattern returns 400
✓ Non-existent account returns 404
✓ Debit + credit together returns 400
✓ Entity mismatch returns 403
```

**Output Encoding Tests:**
```
✓ XSS payload in output is sanitized
✓ HTML tags removed from description
✓ JSON output properly encoded
✓ Response headers include Content-Type: application/json
✓ No plaintext user input echoed in response
✓ Sensitive data masked (SSN → ****1234)
```

**End-to-End Security Tests:**
```
✓ Malicious SQL attempt blocked by Joi
✓ XSS attempt sanitized before output
✓ CSRF token required for state-changing requests
✓ MFA required for sensitive operations
✓ Audit trail captures all write attempts
✓ Rate limiter blocks brute force attempts
```

**Estimated effort:** 30 hours (4 days)

---

### Week 5-6 Synchronization Points

**Day 35 (Wed) - Checkpoint 5:**
- MFA registration working (Agent 2)
- Joi validation on 30+ endpoints (Agent 3)
- Output encoding implemented (Agent 3)
- Validation tests 70%+ passing (Agent 4)
- **Gate:** MFA tested with backup codes; no validation bypasses

**Day 40 (Mon) - Checkpoint 6:**
- MFA authentication 100% working (Agent 2)
- All endpoints validated (Agent 3)
- All responses encoded (Agent 3)
- 90%+ validation tests passing (Agent 4)
- **Gate:** Manual security testing passes

**Day 42 (Wed) - Week 5-6 Gate Review + Phase 1 Exit Gate:**
- MFA (TOTP + SMS + recovery codes) fully operational (Agent 2)
- Input validation on all endpoints (Agent 3)
- Output encoding on all responses (Agent 3)
- 95%+ security tests passing (Agent 4)
- **Final Phase 1 Gate Criteria:**
  - ✅ Auth tests pass (OAuth, JWT, RBAC, ABAC, MFA)
  - ✅ Audit trail captures all changes (immutable)
  - ✅ No plaintext secrets (all in Secrets Manager)
  - ✅ Database encrypted (AES-256-GCM Tier 1 data)
  - ✅ TLS 1.3 on all connections
  - ✅ WAF + rate limiting protecting API
  - ✅ Input validation + output encoding
- **Decision:** Go/No-Go for Phase 2 (Compliance Security)

---

## Daily Standup Format (Weeks 1-6)

**10:00 AM UTC — 15 min sync**

Each agent reports (2 min):
1. **Yesterday:** What was completed?
2. **Today:** What's the priority?
3. **Blockers:** Any issues preventing progress?

**Sample standup (Day 3):**

**Agent 1 (DB):**
- Yesterday: DB schema deployed, users created, pgaudit enabled
- Today: Secrets Manager setup, test credentials rotated
- Blockers: None

**Agent 2 (Auth):**
- Yesterday: OAuth 2.0 server scaffolded, JWT generation working
- Today: JWKS endpoint, token refresh flow
- Blockers: Need Agent 1 to confirm Secrets Manager ready for OAuth secrets

**Agent 3 (TLS):**
- Yesterday: Certificate generated, ALB listener configured
- Today: HSTS + CSP headers, CORS policy
- Blockers: Need Agent 2 to confirm JWT validation working before testing end-to-end

**Agent 4 (Testing):**
- Yesterday: Test framework setup, auth test suite scaffolded
- Today: Write OAuth, JWT, TLS tests; configure mock server
- Blockers: Waiting on Agent 1 DB to be stable for integration tests

---

## Resource Requirements

### Infrastructure (AWS)
- RDS PostgreSQL (Multi-AZ, automated backups)
- AWS KMS (HSM-backed master key)
- AWS Secrets Manager
- Application Load Balancer (TLS termination)
- ElastiCache Redis (rate limiting)
- CloudTrail (audit logging)
- **Cost estimate:** $2,000/month dev + test environments

### Tools & Services
- GitHub (source control)
- GitHub Actions (CI/CD)
- DataDog or Splunk (monitoring)
- Slack (team communication)
- Figma or Miro (architecture diagrams)

### Team Capacity
- Agent 1 (DB): 50 hours = 1.25 FTE
- Agent 2 (Auth): 45 hours = 1.13 FTE
- Agent 3 (API): 55 hours = 1.38 FTE
- Agent 4 (QA): 65 hours = 1.63 FTE
- **Total:** ~5.4 FTE weeks (or 2 FTE × 6 weeks if sequential, or 4-5 FTE × 1.5 weeks if parallel)

**Parallel execution (4 agents, 6 weeks):** ~1.35 FTE per agent/week

---

## Success Metrics

**Code Quality:**
- 95%+ test coverage on security-critical paths
- Zero high/critical security issues in code scan
- All dependencies audited (npm audit, Snyk)

**Performance:**
- API latency p50 < 100ms, p99 < 500ms
- Auth latency < 50ms (JWT validation)
- Encryption/decryption < 10ms per operation
- Rate limiter enforces within 5ms

**Security:**
- Zero plaintext secrets in code
- Zero failed TLS handshakes
- Audit trail 100% complete
- WAF blocks 100% of test payloads
- MFA backup codes work flawlessly

**Compliance:**
- Audit trail immutable + tamper-evident
- Encryption at rest + in transit
- Least-privilege DB permissions
- All access logged

---

## Risk Mitigation

### High Risks

**Risk: KMS key becomes unavailable**
- Mitigation: Test key rotation procedure weekly
- Backup: Keep encrypted backup of all DEKs
- Recovery: Data recoverable with restored master key

**Risk: Audit trail corruption**
- Mitigation: Test tamper detection monthly
- Backup: Replicate audit trail to S3 (Object Lock)
- Recovery: Restore from S3 if DB corrupted

**Risk: OAuth tokens leaked**
- Mitigation: Token expiry 15 minutes (short-lived)
- Backup: Refresh tokens valid 30 days (long-lived, secure)
- Revocation: Instant blacklist via Redis

### Medium Risks

**Risk: Test environment data leaks to production**
- Mitigation: Separate AWS accounts per environment
- Network isolation: Private subnets, no cross-environment routing

**Risk: Secrets Manager integration fails**
- Mitigation: Test failover to local .env (dev-only fallback)
- Monitoring: Alert on Secrets Manager errors

---

## Next Steps (After Week 6 Gate Pass)

**Phase 2 (Weeks 7-12): Compliance Security**
- Data classification (Tier 1/2/3 encryption)
- GDPR endpoints (export, delete, rectify)
- AML/CFT (CDD, VDD, sanctions, SAR)
- VAT/CT/Payroll compliance validation
- Breach notification workflow
- FTA sandbox integration testing

**Phase 3 (Year 2 Q3 2027): Certifications**
- ISO 27001 audit preparation
- SOC 2 Type II (6-month observation)
- Bug bounty program launch
- Annual penetration test

