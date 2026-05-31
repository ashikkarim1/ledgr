# UAE Regulatory Compliance Guide

**Jurisdiction:** United Arab Emirates (Federal + Emirate-specific regulations)  
**Scope:** Payroll, GL, VAT, Tax, Data Protection  
**Key Regulators:** Ministry of Human Resources & Emiratisation (MOHRE), Federal Tax Authority (FTA), Central Bank of UAE, National Electronic Safety & Security Authority (NESA)

---

## 1. PAYROLL COMPLIANCE (MOHRE)

### Labor Law 23/1991 & 2021 Amendments

#### Mandatory Data Record
**What:** MOHRE requires employers to maintain employee records

**Implementation:**
- [ ] **Employee File Must Include:**
  - [ ] Name, nationality, national ID number
  - [ ] Position and job description
  - [ ] Date of employment
  - [ ] Salary structure (basic, allowances, deductions)
  - [ ] Educational qualifications
  - [ ] Medical examination results
  - [ ] Visa/residence permit details
  - [ ] Emergency contact

- [ ] **Digital Record System:**
  - [ ] Employee portal for viewing payslip (PDF generation)
  - [ ] Archive payslips for 7 years minimum
  - [ ] Encryption: AES-256-GCM at rest, TLS 1.3+ in transit
  - [ ] Audit log: Track all access to employee records
  - [ ] Role-based access: Only HR + manager can view salary

**Code Example:**
```typescript
// Payroll system must enforce:
async function generatePayslip(employeeId: string, month: string) {
  // Verify permission
  const hasAccess = await rbac.canPerform(
    req.auth.user_id,
    req.auth.org_id,
    'payroll',
    'payslip',
    'view'
  );

  if (!hasAccess) {
    throw new Error('PERMISSION_DENIED: Cannot view payslips');
  }

  // Generate PDF
  const payslip = await generatePayslipPDF(employeeId, month);

  // Log access
  await auditLogger.logEvent({
    event_type: 'payroll:payslip_viewed',
    entity_id: employeeId,
    after_state: { month, user_id: req.auth.user_id },
  });

  return payslip;
}
```

#### Salary Payment Rules
- [ ] **Payment Timeline:** Must pay within 5 days of month end (Article 70)
- [ ] **Payment Method:** Bank transfer or cash (if < 10 employees)
- [ ] **Deductions Allowed:**
  - [ ] Income tax (if applicable)
  - [ ] Health insurance contributions
  - [ ] Pension/ADIB contributions
  - [ ] Advance on salary (limited to 50% of basic)
  - [ ] Court-ordered alimony
- [ ] **Deductions NOT Allowed:**
  - [ ] Cost of uniform or tools
  - [ ] Disciplinary fines
  - [ ] Cost of breakage/damage

**Implementation:** Validation rules in payroll module:
```typescript
// Calculate net salary
const grossSalary = basic + allowances;
const deductions = incomeTax + healthInsurance + pensionFund;
const advanceDeduction = Math.min(advance, grossSalary * 0.5);
const netSalary = grossSalary - deductions - advanceDeduction;

// Validate
if (totalDeductions > grossSalary * 0.5) {
  throw new Error('Deductions exceed 50% of gross salary');
}
```

#### Annual Leave & Benefits
- [ ] **Annual Leave Entitlement:** 30 days minimum (21 for private sector by 2024)
- [ ] **Sick Leave:** 10 days paid
- [ ] **End of Service Benefit:** Based on length of service
  - [ ] Year 1-5: 21 days salary per year
  - [ ] Year 5+: 30 days salary per year
- [ ] **Public Holidays:** 15 days (varies by emirate)

**Implementation:** Calculate in payroll system:
```typescript
const yearsOfService = (Date.now() - employmentDate) / (365.25 * 86400 * 1000);
const eosb = yearsOfService < 5
  ? yearsOfService * 21 * (salary / 30)
  : yearsOfService * 30 * (salary / 30);
```

#### MOHRE E-Services Registration
- [ ] Register on MOHRE portal (eservices.moh.gov.ae)
- [ ] Submit establishment information
- [ ] Register each employee within 5 days of hiring
- [ ] Update MOHRE on:
  - [ ] Salary changes
  - [ ] Position changes
  - [ ] Employment termination
  - [ ] Extended leave > 30 days

**Implementation:** API integration with MOHRE (if available):
```typescript
async function registerEmployeeWithMOHRE(employee: Employee) {
  const payload = {
    name: employee.name,
    nationalId: employee.nationalId,
    position: employee.position,
    salary: employee.basicSalary,
    startDate: employee.hireDate,
  };

  try {
    const response = await axios.post(
      'https://eservices.moh.gov.ae/api/employee/register',
      payload,
      { headers: { 'Authorization': `Bearer ${mohreBearerToken}` } }
    );

    // Log successful registration
    await auditLogger.logEvent({
      event_type: 'payroll:employee_registered_mohre',
      entity_id: employee.id,
      status: 'success',
      after_state: { mohr_registration_id: response.mohr_id },
    });
  } catch (error) {
    // Log failure
    await auditLogger.logEvent({
      event_type: 'payroll:employee_registration_failed',
      entity_id: employee.id,
      status: 'failure',
      error_message: error.message,
    });
    throw error;
  }
}
```

