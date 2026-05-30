# LEDGR PHASE 1: MASTER EXECUTION PLAN
## AI-Native Finance Operating System for UAE

**Duration:** 90 Days  
**Target Launch:** Production-ready Migration Agent + Core Infrastructure  
**Success Metric:** Migrate QuickBooks customer with 97%+ confidence in <30 minutes  

---

## PART 1: REGULATORY COMPLIANCE FRAMEWORK

### 1.1 UAE Regulatory Bodies & Jurisdictions

#### Federal Level
- **FTA (Federal Tax Authority)** - Corporate Tax, VAT
- **MOHRE (Ministry of Human Resources & Emiratisation)** - Payroll, WPS
- **GDRFA (General Directorate of Residency & Foreigners Affairs)** - Labor compliance

#### Emirate Level
- **Dubai:** DED, DEWA, Dubai Land Department
- **Abu Dhabi:** ADA, ADEW, ADCC
- **Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain:** Respective local authorities
- **DIFC:** DFSA (if company operates in DIFC)
- **ADGM:** ADGM FCA (if company operates in ADGM)

---

## PART 2: DATA CAPTURE REQUIREMENTS BY FILING TYPE

### 2.1 VAT COMPLIANCE (Most Critical)

**Regulatory Body:** FTA  
**Filing Frequency:** Quarterly (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec)  
**Threshold:** Mandatory if turnover > AED 375,000

**Data Ledgr Must Capture:**

```
VAT Registration
├── Registration Number (ZAKAT ID equivalent)
├── Registration Date
├── Tax Year Start (Jan 1 for all UAE entities)
├── Registration Status (Active, Suspended, Cancelled)
└── Exemption Status (if applicable)

VAT Transactions (Every transaction must be classified)
├── Transaction Type
│   ├── Sale (Standard Rated 5%, Zero Rated 0%, Exempt)
│   ├── Purchase (Standard Rated 5%, Zero Rated 0%, Exempt, Import)
│   ├── Service (Standard Rated 5%, Exempt)
│   └── Import/Export
├── Transaction Date
├── Amount (AED)
├── VAT Rate Applied (5%, 0%, Exempt)
├── Customer/Vendor Details
│   ├── Name
│   ├── VAT Number (if registered)
│   ├── Business Type
│   └── Country (for import/export determination)
├── Document Reference (Invoice #, Receipt #)
├── Description
└── GL Account Code

VAT Return Data
├── Standard Rated Supplies (AED value + VAT)
├── Zero-Rated Supplies (AED value)
├── Exempt Supplies (AED value)
├── Adjustments & Reversals
├── Import VAT (recoverable)
├── Purchase VAT (recoverable vs non-recoverable)
├── VAT Payable/Receivable
├── Supporting Documentation
│   ├── Invoices (numbered, dated, signed)
│   ├── Credit Notes (with original invoice reference)
│   ├── Debit Notes
│   ├── Customs Documents (for imports)
│   └── Bank Statements (proof of payment)
└── Audit Trail (who changed what, when)
```

**Ledgr Must Be Able To:**
- Classify every transaction by VAT treatment
- Calculate VAT liability automatically
- Flag non-compliant transactions (invoices without VAT numbers, missing dates, etc.)
- Generate FTA-compliant VAT return PDF
- Maintain 5-year audit trail

---

### 2.2 CORPORATE TAX COMPLIANCE

**Regulatory Body:** FTA  
**Filing Frequency:** Annually (by June 30)  
**Threshold:** Mandatory if turnover > AED 375,000 OR profit > AED 50,000

**Data Ledgr Must Capture:**

```
Entity Information
├── Legal Entity Name
├── Legal Structure (LLC, Partnership, Free Zone, DIFC, ADGM)
├── Trade License Number
├── Expiry Date
├── Business Activity Code
├── Principal Place of Business (Full Address)
├── Sheikh/Owner Details
│   ├── Name
│   ├── Nationality
│   ├── ID Number
│   ├── Percentage Ownership
│   └── Ultimate Beneficial Owner (UBO) Flag
└── UBO Declaration Status (Required for compliance)

Financial Statements Data
├── Revenue (by line of business)
├── Cost of Goods Sold
├── Gross Profit
├── Operating Expenses
│   ├── Salaries & Wages (with headcount)
│   ├── Rent
│   ├── Utilities
│   ├── Professional Fees
│   ├── Depreciation (by asset class)
│   ├── Amortization
│   └── Other (itemized)
├── EBITDA
├── Interest Expense (must be tracked separately)
├── Other Income/Expense
├── Profit Before Tax
├── Tax Adjustments
│   ├── Add-backs (personal expenses, etc.)
│   ├── Deductions (capital allowances, relief items)
│   └── Tax Loss Carryforward (if applicable)
└── Taxable Income

Asset Information (for depreciation/capital allowances)
├── Asset Class
│   ├── Building
│   ├── Plant & Machinery
│   ├── Vehicles
│   ├── IT Equipment
│   ├── Furniture & Fittings
│   └── Intangible Assets
├── Purchase Date
├── Original Cost (AED)
├── Depreciation Method
├── Useful Life
├── Accumulated Depreciation
├── Book Value
└── Capital Allowance Claims

Intercompany Transactions (if multiple entities)
├── Related Party Name
├── Relationship Type
├── Transfer Pricing Documentation
├── Transaction Amount (AED)
├── Transfer Pricing Policy (cost-plus, comparable uncontrolled price)
└── Arm's Length Justification

Loss Carryforward (if applicable)
├── Prior Year Loss Amount (AED)
├── Loss Expiry Year
├── Utilization in Current Year
└── Remaining Loss Balance
```

**Ledgr Must Be Able To:**
- Extract financial statements from the ledger
- Flag related-party transactions for transfer pricing review
- Calculate tax depreciation separately from accounting depreciation
- Identify non-deductible expenses
- Generate FTA Corporate Tax return (Form CT1)
- Maintain 5-year audit trail

---

### 2.3 PAYROLL & WPS COMPLIANCE (Wage Protection System)

**Regulatory Bodies:** MOHRE, Emirates Post  
**Filing Frequency:** Monthly (by last working day)  
**Threshold:** Mandatory if any staff employed (even 1 person)

**Data Ledgr Must Capture:**

