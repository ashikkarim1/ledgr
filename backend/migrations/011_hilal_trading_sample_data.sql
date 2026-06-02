-- ============================================================================
-- HILAL TRADING FZ-LLC SAMPLE ACCOUNTING DATA
-- Comprehensive seed data for integrated Wafeq and QuickBooks sync
-- Migration: 011_hilal_trading_sample_data.sql
-- Date: 2026-06-02
-- Description: Populate Hilal Trading FZ-LLC with realistic GL, AR, AP, bank,
--              and VAT data from both Wafeq and QuickBooks integrations
-- ============================================================================

-- Organization ID: f47ac10b-58cc-4372-a567-0e02b2c3d479
-- Company Details: Hilal Trading FZ-LLC, JAFZA, Dubai
-- Wafeq Company ID: hilal_trading_jafza
-- QuickBooks Realm ID: 9130358975

-- ============================================================================
-- 1. WAFEQ CONNECTIONS - Setup synced connection
-- ============================================================================

INSERT INTO wafeq_connections (
  org_id, company_id, company_name, access_token, refresh_token,
  token_expires_at, status, is_healthy, last_health_check,
  last_full_sync_at, last_incremental_sync_at, next_scheduled_sync,
  auto_sync_enabled, sync_frequency_minutes
) VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'hilal_trading_jafza',
  'Hilal Trading FZ-LLC',
  'wafeq_access_token_xyz_2026',
  'wafeq_refresh_token_xyz_2026',
  NOW() + INTERVAL '24 hours',
  'active',
  true,
  NOW(),
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '15 minutes',
  NOW() + INTERVAL '15 minutes',
  true,
  15
) ON CONFLICT (org_id, company_id) DO NOTHING;

-- ============================================================================
-- 2. QUICKBOOKS CONNECTIONS - Setup synced connection
-- ============================================================================

INSERT INTO qb_connections (
  org_id, realm_id, company_name, access_token, refresh_token,
  token_expires_at, status, is_healthy, last_health_check,
  last_full_sync_at, last_incremental_sync_at, next_scheduled_sync,
  auto_sync_enabled, sync_frequency_minutes
) VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  '9130358975',
  'Hilal Trading FZ-LLC',
  'qb_access_token_abc_2026',
  'qb_refresh_token_abc_2026',
  NOW() + INTERVAL '24 hours',
  'active',
  true,
  NOW(),
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '15 minutes',
  NOW() + INTERVAL '15 minutes',
  true,
  15
) ON CONFLICT (org_id, realm_id) DO NOTHING;

-- ============================================================================
-- 3. WAFEQ GL ENTRIES - Sample journal entries
-- ============================================================================

INSERT INTO wafeq_gl_entries (
  org_id, company_id, wafeq_entry_id, journal_id, journal_name,
  entry_number, account_code, account_name, entry_date,
  debit_amount, credit_amount, amount_aed, is_vat_entry,
  vat_type, vat_amount, vat_rate, description, wafeq_synced_at,
  last_synced_at, sync_status
) VALUES
-- Sales Invoice GL Entry - VAT Output
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_gl_001', 'SJ001', 'Sales Journal',
 '001', '1100', 'Trade Receivables', '2026-06-01',
 105000.00, 0, 105000.00, true, 'output', 5000.00, 5.00,
 'Invoice HT-2026-001 - Office Supplies Export to Abu Dhabi', NOW(), NOW(), 'synced'),

-- Sales VAT Output GL Entry
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_gl_002', 'SJ001', 'Sales Journal',
 '002', '2200', 'VAT Payable', '2026-06-01',
 0, 5000.00, -5000.00, true, 'output', 5000.00, 5.00,
 'VAT on Invoice HT-2026-001', NOW(), NOW(), 'synced'),

-- Revenue Recognition
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_gl_003', 'SJ001', 'Sales Journal',
 '003', '4100', 'Sales Revenue', '2026-06-01',
 0, 100000.00, -100000.00, false, null, 0, null,
 'Revenue from Invoice HT-2026-001', NOW(), NOW(), 'synced'),

-- Purchase Invoice GL Entry - VAT Input
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_gl_004', 'PJ001', 'Purchases Journal',
 '004', '5100', 'Cost of Goods Sold', '2026-05-28',
 47500.00, 0, 47500.00, true, 'input', 2500.00, 5.00,
 'Bill from Al-Noor Suppliers - Equipment', NOW(), NOW(), 'synced'),

