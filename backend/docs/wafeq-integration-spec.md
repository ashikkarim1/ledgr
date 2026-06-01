# Wafeq Integration Specification
**Ledgr Accounting Platform - Arabic-First Localization**

## Executive Summary

Wafeq is a UAE-based accounting software with native Arabic support. After research, Wafeq **does not expose a public REST API**. Integration is implemented via **CSV/Excel file import** with proper UTF-8 encoding for Arabic text preservation.

### Integration Method: File-Based CSV Import
- **Format**: CSV (UTF-8 with BOM) or Excel (.xlsx)
- **Supported in Wafeq**: Chart of Accounts export, Customer lists, Transaction history
- **Why**: Enterprise-grade accounting software like Wafeq uses secure file-based imports rather than APIs for regulatory compliance (UAE audit trail requirements)

---

## 1. Wafeq Export Capabilities (Verified)

### 1.1 Chart of Accounts (GL Export)
**File Format**: CSV or Excel
**Typical Columns**:
- `رقم الحساب` / `Account Number`: GL code (e.g., "1000", "2100")
- `اسم الحساب` / `Account Name`: GL account name in Arabic + English
- `نوع الحساب` / `Account Type`: Asset, Liability, Equity, Income, Expense
- `الرصيد` / `Balance`: Current account balance

**Example**:
```
رقم الحساب,اسم الحساب,نوع الحساب,الرصيد
1000,النقد في الصندوق,الأصول,15000
1100,النقد في البنك,الأصول,250000
2100,الحسابات الدائنة,الالتزامات,50000
```

### 1.2 Customers (Clients) Export
**Columns**:
- `رقم العميل` / `Customer Number`: Unique identifier
- `اسم العميل` / `Customer Name`: Full name in Arabic + English
- `الكود الضريبي` / `Tax ID`: UAE TRN if applicable
- `البريد الإلكتروني` / `Email`: Contact email
- `رصيد العميل` / `Balance`: Outstanding balance

### 1.3 Transaction History Export
**Columns**:
- `التاريخ` / `Date`: Transaction date (DD/MM/YYYY)
- `رقم المرجعية` / `Reference Number`: Invoice/PO number
- `الوصف` / `Description`: Arabic transaction description
- `الحساب` / `Account Code`: GL code
- `المبلغ المدين` / `Debit`: Debit amount
- `المبلغ الدائن` / `Credit`: Credit amount

### 1.4 VAT-Specific Accounts
Wafeq includes built-in VAT accounts for UAE compliance:
- **Input VAT 5%**: GL code typically "2200" - taxes payable on purchases
- **Output VAT 5%**: GL code typically "3100" - taxes collected on sales
- These accounts are recognized automatically during mapping

---

## 2. Technical Integration Approach

### 2.1 Architecture Decision: Why File-Based Import

| Aspect | API | File-Based |
|--------|-----|-----------|
| Availability | Not exposed | Standard in Wafeq |
| Security | OAuth overhead | Direct file handling |
| Audit Trail | Optional logging | Native Wafeq exports |
| UAE Compliance | Varies | Built-in compliance |
| Rate Limits | Yes (usually) | N/A |
| Error Recovery | Token-based | Fingerprint-based dedup |

**Decision**: File-based CSV/Excel import with automated deduplication fingerprinting.

### 2.2 Data Flow

```
User's Wafeq Account
        ↓
    [Export File]
        ↓
    CSV/Excel File
        ↓
Ledgr Import Controller
        ↓
   CSV Parser (UTF-8)
        ↓
   Data Mapping Layer
   (GL Code → Ledgr Format)
        ↓
   Arabic Text Normalization
   (Preserve RTL, validate encoding)
        ↓
   Deduplication Check
   (Prevent duplicate imports)
        ↓
PostgreSQL Storage
(chart_of_accounts, customers, transactions)
```

---

## 3. Arabic Text Handling (Critical)

### 3.1 UTF-8 Encoding Requirements
- **Input**: CSV files with UTF-8 BOM (Byte Order Mark)
- **Validation**: Check for UTF-8 validity, reject invalid sequences
- **Storage**: PostgreSQL UTF-8 encoding (already configured)
- **Preservation**: Store Arabic text as-is, let frontend handle RTL rendering

### 3.2 Arabic Characters Supported
Test cases for validation:
- **ة** (teh marbuta) - Common ending character
- **ش** (sheen) - For words like "شركة" (company)
- **ض** (dad) - Arabic letter
- **ق** (qaf) - Common in customer names
- **فاتورة** (invoice) - Full word test
- **عميل** (customer) - Full word test
- **الأصول** (assets) - Word with diacritics