---

## 2. VAT COMPLIANCE (FTA)

### Federal Tax Authority (FTA) VAT Regulations

#### VAT Registration
- [ ] **Threshold:** Mandatory if turnover > 375,000 AED/year
- [ ] **Registration:** Apply via FTA portal (myfta.gov.ae)
- [ ] **Timeline:** Register before exceeding threshold
- [ ] **Certificate:** FTA issues VAT registration certificate
- [ ] **Record:** Keep certificate in system (audit trail)

**Implementation:**
```typescript
// Check VAT registration requirement
async function checkVATThreshold(orgId: string, year: number) {
  const turnover = await db.query(
    `SELECT SUM(amount) as total FROM gl_entries 
     WHERE org_id = $1 AND EXTRACT(YEAR FROM entry_date) = $2 
     AND entry_type = 'revenue'`,
    [orgId, year]
  );

  const total = turnover.rows[0]?.total || 0;
  
  if (total > 375000 && !org.vat_registered) {
    // Alert compliance team
    await alertComplianceTeam(
      `Organization ${orgId} exceeded VAT threshold (${total} AED). 
       VAT registration required.`
    );
  }
}
```

#### VAT Return Filing
- [ ] **Frequency:** Monthly (primary), quarterly (secondary)
- [ ] **Due Date:** By 28th of following month
- [ ] **Reporting:** Via FTA portal (VAT return form)
- [ ] **Components:**
  - [ ] Output VAT (VAT charged to customers)
  - [ ] Input VAT (VAT paid on business expenses)
  - [ ] Net VAT (Output - Input)
  - [ ] Supporting invoices and documentation

**Implementation in Ledgr:**
```typescript
interface VATReturnData {
  period: { month: number; year: number };
  outputVAT: number; // 5% of taxable sales
  inputVAT: number; // 5% of deductible expenses
  netVAT: number; // outputVAT - inputVAT
  taxableSupplies: number;
  exemptSupplies: number;
  zeroRatedSupplies: number;
}

async function calculateVATReturn(orgId: string, month: number, year: number): Promise<VATReturnData> {
  // Get taxable sales
  const sales = await db.query(
    `SELECT SUM(amount) as total FROM gl_entries 
     WHERE org_id = $1 AND EXTRACT(YEAR FROM entry_date) = $2
     AND EXTRACT(MONTH FROM entry_date) = $3
     AND account_id IN (SELECT id FROM gl_accounts WHERE account_type = 'revenue'
       AND vat_treatment = 'taxable')`,
    [orgId, year, month]
  );

  // Get deductible expenses
  const expenses = await db.query(
    `SELECT SUM(amount) as total FROM gl_entries 
     WHERE org_id = $1 AND EXTRACT(YEAR FROM entry_date) = $2
     AND EXTRACT(MONTH FROM entry_date) = $3
     AND account_id IN (SELECT id FROM gl_accounts WHERE account_type = 'expense'
       AND vat_treatment = 'deductible')`,
    [orgId, year, month]
  );

  const outputVAT = (sales.rows[0]?.total || 0) * 0.05;
  const inputVAT = (expenses.rows[0]?.total || 0) * 0.05;
  const netVAT = outputVAT - inputVAT;

  // Log return preparation
  await auditLogger.logEvent({
    event_type: 'vat:return_prepared',
    entity_type: 'vat_return',
    entity_id: `${year}-${month}`,
    status: 'success',
    after_state: { outputVAT, inputVAT, netVAT },
  });

  return {
    period: { month, year },
    outputVAT,
    inputVAT,
    netVAT,
    taxableSupplies: sales.rows[0]?.total || 0,
    exemptSupplies: 0,
    zeroRatedSupplies: 0,
  };
}
```

#### VAT Record Keeping
- [ ] **Invoices:** Original + copies for 5 years
- [ ] **Supporting docs:** Receipts, expense vouchers
- [ ] **Digital records:** If using electronic invoicing
- [ ] **VAT returns:** Retain filed returns for 5 years