-- Purchase VAT Input GL Entry
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_gl_005', 'PJ001', 'Purchases Journal',
 '005', '1250', 'VAT Recoverable (Input VAT)', '2026-05-28',
 2500.00, 0, 2500.00, true, 'input', 2500.00, 5.00,
 'Input VAT from Bill ALN-2026-005', NOW(), NOW(), 'synced'),

-- Accounts Payable
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_gl_006', 'PJ001', 'Purchases Journal',
 '006', '2100', 'Trade Payables', '2026-05-28',
 0, 50000.00, -50000.00, false, null, 0, null,
 'Payable to Al-Noor Suppliers', NOW(), NOW(), 'synced'),

-- Bank Deposit GL Entry
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_gl_007', 'BJ001', 'Bank Journal',
 '007', '1000', 'Bank Account - AED', '2026-06-02',
 105000.00, 0, 105000.00, false, null, 0, null,
 'Customer Payment - Invoice HT-2026-001', NOW(), NOW(), 'synced'),

-- Sales Receivable Offset
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_gl_008', 'BJ001', 'Bank Journal',
 '008', '1100', 'Trade Receivables', '2026-06-02',
 0, 105000.00, -105000.00, false, null, 0, null,
 'Offset for Invoice HT-2026-001 Payment', NOW(), NOW(), 'synced');

-- ============================================================================
-- 4. WAFEQ INVOICES - Sample AR invoices
-- ============================================================================

INSERT INTO wafeq_invoices (
  org_id, company_id, wafeq_invoice_id, invoice_number, invoice_date,
  due_date, customer_code, customer_name, gross_amount, tax_amount,
  tax_type, tax_rate, net_amount, paid_amount, remaining_amount,
  status, payment_status, description, wafeq_synced_at, last_synced_at,
  sync_status
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_inv_001',
 'HT-2026-001', '2026-06-01', '2026-07-01',
 'CUST001', 'Gulf Trading Company', 105000.00, 5000.00,
 'VAT', 5.00, 100000.00, 105000.00, 0,
 'issued', 'paid', 'Office Supplies Export',
 NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_inv_002',
 'HT-2026-002', '2026-05-25', '2026-06-25',
 'CUST002', 'Emirates Industrial Services', 84000.00, 4000.00,
 'VAT', 5.00, 80000.00, 42000.00, 42000.00,
 'issued', 'partial', 'Machinery Rental Services',
 NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_inv_003',
 'HT-2026-003', '2026-05-15', '2026-06-15',
 'CUST003', 'Dubai Port Authority', 147000.00, 7000.00,
 'VAT', 5.00, 140000.00, 0, 147000.00,
 'issued', 'unpaid', 'Cargo Handling & Logistics',
 NOW(), NOW(), 'synced');

-- ============================================================================
-- 5. WAFEQ BILLS - Sample AP bills
-- ============================================================================

INSERT INTO wafeq_bills (
  org_id, company_id, wafeq_bill_id, bill_number, bill_date,
  due_date, vendor_code, vendor_name, gross_amount, tax_amount,
  tax_type, tax_rate, net_amount, paid_amount, remaining_amount,
  status, payment_status, description, wafeq_synced_at, last_synced_at,
  sync_status
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_bill_001',
 'ALN-2026-005', '2026-05-28', '2026-06-27',
 'VEND001', 'Al-Noor Suppliers', 50000.00, 2500.00,
 'VAT', 5.00, 47500.00, 0, 50000.00,
 'received', 'unpaid', 'Equipment & Spare Parts',
 NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_bill_002',
 'DPS-2026-012', '2026-05-20', '2026-06-20',
 'VEND002', 'Dubai Power Solutions', 10500.00, 500.00,
 'VAT', 5.00, 10000.00, 10500.00, 0,
 'received', 'paid', 'Electricity & Utilities',
 NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_bill_003',
 'DLS-2026-008', '2026-06-01', '2026-07-01',
 'VEND003', 'Dubai Logistics Services', 94500.00, 4500.00,
 'VAT', 5.00, 90000.00, 47250.00, 47250.00,
 'received', 'partial', 'Freight & Transport',
 NOW(), NOW(), 'synced');

-- ============================================================================
-- 6. WAFEQ BANK TRANSACTIONS - Bank reconciliation data
-- ============================================================================