### 3.3 Dual-Language Storage Pattern
Wafeq exports often include both Arabic and English names. Ledgr stores both:

```typescript
interface LocalizedAccount {
  account_name_en: "Assets",
  account_name_ar: "الأصول",
  account_number: "1000",
  wafeq_gl_code: "1000"
}
```

### 3.4 Special Considerations
- **Diacritical Marks**: Preserve (ُ ِ َ etc.) - not stripped
- **Text Direction**: RTL directionality preserved in database
- **Currency Symbols**: Support AED (د.إ), USD ($)
- **Date Formats**: Wafeq exports typically use DD/MM/YYYY (regional format)

---

## 4. GL Code Mapping for UAE Compliance

### 4.1 Standard GL Structure in Wafeq

| GL Range | Category | Purpose | VAT Treatment |
|----------|----------|---------|---|
| 1000-1999 | Assets | Current + Fixed Assets | N/A |
| 2000-2999 | Liabilities | Payables, Loans | Applies |
| 3000-3999 | Equity | Capital, Retained Earnings | N/A |
| 4000-4999 | Income | Sales Revenue | Output VAT (5%) |
| 5000-5999 | Expenses | COGS, Operating Expenses | Input VAT (5%) |
| 6000-6999 | VAT Accounts | Tax Payable/Receivable | Special handling |

### 4.2 Mapping Examples

| Wafeq GL Code | Wafeq GL Name (AR) | Wafeq GL Name (EN) | Ledgr Account Type | Ledgr Category |
|---|---|---|---|---|
| 1000 | النقد في الصندوق | Cash on Hand | asset | current_asset |
| 1100 | النقد في البنك | Bank Account | asset | current_asset |
| 2100 | الحسابات الدائنة | Accounts Payable | liability | current_liability |
| 2200 | ضريبة الدخل المستحقة | Input VAT (5%) | liability | vat_payable |
| 3100 | رأس المال | Share Capital | equity | equity |
| 4000 | المبيعات | Sales Revenue | income | income |
| 5100 | تكلفة البضاعة المباعة | COGS | expense | expense |

### 4.3 VAT Account Detection
```typescript
// Automatically detect and flag VAT accounts
const vatPatterns = {
  input_vat: /ضريبة\s+(المدخلة|المشتريات|الدخل)/i,
  output_vat: /ضريبة\s+(المخرجات|المبيعات)/i
};
```

---

## 5. Database Schema Extensions

### 5.1 Chart of Accounts Table Updates
```sql
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_name_ar VARCHAR(255);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS wafeq_gl_code VARCHAR(50);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS wafeq_sync_id VARCHAR(255) UNIQUE;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS is_vat_account BOOLEAN DEFAULT false;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS vat_type VARCHAR(20);
```

### 5.2 Transactions Table Updates
```sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS wafeq_transaction_id VARCHAR(255) UNIQUE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS description_ar VARCHAR(500);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS imported_from_wafeq BOOLEAN DEFAULT false;
```

### 5.3 Integrations Table Updates
```sql
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS wafeq_last_file_imported_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS wafeq_import_count INTEGER DEFAULT 0;
```

---

## 6. CSV File Format Specifications

### 6.1 Chart of Accounts Export Format
**Encoding**: UTF-8 with BOM
**Delimiter**: Comma (,)

**Example**: `wafeq_coa_export.csv`
```
Account Code,Account Name (English),Account Name (Arabic),Account Type,Balance,Description
1000,Cash - Petty,النقد في الصندوق,Asset,15000.00,Operating cash
1100,Bank Account - AED,الحساب البنكي - درهم,Asset,250000.00,Primary business account
2100,Accounts Payable,الحسابات الدائنة,Liability,50000.00,Supplier invoices
2200,Input VAT 5%,ضريبة الدخل المدخلة,Liability,8500.00,VAT on purchases
```

---

## 7. Deduplication Strategy

### 7.1 Fingerprinting Algorithm
SHA-256 hash of normalized record combining date, amount, description, and GL code.

---

## 8. Implementation Checklist

- [ ] Create WafeqIntegration class extending BaseIntegration
- [ ] Implement CSV parser with UTF-8 validation
- [ ] Add GL code mapping logic
- [ ] Create Arabic text normalization utilities
- [ ] Build Wafeq controller with file upload endpoint
- [ ] Run schema migrations for Arabic columns
- [ ] Implement deduplication fingerprinting
- [ ] Test Arabic text preservation
- [ ] Test VAT account mapping
- [ ] End-to-end testing

---

## Document Version
- **Version**: 1.0
- **Date**: 2024-06-01
- **Status**: Final Specification
