# CCPA (California Consumer Privacy Act) Compliance Guide

**Applicability:** Ledgr collects personal information from California residents  
**Definition of Personal Information:** Information that identifies, relates to, or could be linked with a specific consumer  
**Effective Date:** January 1, 2020 (with amendments from CPRA)  
**Scope:** California (and potentially CPRA nationally after 2023)

---

## 1. CONSUMER RIGHTS

### Right to Know (§1798.100)
**What:** Consumers can request what personal information you collect and how it's used

**Implementation:**
- [ ] Provide "Download My Data" feature in account settings
- [ ] Format: Machine-readable (JSON, CSV)
- [ ] Include:
  - [ ] Data categories collected (name, email, IP address, usage)
  - [ ] Source of data (from consumer directly, from vendor, from public record)
  - [ ] Business purpose for collection (provide service, analytics, legal compliance)
  - [ ] Categories of third parties with whom data is shared
  - [ ] Specific data points (e.g., all email addresses on file)
- [ ] Deadline: Respond within 45 days (extendable 45 days with notice)
- [ ] Frequency: Allow up to 2 requests per 12 months per consumer
- [ ] No fee (unless excessive requests)
- [ ] Cannot charge for exercising right

**Verification:**
- [ ] Verify requester is California resident
- [ ] Verify requester owns account (send confirmation email)
- [ ] Log request in audit_log

```typescript
// Implementation example
app.get('/api/my-data', async (req, res) => {
  const consumer = req.auth;
  
  // Verify California resident
  if (!isCaliforniaResident(consumer.state)) {
    return res.status(403).json({ error: 'CCPA applies to CA residents only' });
  }

  // Generate export
  const myData = {
    categories: {
      identifiers: ['name', 'email', 'phone'],
      commercial: ['payroll_history', 'gl_entries_authored'],
      internet_activity: ['login_history', 'api_calls'],
    },
    sources: ['collected_directly', 'from_employer'],
    purposes: ['provide_service', 'legal_compliance'],
    thirdParties: ['AWS', 'Stripe'],
  };

  // Log in audit
  await auditLogger.logEvent({
    event_type: 'ccpa:right_to_know_requested',
    entity_id: consumer.user_id,
    status: 'success',
  });

  res.json(myData);
});
```

### Right to Delete (§1798.105)
**What:** Consumers can request deletion of personal information (exceptions apply)

**Implementation:**
- [ ] Provide "Delete My Account" in settings
- [ ] Include confirmation: "This action is permanent"
- [ ] Deadline: Respond within 45 days (extendable 45 days)
- [ ] Exceptions (CAN retain):
  - [ ] Data necessary to complete transaction (payroll records for current period)
  - [ ] Legal compliance (7-year GL retention for audit)
  - [ ] Security purposes (fraud detection, preventing harm)
  - [ ] Business operations (research, product improvement)
- [ ] Exceptions (MUST delete):
  - [ ] Data collected by mistake
  - [ ] Data from consent withdrawal
  - [ ] Data no longer needed for stated purpose

**Code Example:**
```typescript
app.delete('/api/account', async (req, res) => {
  const consumer = req.auth;
  
  // Mark for deletion (implement async deletion)
  await db.query(
    `UPDATE users SET deletion_requested_at = NOW(), deletion_reason = $1
     WHERE id = $2`,
    [req.body.reason, consumer.user_id]
  );

  // Log request
  await auditLogger.logDataDeletion(
    consumer.org_id,
    consumer.user_id,
    consumer.user_id,
    ['name', 'email', 'phone', 'ssn'],
    'consumer_request',
    req.ip,
    req.get('user-agent')
  );

  // Delete within 45 days (implement batch job)
  res.json({ message: 'Account deletion requested. Processing within 45 days.' });
});
```

**What to Delete:**
- [ ] Profile: name, email, phone
- [ ] Salary information (mask to "***")
- [ ] Personal identifiers (SSN, national ID)

**What to Retain:**
- [ ] GL entries (legal compliance, 7-year requirement)
- [ ] Tax records (legal requirement)
- [ ] Audit logs (immutable, required for integrity)

### Right to Opt-Out of Sale (§1798.120)
**What:** Consumers can request not to sell their personal information

**Definition of "Sale":** Sharing personal information with third parties for monetary/valuable consideration

**Implementation:**
- [ ] Add "Do Not Sell My Information" link in footer
- [ ] Checkbox at signup: "Do not sell my information"
- [ ] Track opt-out status in user table
- [ ] Honor opt-out in all future data sharing

**Code Example:**
```typescript
// In signup form
<label>
  <input type="checkbox" name="do_not_sell" defaultChecked={true} />
  Do not sell my personal information
</label>

// In database
UPDATE users SET do_not_sell_preference = $1 WHERE id = $2

// Before sharing data with third party
if (user.do_not_sell_preference) {
  // Skip this user
  continue;
}
```