INSERT INTO wafeq_bank_transactions (
  org_id, company_id, wafeq_transaction_id, bank_transaction_number,
  bank_account_code, bank_account_name, transaction_date, value_date,
  debit_amount, credit_amount, amount_aed, description,
  is_reconciled, reconciled_at, wafeq_synced_at, last_synced_at,
  sync_status
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_bank_001',
 'CHQ-2026-001', '1000', 'Bank Account - AED', '2026-06-02', '2026-06-02',
 0, 105000.00, 105000.00, 'Customer Payment - Invoice HT-2026-001',
 true, NOW(), NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_bank_002',
 'XFER-2026-001', '1000', 'Bank Account - AED', '2026-06-01', '2026-06-01',
 10500.00, 0, -10500.00, 'Wire Transfer - DPS Bill Payment',
 true, NOW(), NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_bank_003',
 'DEP-2026-001', '1000', 'Bank Account - AED', '2026-05-30', '2026-05-30',
 0, 42000.00, 42000.00, 'Partial Payment - Invoice HT-2026-002',
 true, NOW(), NOW(), NOW(), 'synced');

-- ============================================================================
-- 7. WAFEQ VAT RETURNS - Tax compliance tracking
-- ============================================================================

INSERT INTO wafeq_vat_returns (
  org_id, company_id, wafeq_return_id, return_period, return_year,
  return_quarter, total_output_vat, total_input_vat, net_vat_payable,
  status, tax_authority, wafeq_synced_at, last_synced_at, sync_status
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_vat_001',
 '2026-Q2', 2026, 2, 9000.00, 2500.00, 6500.00,
 'draft', 'FTA', NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza', 'wafeq_vat_002',
 '2026-Q1', 2026, 1, 8500.00, 2000.00, 6500.00,
 'filed', 'FTA', NOW(), NOW(), 'synced');

-- ============================================================================
-- 8. QUICKBOOKS CHART OF ACCOUNTS
-- ============================================================================

INSERT INTO qb_chart_of_accounts (
  org_id, realm_id, qb_account_id, account_number, account_name,
  account_type, account_subtype, current_balance, is_active,
  qb_synced_at, last_synced_at, sync_status
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_acc_001',
 '1000', 'Checking Account', 'Asset', 'Cash', 147500.00, true, NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_acc_002',
 '1100', 'Accounts Receivable', 'Asset', 'AccountsReceivable', 189000.00, true, NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_acc_003',
 '1200', 'Inventory', 'Asset', 'FixedAsset', 250000.00, true, NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_acc_004',
 '2100', 'Accounts Payable', 'Liability', 'AccountsPayable', 97250.00, true, NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_acc_005',
 '2200', 'Sales Tax Payable', 'Liability', 'OtherCurrentLiability', 6500.00, true, NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_acc_006',
 '3100', 'Retained Earnings', 'Equity', 'RetainedEarnings', 500000.00, true, NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_acc_007',
 '4100', 'Sales Revenue', 'Revenue', 'SalesOfProductIncome', 320000.00, true, NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_acc_008',
 '5100', 'Cost of Goods Sold', 'Expense', 'CostOfGoodsSold', 127500.00, true, NOW(), NOW(), 'synced');

-- ============================================================================
-- 9. QUICKBOOKS CUSTOMERS
-- ============================================================================

INSERT INTO qb_customers (
  org_id, realm_id, qb_customer_id, customer_name, display_name,
  email, phone, billing_city, billing_country, current_balance,
  is_active, qb_synced_at, last_synced_at, sync_status
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_cust_001',
 'Gulf Trading Company', 'Gulf Trading Co.', 'sales@gulftrade.ae', '+971-4-123-4567',
 'Dubai', 'United Arab Emirates', 0, true, NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_cust_002',
 'Emirates Industrial Services', 'EIS LLC', 'procurement@eis.ae', '+971-4-567-8901',
 'Abu Dhabi', 'United Arab Emirates', 42000.00, true, NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_cust_003',
 'Dubai Port Authority', 'DP Authority', 'payments@dubaiport.ae', '+971-4-789-0123',
 'Dubai', 'United Arab Emirates', 147000.00, true, NOW(), NOW(), 'synced');

-- ============================================================================
-- 10. QUICKBOOKS VENDORS
-- ============================================================================

INSERT INTO qb_vendors (
  org_id, realm_id, qb_vendor_id, vendor_name, display_name,
  email, phone, city, country, current_balance, is_active,
  qb_synced_at, last_synced_at, sync_status
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_vend_001',
 'Al-Noor Suppliers', 'Al-Noor LLC', 'sales@alnoor.ae', '+971-4-200-1000',
 'Dubai', 'United Arab Emirates', 50000.00, true, NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_vend_002',
 'Dubai Power Solutions', 'DPS UAE', 'billing@dubaipower.ae', '+971-4-234-5678',
 'Dubai', 'United Arab Emirates', 0, true, NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_vend_003',
 'Dubai Logistics Services', 'DLS Services', 'accounts@dls.ae', '+971-4-345-6789',
 'Dubai', 'United Arab Emirates', 47250.00, true, NOW(), NOW(), 'synced');

