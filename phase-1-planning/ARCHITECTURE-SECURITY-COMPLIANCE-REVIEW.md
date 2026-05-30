# Ledgr Phase 1: Architecture, Security & Compliance Review
## Complete Technical Blueprint for World-Class Implementation

**Document Version:** 1.0  
**Status:** Ready for Architecture Review  
**Prepared for:** Engineering Lead / Architect  
**Review Scope:** Security, Compliance, Performance, Scalability, Data Protection  

---

## PART 1: SECURITY ARCHITECTURE FRAMEWORK

### 1.1 Defense in Depth Model

Ledgr implements concentric layers of security, each with independent validation:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Network & Transport Security                        │
│  - TLS 1.3 mandatory for all traffic (no downgrades)        │
│  - Certificate pinning on client (mobile, desktop clients)  │
│  - DDoS protection (CloudFlare / AWS Shield Advanced)       │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Application Authentication & Authorization         │
│  - OAuth 2.0 + OpenID Connect (external IdP option)         │
│  - JWT with RS256 signing, 15-min expiry, refresh tokens   │
│  - RBAC: Role → Permissions → Resource (granular)          │
│  - MFA: TOTP (Google Authenticator) + SMS fallback         │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Data Access Control                                │
│  - Row-Level Security (RLS) on all tenant data              │
│  - Entity ID partitioning: org_id filter on every query    │
│  - Attribute-Based Access Control (ABAC) on documents      │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Data Encryption                                    │
│  - At Rest: AES-256-GCM for sensitive fields (PII, SSN, etc)
│  - In Transit: TLS 1.3 for all API calls                   │
│  - Key Management: AWS KMS / Azure Key Vault (HSM-backed)  │
│  - Key Rotation: Automatic every 90 days                    │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: Audit & Monitoring                                 │
│  - Immutable audit log (append-only, tamper-evident)        │
│  - Real-time threat detection (SIEM integration)            │
│  - WAF rules: SQL injection, XSS, CSRF, rate limiting      │
└─────────────────────────────────────────────────────────────┘
```

---

### 1.2 Cryptography Standards

**Symmetric Encryption:**
- Algorithm: AES-256-GCM (authenticated encryption)
- Fields encrypted: SSN, TIN, bank account numbers, payroll data, employee PII
- IV: Cryptographically random, stored with ciphertext
- Authentication tag: 128-bit minimum

**Asymmetric Encryption:**
- RSA-4096 for key exchange (rare, JWT uses ECDSA)
- ECDSA with P-256 for JWT signing (faster, smaller keys)
- Perfect Forward Secrecy (PFS): ECDHE in TLS handshake

**Hashing:**
- PBKDF2 or bcrypt (cost factor 12+) for password storage
- SHA-256 for non-sensitive data fingerprints
- HMAC-SHA256 for message authentication

**Key Management:**
- Master keys: HSM-backed (Hardware Security Module)
- Data keys: Envelope encryption (encrypt data key with master key)
- Rotation: Automatic 90-day rotation, re-encrypt all data
- Access: Only Key Management Service has access to plaintext keys

---

### 1.3 Authentication & Authorization

**Multi-Factor Authentication (MFA):**
- Primary: TOTP (Time-based One-Time Password)
  - Provider: Google Authenticator, Microsoft Authenticator, Authy
  - Backup codes: 10× 8-digit codes, printed and stored securely
- Secondary (fallback): SMS OTP to registered phone
  - 6-digit code, 5-minute expiry, rate-limited (5 attempts/15 min)
- Enforcement: Required for all users on day 1

**Session Management:**
- JWT Token Structure:
  ```json
  {
    "sub": "org:12345:user:67890",
    "org_id": "12345",
    "entity_ids": ["e1", "e2", "e3"],
    "roles": ["finance_controller", "vat_specialist"],
    "iat": 1234567890,
    "exp": 1234567890 + 900,  // 15 minutes
    "aud": "ledgr-api.ae"
  }
  ```
- Access Token: 15-minute expiry
- Refresh Token: 30-day expiry, invalidated on logout/password change
- Rotation: New token issued every 5 API calls (sliding window)
- Revocation: Blacklist checked on every request (Redis cache, 16ms lookup)

**Role-Based Access Control (RBAC):**

| Role | Default Permissions | Can Access |
|---|---|---|
| Office Manager | Create users, manage teams, view dashboard | Dashboard, Users, Settings |
| Finance Controller | Post GL entries, approve VAT, reconcile | GL, VAT, Bank, Reports |
| Tax Specialist | Prepare tax filings, review rates | Tax Returns, Tax Config |
| VAT Specialist | Process VAT, manage exemptions, file returns | VAT Transactions, Returns, AML |
| Payroll Officer | Post payroll, WPS filing, manage employees | Payroll, WPS, HR Master |
| Regulatory Officer | Audit logs, compliance reports, data exports | Compliance Dashboard, Audit Trail |
| Audit Manager | Review reconciliations, approve GL close | GL, Trial Balance, Audit Report |
| CFO | Full platform access, approval authority | Everything except system config |
| Admin (Ledgr staff only) | System configuration, user management | Backend admin panel |

**Attribute-Based Access Control (ABAC) - Document Level:**
```
Can User access Document X if:
  - User.org_id == Document.org_id AND
  - User.entity_ids contains Document.entity_id AND
  - (User.roles contain ["finance_controller"] OR Document.shared_with contains User.id) AND
  - Current time < Document.expiry_date