**Implementation:**
```typescript
// Archive VAT returns
async function archiveVATReturn(orgId: string, returnData: VATReturnData) {
  const returnId = `vat_${returnData.period.year}_${returnData.period.month}`;

  // Store in immutable archive (S3 with versioning)
  await s3.putObject({
    Bucket: 'ledgr-vat-returns',
    Key: `${orgId}/${returnId}.json`,
    Body: JSON.stringify(returnData),
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: kmsKeyId,
    Metadata: {
      'org-id': orgId,
      'filing-date': new Date().toISOString(),
    },
  });

  // Log archival
  await auditLogger.logEvent({
    event_type: 'vat:return_archived',
    entity_type: 'vat_return',
    entity_id: returnId,
    status: 'success',
    after_state: { returnId, filingDate: new Date().toISOString() },
  });
}
```

#### VAT Audit Support
- [ ] **VAT audits:** FTA conducts audits (typically 5-year window)
- [ ] **Documentation:** All invoices, returns, supporting docs must be available
- [ ] **Cooperation:** Respond to FTA inquiries within specified timeframe
- [ ] **Preservation:** Never delete VAT records during audit period

---

## 3. GENERAL LEDGER (GL) COMPLIANCE

### Accounting Standards & Record Keeping

#### UAE Accounting Standards
- [ ] **Framework:** International Financial Reporting Standards (IFRS)
- [ ] **Chart of Accounts:** Minimum requirements:
  - [ ] Assets (current + non-current)
  - [ ] Liabilities (current + non-current)
  - [ ] Equity (capital, retained earnings)
  - [ ] Revenue
  - [ ] Expenses
- [ ] **Accounting Method:** Accrual basis (required for companies > 3M AED revenue)