### Right to Correct (CPRA Amendment)
**What:** Consumers can request correction of inaccurate personal information

**Implementation:**
- [ ] Allow profile editing (name, email, address)
- [ ] Flag incorrect data in database
- [ ] Provide correction form
- [ ] Log corrections in audit trail
- [ ] Deadline: 45 days (extendable 45 days)

### Right to Limit Use (CPRA Amendment)
**What:** Consumers can limit how their data is used

**Implementation:**
- [ ] Offer granular opt-outs for specific uses:
  - [ ] Marketing communications
  - [ ] Behavioral profiling
  - [ ] Selling to third parties
- [ ] Store preferences in user table
- [ ] Honor preferences in all processing

---

## 2. PRIVACY NOTICE

**Required:** Displayed at time of data collection

**Content:**
- [ ] Categories of personal information collected
  - [ ] Identifiers (name, email, account ID)
  - [ ] Commercial information (transaction history, GL entries)
  - [ ] Internet activity (pages visited, clicks, IP address)
  - [ ] Geolocation (not applicable for Ledgr)
  - [ ] Sensitive information (not collected)
- [ ] Business purpose for collection
  - [ ] Provide service (process GL entries)
  - [ ] Legal compliance (tax reporting)
  - [ ] Analytics (usage patterns)
- [ ] Sources of information
  - [ ] Collected directly from consumer
  - [ ] Inferred from behavior
  - [ ] Purchased from data brokers (if applicable)
- [ ] Categories of third parties with whom data is shared
  - [ ] Service providers (AWS, Stripe)
  - [ ] Business partners (not applicable)
  - [ ] For legal compliance (government, regulators)
- [ ] Retention policy
  - [ ] "We retain data for [X] years unless you request deletion"
- [ ] Consumer rights
  - [ ] Right to know, right to delete, right to opt-out, right to correct
  - [ ] How to exercise (link to "Request Privacy Rights" page)
  - [ ] Non-discrimination promise (we won't penalize you for exercising rights)

**Example Privacy Notice:**

```markdown
# CCPA Privacy Notice for California Residents

## What Information We Collect
- Your name, email, phone number
- Financial information (payroll, GL entries)
- Login activity and IP addresses

## Why We Collect It
- To provide accounting services
- To comply with tax law
- To improve our product

## How Long We Keep It
- Payroll records: 7 years (legal requirement)
- GL entries: 7 years (audit trail)
- Usage logs: 90 days

## Who We Share It With
- AWS (infrastructure)
- Stripe (payment processing)
- Tax authorities (legal requirement)

## Your Rights
- **Right to Know:** Request what data we have
- **Right to Delete:** Request deletion (some exceptions)
- **Right to Opt-Out:** Prevent data sale
- **Right to Correct:** Fix inaccurate data
- **Right to Limit Use:** Restrict how we use data

[Button: Submit Privacy Request]
```

---

## 3. BUSINESS PURPOSES (§1798.140(w))

Must document business purpose for each data collection:

| Data Type | Business Purpose | Retained | Shared |
|-----------|------------------|----------|--------|
| Name | Provide service, legal compliance | Yes (7 years) | Tax authorities |
| Email | Communication, service provision | Yes (7 years) | AWS (email service) |
| Payroll | Service delivery, legal compliance | Yes (7 years) | MOHRE (tax) |
| GL entries | Service delivery, audit trail | Yes (7 years) | Stripe (data export) |
| IP address | Security, fraud prevention | Yes (90 days) | AWS (logs) |
| Usage analytics | Product improvement | Yes (1 year) | None |

---

## 4. CONSUMER RIGHTS REQUEST PROCESS

### Step 1: Receive Request
- [ ] Consumer submits request via website form or email
- [ ] Request types: Know, Delete, Opt-Out, Correct
- [ ] Capture: Consumer ID, request type, timestamp

### Step 2: Verification
- [ ] Verify consumer identity:
  - [ ] Email verification (send confirmation link)
  - [ ] Account password verification (if logged in)
  - [ ] Personal information matching (last 4 SSN, etc.)
- [ ] Verify consumer is California resident (address on file)
- [ ] Log verification in audit_log

### Step 3: Response
- [ ] Confirm receipt within 10 days
- [ ] Provide substantive response within 45 days
- [ ] For deletion requests:
  - [ ] Instruct service providers to delete
  - [ ] Verify deletion completed
  - [ ] Confirm completion to consumer
- [ ] For knowledge requests:
  - [ ] Provide data in machine-readable format
  - [ ] Explain categories and purposes
  - [ ] Include special information requested

### Step 4: Audit & Documentation
- [ ] Log all requests and responses
- [ ] Retain documentation for 3 years
- [ ] Track metrics (response times, request volumes)

**Code Example:**
```typescript
app.post('/api/privacy-request', async (req, res) => {
  const { requestType, reason } = req.body;
  const consumer = req.auth;

  // Log request
  const requestId = `privacy_req_${Date.now()}`;
  
  await db.query(
    `INSERT INTO privacy_requests (request_id, consumer_id, request_type, status, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [requestId, consumer.user_id, requestType, 'pending']
  );

  // Send verification email
  await sendVerificationEmail(consumer.email, requestId);

  res.json({
    message: 'Request received. Verification email sent.',
    requestId
  });

  // Set reminder to respond within 45 days
  setTimeout(async () => {
    const status = await db.query(
      `SELECT status FROM privacy_requests WHERE request_id = $1`,
      [requestId]
    );

    if (status.rows[0]?.status === 'pending') {
      console.warn(`Privacy request ${requestId} not responded to in 45 days`);
      // Alert compliance team
    }
  }, 45 * 24 * 60 * 60 * 1000);
});
```

---

## 5. SALE OF PERSONAL INFORMATION

**CCPA Definition:** Sharing personal information with third parties for monetary/valuable consideration

**Ledgr Analysis:**
- [ ] **Do we sell data?** No
  - [ ] No data shared with third parties for payment
  - [ ] AWS, Stripe are service providers (not sales)
  - [ ] Tax authorities are legal requirement (not sales)
- [ ] **Disclosure:** "We do not sell personal information"
- [ ] **Do Not Sell Link:** Add to footer anyway (required even if not selling)

---

## 6. SENSITIVE PERSONAL INFORMATION (CPRA Addition)

**Special protection required for:**
- [ ] Social security number (SSN)
- [ ] Financial account information (bank account)
- [ ] Geolocation data
- [ ] Racial/ethnic identity
- [ ] Religious beliefs
- [ ] Sex/sexual orientation

**Ledgr's Sensitive Data:**
- [ ] **SSN (for payroll):** Encrypted in database, not shared, deleted after 7 years
- [ ] **Bank account:** Only tokenized via Stripe, not stored in Ledgr database
- [ ] **Limiting disclosure:** Restrict to employees with "view_pii" permission

**Code Example:**
```typescript
// Mask sensitive data in API responses
const maskSensitiveFields = (obj: any) => {
  const sensitiveFields = ['ssn', 'national_id', 'bank_account'];
  
  for (const field of sensitiveFields) {
    if (obj[field]) {
      obj[field] = '***'; // Mask in responses
    }
  }
  
  return obj;
};