```

---

### 1.4 Data Protection & Residency

**Data Residency Compliance:**
- Primary: UAE data centers (AWS eu-central-1 / Azure UAE North equivalent)
- Backup: Secondary region within UAE (geo-redundant within country)
- Restriction: No data leaves UAE without explicit customer consent (audit logging)
- Testing data: Masked, anonymized, separate from production

**Data Classification:**
```
Tier 1: Highly Sensitive (encrypted at rest + in transit)
  - SSN, TIN, Bank Account Numbers
  - Personal IDs (Passport, EID)
  - Payroll amounts and WPS account details
  - Customer/Vendor bank details
  - AML/KYC documents (photos, government IDs)
  - Employee medical info (if payroll-related)

Tier 2: Sensitive (encrypted at rest, TLS in transit)
  - Customer/Vendor master data (names, contacts)
  - GL transactions and journal entries
  - VAT-classified transaction data
  - Email addresses, phone numbers
  - Audit trail entries (who did what, when)

Tier 3: Internal (TLS in transit, encryption optional)
  - Chart of accounts structure
  - Tax rate tables
  - System configuration
  - Non-personal usage metrics
```

**Data Retention & Deletion:**
- Active customer data: Retained indefinitely (regulatory requirement)
- Deleted customer account data:
  - Grace period: 30 days (restore window)
  - After 30 days: Permanent deletion (overwrite with random data 3× DOD 5220.22-M)
  - Backup tapes: Auto-expire after 90 days
- Audit logs: Retained 7 years (UAE corporate law requirement)

---

### 1.5 Incident Response & Breach Handling

**Incident Classification:**

| Severity | Definition | Response Time | Escalation |
|----------|-----------|---|---|
| Critical | Data breach, authentication bypass, ransomware | 15 minutes | CEO + Legal + FTA notification |
| High | Unauthorized access, PII exposure, service down | 1 hour | CISO + Leadership |
| Medium | Suspicious login, minor data leak, performance issue | 4 hours | Security Team + Team Lead |
| Low | Configuration anomaly, failed login attempts, warning logs | 1 business day | Security Team |

**Breach Notification Protocol:**
1. **Hour 0–1:** Detect, confirm, isolate affected systems
2. **Hour 1–4:** Internal assessment (scope, data affected, customers impacted)
3. **Hour 4–24:** Notify affected customers via email + SMS
4. **Hour 24:** Notify FTA (if breach involves VAT/Tax data)
5. **Hour 24–72:** Notify other regulators if applicable (DFSA, DED, etc.)
6. **Day 5:** Public disclosure (press release)
7. **Day 30:** Post-incident report (RCA, remediation steps)

**Forensics & Evidence Preservation:**
- Immutable audit log snapshot (timestamp, digital signature)
- Network traffic capture (PCAP) for 7 days
- Database transaction logs: Retained for 30 days
- Server logs: Retained for 90 days in S3 Glacier (cold storage)

---

## PART 2: COMPLIANCE ARCHITECTURE

### 2.1 Regulatory Jurisdictions & Frameworks

**UAE Financial Regulatory Bodies:**

| Authority | Jurisdiction | Requirements for Ledgr |
|-----------|---|---|
| **FTA** (Federal Tax Authority) | VAT, Corporate Tax | VAT returns filing, audit trail, transaction classification |
| **MOHRE** (Ministry Human Resources) | Payroll, WPS | WPS filing, employee master, salary structure validation |
| **DED** (Department Economic Development) | Trade License | Entity registration data capture, renewal tracking |
| **CBU** (Central Bank) | Banking, AML | KYC/AML transaction monitoring, sanctions screening |
| **ADGM** | Free Zone finance | Alternative entity structure support (if applicable) |
| **DIFC** | Free Zone finance | DFSA-regulated entities (separate schema option) |

**International Standards:**

| Standard | Application | Ledgr Implementation |
|----------|---|---|
| **GDPR** | Personal data of EU citizens | Data processor agreement, DPA, encryption, subject rights (export/delete) |
| **ISO 27001** | Information security management | Target certification year 2 (Q3 2027) |
| **SOC 2 Type II** | Security & availability attestation | Target certification year 2 |
| **NIST Cybersecurity Framework** | Risk management baseline | Adopt NIST CSF v2.1 categories |

---

### 2.2 Data Privacy & GDPR Compliance

**Applicability:** Ledgr stores personal data of EU citizens (customer contacts, employee records passed through payroll).

**GDPR Obligations:**

1. **Lawful Basis:** Contract (customer service) + Legitimate interest (fraud prevention, audit)
2. **Data Processor Agreement:** Required for Ledgr ↔ Customer relationship
3. **Privacy Notice:** Provide before data collection (in HTML form)
4. **Data Subject Rights:**
   - Right to Access: 30-day API endpoint `/api/users/{id}/export` (CSV + PDF)
   - Right to Erasure: 30-day deletion with audit log retention exception
   - Right to Rectification: Edit endpoint + version history
   - Right to Restriction: "Suspend processing" flag on user record
   - Right to Portability: Full data export in standard format (CSV)
   - Right to Object: Opt-out of profiling/analytics (if any)
5. **Data Protection Impact Assessment (DPIA):** Required before major processing changes
6. **Breach Notification:** 72 hours to authority + notification to individuals
7. **DPO (Data Protection Officer):** Not required (Ledgr is processor, not controller)

**Implementation:**
- Privacy notice: Embedded in signup form, accept checkbox required
- Export endpoint: Triggered by user dashboard, sent as email download link (7-day expiry)
- Deletion: Soft-delete + hard-delete after 30-day grace period
- Audit trail: Log every data access for non-individual employees (e.g., support tickets)

---

### 2.3 UAE Data Protection Law (UAEDPL)

**Law 41 of 2021 - Personal Data Protection Law:**

| Requirement | Ledgr Compliance |
|---|---|
| **Data Residency** | Primary: UAE; Secondary: UAE (no extraterritorial data transfer) |
| **Consent** | Explicit opt-in for non-essential data collection; implicit for contractual necessity |
| **Security Measures** | Encryption at rest, TLS in transit, access controls, audit logging |
| **Data Minimization** | Collect only fields required for functionality (no analytics tracking) |
| **Breach Notification** | Notify UAEDPL regulator within 72 hours if data includes ID/financial info |
| **Children's Data** | Not applicable (B2B platform, no direct children) |
| **Data Retention** | 7 years for audit/regulatory; delete non-essential data after contract ends |

**UAEDPL Breach Notification:**
- Notification recipient: UAE Data Protection Authority (within UAE Ministry of Justice)
- Timeline: 72 hours from discovery
- Required info: Nature of breach, data categories, individuals affected, measures taken

---

### 2.4 AML/CFT Compliance Framework

**Applicable Regulations:**
- UAE AML Law (Law 20 of 2018)
- FATF Mutual Evaluation Report (UAE implemented most Recommendations)
- DIFC AML Rules (if entities use DIFC structures)

**Customer Due Diligence (CDD) - Ledgr's Role:**
- Collect: Full name, DOB, nationality, source of funds, PEP status
- Verify: Government ID (EID/Passport) + address proof
- Risk assessment: Low/Medium/High based on jurisdiction + business type
- Frequency: Annual refresh for high-risk customers

**Vendor Due Diligence (VDD):**
- Same as CDD (verify vendor identity)
- Additional: Banking details validation + payment tracking

**Sanctions Screening:**
- Check customer/vendor names against OFAC SDN list (daily)
- Flag matches for manual review (if name similarity >85%)
- Escalate to compliance officer if flagged
- Document decision (approve or reject vendor)

**Transaction Monitoring:**
- Rule 1: Unusual volume - >5× average monthly spending in single transaction
- Rule 2: Unusual velocity - 10+ transactions in <1 hour
- Rule 3: High-risk jurisdictions - Flag transactions to countries on FATF grey list
- Rule 4: Round-number transactions - Suspicious pattern (exactly AED 100,000)
- Response: Alert compliance officer; auto-freeze if critical score >90

**Suspicious Activity Report (SAR):**
- Internal assessment: If activity meets AML criteria, file report
- Timeline: Within 10 business days of detection
- Recipient: UAE Financial Intelligence Unit (FIU)
- Confidentiality: Don't disclose filing to customer (legal prohibition)

**Implementation in Ledgr:**
- CDD data capture: Onboarding form (Step 2)
- Sanctions screening: Automated on every new vendor/customer
- Transaction monitoring: Real-time GL posting validation
- SAR filing: Compliance dashboard with alert + approve/file workflow

---

### 2.5 VAT Compliance & FTA Integration

**VAT Registration Requirements (UAE):**
- Turnover threshold: AED 375,000 (mandatory if exceeded)
- Foreign VAT ID: If conducting cross-border trade
- Ledgr's role: Store registration details, validate threshold compliance

**VAT Transaction Classification:**
Every invoice/transaction must be tagged with one of:
- Standard rate (5%)
- Zero-rated (specific exports, medicines, food)
- Exempt (financial services, healthcare)
- Out-of-scope (no VAT)

**VAT Return Filing:**
- Frequency: Monthly (default) or quarterly (if eligible for simplified accounting)
- Deadline: 28th of following month
- Submission: Via FTA e-services portal (Ledgr → FTA integration via API)
- Content: Input VAT, Output VAT, Adjustment, Net amount due

**Ledgr Implementation:**
- Store VAT registration: Entity master data
- Classify transactions: Dropdown on invoice creation + autocomplete from history
- Calculate returns: Real-time GL report (VAT Input vs Output by category)
- Validate accuracy: Flag discrepancies >1% variance
- Auto-file (future): Integrate with FTA API (Q2 2027 target)

---

### 2.6 Corporate Tax & Profit Filing

**Corporate Tax Framework (UAE):**
- Tax rate: 0% for first AED 375,000 profit (year 1), then 9%
- Exemptions: Free zones, certain sectors
- Filing deadline: 4 months after financial year-end
- Required documents: Financial statements (BS, P&L), tax return form, working papers

**Ledgr's Data Capture:**
- Income: GL Account 4000–4999 (operating revenue)
- Expenses: GL Account 5000–5999 (COGS, operating expenses)
- Deductions: Interest expense, depreciation, tax-deductible provisions
- Non-deductible: Penalties, entertainment, personal expenses

**Calculation Logic:**
```
Taxable Income = Operating Income - Deductions
Tax Liability = Max(0%, Taxable Income - 375,000 AED) × 9%
```

**Ledgr Implementation:**
- GL classification: Link accounts to tax category (income, deduction, non-deductible)
- Draft return: Auto-generate tax summary report
- Validation: Compare GL totals to financial statements (must match 100%)
- Export: Generate TXT file for tax filing software (FTA-compatible format)

---

### 2.7 Payroll & WPS Compliance

**Ministry of Human Resources (MOHRE) Requirements:**

**WPS (Wages Protection System):**
- Mandatory for all employees on UAE labor contracts
- Payment method: Direct bank transfer (no cash)
- Frequency: Monthly (by 15th of following month)
- Data fields: Employee ID, basic salary, allowances, deductions

**Employee Master Data (Required):**
- Full name (Arabic + English)
- Employee ID (from Ministry)
- Labor card number
- Passport/EID number
- Date of birth
- Date of hire
- Job title
- Base salary + allowances
- Bank account details

**Salary Structure Validation:**
- Basic salary: ≥50% of total (rest can be allowances)
- Deductions: Limited to 10% of salary (unless debt repayment)
- Overtime: Calculated per labor law (1.25× or 1.5× rate)
- Gratuity: Accrued monthly (1/30th of salary × years of service)
- Leave: Annual leave provision (30 days for most), sick leave (15 days)

**WPS Filing:**
- Frequency: Monthly (before 15th of following month)
- Method: FTA e-services (automated file upload)
- Validation: Must match bank transfer records (audit trail check)

**Ledgr Implementation:**
- Employee master: Capture all required fields (Step 3 onboarding)
- Salary calculation: Auto-calculate based on labor law rules
- WPS preparation: Generate FTA-compatible CSV file (monthly)
- Bank reconciliation: Match WPS filing to actual bank transfers (variance alert if >1%)
- Gratuity accrual: Auto-accrue monthly in GL (Liability account)

---

### 2.8 E-Invoicing & Peppol Compliance

**UAE E-Invoicing Mandate (FTA):**
- Phase 1 (July 2026): Large enterprises (revenue >AED 50M)
- Phase 2 (Jan 2027): Medium enterprises (revenue >AED 10M)
- Phase 3 (Jan 2028): All businesses
- Format: Peppol BIS 3.0 (international standard)
- Network: Peppol eDelivery Network (interconnected providers)

**Required Fields (Peppol):**
- Invoice number + date
- Supplier name, address, TIN
- Customer name, address (TIN if available)
- Item description, quantity, unit price, amount
- Tax amount (VAT line-by-line)
- Total amount due

**Ledgr Implementation (Phase 1 = July 2026):**
- Invoice creation: Add Peppol-compliant structure
- Data validation: Ensure all mandatory fields populated
- XML generation: Auto-generate Peppol XML (UBL format)
- Transmission: Send via Peppol eDelivery network (integrate with Peppol Service Provider)
- Archival: Store received/sent invoices in immutable audit log

**Timeline:**
- Q1 2026: Peppol integration (testing with FTA sandbox)
- Q2 2026: Beta with early-access customers
- July 2026: Production launch (Phase 1 support)

---

## PART 3: DATA ARCHITECTURE & MULTI-TENANCY SECURITY

### 3.1 Database Design Principles

**Multi-Tenancy Model: Tenant-per-Schema (Recommended)**

Why this approach:
- **Isolation:** Complete data separation (schema-level firewall)
- **Compliance:** Easy audit trail per tenant; no risk of cross-tenant data leak
- **Performance:** Tenant-specific indexing, query optimization
- **Scale:** Shard by tenant (each shard handles 50–100 tenants)
- **Backup/Restore:** Restore single tenant without affecting others

**Forbidden Patterns:**
- ❌ Shared schema with org_id filter (one WHERE clause bug = data breach)
- ❌ Row-level security alone (insufficient for regulated data)
- ❌ Application-layer filtering (database should enforce, not app)

**Schema Structure per Tenant:**
```sql
-- Tenant namespace: org_12345_production
CREATE SCHEMA org_12345_production;