```
Employee Master Data
├── Employee ID (unique, persistent)
├── Full Name (English & Arabic)
├── Nationality
├── Passport Number
├── Labor Card Number (if issued)
├── Date of Birth
├── Gender
├── Marital Status
├── Emergency Contact
└── Profile Photo (if required by policy)

Employment Terms
├── Hire Date
├── Employment Type
│   ├── Unlimited (Open-ended contract)
│   ├── Limited (Fixed contract)
│   ├── Probation (Typically 6 months)
│   └── End Date (if limited)
├── Job Title
├── Department
├── Reporting Manager
├── Salary Grade
├── Employment Status
│   ├── Active
│   ├── On Leave
│   ├── Terminated
│   └── Resignation Date (if applicable)
├── Visa Status (if non-national)
│   ├── Sponsorship Status
│   ├── Visa Expiry
│   └── Renewal Status
└── Labor Card Status

Salary Structure (Per Month)
├── Basic Salary (AED)
├── Housing Allowance (AED) [If applicable]
├── Transportation Allowance (AED) [If applicable]
├── Other Allowances (itemized)
├── Gross Salary (before deductions)
├── Social Security Contribution (MOHRE %)
│   ├── Employer Contribution
│   └── Employee Contribution
├── Income Tax Withholding (if applicable for limited entities)
├── Health Insurance Deduction
├── Other Deductions (loans, voluntary, etc.)
├── Net Salary (to WPS)
└── Effective Date (salary change tracking)

WPS Bank Account Details
├── Bank Name
├── Account Number (IBAN preferred)
├── Account Holder Name (Employee)
├── Account Type (Salary account)
├── Verification Status
└── Last Verification Date

Attendance & Leave
├── Working Days (Calendar days tracked)
├── Holidays (Public holidays, company holidays)
├── Sick Leave (Days taken, Medical certificate required >3 days)
├── Annual Leave (Accrued: 30 days/year for all staff)
├── Unpaid Leave (if applicable)
├── Leave Balance (Carryover tracking, max 30 days carryover to next year)
├── Maternity/Paternity Leave (if applicable)
├── Emergency Leave (Deaths, etc.)
├── Absences (Unauthorized, notification to employee)
└── Late Arrivals/Early Departures

Overtime & Incentives
├── Overtime Hours (tracking daily/monthly)
├── Overtime Rate (1.25x–1.5x as per UAE Labor Law)
├── Incentives/Bonuses
│   ├── Performance Bonus
│   ├── Annual Bonus (Gratuity foundation)
│   └── Spot Bonuses
├── Commission (if applicable)
└── Deductions for Absences (if applicable)

Gratuity & End of Service Benefits
├── Length of Service (calculated from hire date)
├── Gratuity Accrual (0.5 months first 5 years, 1 month thereafter)
├── Current Gratuity Balance (AED)
├── Gratuity Claim (if employee terminated)
├── Notice Period Fulfillment
├── Gratuity Payment Status (Paid/Pending)
└── Settlement Documentation

Statutory Deductions
├── Social Security
│   ├── Employer Rate (DEWA: 5.5%, Private: varies by sector)
│   ├── Employee Rate (varies)
│   ├── Contribution Tracking (monthly)
│   └── Annual Summary (for MOHRE reporting)
├── Health Insurance
│   ├── Provider Name
│   ├── Policy Number
│   ├── Coverage Level
│   ├── Renewal Date
│   └── Monthly Premium (AED)
└── Other Statutory (if applicable by emirate)

Separation/Termination
├── Termination Date
├── Termination Reason (Resignation, End of Contract, Dismissal, etc.)
├── Notice Given (Yes/No, Date)
├── Notice Period Waived (if applicable)
├── Final Settlement Date
├── Gratuity Paid Amount (AED)
├── Unpaid Salary (if any)
├── Final Bank Transfer Confirmation
├── Labor Clearance Certificate (if required)
└── Exit Interview (documentation)
```

**Ledgr Must Be Able To:**
- Calculate WPS-compliant monthly file (specific format: IBAN, name, amount)
- Flag non-compliance (missing bank account, employee termination without settlement, etc.)
- Accrue gratuity correctly (0.5 months first 5 years, 1 month after)
- Track leave balance (accrual vs. carryover limits)
- Generate MOHRE-compliant payroll reports (if required for disputes)
- Maintain 3-year audit trail for labor disputes
- Support multi-bank WPS submission (Emirates Post, Bank transfers, etc.)
- Alert on visa expiry, labor card renewal, health insurance expiry

---

### 2.4 TRADE LICENSE & COMPANY REGISTRATION

**Regulatory Bodies:** DED (Dubai), ADA (Abu Dhabi), Emirate-specific  
**Renewal Frequency:** Annually  
**Data Ledgr Must Capture:**

```
Trade License
├── License Number
├── Issue Date
├── Expiry Date
├── Business Activity (Primary + Secondary)
├── License Type
│   ├── Individual
│   ├── Partnership
│   ├── Limited Company
│   ├── Free Zone
│   ├── DIFC
│   └── ADGM
├── Location/Branch (address change tracking)
├── Ownership/Sponsorship
│   ├── Sheikh/Partner Name
│   ├── % Ownership
│   └── UBO Status
└── Compliance Status (Active, Suspended, Expired)

Company Registration (if Limited Company)
├── Memorandum & Articles of Association
├── Shareholders Register (names, %, nationality)
├── Board of Directors (if applicable)
├── Company Secretary
├── Registered Office Address
├── Company Seal (if used)
└── Registration Certificate Copy

Emirate-Specific Requirements
├── Dubai (DED + Jebel Ali/JAFZA/RAKEZ if applicable)
├── Abu Dhabi (ADA + ADGM if applicable)
├── Sharjah (SED)
├── Ajman (Ajman Chamber)
└── RAK (Ras Al Khaimah Free Zone)

Professional Licensing (if applicable)
├── Accountant License
├── Auditor License
├── Legal Advisor License
├── Real Estate Agent License
└── Insurance Agent License
```

**Ledgr Must Be Able To:**
- Track license expiry and alert for renewal
- Maintain historical records of license changes
- Link license to customers (for accountant/advisor firms)
- Flag missing required licenses

---

### 2.5 AML/CFT COMPLIANCE (Anti-Money Laundering)

**Regulatory Bodies:** FIU (Financial Intelligence Unit), CBU (Central Bank), DFSA (if DIFC)  
**Scope:** Mandatory for all UAE businesses, stricter for financial services  

**Data Ledgr Must Capture:**

```
Customer Due Diligence (CDD) / Know Your Customer (KYC)
├── Customer Name (Individual/Entity)
├── Full Address (Verified)
├── Phone & Email
├── Government ID (Type, Number, Expiry)
├── ID Verification Date & Method
├── UBO Declaration (for entities)
│   ├── Beneficial Owner Name
│   ├── Percentage Ownership
│   ├── Source of Wealth
│   └── Nationality
├── Source of Funds (business description, income sources)
├── PEP Status (Politically Exposed Person)
│   ├── PEP Check (Yes/No)
│   ├── Check Date
│   ├── Check Provider (if using external service)
│   └── Result
└── Sanctions Screening (OFAC, UN, etc.)

Vendor/Supplier Due Diligence
├── Vendor Name
├── Vendor Address (Physical verification if > AED 100K annually)
├── Vendor Registration (License, Tax ID)
├── Business Nature
├── Contact Person
├── Payment Terms
├── Transaction History
└── AML Status (Cleared, Under Review, Flagged)

Transaction Monitoring
├── Transaction Amount (AED)
├── Transaction Date
├── Transaction Type (Payment, Receipt, Transfer, etc.)
├── Customer Involved
├── Purpose of Transaction
├── Risk Scoring
│   ├── High Risk Flag (transactions > AED 500K, rapid deposits & withdrawals)
│   ├── Medium Risk Flag
│   └── Standard Risk
├── Suspicious Activity Report (SAR) Filed (Yes/No, Date)
└── Investigation Status

Compliance Documentation
├── CDD Completion Date
├── Review Schedule (Annual minimum)
├── Update Frequency
├── Escalation Path (if PEP/High Risk identified)
└── Record Retention (5-year minimum)
```

**Ledgr Must Be Able To:**
- Flag high-risk customers for enhanced due diligence
- Track CDD completion status
- Generate AML compliance reports
- Alert on suspicious patterns (unusual large transactions, rapid movement, etc.)
- Maintain audit trail for compliance audits

