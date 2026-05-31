# GDPR Compliance Guide

**Applicability:** Ledgr processes personal data of EU residents (employees, customers, vendors)  
**Controller:** Ledgr UAE (organization using the platform)  
**Processor:** Ledgr Platform (the software and infrastructure)  
**Basis for Processing:** Contract (employment), Legitimate Interest (financial operations)  
**Data Protection Officer:** Recommended if 250+ employees

---

## 1. CORE GDPR PRINCIPLES (Article 5)

### Lawfulness, Fairness, Transparency
- [ ] Document legal basis for each data processing activity
  - [ ] Employment data: Employee contract
  - [ ] Customer data: Customer agreement
  - [ ] Vendor data: Vendor contract
  - [ ] Tax data: Legal obligation (FTA, MOHRE)
- [ ] Privacy notice provided before collecting data
- [ ] Data subjects know who processes their data
- [ ] Processing purpose is clear and specific

### Purpose Limitation
- [ ] Document processing purpose for each data type
  - [ ] Payroll: Calculate and process employee compensation
  - [ ] VAT: Compliance with FTA VAT regulations
  - [ ] GL: Financial record-keeping per audit requirements
- [ ] Do not use data for other purposes without explicit consent
- [ ] Personal data not used for automated decision-making (except payroll calculation)

### Data Minimization
- [ ] Collect only data necessary for stated purpose
  - [ ] Payroll: Name, ID, bank account (no emergency contacts if not needed)
  - [ ] VAT: Business activity, turnover (no personal family data)
- [ ] Audit data quality quarterly
- [ ] Delete unnecessary data promptly

### Accuracy
- [ ] Provide employees/customers way to correct their data
- [ ] Implement data validation on all input forms
- [ ] Flag outdated records for review (annual)
- [ ] Audit log tracks data corrections

### Storage Limitation
- [ ] Define retention period for each data type
  - [ ] Payroll records: 7 years (UAE regulatory requirement)
  - [ ] GL entries: 7 years (audit trail)
  - [ ] Tax records: 5 years (MOHRE)
  - [ ] Personal data of inactive employees: 1 year after separation
- [ ] Implement automated deletion process
- [ ] Exception: Audit logs retained for 7 years (immutable)

### Integrity and Confidentiality
- [ ] Encryption at rest: AES-256-GCM
- [ ] Encryption in transit: TLS 1.3+
- [ ] Access control: Role-based with 8 roles
- [ ] Regular backups with encryption
- [ ] Incident response plan (30-min SLA)

---

## 2. DATA SUBJECT RIGHTS

### Right to Access (Article 15)
**Implementation:**
- [ ] Provide "Data Export" feature in user dashboard
- [ ] Export format: CSV, JSON (machine-readable)
- [ ] Include all personal data held:
  - [ ] Profile (name, email, phone, address)
  - [ ] Employment (title, salary range, department) [REDACTED for salary amount if needed]
  - [ ] GL entries authored by user
  - [ ] Audit log entries involving user
- [ ] Deliver within 30 days (or explain delay)
- [ ] No fee unless excessive requests
- [ ] Log request in audit_log with type: 'compliance:right_to_access_requested'

**Code Example:**
```typescript
// In audit-logger.ts
await auditLogger.logEvent({
  org_id: orgId,
  user_id: requestingUserId,
  event_type: AuditEventType.RIGHT_TO_ACCESS_REQUESTED,
  entity_type: 'user',
  entity_id: subjectUserId,
  status: 'success',
  ip_address: req.ip,
  user_agent: req.get('user-agent'),
  after_state: { exportedAt: new Date().toISOString() },
  timestamp: new Date(),
});
```

### Right to Erasure ("Right to be Forgotten") (Article 17)
**Implementation:**
- [ ] Provide "Delete My Account" option in settings
- [ ] Conditions for erasure:
  - [ ] Data no longer necessary for original purpose (inactive employee)
  - [ ] User withdraws consent
  - [ ] Unlawful processing
  - [ ] Legal obligation to delete