-- All tables within tenant schema
CREATE TABLE org_12345_production.entities (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,  -- Redundant for safety (schema already scoped)
  legal_name VARCHAR NOT NULL,
  -- ... rest of columns
);

-- Indexes: Partition on org_id (for sharding)
CREATE INDEX idx_entities_org ON org_12345_production.entities(org_id);
```

---

### 3.2 Audit Trail & Immutability

**Immutable Audit Log Design:**

Every transaction → append-only log entry (never deleted, never modified):

```sql
CREATE TABLE org_12345_production.audit_log (
  id BIGSERIAL PRIMARY KEY,  -- Monotonically increasing
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID NOT NULL,
  action VARCHAR NOT NULL,  -- 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'FILE'
  entity_type VARCHAR NOT NULL,  -- 'invoice', 'gl_entry', 'vat_return'
  entity_id UUID NOT NULL,
  before_state JSONB,  -- Snapshot of old values
  after_state JSONB,   -- Snapshot of new values
  ip_address INET,
  user_agent VARCHAR,
  hash BYTEA,  -- SHA-256(previous_hash || this_record) = tamper-evident chain
  
  CONSTRAINT immutable CHECK (true)  -- Cannot be updated/deleted
);

-- Permissions: Only INSERT allowed; no UPDATE/DELETE
REVOKE UPDATE, DELETE ON org_12345_production.audit_log FROM app_user;
GRANT INSERT ON org_12345_production.audit_log TO app_user;
```

**Tamper Detection:**
- Hash chain: `H(N) = SHA256(H(N-1) || record_N)`
- Verification: Recalculate hash chain; mismatch = tampering
- Storage: Save root hash to immutable external storage (AWS S3 Object Lock)

**Audit Log Retention:**
- Active storage (queryable): 1 year in PostgreSQL
- Archive storage (cold): 6 years in AWS Glacier (legal hold)
- Deletion: Only after 7 years (per UAE corporate law)

---

### 3.3 Encryption Implementation Details

**At-Rest Encryption (Sensitive Fields):**

```sql
-- Tier 1 (Highly Sensitive) Fields - Encrypted
CREATE TABLE org_12345_production.employees (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,  -- Not encrypted (name is publicly visible on payroll)
  eid_number BYTEA NOT NULL,  -- Encrypted with pgcrypto
  ssn BYTEA NOT NULL,         -- Encrypted
  bank_account BYTEA NOT NULL, -- Encrypted
  salary_amount DECIMAL,       -- Not encrypted (sensitive but needed for calculations)
  
  CONSTRAINT check_encrypted CHECK (
    -- Verify encryption marker present
    substring(eid_number, 1, 5) = E'\\x00000001'  -- Magic bytes indicate encryption
  )
);