---

### 2.6 BANKING & CASH MANAGEMENT

**Regulatory Bodies:** CBU (Central Bank), Banks (individual compliance)  

**Data Ledgr Must Capture:**

```
Bank Account Details
├── Account Number
├── IBAN
├── Bank Name
├── Account Type (Current, Savings, Etc.)
├── Account Holder Name
├── Currency (AED, USD, EUR, etc.)
├── Opening Date
├── Signatory Authority
│   ├── Primary Signatory
│   ├── Secondary Signatory
│   └── Dual Signature Requirement (Yes/No)
├── Debit Card/Cheque Book (if issued)
├── Monthly Fee (if applicable)
└── Interest Rate (for savings, if applicable)

Bank Reconciliation Data
├── Bank Statement Import (monthly automated if API available)
├── Bank Balance (per statement)
├── GL Account Balance (per ledger)
├── Reconciling Items
│   ├── Outstanding Cheques
│   ├── Deposits in Transit
│   ├── Bank Charges (NSF, maintenance, etc.)
│   ├── Bank Interest (if credited)
│   └── Corrections/Reversals
├── Variance Amount
├── Reconciliation Date
├── Reconciler Name (if manual)
└── Supporting Documentation (copies of bank statements, reconciliation memo)

Cheque/Payment Management
├── Cheque Book Number
├── Cheque Number Series
├── Cheque Status (Blank, Issued, Cleared, Stopped, Stale-dated)
├── Payee Name
├── Amount (AED)
├── Issue Date
├── Clear/Collection Date
├── Bank Details
└── Reconciliation Status

Journal Entries (Bank-Related)
├── Entry Date
├── Account Coding (AP, AR, Cash, Expense, Income)
├── Description
├── Bank Reference (if linked to bank transaction)
├── Amount (AED, Debit/Credit)
├── Supporting Document (Invoice, Receipt, Statement)
└── Audit Trail (who created, when, who approved)
```

**Ledgr Must Be Able To:**
- Auto-import bank statements (via API or file upload)
- Reconcile bank accounts automatically (match transactions by amount + date)
- Flag outstanding items (stale-dated cheques, unmatched deposits)
- Generate bank reconciliation reports
- Track multi-currency accounts (if applicable)

---

### 2.7 ACCOUNTS RECEIVABLE & COLLECTIONS

**Regulatory Bodies:** FTA (for VAT, invoicing), CBU (for credit risk)  

**Data Ledgr Must Capture:**

```
Customer Master
├── Customer ID
├── Customer Name
├── Business Type
├── VAT Number (if registered)
├── Address (Billing & Delivery)
├── Contact Person
├── Phone & Email
├── Payment Terms (Net 15, Net 30, Net 60, etc.)
├── Credit Limit (AED)
├── Credit Rating
└── Sales History (YTD, Annual, Lifetime)

Invoice Data
├── Invoice Number (sequential, unique)
├── Invoice Date (must be within business days)
├── Customer Name
├── Customer Address (as on invoice)
├── Customer VAT Number (if registered, required by FTA)
├── Line Items
│   ├── Description (clear, detailed)
│   ├── Quantity
│   ├── Unit Price (AED)
│   ├── Amount (AED)
│   ├── VAT Rate Applied (5%, 0%, Exempt)
│   └── VAT Amount (AED)
├── Total Amount (excluding VAT)
├── Total VAT Amount
├── Total Invoice Amount (including VAT)
├── Payment Terms
├── Due Date
├── Bank Details (for payment)
├── Invoice Status (Draft, Issued, Partially Paid, Fully Paid, Overdue, Written Off)
├── Document Signature (if required by customer contract)
└── Supporting Documentation (Delivery note, PO, etc.)

Payment Tracking
├── Payment Date
├── Payment Amount (AED)
├── Payment Method (Bank Transfer, Cheque, Cash, Credit Card)
├── Payment Reference (cheque #, bank reference, etc.)
├── Bank Reconciliation Status
├── Currency (if multi-currency)
└── Exchange Rate (if applicable)

Credit Notes & Adjustments
├── Credit Note Number (sequential, unique, linked to original invoice)
├── Credit Note Date
├── Original Invoice Reference
├── Reason for Credit (Return, Discount, Error, Adjustment, etc.)
├── Amount Credited (AED)
├── VAT Adjustment (AED)
├── Applied Against Invoice (if partial credit)
└── Approval Status

Aging & Collections
├── Invoice Aging Bucket (Current, 1-30 days overdue, 30-60, 60-90, 90+ days)
├── Days Outstanding (calculated)
├── Overdue Amount (AED)
├── Collection Status
│   ├── Not Due
│   ├── Due, Not Overdue
│   ├── 1st Collection Attempt
│   ├── 2nd Collection Attempt
│   ├── Legal Action
│   ├── Written Off
│   └── Collected
├── Collection Notes (date, method, result)
├── Contact Log (calls, emails, meetings)
└── Dispute Status (if customer disputes invoice)

Bad Debt Allowance
├── Invoice Amount
├── Likelihood of Collection (%)
├── Allowance Amount (AED)
├── Write-Off Date (when confirmed uncollectible)
└── Authorization Approval
```

**Ledgr Must Be Able To:**
- Generate invoices with FTA-compliant format (all required fields, VAT treatment clear)
- Track payment status automatically (match bank deposits to invoices)
- Alert on overdue invoices (>30, >60, >90 days)
- Calculate aging analysis
- Track credit notes linked to original invoices
- Generate Collections Agent insights (high-risk customers, aging trends)
- Support dispute resolution (customer challenges invoice, document dispute reason)

---

### 2.8 ACCOUNTS PAYABLE & VENDOR MANAGEMENT

**Data Ledgr Must Capture:**

```
Vendor Master
├── Vendor ID
├── Vendor Name
├── Business Type
├── VAT Number (if registered)
├── Address (Invoice & Payment)
├── Contact Person
├── Phone & Email
├── Payment Terms (Net 15, Net 30, Net 60, COD, etc.)
├── Bank Details (IBAN preferred)
├── TRN (Tax Registration Number, if applicable)
└── Vendor Category (Supplier, Contractor, Service Provider, etc.)

Purchase Invoice Data
├── Invoice Number (vendor's invoice #)
├── Invoice Date
├── Vendor Name
├── Vendor VAT Number (if registered)
├── GL Account Code (for coding)
├── Line Items
│   ├── Description
│   ├── Quantity
│   ├── Unit Price (AED)
│   ├── Amount (AED)
│   ├── VAT Rate Applied (5%, 0%, Exempt, Reverse Charge, etc.)
│   └── VAT Amount (AED)
├── Total Amount (ex-VAT)
├── Total VAT Amount
├── Total Invoice Amount (inc-VAT)
├── Due Date
├── Invoice Status (Received, Approved, Partially Paid, Fully Paid, Disputed)
├── VAT Treatment (Standard, Zero-Rated, Exempt, Reverse Charge)
└── Supporting Documents (PO, Delivery Note, Receipt, etc.)

Debit Notes
├── Debit Note Number (our debit note to vendor, linked to original invoice)
├── Debit Note Date
├── Original Invoice Reference
├── Reason for Debit (Overcharge, Damaged Goods, etc.)
├── Amount Debited (AED)
├── VAT Adjustment (AED)
└── Vendor Acknowledgment Status

Payment Tracking
├── Payment Date
├── Payment Amount (AED)
├── Payment Method (Bank Transfer, Cheque, Credit Card, Cash)
├── Bank Account Used (for multi-account tracking)
├── Bank Reference
├── Reconciliation Status
└── Currency (if multi-currency)

Reverse Charge VAT
├── Vendor Reverse Charge Status (Yes/No)
├── Reason (Service from abroad, Goods from abroad, etc.)
├── Original Invoice Amount (AED)
├── VAT Calculated (AED, 5% on original amount)
├── VAT Liability (Ledgr's liability to FTA, not vendor's)
└── Documentation (Vendor invoice, Proof of payment, etc.)

Vendor Statement Reconciliation
├── Vendor Statement Period
├── Vendor Statement Balance (per vendor's statement)
├── GL Account Balance (per our records)
├── Reconciling Items
│   ├── Invoices in transit
│   ├── Credits pending
│   ├── Overpayments
│   └── Disputed invoices
├── Variance Amount
└── Reconciliation Date & Approver
```