- [ ] Exceptions (DO NOT DELETE):
  - [ ] Audit logs (immutable, required for compliance)
  - [ ] GL entries (7-year legal requirement)
  - [ ] Tax records (MOHRE legal requirement)
- [ ] Implement GDPR-safe deletion:
  - [ ] Delete: Personal profile, contact details, salary info (mask to "***")
  - [ ] Mask: SSN, national ID, passport (retain for audit but mask in exports)
  - [ ] Retain: GL entries with user ID reference (for audit trail)
  - [ ] Retain: Audit logs (immutable)
- [ ] Complete within 30 days
- [ ] Notify others who have copy of data (if practical)
- [ ] Log deletion in audit_log with type: 'compliance:right_to_delete_requested'

**Code Example:**
```typescript
// In audit-logger.ts
async logDataDeletion(
  orgId: string,
  userId: string, // Who requested deletion
  subjectId: string, // Whose data is deleted
  deletedFields: ['ssn', 'national_id', 'passport', 'bank_account'],
  reason: 'user_request',
  ipAddress: req.ip,
  userAgent: req.get('user-agent')
);
```

### Right to Rectification (Article 16)
**Implementation:**
- [ ] Allow users to edit their own profile
- [ ] Provide admin interface to correct erroneous data
- [ ] Document who changed what (audit log)
- [ ] No additional consent needed
- [ ] Implement "before/after state" in audit_log

### Right to Restrict Processing (Article 18)
**Implementation:**
- [ ] Allow users to request restriction (e.g., "don't use my data for analytics")
- [ ] Flag user with "restrict_processing = true" in database
- [ ] Stop all non-essential processing (analytics, segmentation)
- [ ] Continue essential processing (payroll, VAT filing)
- [ ] Maintain data but don't use beyond essential purpose

### Right to Data Portability (Article 20)
**Implementation:**
- [ ] Same as "Right to Access" (use export feature)
- [ ] Format must be machine-readable (JSON, CSV)
- [ ] Include all personal data
- [ ] Allow direct transfer to another controller (if technically feasible)

### Right to Object (Article 21)
**Implementation:**
- [ ] Allow users to object to processing based on legitimate interest
- [ ] For employees: Show which processing activities are based on legitimate interest vs. contract
- [ ] If objection upheld, stop the processing
- [ ] Exception: Essential processing (payroll, tax) cannot be objected to

---

## 3. LAWFUL BASIS FOR PROCESSING

Define for each data type:

### Contract (Employee)
- [ ] **Personal data:** Name, address, phone, email, tax ID, bank account
- [ ] **Purpose:** Process employment contract, payroll, benefits
- [ ] **Legal basis:** Article 6(1)(b) - Performance of contract
- [ ] **Retention:** 7 years after separation (UAE legal requirement)

### Legal Obligation (Tax/Payroll)
- [ ] **Personal data:** Name, national ID, salary, tax deductions
- [ ] **Purpose:** Comply with MOHRE payroll regulations, FTA tax
- [ ] **Legal basis:** Article 6(1)(c) - Legal obligation
- [ ] **Retention:** 5-7 years (regulatory requirement)

### Legitimate Interest (Financial Operations)
- [ ] **Personal data:** GL entry author, timestamp
- [ ] **Purpose:** Maintain audit trail for financial integrity
- [ ] **Legal basis:** Article 6(1)(f) - Legitimate interest
- [ ] **Retention:** 7 years (operational necessity)
- [ ] **Balancing test:** Interest in audit integrity > Privacy interest in anonymity

### Explicit Consent (Marketing, Analytics)
- [ ] **Personal data:** Email, usage patterns
- [ ] **Purpose:** Send product updates, analyze feature usage
- [ ] **Legal basis:** Article 6(1)(a) - Explicit consent
- [ ] **Retention:** Until consent withdrawn
- [ ] **Withdrawal:** Checkbox in preferences, "Unsubscribe" link in emails

---

## 4. PRIVACY BY DESIGN