#### GL Entry Requirements
- [ ] **Every entry must include:**
  - [ ] Date (entry_date)
  - [ ] Amount (debit + credit, always balance)
  - [ ] Account code (from chart of accounts)
  - [ ] Description (narrative of transaction)
  - [ ] Reference (invoice #, check #, etc.)
  - [ ] Approver (who authorized entry)
  - [ ] Timestamp (when posted)

**Implementation in Ledgr:**
```typescript
interface GLEntry {
  id: string;
  org_id: string;
  entry_date: Date;
  account_id: string; // Links to chart_of_accounts
  debit_amount?: number;
  credit_amount?: number;
  description: string;
  reference_document: string;
  posted_by: string; // User ID
  approved_by?: string; // User ID who approved
  timestamp: Date;
  hash: string; // For audit chain
}

// Validation rules
async function validateGLEntry(entry: GLEntry) {
  // Rule 1: Debit must equal credit for each entry
  const totalDebit = entry.debit_amount || 0;
  const totalCredit = entry.credit_amount || 0;
  
  if (totalDebit !== totalCredit) {
    throw new Error(`Debit (${totalDebit}) must equal Credit (${totalCredit})`);
  }

  // Rule 2: Account must exist in COA
  const account = await db.query(
    `SELECT id FROM gl_accounts WHERE id = $1 AND org_id = $2`,
    [entry.account_id, entry.org_id]
  );
  
  if (!account.rows.length) {
    throw new Error(`Account ${entry.account_id} not found`);
  }

  // Rule 3: Posting date cannot be in future
  if (entry.entry_date > new Date()) {
    throw new Error('Entry date cannot be in the future');
  }

  // Rule 4: Posting requires approval for entries > 50k AED
  if (totalDebit > 50000 && !entry.approved_by) {
    throw new Error('Entries > 50k AED require approval');
  }

  return true;
}
```

#### GL Record Retention
- [ ] **Retention Period:** 7 years minimum
- [ ] **Storage:** Encrypted database + encrypted backups
- [ ] **Audit Trail:** Immutable log of all changes
- [ ] **Access:** Restricted to finance_controller, audit_manager, cfo

---

## 4. TAX COMPLIANCE

### Corporate Tax & Income Tax

#### Corporate Tax (if applicable)
- [ ] **Rate:** 0% for UAE nationals in free zones
- [ ] **Rate:** 15% for foreign entities (post-2023)
- [ ] **Filing:** Annual corporate tax return
- [ ] **Documentation:** GL + supporting schedules

#### Personal Income Tax (for high earners)
- [ ] **Threshold:** 21,000 AED/month (exempt below)
- [ ] **Rate:** Progressive (0-22.5%)
- [ ] **Filing:** Annual return by March 31
- [ ] **Employer Responsibility:** Withhold and remit tax

**Implementation:**
```typescript
async function calculatePersonalIncomeTax(employee: Employee, grossSalary: number) {
  const monthlyThreshold = 21000;
  const taxableIncome = Math.max(0, grossSalary - monthlyThreshold);

  // Progressive tax brackets
  let tax = 0;
  if (taxableIncome > 250000) {
    tax += (taxableIncome - 250000) * 0.225; // 22.5% on income above 250k
    tax += 250000 * 0.20; // 20% on income 0-250k
  } else {
    tax += taxableIncome * 0.20;
  }

  // Log tax calculation
  await auditLogger.logEvent({
    event_type: 'payroll:tax_calculated',
    entity_id: employee.id,
    after_state: { grossSalary, taxableIncome, tax },
  });

  return tax;
}
```

---

## 5. DATA PROTECTION (NESA & Emirates Cybersecurity Council)

### UAE Data Protection Law (Decree 36/2021)

#### Data Classification
- [ ] **Personal Data:** Name, national ID, contact info
- [ ] **Sensitive Data:** SSN, financial account, health, biometric
- [ ] **Confidential Business Data:** GL entries, VAT returns, salaries

#### Data Protection Requirements
- [ ] **Security:** Implement controls per NESA standards
  - [ ] Encryption at rest: AES-256-GCM
  - [ ] Encryption in transit: TLS 1.3+
  - [ ] Access control: Role-based with audit log
  - [ ] Authentication: Multi-factor for admins
- [ ] **Privacy:** Minimize data collection
  - [ ] Collect only necessary data
  - [ ] Define retention period
  - [ ] Delete when no longer needed
- [ ] **Transparency:** Disclose data use
  - [ ] Privacy policy on website
  - [ ] Data use clearly stated

#### Data Breach Notification
- [ ] **Timeframe:** Notify affected parties within 30 days
- [ ] **Content:** Describe breach, data affected, remedial actions
- [ ] **Authorities:** Notify NESA if breach involves sensitive data of 1000+ people
- [ ] **Documentation:** Retain breach records for 3 years

**Implementation:**
```typescript
async function reportDataBreach(
  breachScope: { affectedCount: number; dataTypes: string[] },
  remedialActions: string[]
) {
  // Determine if NESA notification required
  const requiresNESANotification = breachScope.affectedCount >= 1000
    || breachScope.dataTypes.includes('personal_id_number')
    || breachScope.dataTypes.includes('financial_account');

  if (requiresNESANotification) {
    // Prepare NESA notification
    const notification = {
      breach_date: new Date().toISOString(),
      affected_individuals: breachScope.affectedCount,
      data_categories: breachScope.dataTypes,
      remedial_actions: remedialActions,
      notification_method: 'email',
    };

    // Submit to NESA (via portal or API)
    // Log in audit trail
    await auditLogger.logEvent({
      event_type: 'security:breach_reported_nesa',
      entity_type: 'breach',
      entity_id: `breach_${Date.now()}`,
      status: 'success',
      after_state: notification,
    });
  }

  // Notify affected individuals
  for (const user of affectedUsers) {
    await sendBreachNotificationEmail(user, remedialActions);
  }
}
```

---

## 6. ANTI-MONEY LAUNDERING (AML)

### UAE Central Bank AML Requirements

#### Know Your Customer (KYC)
- [ ] **Due Diligence:** Verify customer identity and business
- [ ] **Documentation:**
  - [ ] Valid government ID
  - [ ] Business registration
  - [ ] Beneficial ownership (if company)
- [ ] **Monitoring:** Review transactions for suspicious patterns

#### Suspicious Activity Reporting
- [ ] **Reporting:** Report unusual transactions to UAE Central Bank
- [ ] **Definition:** Transactions inconsistent with customer profile
- [ ] **Examples:**
  - [ ] Large round amounts
  - [ ] Multiple rapid transactions
  - [ ] Cross-border transfers to high-risk jurisdictions
  - [ ] Structured deposits (below reporting threshold)

---

## 7. GENERAL REQUIREMENTS SUMMARY

| Requirement | Owner | Frequency | Retention | Implementation |
|-------------|-------|-----------|-----------|-----------------|
| MOHRE Registration | HR | Per hire | 7 years | API integration + audit log |
| Payroll Records | Payroll | Monthly | 7 years | Encrypted DB + backups |
| VAT Registration | Finance | Once | Certificate | FTA portal + documentation |
| VAT Returns | Finance | Monthly | 5 years | FTA submission + archived |
| GL Records | Accounting | Daily | 7 years | Immutable ledger + audit trail |
| Tax Returns | Finance | Annual | 5 years | Filed + documented |
| Data Protection | Security | Continuous | Varies | Encryption + access control |
| Incident Response | Security | As needed | 3 years | 30-min SLA documented |

---

## Compliance Checklist

- [ ] MOHRE payroll registration complete
- [ ] MOHRE employee records maintained (updated within 5 days of changes)
- [ ] VAT registration current (if threshold exceeded)
- [ ] VAT returns filed on schedule (by 28th each month)
- [ ] GL records maintained per IFRS standards
- [ ] GL entries balance (debit = credit)
- [ ] GL retention: 7 years minimum
- [ ] Employee personal data encrypted
- [ ] Employee files accessible only to authorized personnel
- [ ] Payslips archived for 7 years
- [ ] Tax calculations validated (threshold rules enforced)
- [ ] Incident response SLA in place (30 minutes critical)
- [ ] Annual security training completed
- [ ] Data breach notification procedures documented