**Ledgr Must Be Able To:**
- Track vendor invoices with full VAT treatment detail
- Flag Reverse Charge invoices for separate VAT handling
- Match POs to invoices (3-way match: PO, Invoice, Delivery)
- Support vendor statement reconciliation
- Track payment status automatically
- Alert on duplicate invoice detection (same # or amount from same vendor)
- Generate Vendor Aging analysis
- Track vendor performance (on-time payment, quality of goods/services)

---

### 2.9 GENERAL LEDGER & CHART OF ACCOUNTS

**Regulatory Bodies:** FTA (for reporting), AAOIFI (if Islamic finance principles apply)  

**Data Ledgr Must Capture:**

```
Chart of Accounts
├── GL Account Number (sequential 1000-9999 typically)
├── GL Account Name
├── Account Type
│   ├── Asset (Current & Non-Current)
│   ├── Liability (Current & Non-Current)
│   ├── Equity
│   ├── Revenue
│   ├── Expense
│   └── Contra-Account (Accumulated Depreciation, Allowance for Doubtful Debts)
├── Account Category
│   ├── Operational
│   ├── Financing
│   ├── Investing
│   └── Regulatory (Statutory)
├── Sub-Account (if hierarchical)
├── Opening Balance (AED)
├── Is Active (Yes/No)
└── Creation Date

Journal Entry Header
├── Entry ID (unique, sequential)
├── Entry Date (transaction date)
├── Entry Reference (Invoice #, Receipt #, Check #, Description)
├── Description (clear narrative of transaction)
├── Entry Status
│   ├── Draft (not yet balanced)
│   ├── Balanced (debits = credits)
│   ├── Approved (authorized by approver)
│   └── Posted (in GL)
├── GL Period (Month/Year for reporting)
├── Prepared By (user name)
├── Approved By (authorized user)
└── Audit Notes (reason for any manual adjustments)

Journal Entry Line Items
├── Line ID
├── GL Account Code
├── GL Account Name
├── Debit Amount (AED, if applicable)
├── Credit Amount (AED, if applicable)
├── Cost Center (if tracking by department)
├── Project Code (if project accounting)
├── Customer ID (if linking to customer)
├── Vendor ID (if linking to vendor)
└── Supporting Document Link (Invoice, Receipt, etc.)

Trial Balance (Auto-Generated)
├── GL Account
├── Account Type
├── Debit Balance (AED)
├── Credit Balance (AED)
├── Net Balance (AED)
├── Verification Status (Balanced, Out of Balance)
└── As of Date

Account Reconciliation
├── Account Number
├── Sub-Ledger Balance (AR/AP/Bank balance per detailed ledger)
├── GL Balance (per Chart of Accounts)
├── Reconciling Items (list of unmatched items)
├── Variance Amount
├── Reconciliation Date
├── Reconciler Name
└── Approval Status
```

**Ledgr Must Be Able To:**
- Auto-create GL entries from invoices, payments, payroll, etc.
- Enforce balanced entries (debits must = credits)
- Generate monthly Trial Balance
- Support period-end closing (accruals, cutoffs, reversals)
- Track account reconciliation (AR, AP, Bank, Employee Advances, etc.)
- Generate GL reports (GL Register, TB, P&L, Balance Sheet)
- Support multi-entity consolidation (if customer has multiple legal entities)
- Enforce audit trail (who created, modified, when, why)

---

## PART 3: PHASE 1 ENGINEERING ROADMAP

### 3.1 Core Database Schema (Week 1-2)

**Priority: CRITICAL**

**Tables Required:**

```
Database Layer 1: Identity
├── Users (email, password hash, roles, created_at, last_login)
├── Roles (admin, accountant, employee, customer, auditor)
├── Permissions (create_invoice, approve_payment, file_vat, etc.)
└── Audit_Log (user_id, action, table_name, record_id, timestamp, old_value, new_value)

Database Layer 2: Organizations
├── Organizations (org_id, legal_name, trade_license_no, difc_license_no, emirate)
├── Organization_Settings (org_id, fiscal_year_start, currency, vat_threshold, tax_year_start)
├── Legal_Entities (entity_id, org_id, legal_structure, country, tax_authority)
├── Ownership (owner_id, entity_id, percentage, nationality, ubo_flag)
└── Compliance_Status (entity_id, vat_registered, ct_registered, mohre_registered, last_check_date)

Database Layer 3: Ledger (Append-Only Event Ledger)
├── Ledger_Events (event_id, created_at, entity_id, transaction_type, description, is_reversing)
│   ├── Columns: id, entity_id, event_date, event_type, amount_aed, currency_override
│   ├── Related IDs: invoice_id, payment_id, payroll_id, journal_entry_id
│   └── Audit Trail: created_by, created_at, last_modified_by, last_modified_at
├── GL_Entries (gl_entry_id, ledger_event_id, gl_account, debit_aed, credit_aed, cost_center)
├── Account_Balances (account_id, period_end_date, balance_aed, last_updated)
└── Transactions (transaction_id, ledger_event_id, transaction_date, status, posting_status)

Database Layer 4: Documents
├── Documents (doc_id, entity_id, doc_type, doc_date, file_path, version, hash, signed_status)
├── Document_Metadata (doc_id, page_count, total_amount, parties_involved, retention_until)
├── Document_Versions (version_id, doc_id, created_by, created_at, reason_for_change)
└── Document_Signatures (signature_id, doc_id, signer_name, signature_timestamp, digital_signature)

Database Layer 5: VAT Compliance
├── VAT_Registrations (registration_id, entity_id, fta_registration_no, registered_date, status)
├── VAT_Transactions (vat_transaction_id, entity_id, transaction_date, transaction_type, rate_applied)
│   ├── transaction_type: SALE_STANDARD, SALE_ZERO, SALE_EXEMPT, PURCHASE_STANDARD, PURCHASE_ZERO, IMPORT, EXPORT
│   ├── rate_applied: 5%, 0%, EXEMPT, REVERSE_CHARGE
│   └── gl_account_link: Links to GL entry
├── VAT_Returns (return_id, entity_id, period_start, period_end, submitted_date, confirmation_no)
└── VAT_Calculations (calculation_id, entity_id, period, standard_rated_sales, zero_rated_sales, vat_payable)

Database Layer 6: Corporate Tax
├── CT_Registrations (registration_id, entity_id, fta_ct_no, registered_date, status)
├── CT_Periods (period_id, entity_id, tax_year_start, tax_year_end, filing_deadline)
├── Financial_Statements (fs_id, entity_id, period_id, revenue, cogs, gross_profit, op_income, profit_bef_tax)
├── Asset_Register (asset_id, entity_id, asset_type, purchase_date, original_cost, depreciation_method, useful_life)
├── Tax_Depreciation (depreciation_id, asset_id, year, book_depreciation, tax_depreciation, variance)
├── Intercompany_Transactions (interco_id, entity_1, entity_2, amount, transfer_pricing_method)
└── Loss_Carryforward (loss_id, entity_id, loss_year, loss_amount, utilization_year, remaining_balance)

Database Layer 7: Payroll & WPS
├── Employees (employee_id, org_id, legal_name, passport_no, nationality, hire_date, status)
├── Employee_Salary (salary_id, employee_id, effective_date, basic, housing_allowance, transport_allowance, gross)
├── WPS_Submissions (submission_id, entity_id, submission_month, submission_date, status, confirmation_no)
│   ├── Contains: Employee ID, Name, Bank IBAN, Salary Amount, Deductions
│   └── Compliance check: All required fields present, valid IBANs, no duplicates
├── Leave_Accrual (accrual_id, employee_id, year, annual_days, taken_days, balance, carryover_allowed)
├── Gratuity (gratuity_id, employee_id, accrual_balance, calculation_method, last_updated)
├── Social_Security (ss_id, employee_id, period, contribution_amount, employee_deduction, status)
└── Termination (termination_id, employee_id, termination_date, gratuity_paid, clearance_issued)

Database Layer 8: AML/KYC
├── Customers (customer_id, org_id, customer_name, address, id_type, id_number, id_expiry)
├── KYC_Status (kyc_id, customer_id, cdd_complete_date, ubo_declared, pep_check_status, sanctions_status)
├── Transaction_Risk (risk_id, transaction_id, amount, customer_id, risk_score, flag_type, sap_filed)
└── Compliance_Evidence (evidence_id, kyc_id, document_type, file_path, upload_date, expiry_date)

Database Layer 9: AR/AP
├── Invoices (invoice_id, entity_id, invoice_no, invoice_date, customer_id, total_amount, vat_amount, due_date, status)
├── Invoice_Lines (line_id, invoice_id, description, quantity, unit_price, line_amount, vat_rate, vat_amount)
├── Payments (payment_id, invoice_id, payment_date, amount_paid, payment_method, bank_reference)
├── Credits (credit_id, invoice_id, credit_no, credit_date, reason, amount, vat_amount)
├── Vendors (vendor_id, org_id, vendor_name, address, vat_no, bank_iban, payment_terms)
├── Purchase_Invoices (purchase_id, entity_id, po_no, invoice_date, vendor_id, total_amount, vat_treatment)
└── Vendor_Payments (vendor_payment_id, purchase_id, payment_date, amount, bank_reference)

Database Layer 10: Bank & Cash
├── Bank_Accounts (account_id, entity_id, bank_name, account_no, iban, currency, opening_date)
├── Bank_Transactions (bank_tx_id, account_id, tx_date, description, amount, balance, reconciliation_status)
├── Bank_Reconciliation (reconciliation_id, account_id, reconciliation_date, bank_balance, gl_balance, variance)
└── Outstanding_Items (item_id, account_id, item_type, amount, date_identified, status, age_in_days)
```

**Schema Design Principles:**
- ✅ Append-only Ledger (no updates to historical transactions)
- ✅ Full audit trail (created_by, created_at, modified_by, modified_at on every table)
- ✅ Compliance-first (VAT, Tax, Payroll, AML fields built in, not added later)
- ✅ Foreign keys enforced (entities, customers, vendors must exist before referencing)
- ✅ Indexes on frequently queried fields (entity_id, customer_id, transaction_date, status)
- ✅ Partitioned by entity_id (for multi-tenant performance)

---

### 3.2 Migration Agent Architecture (Week 2-4)

**Priority: CRITICAL**

**Workflow:**

```
Step 1: Source System Detection
├── Input: File upload (QuickBooks.IIF, Zoho Export.CSV, Xero.xml, Bank Statements.PDF, Excel)
├── Algorithm: Detect format, parse structure
├── Output: Source system identified (QB, Zoho, Xero, Manual), mapped fields
└── Confidence: Detect errors (missing required fields, invalid dates, negative amounts)

Step 2: Data Extraction & Validation
├── Extract GL Entries → Validate: Account codes exist, debits=credits, posting period valid
├── Extract Customers → Validate: Name populated, address not null, VAT format (if provided)
├── Extract Vendors → Validate: Name populated, payment terms valid, bank details (if present)
├── Extract Transactions → Validate: Date in valid range, amount not negative, GL accounts exist
├── Extract Payroll → Validate: Employee ID present, salary amount valid, WPS period valid
├── Output: Cleaned dataset with flags for manual review
└── Confidence Scoring: % of records passed validation vs. failed

Step 3: Data Mapping & Transformation
├── QuickBooks → Ledgr Schema
│   ├── QB Chart of Accounts → Ledgr GL
│   ├── QB Customers → Ledgr Customers (AR)
│   ├── QB Vendors → Ledgr Vendors (AP)
│   ├── QB Transactions → Ledgr GL Entries (with source audit trail: "Migrated from QB")
│   └── QB Splits → Ledgr GL Entry lines
├── Zoho Books → Ledgr Schema
│   ├── Zoho Accounts → Ledgr GL
│   ├── Zoho Contacts → Ledgr Customers/Vendors
│   ├── Zoho Invoices → Ledgr Invoices (AR)
│   ├── Zoho Bills → Ledgr Purchase Invoices (AP)
│   └── Zoho Transactions → Ledgr GL Entries
├── Xero → Ledgr Schema
│   ├── Xero Accounts → Ledgr GL
│   ├── Xero Contacts → Ledgr Customers/Vendors
│   ├── Xero Invoices → Ledgr Invoices (AR)
│   ├── Xero Bills → Ledgr Purchase Invoices (AP)
│   └── Xero Transactions → Ledgr GL Entries
└── Bank Statements → Ledgr Schema
    ├── Statement Transactions → Ledgr Bank Transactions
    ├── Matched to GL entries (by amount + approximate date)
    └── Unmatched flagged for manual review

Step 4: Reconciliation & Validation
├── Verify Opening Balances Match
│   ├── QB Opening GL Balance vs. Ledgr Opening GL Balance → Flag variance > AED 1000
│   └── Zoho/Xero Opening Balances → Match to Ledgr
├── Verify Ending Balances Match
│   ├── QB Ending Trial Balance vs. Ledgr Ending Trial Balance
│   ├── Zoho Ending Trial Balance vs. Ledgr Ending Trial Balance
│   └── Xero Ending Trial Balance vs. Ledgr Ending Trial Balance
├── Verify AR Aging
│   ├── QB AR Aging vs. Ledgr AR Aging → Flag > 5% variance
│   └── Zoho/Xero AR Aging vs. Ledgr AR Aging
├── Verify AP Aging
│   ├── QB AP Aging vs. Ledgr AP Aging
│   └── Zoho/Xero AP Aging vs. Ledgr AP Aging
├── Verify Bank Balance
│   ├── QB Bank Balance vs. Ledgr Bank Balance
│   └── Source Bank Statement vs. Ledgr Bank Balance → Match to latest statement provided
└── Output: Reconciliation report showing % match for each area

Step 5: Missing Data Detection
├── Check for required compliance fields
│   ├── VAT Registrations: Is VAT registration on file? If revenue > AED 375K, flag as mandatory
│   ├── Customer VAT Numbers: Are all customers matched to VAT IDs? Flag >10% missing
│   ├── Employee Data: Are all employees in payroll system? Flag missing bank accounts
│   ├── Trade License: Is trade license loaded? Flag if missing or expired
│   └── UBO Declaration: Is UBO documented? Flag if company is entity (not sole trader)
├── Check for historical compliance
│   ├── VAT: Is VAT registration early enough to cover history? Flag if not
│   ├── Tax: Is tax registration early enough to cover history? Flag if not
│   └── Payroll: Is payroll registration documented? Flag if missing
└── Output: Required items list (customer VAT numbers, employee bank accounts, etc.)

Step 6: Confidence Scoring & Report Generation
├── Calculate Confidence Score:
│   ├── Base score: 100%
│   ├── Minus for validation failures: -5% per 100 failed records
│   ├── Minus for balance variance: -10% per AED 100K variance
│   ├── Minus for missing required fields: -5% per 10% missing
│   ├── Minus for unmatched transactions: -2% per 5% unmatched
│   └── Final Score: (100 - deductions) = Confidence %
├── Generate Migration Report
│   ├── Summary: {records_total, records_migrated, records_failed, confidence_score}
│   ├── Issues by Severity
│   │   ├── Critical: GL doesn't balance, missing legal structure, no VAT registration for registered customer
│   │   ├── High: Missing customer VAT numbers (>50%), unmatched bank transactions (>20%)
│   │   ├── Medium: Missing employee bank accounts (<50%), unmatched invoices (<10%)
│   │   └── Low: Minor VAT classification issues, formatting issues
│   ├── Recommendations
│   │   ├── If Critical: Do not post to GL. Require manual review & correction.
│   │   ├── If High: Post to GL but flag for accountant review within 7 days.
│   │   ├── If Medium: Post to GL, auto-create review tasks for accountant.
│   │   └── If Low: Post to GL, log as reference for future validation.
│   └── Next Steps: "Import complete. 97% confidence. Review the 50 flagged items below."

Step 7: Data Import & Posting
├── If Confidence >= 95%: Auto-post all data to GL
├── If 80% <= Confidence < 95%: Post to GL but lock for review (accountant must approve)
├── If Confidence < 80%: Hold in staging area, require manual review & correction before posting
├── Create system audit entries for all imported data:
│   ├── Source: "Migrated from QuickBooks" (with file name, upload date, user)
│   └── Ability to reverse: If customer finds error post-migration, can rollback that section
└── Generate welcome email with migration results
```

**Key Migration Integrations:**

1. **QuickBooks Desktop/Online Import**
   - File formats: IIF (Interchange Format), CSV
   - Extract: Chart of Accounts, Customers, Vendors, Invoices, Bills, Transactions
   - Mapping: QB Account Type → Ledgr GL Account Type (Asset/Liability/Equity/Income/Expense)

2. **Zoho Books Import**
   - API access (OAuth) or CSV export
   - Extract: Accounts, Contacts, Invoices, Bills, Expenses, Transactions
   - Mapping: Zoho Account → Ledgr GL (by name matching + user mapping)

3. **Xero Import**
   - API access (OAuth) or CSV export
   - Extract: Accounts, Contacts, Invoices, Bills, Payments, Journal Entries
   - Mapping: Xero Account Code → Ledgr GL (by code or name)

4. **Bank Statement Import**
   - File formats: OFX, CSV, PDF (with OCR), MT940 (international standard)
   - Extract: Transaction date, amount, description, balance
   - Matching: Amount + approximate date to existing GL entries

5. **Excel/CSV Import** (for manual data entry)
   - Templates: Chart of Accounts, Customers, Vendors, Invoices, Transactions
   - Validation: Format checks (dates, amounts, required fields)
   - Error reporting: Row-by-row feedback on issues

---

### 3.3 Core API Endpoints (Week 3-4)

**Priority: HIGH**

```
Authentication
POST /auth/signup
POST /auth/login
POST /auth/refresh-token
POST /auth/logout
POST /auth/forgot-password
POST /auth/reset-password

Organizations
POST /orgs
GET /orgs/{org_id}
PUT /orgs/{org_id}
GET /orgs/{org_id}/legal-entities
POST /orgs/{org_id}/legal-entities
GET /orgs/{org_id}/compliance-status

Migration
POST /orgs/{org_id}/migrations/start
GET /orgs/{org_id}/migrations/{migration_id}
GET /orgs/{org_id}/migrations/{migration_id}/status
POST /orgs/{org_id}/migrations/{migration_id}/validate
POST /orgs/{org_id}/migrations/{migration_id}/import
POST /orgs/{org_id}/migrations/{migration_id}/rollback
GET /orgs/{org_id}/migrations/{migration_id}/report
POST /orgs/{org_id}/migrations/{migration_id}/upload

GL & Ledger
GET /orgs/{org_id}/gl/chart-of-accounts
GET /orgs/{org_id}/gl/trial-balance
GET /orgs/{org_id}/gl/entries
POST /orgs/{org_id}/gl/entries
GET /orgs/{org_id}/gl/account/{account_id}/balance
GET /orgs/{org_id}/gl/reconciliations/{account_id}

Documents
POST /orgs/{org_id}/documents/upload
GET /orgs/{org_id}/documents/{doc_id}
GET /orgs/{org_id}/documents (filtered by type, date, status)
PUT /orgs/{org_id}/documents/{doc_id}

VAT
GET /orgs/{org_id}/vat/registration
GET /orgs/{org_id}/vat/transactions
GET /orgs/{org_id}/vat/returns/{return_id}
POST /orgs/{org_id}/vat/returns (submit to FTA, if API available)

Corporate Tax
GET /orgs/{org_id}/ct/registration
GET /orgs/{org_id}/ct/financial-statements/{period}
GET /orgs/{org_id}/ct/depreciation/{asset_id}
GET /orgs/{org_id}/ct/return/{tax_year}

Payroll & WPS
GET /orgs/{org_id}/employees
POST /orgs/{org_id}/employees
PUT /orgs/{org_id}/employees/{employee_id}
GET /orgs/{org_id}/payroll/wps-submissions
POST /orgs/{org_id}/payroll/wps-submissions/generate
GET /orgs/{org_id}/payroll/gratuity/{employee_id}

AR/AP
GET /orgs/{org_id}/ar/invoices
POST /orgs/{org_id}/ar/invoices
GET /orgs/{org_id}/ar/invoice/{invoice_id}
PUT /orgs/{org_id}/ar/invoice/{invoice_id}
POST /orgs/{org_id}/ar/invoice/{invoice_id}/payment
GET /orgs/{org_id}/ap/purchase-invoices
POST /orgs/{org_id}/ap/purchase-invoices
GET /orgs/{org_id}/ap/aging

Banking
GET /orgs/{org_id}/bank/accounts
POST /orgs/{org_id}/bank/accounts
GET /orgs/{org_id}/bank/reconciliation/{account_id}
POST /orgs/{org_id}/bank/reconciliation/{account_id}
```

---

### 3.4 Frontend for Onboarding (Week 4)

**Priority: HIGH**

**Step 1: Create Account (30 seconds)**
- Form: Company Name, Emirates, Industry, # of Employees
- Validation: Names > 2 chars, emirate selected, industry selected
- Output: Account created, user logged in

**Step 2: Connect Systems (1 minute)**
- Buttons: QuickBooks, Zoho Books, Xero, Google Drive, Bank (upload statement)
- OAuth for QuickBooks/Zoho/Xero
- File upload for bank statements
- Output: Systems connected, awaiting import

**Step 3: Upload Historical Records (5 minutes)**
- Drag & drop: Bank statements, VAT returns, Tax records, Payroll exports, Trial balance, Invoices
- Validation: File format check (PDF, CSV, Excel)
- Output: Files uploaded, migration agent queued

**Step 4: AI Migration Agent (10 minutes)**
- Show progress: "Analyzing QuickBooks export... Mapping chart of accounts... Validating transactions..."
- Show results: "Migration complete. 97% confidence. 3 items flagged for review."
- Output: Data imported, customer can review flagged items, start using Ledgr

---

### 3.5 Compliance Validation Engine (Week 4)

**Priority: CRITICAL**

**Real-Time Compliance Checks:**

```
VAT Compliance
├── Invoice Validation
│   ├── Every invoice must have: invoice number, date, customer name, customer address, amount, VAT treatment
│   ├── VAT number required if customer is registered
│   ├── VAT calculation: Line items × rate = total VAT
│   ├── Sequential invoice numbers (no gaps, no duplicates)
│   └── Dates must be within business days (not weekends/public holidays unless exception)
├── VAT Transaction Classification
│   ├── Sale = classify as STANDARD/ZERO/EXEMPT
│   ├── Purchase = classify as STANDARD/ZERO/EXEMPT/REVERSE_CHARGE
│   ├── Import = classify as REVERSE_CHARGE
│   └── Validation: If > AED 100K purchase, must have supporting documents
├── Reverse Charge Validation
│   ├── Service from abroad? Classify as REVERSE_CHARGE (no input VAT claim)
│   ├── Document proof: Invoice from vendor, proof of payment, service contract
│   └── Amount must match VAT return claim (if any)
└── VAT Return Validation
    ├── Standard Rated Sales total = sum of all STANDARD classified invoices
    ├── Zero Rated Sales total = sum of all ZERO classified invoices
    ├── Input VAT total = sum of recoverable VAT on purchases
    ├── VAT Payable = Standard Sales VAT - Input VAT (but never negative, else VAT receivable)
    └── Submission ready if all invoices matched to VAT return

Corporate Tax Compliance
├── Financial Statement Validation
│   ├── P&L: Revenue - COGS - Expenses = Net Profit
│   ├── Balance Sheet: Assets = Liabilities + Equity
│   ├── Cash Flow: Operating + Investing + Financing = Cash change
│   └── All three statements must reconcile
├── Depreciation Validation
│   ├── Fixed assets correctly categorized (Building, Plant, Vehicle, IT, etc.)
│   ├── Depreciation method applied (Straight-line, declining balance, etc.)
│   ├── Tax depreciation rates compliant with FTA (if applicable)
│   └── Accumulated depreciation ≤ original cost
├── Intercompany Transactions
│   ├── Identified and flagged for transfer pricing review
│   ├── Amount must have supporting documentation
│   └── Transfer pricing method documented (cost-plus, CUP, etc.)
└── Tax Return Validation
    ├── All GL accounts reconciled
    ├── All balance sheet accounts reconciled
    ├── Tax adjustments identified and documented
    └── Return ready for submission

Payroll & WPS Compliance
├── Employee Master Validation
│   ├── Every active employee must have: name, nationality, passport no., hire date, job title
│   ├── Labor card number (if issued)
│   ├── Bank IBAN (required for WPS)
│   └── All fields populated before payment
├── Salary Structure Validation
│   ├── Basic salary must be ≥ AED 4,000 (or emirate minimum)
│   ├── Housing/Transport allowances must be reasonable (typically 25-50% of basic)
│   ├── Total salary calculated correctly
│   ├── Statutory deductions applied (Social Security, Health Insurance, Income Tax if applicable)
│   └── Net salary = Gross - Deductions
├── Leave Management Validation
│   ├── Annual leave accrued: 30 days/year (minimum)
│   ├── Carryover allowed: Max 30 days to next year
│   ├── Medical certificate required if sick leave > 3 days
│   ├── Leave balance never negative (flag over-allocation)
│   └── Leave taken logged with dates
├── Gratuity Calculation Validation
│   ├── First 5 years: 0.5 months per year
│   ├── After 5 years: 1 month per year
│   ├── Gratuity = (Basic × Years of Service) / 12
│   ├── Capped at 2 years (max) per UAE Labor Law
│   └── Calculation verified before payment
├── WPS Submission Validation
│   ├── Month submitted matches payroll period
│   ├── All active employees included (no omissions)
│   ├── Employee name matches bank account holder
│   ├── IBAN valid format (24 characters, starts with AE)
│   ├── Amount matches GL payroll entry
│   ├── No duplicates (same employee submitted twice)
│   ├── Submission date within deadline (last business day of month)
│   └── File format matches Emirates Post specification
└── Termination Validation
    ├── Gratuity calculated and documented
    ├── Final settlement amount = Gratuity + Unpaid Salary
    ├── Labor Clearance Certificate obtained (if required)
    └── Employee exit documented

AML/KYC Compliance
├── Customer Due Diligence Validation
│   ├── For transactions > AED 100K: Full CDD required (name, address, ID, source of funds)
│   ├── For transactions > AED 500K: Enhanced CDD required (UBO, source of wealth, business nature)
│   ├── PEP (Politically Exposed Person) screening completed (if applicable)
│   ├── Sanctions screening completed (OFAC, UN, etc.)
│   └── CDD review scheduled at least annually
├── Transaction Monitoring Validation
│   ├── High-value transactions (> AED 500K) flagged for review
│   ├── Rapid deposit & withdrawal patterns flagged
│   ├── Cash-heavy transactions flagged
│   ├── Transactions with high-risk countries flagged
│   ├── Suspicious Activity Report (SAR) filed (if pattern detected)
│   └── Investigation status tracked
└── Compliance Records
    ├── All CDD documents retained (minimum 5 years)
    ├── SAR decisions documented (why filed or why not)
    └── Compliance review audit trail maintained

General Ledger Compliance
├── Entry Validation
│   ├── Every GL entry must be balanced (debits = credits)
│   ├── GL account must exist (no orphaned entries)
│   ├── Transaction date must be within open period
│   ├── Description must be clear (>= 20 characters)
│   ├── Supporting document referenced (invoice, receipt, bank statement)
│   └── Entry approved by authorized user before posting
├── Reconciliation Validation
│   ├── All balance sheet accounts reconciled to supporting documents
│   ├── AR reconciliation: Invoice total = Payment received + Outstanding
│   ├── AP reconciliation: Invoice total = Payment made + Outstanding
│   ├── Bank reconciliation: Bank statement balance = GL balance +/- outstanding items
│   ├── Payroll reconciliation: WPS amount = GL payroll entry
│   └── Reconciliation completed monthly (within 10 days of month-end)
└── Posting Validation
    ├── Only completed & approved entries posted to GL
    ├── No entries posted to current open period without approval
    └── Month-end cutoff enforced (no transactions dated before month-end posted after)
```

---

## PART 4: REGULATORY CHECKLISTS

### 4.1 VAT Pre-Launch Checklist

- [ ] VAT Registration number captured in system
- [ ] VAT threshold documented (AED 375K for UAE)
- [ ] VAT rate rules configured (5% standard, 0% zero-rated, exemptions defined by industry)
- [ ] VAT return template created (matches FTA format)
- [ ] Tax year defined (Jan-Dec for UAE)
- [ ] Reverse charge rules configured (services from abroad, etc.)
- [ ] Invoice validation rules enforced (VAT number required for registered customers)
- [ ] VAT return submission process documented
- [ ] Audit trail configured (every transaction tracked)
- [ ] 5-year retention policy documented
- [ ] Test VAT return generated and validated

### 4.2 Corporate Tax Pre-Launch Checklist

- [ ] Tax registration number captured
- [ ] Tax year defined (Jan-Dec)
- [ ] Filing deadline documented (June 30)
- [ ] Depreciation methods configured (straight-line, declining balance)
- [ ] Capital allowance rules defined per FTA
- [ ] Intercompany transaction flagging enabled
- [ ] Transfer pricing documentation template created
- [ ] Loss carryforward mechanism configured
- [ ] Financial statement reconciliation rules configured
- [ ] Tax return template created (matches FTA form)
- [ ] Audit trail configured
- [ ] 5-year retention policy documented

### 4.3 Payroll Pre-Launch Checklist

- [ ] Employee master data structure validated
- [ ] Salary structure rules configured (basic, allowances, deductions)
- [ ] Social security rates per emirate configured
- [ ] Health insurance provider integrated (or manual entry process)
- [ ] WPS submission format validated (matches Emirates Post spec)
- [ ] Leave accrual rules configured (30 days/year, 30-day carryover max)
- [ ] Gratuity calculation rules configured (0.5 months first 5 years, 1 month after)
- [ ] Labor card tracking enabled
- [ ] Visa expiry alerts configured
- [ ] Termination settlement calculation enabled
- [ ] MOHRE compliance checklist created
- [ ] 3-year payroll record retention policy documented

### 4.4 AML/KYC Pre-Launch Checklist

- [ ] Customer due diligence form created
- [ ] KYC documentation requirements defined
- [ ] PEP screening process defined (internal vs. external service)
- [ ] Sanctions screening configured (if external service available)
- [ ] Transaction monitoring rules configured (high-value threshold, rapid movement, etc.)
- [ ] SAR reporting process documented
- [ ] CDD review schedule configured (annual minimum)
- [ ] Record retention policy documented (5 years minimum)
- [ ] Audit trail for AML decisions configured
- [ ] Staff training requirements documented

### 4.5 General Ledger Pre-Launch Checklist

- [ ] Chart of accounts structure finalized
- [ ] GL account types & categories defined
- [ ] Reconciliation rules configured for each account
- [ ] Approval workflows configured (by transaction amount, account type)
- [ ] Posting rules configured (no posting to previous periods without exception)
- [ ] Audit trail enabled (created_by, created_at, modified_by, modified_at on all entries)
- [ ] Month-end close process documented
- [ ] Trial balance auto-generation configured
- [ ] Balance sheet reconciliation process documented
- [ ] P&L account reconciliation process documented
- [ ] Record retention policy documented (7 years minimum per tax law)

---

## PART 5: RESOURCE REQUIREMENTS & TIMELINE

### 5.1 Engineering Team (Recommended)

- **1 Architect/Tech Lead** (2 months) — Database design, API architecture, compliance integration strategy
- **2 Backend Engineers** (3 months) — Core database, GL & ledger, VAT/Tax engines
- **1 Migration Specialist** (3 months) — QuickBooks, Zoho, Xero integrations, data mapping
- **1 Frontend/Full-Stack Engineer** (2 months) — Onboarding flow, migration UI, compliance dashboard
- **1 QA/Compliance Officer** (2 months) — Validation rules, compliance checklist, testing

**Total: 12-15 engineer-weeks**

### 5.2 Compliance/Finance Consultant (Recommended)

- **1 UAE Tax/Accounting Consultant** (4 weeks) — VAT rules validation, CT rules, transfer pricing guidelines
- **1 MOHRE HR Specialist** (2 weeks) — Payroll, WPS, gratuity calculations, labor law compliance
- **1 AML/KYC Specialist** (2 weeks) — CDD requirements, transaction monitoring rules

**Total: 8 consultant-weeks**

### 5.3 Timeline

```
Week 1-2: Database Design & Setup
├── Define schema (all 10 layers)
├── Create migrations (DDL scripts)
├── Set up indexes & partitioning
└── Test data seeding

Week 2-3: Core API Development
├── Auth endpoints
├── GL CRUD endpoints
├── Bank reconciliation endpoints
└── Testing & documentation

Week 3-4: Migration Agent Development
├── QuickBooks importer
├── Zoho importer
├── Xero importer
├── Bank statement importer
├── Reconciliation & validation logic
└── Confidence scoring algorithm

Week 4: Frontend Onboarding
├── Step 1: Account creation form
├── Step 2: System connection (OAuth, file upload)
├── Step 3: Historical record upload
├── Step 4: Migration progress display & results
└── Testing

Week 4 (Parallel): Compliance Validation Rules
├── VAT validation rules
├── Tax validation rules
├── Payroll validation rules
├── AML validation rules
├── GL validation rules
└── Testing & documentation

Week 5: Integration Testing & QA
├── End-to-end migration tests (QB → Ledgr, Zoho → Ledgr, Xero → Ledgr)
├── Reconciliation validation tests
├── Compliance validation tests
└── Performance testing (can handle 10K+ transactions?)

Week 5-6: Beta Customer Onboarding
├── Launch to 2-3 beta customers
├── Collect feedback on migration process
├── Fix issues
└── Iterate onboarding flow

Week 6: Launch Ready
├── Final compliance sign-off
├── Documentation complete
├── Support team trained
└── Production environment hardened
```

---

## PART 6: SUCCESS METRICS FOR PHASE 1

- ✅ **Migration Confidence Score:** Average 95%+ across beta customers (target: 97%+)
- ✅ **Onboarding Time:** <30 minutes from account creation to data imported for 80%+ customers
- ✅ **Data Accuracy:** GL trial balance variance < AED 5,000 post-migration (< 0.5%)
- ✅ **Compliance:** 100% of migrated data compliant with VAT/Tax/Payroll requirements
- ✅ **API Uptime:** 99.9% during Phase 1 beta
- ✅ **Customer Satisfaction:** NPS > 70 for migration experience
- ✅ **Regulatory Readiness:** Phase 1 design reviewed & approved by UAE accounting/tax expert

---

**END OF PHASE 1 MASTER PLAN**

---

## NEXT STEPS

1. **Week 1:** Architect reviews this plan, confirms database design
2. **Week 1:** Compliance consultant validates all VAT/Tax/Payroll rules
3. **Week 2:** Engineering team begins schema creation
4. **Week 2:** Migration integrations (QB, Zoho, Xero) start development
5. **Week 4:** Onboarding flow implemented
6. **Week 5:** Beta testing begins with 2-3 customers
7. **Week 6:** Production launch of Phase 1