-- Encryption function (PostgreSQL pgcrypto extension)
-- Note: In production, use AWS KMS instead of pgcrypto key
CREATE OR REPLACE FUNCTION encrypt_field(plaintext TEXT, kms_key_id UUID)
RETURNS BYTEA AS $$
BEGIN
  -- Call AWS KMS GenerateDataKey
  -- Encrypt plaintext with returned data key
  -- Return: [1-byte version][32-byte encrypted_data_key][16-byte IV][ciphertext][16-byte auth_tag]
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**In-Transit Encryption (TLS 1.3):**

```yaml
# Nginx configuration
server {
  listen 443 ssl http2;
  
  # TLS 1.3 only (no fallback to 1.2)
  ssl_protocols TLSv1.3;
  ssl_ciphers TLS_AES_256_GCM_SHA384;
  
  # Certificate: Let's Encrypt wildcard (*.ledgr.ae)
  ssl_certificate /etc/ssl/certs/ledgr.ae.crt;
  ssl_certificate_key /etc/ssl/private/ledgr.ae.key;
  
  # HSTS: Force HTTPS for 1 year, include subdomains
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
  
  # Certificate pinning (public key hash)
  add_header Public-Key-Pins "pin-sha256=\"[base64-hash]\"; max-age=31536000; includeSubDomains" always;
}
```