### Data Minimization
- [ ] Collect only necessary data (no unnecessary personal fields)
- [ ] Implement field-level access control (e.g., payroll officers see salary, HR doesn't)
- [ ] Regular audit: Identify unused personal data and delete

### Privacy Impact Assessment (DPIA)
- [ ] Required for high-risk processing (automatic decision-making, monitoring)
- [ ] Example: Using GL entries to detect fraud patterns
  - [ ] Risk: Pattern could reveal employee performance issues
  - [ ] Mitigation: Aggregate data, remove identifiers, require human review
  - [ ] Documentation: DPIA form filed and reviewed by data protection officer

### Data Protection by Default
- [ ] Encryption enabled by default (AES-256-GCM)
- [ ] Access control enabled by default (role-based)
- [ ] Audit logging enabled by default (immutable logs)
- [ ] Data deletion enabled by default (retention policy enforced)

---

## 5. DATA BREACHES (Article 33-34)

### Detection
- [ ] Automated alerts for suspicious activity:
  - [ ] 5+ failed login attempts
  - [ ] Access from unusual IP address
  - [ ] Bulk data export by admin
  - [ ] Deletion of audit logs
- [ ] Monitor for indicators:
  - [ ] Ransomware (file extensions, encryption patterns)
  - [ ] Data exfiltration (large outbound data transfer)
  - [ ] Privilege escalation (role elevation)

### Response
- [ ] **Immediate (within 1 hour):**
  - [ ] Isolate affected system
  - [ ] Halt unauthorized access
  - [ ] Preserve evidence (logs, snapshots)
  - [ ] Notify management and security team

- [ ] **Investigation (within 24 hours):**
  - [ ] Determine scope: What data? How many people?
  - [ ] Determine risk: Can data cause harm? (Encrypted data = lower risk)
  - [ ] Determine cause: How did breach happen?
  - [ ] Document timeline from audit logs

- [ ] **Notification (within 72 hours):**
  - [ ] **To regulators (DPA):** If "high risk" to data subjects
    - [ ] High risk = Unencrypted personal data of 100+ people
    - [ ] High risk = Sensitive data (national ID, bank account) of any number
    - [ ] Form: Fill DPA breach notification form with:
      - [ ] Date/time of breach
      - [ ] What data compromised
      - [ ] How many people affected
      - [ ] Remedial actions taken
  - [ ] **To data subjects:** If high risk
    - [ ] Email to their registered email address
    - [ ] Plain language description of what happened
    - [ ] What we're doing about it
    - [ ] What they should do (change passwords, monitor accounts)
    - [ ] Contact for more info
  - [ ] **To customers:** Alert they may be affected

### Template: Breach Notification Email

```
Subject: Security Incident - Action Required

Dear [User Name],

On [DATE], we discovered unauthorized access to personal data, potentially affecting your account.

WHAT HAPPENED:
[Specific description: e.g., "Attacker gained access to employee names and ID numbers, but not passwords or bank details because they were encrypted."]

WHAT DATA:
- Name
- ID number
- Email address
[Omit: Passwords, bank accounts (were encrypted and inaccessible)]

WHAT WE'RE DOING:
- Secured the vulnerability
- Investigated the full scope
- Notified law enforcement
- Reviewed access logs

WHAT YOU SHOULD DO:
- Change your password
- Monitor accounts for fraudulent activity
- Enable 2FA if available

Questions? Email security@ledgr.com

Ledgr Security Team
```

---

## 6. THIRD-PARTY DATA SHARING (Article 28)

### Data Processing Agreements
- [ ] **AWS (Infrastructure)**
  - [ ] EU Standard Contractual Clauses (SCCs) signed
  - [ ] AWS Processor Addendum included
  - [ ] Data processing limited to technical support/compliance
  - [ ] Sub-processors authorized (S3, RDS, CloudWatch)

- [ ] **Stripe (Payment Processing)**
  - [ ] Stripe Data Processing Agreement signed
  - [ ] Card data NOT stored in our systems (tokenized)
  - [ ] Personal data limited to billing name/address
  - [ ] Stripe compliant with EU Safe Harbor

- [ ] **Twilio (SMS 2FA)**
  - [ ] Twilio Data Processing Agreement signed
  - [ ] Phone numbers processed for 2FA only
  - [ ] Data deleted after SMS verification (24 hours)

### Vendor Audit
- [ ] Annual security questionnaire to vendors
- [ ] Review SOC 2 Type II report (AWS, Stripe)
- [ ] Document compliance status in spreadsheet

---

## 7. INTERNATIONAL DATA TRANSFERS

**Issue:** GDPR covers EU data, but Ledgr operates in UAE  

### Standard Contractual Clauses (SCCs)
- [ ] For EU data subjects → UAE:
  - [ ] SCCs (EU Standard Contractual Clauses) in place
  - [ ] Schrems II supplementary measures implemented
  - [ ] Encryption in transit (TLS 1.3) and at rest (AES-256-GCM)
  - [ ] Access controls limit who can decrypt data
  - [ ] Audit log captures all access

### Transfer Impact Assessment (TIA)
- [ ] Document why data must be transferred to UAE
  - [ ] Purpose: Deliver financial software to UAE-based organizations
  - [ ] Necessity: Cannot provide service without UAE infrastructure
- [ ] Evaluate legal environment in UAE
  - [ ] Is data safe from government access?
  - [ ] Are there surveillance laws?
  - [ ] Can we challenge legal requests?
- [ ] Supplementary safeguards (encryption, access control)

---

## 8. DATA RETENTION POLICY

| Data Type | Retention Period | Justification | Deletion Method |
|-----------|------------------|---------------|-----------------|
| Payroll records | 7 years | UAE MOHRE requirement | Permanent deletion (shred) |
| GL entries | 7 years | Audit trail legal requirement | Permanent deletion (shred) |
| Tax records | 5 years | FTA compliance | Permanent deletion (shred) |
| VAT returns | 7 years | VAT regulation | Permanent deletion (shred) |
| Audit logs | 7 years | Immutable for integrity | Immutable (never deleted) |
| Personal employee data | 1 year after separation | No longer necessary | Mask/redact (shred sensitive fields) |
| Customer data | 3 years after contract ends | Potential disputes, legal holds | Mask/redact (shred if no hold) |
| User session logs | 90 days | Security investigation window | Automatic deletion via Elasticsearch TTL |
| API request logs | 1 year | Performance analysis, incident response | Automatic deletion via S3 lifecycle |
| Failed login attempts | 30 days | Brute force tracking | Automatic deletion via script |

---

## 9. EMPLOYEE PRIVACY POLICIES

- [ ] **Email & Communication Monitoring**
  - [ ] Monitoring policy disclosed to employees
  - [ ] Limited to business email, not personal devices
  - [ ] Exception: Explicit legal authority (law enforcement request)

- [ ] **Location & Activity Monitoring**
  - [ ] No GPS tracking or keystroke logging
  - [ ] System logs and audit trails are business records
  - [ ] IP address logging for security purposes (disclosed)

- [ ] **HR Records Privacy**
  - [ ] HR data (performance reviews, salary) segregated
  - [ ] Access restricted to HR + manager only
  - [ ] Employee has right to access own file

---

## Compliance Checklist for Product Teams

- [ ] Data collection: Is there legal basis for collecting this data?
- [ ] Storage: Is it encrypted at rest?
- [ ] Transit: Is it encrypted in transit (TLS 1.3)?
- [ ] Access: Is access controlled by role?
- [ ] Logging: Is access logged to audit trail?
- [ ] Retention: Is there a defined retention period?
- [ ] Deletion: Is there an automated deletion process?
- [ ] Portability: Can users export this data?
- [ ] Consent: Did we get explicit consent (if required)?
- [ ] Vendor: Is third-party sharing covered by DPA?
- [ ] International: Are SCCs in place for non-EU transfers?