// API response
app.get('/api/employees/:id', async (req, res) => {
  const employee = await db.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
  const masked = maskSensitiveFields(employee.rows[0]);
  res.json(masked);
});
```

---

## 7. THIRD-PARTY SHARING DISCLOSURES

| Service | Data Shared | Purpose | Sale? |
|---------|------------|---------|-------|
| AWS | Personal data (encrypted), logs | Infrastructure, security | No |
| Stripe | Payment info, billing address | Payment processing | No |
| Twilio | Phone number | 2FA SMS | No |
| Tax Authorities | Name, SSN, payroll | Legal compliance | No |
| Auditors | GL entries, audit logs | Financial audit | No |

**Disclosure:** Add to Privacy Notice and Terms of Service

---

## 8. DATA SECURITY REQUIREMENTS

CCPA requires "reasonable security" - implement:

- [ ] Encryption at rest: AES-256-GCM
- [ ] Encryption in transit: TLS 1.3+
- [ ] Access control: Role-based with 8 roles
- [ ] Audit logging: Immutable logs, 7-year retention
- [ ] Incident response: 30-min SLA for critical
- [ ] Annual penetration testing
- [ ] Vulnerability scanning
- [ ] Employee training (annual security training)

---

## 9. CPRA AMENDMENTS (Effective Jan 1, 2023)

**New Rights Added:**

### Right to Correct (§1798.100(d))
- [ ] Provide mechanism to correct inaccurate data
- [ ] Include in privacy dashboard

### Right to Limit Use (§1798.121)
- [ ] Granular opt-outs for marketing, analytics, etc.
- [ ] Implement in privacy settings

### Right to Know About Sales/Sharing
- [ ] Disclose: What data? To whom? For what?
- [ ] Provide 12-month history

### Enhanced Sensitive Data Protections
- [ ] Higher bar for "sale" of sensitive data
- [ ] Stricter purpose limitations
- [ ] More aggressive minimization

---

## Compliance Checklist

- [ ] Privacy notice displayed at signup
- [ ] "Do Not Sell" link in footer
- [ ] Privacy center/dashboard for consumers
- [ ] Data export feature implemented
- [ ] Data deletion feature implemented
- [ ] Correction form provided
- [ ] Opt-out mechanism for marketing
- [ ] Third-party disclosures updated
- [ ] Incident response plan (30-min SLA)
- [ ] Annual training for employees
- [ ] Data inventory (what we collect, why, how long)
- [ ] Service provider contracts (require CCPA compliance)
- [ ] Documentation of consumer requests (3-year retention)
- [ ] Non-discrimination policy (no penalty for exercising rights)