---

### 3.4 Key Management Lifecycle

**Master Key (HSM-backed):**
```
┌─ AWS KMS Master Key (in Hardware Security Module)
│  - Cryptographic material never leaves HSM
│  - Access requires AWS IAM role + MFA
│  - Automatic rotation every 365 days
│  - Audit every access via CloudTrail
└─ Protected by: HSM PIN + AWS IAM + CloudTrail logging
```

**Data Encryption Key (DEK) Lifecycle:**
```
1. Request DEK: App calls AWS KMS GenerateDataKey(master_key_id, algorithm=AES-256)
2. Response: { encrypted_dek, plaintext_dek }
3. Use: Encrypt data with plaintext_dek
4. Store: Save encrypted_dek with ciphertext
5. Rotate: Every 90 days, re-encrypt all data with new DEK
   - Scan database for old encrypted_deks
   - Decrypt with old DEK, re-encrypt with new DEK
   - Update ciphertext + encrypted_dek in database
6. Shred: Plaintext DEK memory overwritten with random data
```

---

## PART 4: APPLICATION SECURITY

### 4.1 API Security

**OAuth 2.0 + OpenID Connect:**

```
Client Credentials Flow (for Ledgr's own services):
┌─────────────┐
│ OAuth Server│
│  (Ledgr)    │
└─────────────┘
       ↑
       │ 1. POST /oauth/token
       │    Client ID + Secret
       │
┌─────────────┐
│ API Service │
│  (Backend)  │
└─────────────┘
       │
       │ 2. Response: { access_token, expires_in }
       │
       ↓
    [Uses JWT to call other services]
```

**JWT Security:**
- Algorithm: RS256 (asymmetric, allows key rotation without shared secret)
- Signature: Private key held by OAuth server
- Validation: Public key published at `/.well-known/jwks.json`
- Claims:
  ```json
  {
    "iss": "https://ledgr.ae/oauth",
    "sub": "org:12345:user:67890",
    "aud": "ledgr-api",
    "exp": 1234567890 + 900,   // 15 min
    "iat": 1234567890,
    "org_id": "12345",
    "entity_ids": ["e1", "e2"],
    "roles": ["finance_controller"]
  }
  ```

**Request Validation:**

```javascript
// Every API endpoint
async function validateRequest(req, res, next) {
  const token = extractBearerToken(req);
  
  if (!token) return res.status(401).json({ error: "Missing token" });
  
  const payload = verifyJWT(token, PUBLIC_KEY);
  if (!payload) return res.status(401).json({ error: "Invalid token" });
  
  // Verify org_id from URL matches token
  const urlOrgId = req.params.org_id;
  if (payload.org_id !== urlOrgId) {
    return res.status(403).json({ error: "Org mismatch" });
  }
  
  // Verify entity_id access
  const requestedEntity = req.body.entity_id;
  if (!payload.entity_ids.includes(requestedEntity)) {
    return res.status(403).json({ error: "Entity access denied" });
  }
  
  // Verify roles
  if (!payload.roles.includes('finance_controller')) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  
  req.user = payload;
  next();
}
```

**Rate Limiting:**

```javascript
// Redis-backed rate limiter (prevent brute force)
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rate-limit:'
  }),
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // Max 100 requests per window
  keyGenerator: (req) => req.user?.org_id || req.ip,  // By org (for auth'd users) or IP
  skip: (req) => req.user?.roles.includes('admin'),   // Admins not rate-limited
  message: { error: "Too many requests, please retry later" }
});

app.use('/api/', limiter);
```

---

### 4.2 OWASP Top 10 Mitigation

| Vulnerability | Ledgr Mitigation | Implementation |
|---|---|---|
| **A1: Injection** | Parameterized queries (no string concatenation) | Prisma ORM auto-parameterizes; code review for raw SQL |
| **A2: Broken Auth** | OAuth 2.0, MFA, session timeout | JWT + TOTP + 15-min token expiry |
| **A3: Sensitive Data Exposure** | Encryption at rest + TLS 1.3 | AES-256-GCM + TLS 1.3 mandatory |
| **A4: XML External Entities (XXE)** | Disable XML features if not needed | Disable DTD processing in XML parsers |
| **A5: Broken Access Control** | RBAC + ABAC + RLS | Verified at API layer + database layer |
| **A6: Security Misconfiguration** | IaC (Infrastructure as Code), security headers | CloudFormation templates + WAF rules |
| **A7: XSS** | Input validation + output encoding | Sanitize input (DOMPurify); escape output in templates |
| **A8: Insecure Deserialization** | Avoid untrusted deserialization | Use JSON only (no pickle/eval); validate schema |
| **A9: Using Components with Known Vulnerabilities** | Dependency scanning | npm audit + Snyk CI integration; weekly scanning |
| **A10: Insufficient Logging** | Comprehensive audit trail | Immutable audit log + SIEM integration |