-- ============================================================================
-- 11. QUICKBOOKS INVOICES
-- ============================================================================

INSERT INTO qb_invoices (
  org_id, realm_id, qb_invoice_id, invoice_number, invoice_date,
  due_date, qb_customer_id, customer_name, subtotal, tax_amount,
  total_amount, balance, paid_amount, remaining_amount,
  status, payment_status, description, qb_synced_at, last_synced_at,
  sync_status
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_inv_001',
 'HT-2026-001', '2026-06-01', '2026-07-01',
 'qb_cust_001', 'Gulf Trading Co.', 100000.00, 5000.00,
 '105000.00', 0, 105000.00, 0,
 'Paid', 'paid', 'Office Supplies Export', NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_inv_002',
 'HT-2026-002', '2026-05-25', '2026-06-25',
 'qb_cust_002', 'EIS LLC', 80000.00, 4000.00,
 '84000.00', 42000.00, 42000.00, 42000.00,
 'Open', 'partial', 'Machinery Rental Services', NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_inv_003',
 'HT-2026-003', '2026-05-15', '2026-06-15',
 'qb_cust_003', 'DP Authority', 140000.00, 7000.00,
 '147000.00', 147000.00, 0, 147000.00,
 'Open', 'unpaid', 'Cargo Handling & Logistics', NOW(), NOW(), 'synced');

-- ============================================================================
-- 12. QUICKBOOKS BILLS
-- ============================================================================

INSERT INTO qb_bills (
  org_id, realm_id, qb_bill_id, bill_number, bill_date,
  due_date, qb_vendor_id, vendor_name, subtotal, tax_amount,
  total_amount, balance, paid_amount, remaining_amount,
  status, payment_status, description, qb_synced_at, last_synced_at,
  sync_status
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_bill_001',
 'ALN-2026-005', '2026-05-28', '2026-06-27',
 'qb_vend_001', 'Al-Noor LLC', 47500.00, 2500.00,
 '50000.00', 50000.00, 0, 50000.00,
 'Open', 'unpaid', 'Equipment & Spare Parts', NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_bill_002',
 'DPS-2026-012', '2026-05-20', '2026-06-20',
 'qb_vend_002', 'DPS UAE', 10000.00, 500.00,
 '10500.00', 0, 10500.00, 0,
 'Paid', 'paid', 'Electricity & Utilities', NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_bill_003',
 'DLS-2026-008', '2026-06-01', '2026-07-01',
 'qb_vend_003', 'DLS Services', 90000.00, 4500.00,
 '94500.00', 47250.00, 47250.00, 47250.00,
 'Open', 'partial', 'Freight & Transport', NOW(), NOW(), 'synced');

-- ============================================================================
-- 13. QUICKBOOKS JOURNAL ENTRIES
-- ============================================================================

INSERT INTO qb_journal_entries (
  org_id, realm_id, qb_journal_entry_id, journal_entry_number,
  transaction_date, description, total_debits, total_credits,
  status, qb_synced_at, last_synced_at, sync_status
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_je_001',
 'JE-001', '2026-06-01', 'Sales Journal Entry - Invoice HT-2026-001',
 105000.00, 105000.00, 'posted', NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_je_002',
 'JE-002', '2026-05-28', 'Purchase Journal Entry - Bill ALN-2026-005',
 50000.00, 50000.00, 'posted', NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_je_003',
 'JE-003', '2026-06-02', 'Bank Reconciliation - Customer Payment',
 105000.00, 105000.00, 'posted', NOW(), NOW(), 'synced');

-- ============================================================================
-- 14. QUICKBOOKS BANK TRANSACTIONS
-- ============================================================================

INSERT INTO qb_bank_transactions (
  org_id, realm_id, qb_transaction_id, qb_account_id, account_name,
  transaction_date, transaction_type, amount, payee_name,
  is_reconciled, reconciliation_date, qb_synced_at, last_synced_at,
  sync_status
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_bank_001',
 'qb_acc_001', 'Checking Account', '2026-06-02', 'Deposit', 105000.00,
 'Gulf Trading Company', true, NOW(), NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_bank_002',
 'qb_acc_001', 'Checking Account', '2026-06-01', 'Check', -10500.00,
 'Dubai Power Solutions', true, NOW(), NOW(), NOW(), 'synced'),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975', 'qb_bank_003',
 'qb_acc_001', 'Checking Account', '2026-05-30', 'Transfer', 42000.00,
 'Emirates Industrial Services', true, NOW(), NOW(), NOW(), 'synced');