---

### 4.3 Input Validation & Sanitization

**Schema Validation (Every Request):**

```javascript
// Example: Create GL Journal Entry
const createJournalEntrySchema = Joi.object({
  entity_id: Joi.string().uuid().required(),
  date: Joi.date().iso().required(),
  description: Joi.string().max(255).required(),
  currency: Joi.string().length(3).uppercase().required(),
  lines: Joi.array().items(
    Joi.object({
      account_id: Joi.string().uuid().required(),
      debit: Joi.number().positive(),
      credit: Joi.number().positive(),
      description: Joi.string().max(100)
      // Constraint: debit XOR credit (not both zero, not both set)
    }).external(async (value) => {
      if ((value.debit > 0 && value.credit > 0) || (value.debit === 0 && value.credit === 0)) {
        throw new Error("Must have either debit OR credit, not both");
      }
    })
  ).required()
    .external(async (value) => {
      // Constraint: Total debits must equal total credits
      const totalDebit = value.reduce((sum, line) => sum + (line.debit || 0), 0);
      const totalCredit = value.reduce((sum, line) => sum + (line.credit || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error("Debits must equal credits");
      }
    })
});

// Validate request
const { error, value } = createJournalEntrySchema.validate(req.body);
if (error) return res.status(400).json({ error: error.details });
```

**Output Encoding (Prevent XSS):**

```javascript
// Frontend - React example
import DOMPurify from 'dompurify';

function CustomerCard({ customer }) {
  const safeName = DOMPurify.sanitize(customer.name);
  
  return (
    <div>
      <h3>{safeName}</h3>  {/* React auto-escapes; DOMPurify adds extra layer */}
      <p>{customer.description}</p>  {/* Plain text is safe */}
    </div>
  );
}

// Backend - JSON response (always safe)
res.json({
  name: customer.name,  // JSON serialization auto-escapes special chars
  email: customer.email
});
```

---

## PART 5: INFRASTRUCTURE & DEPLOYMENT SECURITY

### 5.1 Cloud Architecture (AWS Recommended)

```
┌─ AWS Account (Ledgr Production)
│
├─ VPC (eu-central-1 - Frankfurt, Germany / ME equivalent)
│  │
│  ├─ Public Subnet (NAT Gateway)
│  │  └─ CloudFront (CDN for static assets)
│  │  └─ ALB (Application Load Balancer) - TLS termination
│  │
│  ├─ Private Subnet (Application Tier)
│  │  ├─ ECS Fargate (Node.js API) - Auto-scale 2–10 instances
│  │  ├─ ECS Fargate (Migration Agent) - Batch processing
│  │  └─ Secrets Manager (API keys, database passwords)
│  │
│  ├─ Private Subnet (Database Tier)
│  │  ├─ RDS PostgreSQL (Multi-AZ for HA)
│  │  │  ├─ Master node (write)
│  │  │  └─ Replica (read-only)
│  │  │
│  │  └─ ElastiCache Redis (Session + Rate limiting)
│  │
│  ├─ Private Subnet (Batch/Analytics Tier)
│  │  └─ Glue ETL (Monthly VAT report generation)
│  │
│  └─ NAT Gateway (Outbound internet for external APIs - FTA, banks)
│
├─ Storage (S3)
│  ├─ Application Logs (Glacier after 90 days)
│  ├─ Audit Trail Backups (Object Lock - immutable)
│  └─ Customer Data Exports (Encrypted, signed URLs)
│
├─ Monitoring & Security
│  ├─ CloudWatch (Logs, Metrics, Alarms)
│  ├─ WAF (Web Application Firewall)
│  │  ├─ SQL Injection rules
│  │  ├─ XSS rules
│  │  ├─ Rate limiting (IP-based)
│  │  └─ Geo-blocking (if needed)
│  │
│  ├─ GuardDuty (Threat detection)
│  ├─ Config (Configuration compliance)
│  └─ CloudTrail (API audit log)
│
└─ Backup & Disaster Recovery
   ├─ RDS Automated Snapshots (daily, 35-day retention)
   ├─ S3 Cross-Region Replication (UAE to EU backup)
   └─ Recovery Plan: RTO 4 hours, RPO 1 hour
```

---

### 5.2 Network Security

**VPC Configuration:**

```yaml
# Security Groups (Stateful firewall rules)

# ALB Security Group
SecurityGroupALB:
  Ingress:
    - IpProtocol: tcp
      FromPort: 443
      ToPort: 443
      CidrIp: 0.0.0.0/0  # HTTPS from internet
    - IpProtocol: tcp
      FromPort: 80
      ToPort: 80
      CidrIp: 0.0.0.0/0   # HTTP redirect to HTTPS
  Egress:
    - IpProtocol: -1
      CidrIp: 0.0.0.0/0   # All outbound allowed

# Application Security Group
SecurityGroupApp:
  Ingress:
    - IpProtocol: tcp
      FromPort: 3000
      ToPort: 3000
      SourceSecurityGroupId: SecurityGroupALB  # Only from ALB
  Egress:
    - IpProtocol: tcp
      FromPort: 5432
      ToPort: 5432
      DestinationSecurityGroupId: SecurityGroupDB  # To database
    - IpProtocol: tcp
      FromPort: 6379
      ToPort: 6379
      DestinationSecurityGroupId: SecurityGroupCache  # To Redis
    - IpProtocol: tcp
      FromPort: 443
      ToPort: 443
      CidrIp: 0.0.0.0/0   # Outbound HTTPS (FTA, banks, external APIs)

# Database Security Group
SecurityGroupDB:
  Ingress:
    - IpProtocol: tcp
      FromPort: 5432
      ToPort: 5432
      SourceSecurityGroupId: SecurityGroupApp  # Only from app tier
  Egress:
    - IpProtocol: -1
      CidrIp: 0.0.0.0/0   # (Usually restricted in production)
```

**DDoS Protection:**
- AWS Shield Standard (automatic, free)
- AWS Shield Advanced (optional, for large-scale attacks)
- CloudFlare WAF rules (additional layer)

---

### 5.3 Secrets Management

**Secret Rotation Policy:**

```
Database Credentials:
  - Rotation: Every 90 days
  - Method: AWS Secrets Manager auto-rotation
  - New password: Generated by Lambda function
  - Old password: Disabled after 5-day grace period

API Keys (OAuth/External):
  - Rotation: Every 180 days (or on compromise)
  - Method: Manual or external provider auto-rotation
  - Ledgr stores: Encrypted in Secrets Manager

Master Encryption Key:
  - Rotation: Automatic, every 365 days (AWS KMS)
  - Old keys: Retained for decryption of historical data
  - Access: Requires AWS IAM role + MFA
```

**Secret Access Audit:**
```
Every secret retrieval is logged in CloudTrail:
{
  "eventTime": "2026-05-30T10:15:30Z",
  "eventName": "GetSecretValue",
  "requestParameters": {
    "secretId": "prod/database/password"
  },
  "userIdentity": {
    "arn": "arn:aws:iam::123456789:role/ECSTaskRole"
  }
}
```

---

## PART 6: OPERATIONS & MONITORING

### 6.1 Security Monitoring & Alerting

**SIEM Integration (Splunk or AWS Security Hub):**

```
Real-time Alerts:
1. Authentication failures >5 in 5 minutes → Immediate alert (suspicious login)
2. Multiple org access attempts from same IP → Escalate (account takeover?)
3. Data export >100MB in 1 hour → Review (data exfiltration attempt?)
4. Database connection from unexpected IP → Block (unauthorized access)
5. Audit log query without proper authorization → Investigate (tampering?)
6. Certificate expiry <30 days → Renewal alert (prevent outage)
```

**Metrics Dashboard (CloudWatch):**
```
Key Performance Indicators:
- API Latency (p50, p99): Target <200ms
- Error Rate: Target <0.1% (200 errors per 2M requests)
- Database CPU: Alert if >80%
- Memory Usage: Alert if >85%
- Disk Space: Alert if >80%

Security Metrics:
- Failed authentication attempts (hourly)
- Rate limit hits (per IP)
- WAF rule triggers (by rule)
- Unauthorized access attempts (by permission)
```

---

### 6.2 Incident Response Plan

**Escalation Matrix:**

| Incident Type | Severity | Owner | Escalation | Timeline |
|---|---|---|---|---|
| Failed login attempts | Low | Security team | None | Next business day |
| Unauthorized data access (detected) | Medium | Security team → CISO | CEO, Legal | 1 hour |
| Data breach (confirmed) | Critical | CISO | CEO, Legal, FTA, Regulator | 15 minutes |
| Service outage | High | Ops team → VP Eng | CEO | 30 minutes |
| Certificate expiry | Medium | Ops team | VP Eng | 1 week before |

**Forensic Capabilities:**
- Immutable audit trail: Query all user actions (who, what, when)
- Network logs: PCAP for 7 days (source IP, destination, payload size)
- Database logs: Transaction history for 30 days
- Application logs: Structured logs (JSON) for 90 days

---

### 6.3 Compliance Auditing & Certification

**Annual Audits:**

1. **ISO 27001 Audit** (Internal) → Year 2 (Q3 2027)
   - Assessment: 100% compliance with ISMS controls
   - Documentation: Risk register, control evidence, proof of testing
   - Certification: 3-year cycle

2. **SOC 2 Type II Audit** (External) → Year 2 (Q3 2027)
   - Scope: Security, Availability, Processing Integrity
   - Period: 6-month audit period (Jan–June)
   - Report: Trust Services Criteria compliance

3. **GDPR Compliance Audit** (Internal + External)
   - Scope: Data processing, consent, breach handling, DPA
   - Frequency: Annual + incident-triggered
   - Documentation: DPA, Privacy Impact Assessment, Breach log

4. **UAE AML/CFT Audit** (Internal + Consultant)
   - Scope: Customer due diligence, sanctions screening, SAR filing
   - Frequency: Annual
   - Documentation: Audit report, testing evidence

---

## PART 7: IMPLEMENTATION ROADMAP (Security Phase-In)

### Phase 1 (Weeks 1–6): Foundation Security