-- ============================================================================
-- 15. WAFEQ SYNC LOG - Record successful syncs
-- ============================================================================

INSERT INTO wafeq_sync_log (
  org_id, company_id, sync_type, sync_data_type, status,
  records_fetched, records_created, records_updated,
  started_at, completed_at, duration_seconds
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza',
 'full', 'gl', 'success', 8, 8, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '30 seconds', 30),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza',
 'full', 'invoices', 'success', 3, 3, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '20 seconds', 20),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza',
 'full', 'bills', 'success', 3, 3, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '15 seconds', 15),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza',
 'full', 'bank', 'success', 3, 3, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '10 seconds', 10),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'hilal_trading_jafza',
 'full', 'vat', 'success', 2, 2, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '5 seconds', 5);

-- ============================================================================
-- 16. QUICKBOOKS SYNC LOG - Record successful syncs
-- ============================================================================

INSERT INTO qb_sync_log (
  org_id, realm_id, sync_type, sync_data_type, status,
  records_fetched, records_created, records_updated,
  started_at, completed_at, duration_seconds
) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975',
 'full', 'accounts', 'success', 8, 8, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '25 seconds', 25),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975',
 'full', 'customers', 'success', 3, 3, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '15 seconds', 15),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975',
 'full', 'vendors', 'success', 3, 3, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '12 seconds', 12),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975',
 'full', 'invoices', 'success', 3, 3, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '18 seconds', 18),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975',
 'full', 'bills', 'success', 3, 3, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '16 seconds', 16),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975',
 'full', 'journal_entries', 'success', 3, 3, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '14 seconds', 14),

('f47ac10b-58cc-4372-a567-0e02b2c3d479', '9130358975',
 'full', 'bank', 'success', 3, 3, 0,
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '9 seconds', 9);

-- ============================================================================
-- 17. SYNC TASK QUEUE - Agent assignments
-- ============================================================================

INSERT INTO hilal_sync_tasks (
  org_id, task_type, data_type, assigned_agent_id, status,
  priority, source_system, destination_system,
  started_at, completed_at, duration_seconds, records_processed,
  sync_id
) VALUES
-- Completed GL sync task
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'wafeq_sync', 'gl',
 (SELECT id FROM agents WHERE org_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' AND role = 'reconciliation' LIMIT 1),
 'completed', 1, 'wafeq', 'ledgr',
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '30 seconds', 30, 8, 'sync_gl_001'),

-- Completed AR sync task
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'wafeq_sync', 'invoices',
 (SELECT id FROM agents WHERE org_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' AND role = 'ar'),
 'completed', 1, 'wafeq', 'ledgr',
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '20 seconds', 20, 3, 'sync_ar_001'),

-- Completed AP sync task
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'wafeq_sync', 'bills',
 (SELECT id FROM agents WHERE org_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' AND role = 'ap'),
 'completed', 1, 'wafeq', 'ledgr',
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '15 seconds', 15, 3, 'sync_ap_001'),

-- Completed Bank Reconciliation task
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'wafeq_sync', 'bank',
 (SELECT id FROM agents WHERE org_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' AND role = 'reconciliation' AND specialization @> ARRAY['bank_reconciliation']),
 'completed', 1, 'wafeq', 'ledgr',
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '10 seconds', 10, 3, 'sync_bank_001'),

-- Completed QB AR sync task
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'quickbooks_sync', 'invoices',
 (SELECT id FROM agents WHERE org_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' AND role = 'ar'),
 'completed', 1, 'quickbooks', 'ledgr',
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '18 seconds', 18, 3, 'sync_qb_ar_001'),

-- Completed QB AP sync task
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'quickbooks_sync', 'bills',
 (SELECT id FROM agents WHERE org_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' AND role = 'ap'),
 'completed', 1, 'quickbooks', 'ledgr',
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '16 seconds', 16, 3, 'sync_qb_ap_001'),

-- Pending cross-system reconciliation task
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'reconciliation', 'gl',
 (SELECT id FROM agents WHERE org_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' AND specialization @> ARRAY['cross_system_reconciliation']),
 'pending', 2, 'wafeq', 'quickbooks',
 NULL, NULL, NULL, 0, NULL);

-- ============================================================================
-- End of Hilal Trading Sample Data Migration
-- ============================================================================