**Week 1–2:**
- [ ] PostgreSQL database hardening (restrict connections, enable audit logging)
- [ ] OAuth 2.0 + JWT setup (private/public key pair generation)
- [ ] TLS certificate (Let's Encrypt, auto-renewal)
- [ ] RBAC permission matrix implementation

**Week 3–4:**
- [ ] Secrets Manager integration (AWS Secrets Manager or HashiCorp Vault)
- [ ] Database encryption (setup KMS master key, implement DEK envelope)
- [ ] Audit trail table creation (immutable, tamper-evident design)
- [ ] WAF rules deployment (SQL injection, XSS, CSRF)

**Week 5–6:**
- [ ] MFA setup (TOTP + SMS fallback)
- [ ] Rate limiting (Redis backend)
- [ ] Input validation schemas (Joi or Zod)
- [ ] Output encoding (DOMPurify on frontend)

**Gate Criteria:**
- All authentication tests passing (login, logout, token refresh)
- Audit trail capturing all changes
- No plaintext secrets in code
- Database encrypted at rest

---

### Phase 2 (Weeks 7–12): Compliance Security

**Week 7–8:**
- [ ] Data classification implementation (Tier 1/2/3 fields encrypted)
- [ ] GDPR Data Subject Rights endpoints (export, delete)
- [ ] AML/CFT customer due diligence capture
- [ ] VAT transaction classification fields

**Week 9–10:**
- [ ] Breach notification workflow (alert + escalation + SAR filing)
- [ ] Compliance validation engine (real-time GL checks)
- [ ] Audit trail export (SIEM-compatible format)
- [ ] FTA integration testing (VAT return filing sandbox)

**Week 11–12:**
- [ ] Security incident response playbook (documented, tested)
- [ ] Backup & disaster recovery testing (restore RTO/RPO verification)
- [ ] CloudWatch dashboards + alarms setup
- [ ] Documentation (Security Architecture, Incident Response, DPA)

**Gate Criteria:**
- All compliance rules validated by external consultant
- Breach notification tested end-to-end
- Backup restore completed successfully
- Documentation approved by CISO

---

### Phase 3 (Year 2): Certifications & Hardening

**Q3 2027:**
- [ ] ISO 27001 certification audit
- [ ] SOC 2 Type II audit (6-month observation)
- [ ] Bug bounty program launch
- [ ] Penetration testing (annual)

---

## PART 8: SECURITY REQUIREMENTS CHECKLIST (Architect Review)

### Database Security

- [ ] Multi-tenant schema isolation (no shared tables)
- [ ] Row-Level Security (RLS) on all tenant tables
- [ ] Encrypted Tier 1 fields (PII, SSN, bank details)
- [ ] Immutable audit trail (append-only, tamper-evident)
- [ ] Database user with minimal privileges (app user ≠ admin)
- [ ] Backup encryption (at rest + in transit)
- [ ] Network isolation (database in private subnet, ALB access only)

### API Security

- [ ] TLS 1.3 mandatory (no fallback)
- [ ] OAuth 2.0 + JWT for all requests
- [ ] MFA enforcement (TOTP + SMS)
- [ ] RBAC + ABAC implemented
- [ ] Rate limiting per org (not per IP)
- [ ] Input validation (Joi schema on every request)
- [ ] Output encoding (DOMPurify on frontend)
- [ ] CORS properly configured (whitelist known domains)
- [ ] HSTS header (Strict-Transport-Security)
- [ ] CSP header (Content-Security-Policy)

### Data Protection

- [ ] Data classification (Tier 1/2/3)
- [ ] Encryption keys in HSM (AWS KMS)
- [ ] Key rotation policy (90 days for DEK, 365 for master key)
- [ ] GDPR data subject rights (export, delete, rectify)
- [ ] Data retention policy (7 years audit logs, then delete)
- [ ] Backup strategy (daily snapshots, 35-day retention)
- [ ] Disaster recovery (RTO 4h, RPO 1h)

### Compliance

- [ ] AML/CFT framework (CDD, sanctions screening, SAR filing)
- [ ] VAT compliance (transaction classification, FTA integration ready)
- [ ] Corporate tax (GL classification, annual filing)
- [ ] Payroll (WPS filing, gratuity accrual)
- [ ] GDPR DPA in place
- [ ] Breach notification process documented
- [ ] Audit trail SIEM integration

### Monitoring & Incident Response

- [ ] CloudWatch dashboards (API latency, errors, security metrics)
- [ ] Alerts configured (failed auth >5, data export >100MB, cert expiry)
- [ ] Incident response playbook (written, tested)
- [ ] Forensic capability (7-day PCAP, 30-day DB logs)
- [ ] SIEM integration (Splunk or AWS Security Hub)
- [ ] Annual security audit planned

### Infrastructure

- [ ] VPC with public/private subnets
- [ ] Security groups (least privilege)
- [ ] ALB with TLS termination
- [ ] RDS with Multi-AZ + automated snapshots
- [ ] ElastiCache for session management
- [ ] S3 with Object Lock for immutable audit trail
- [ ] NAT Gateway for outbound internet
- [ ] CloudFront for CDN (static assets)
- [ ] AWS WAF rules deployed
- [ ] DDoS protection (Shield Advanced optional)

### Documentation

- [ ] Security Architecture document (this doc)
- [ ] Incident Response playbook
- [ ] Data Protection Impact Assessment (DPIA)
- [ ] DPA with customers
- [ ] Privacy notice (GDPR-compliant)
- [ ] Secrets rotation procedures
- [ ] Disaster recovery runbook

---

## SIGN-OFF

**Architect Review:**
- [ ] Database schema approved
- [ ] Encryption approach approved
- [ ] Multi-tenancy isolation approved
- [ ] API security design approved

**Security Officer Review:**
- [ ] All OWASP mitigations implemented
- [ ] Compliance framework approved
- [ ] Incident response plan approved

**Compliance Consultant Review:**
- [ ] UAE regulations (VAT, Payroll, AML) compliant
- [ ] FTA integration readiness approved
- [ ] Data protection measures approved

---

**Next Step:** Schedule 2-hour architecture review session with engineering lead, CISO, and compliance consultant.

**Prepared by:** Claude (AI Assistant)  
**Date:** May 30, 2026  
**Review Date:** [Scheduled by user]
