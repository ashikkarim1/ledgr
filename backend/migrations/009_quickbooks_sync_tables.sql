-- ============================================================================
-- QUICKBOOKS INTEGRATION SYNC TABLES
-- Complete schema for QuickBooks Online data synchronization
-- Migration: 009_quickbooks_sync_tables.sql
-- Date: 2026-06-02
-- Description: Create dedicated tables for QB Chart of Accounts, Invoices,
--              Bills, Journal Entries, Customers, Vendors, and Bank Transactions
-- ============================================================================

-- ============================================================================
-- 1. QB_CHART_OF_ACCOUNTS - Chart of Accounts from QuickBooks
-- ============================================================================

CREATE TABLE IF NOT EXISTS qb_chart_of_accounts (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  realm_id VARCHAR(100) NOT NULL, -- QB Company ID
  
  -- Account identifiers
  qb_account_id VARCHAR(100) UNIQUE NOT NULL,
  account_number VARCHAR(50),
  account_name VARCHAR(255) NOT NULL,
  
  -- Account classification
  account_type VARCHAR(50) NOT NULL, -- Asset, Liability, Equity, Revenue, Expense
  account_subtype VARCHAR(100),
  
  -- Account details
  description TEXT,
  currency_code VARCHAR(3) DEFAULT 'AED',
  
  -- Current balance
  current_balance DECIMAL(15, 2) DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  status VARCHAR(50) DEFAULT 'active', -- active, archived
  
  -- Sync tracking
  qb_synced_at TIMESTAMP WITH TIME ZONE,
  qb_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced', -- synced, pending, failed
  ledgr_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_coa_org_id ON qb_chart_of_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_coa_realm_id ON qb_chart_of_accounts(realm_id);
CREATE INDEX IF NOT EXISTS idx_qb_coa_account_id ON qb_chart_of_accounts(qb_account_id);
CREATE INDEX IF NOT EXISTS idx_qb_coa_type ON qb_chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_qb_coa_active ON qb_chart_of_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_qb_coa_sync_status ON qb_chart_of_accounts(sync_status);

-- ============================================================================
-- 2. QB_CUSTOMERS - Customer master data from QuickBooks
-- ============================================================================

CREATE TABLE IF NOT EXISTS qb_customers (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  realm_id VARCHAR(100) NOT NULL,
  
  -- Customer identifiers
  qb_customer_id VARCHAR(100) UNIQUE NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  
  -- Contact information
  email VARCHAR(255),
  phone VARCHAR(20),
  fax VARCHAR(20),
  website VARCHAR(255),
  
  -- Address information
  billing_address_line1 VARCHAR(255),
  billing_address_line2 VARCHAR(255),
  billing_city VARCHAR(100),
  billing_state VARCHAR(50),
  billing_postal_code VARCHAR(20),
  billing_country VARCHAR(100),
  
  shipping_address_line1 VARCHAR(255),
  shipping_address_line2 VARCHAR(255),
  shipping_city VARCHAR(100),
  shipping_state VARCHAR(50),
  shipping_postal_code VARCHAR(20),
  shipping_country VARCHAR(100),
  
  -- Credit and balance information
  credit_limit DECIMAL(15, 2),
  current_balance DECIMAL(15, 2) DEFAULT 0,
  total_outstanding DECIMAL(15, 2) DEFAULT 0,
  
  -- Tax and payment
  tax_id VARCHAR(50),
  payment_terms VARCHAR(100),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Sync tracking
  qb_synced_at TIMESTAMP WITH TIME ZONE,
  qb_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced',
  ledgr_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_cust_org_id ON qb_customers(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_cust_realm_id ON qb_customers(realm_id);
CREATE INDEX IF NOT EXISTS idx_qb_cust_id ON qb_customers(qb_customer_id);
CREATE INDEX IF NOT EXISTS idx_qb_cust_name ON qb_customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_qb_cust_active ON qb_customers(is_active);
CREATE INDEX IF NOT EXISTS idx_qb_cust_sync_status ON qb_customers(sync_status);

-- ============================================================================
-- 3. QB_VENDORS - Vendor master data from QuickBooks
-- ============================================================================

CREATE TABLE IF NOT EXISTS qb_vendors (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  realm_id VARCHAR(100) NOT NULL,
  
  -- Vendor identifiers
  qb_vendor_id VARCHAR(100) UNIQUE NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  
  -- Contact information
  email VARCHAR(255),
  phone VARCHAR(20),
  fax VARCHAR(20),
  website VARCHAR(255),
  
  -- Address information
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  
  -- Tax and payment
  tax_id VARCHAR(50),
  payment_terms VARCHAR(100),
  payment_method VARCHAR(50),
  
  -- Billing and balance
  account_number VARCHAR(50),
  current_balance DECIMAL(15, 2) DEFAULT 0,
  total_outstanding DECIMAL(15, 2) DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Sync tracking
  qb_synced_at TIMESTAMP WITH TIME ZONE,
  qb_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced',
  ledgr_vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_vend_org_id ON qb_vendors(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_vend_realm_id ON qb_vendors(realm_id);
CREATE INDEX IF NOT EXISTS idx_qb_vend_id ON qb_vendors(qb_vendor_id);
CREATE INDEX IF NOT EXISTS idx_qb_vend_name ON qb_vendors(vendor_name);
CREATE INDEX IF NOT EXISTS idx_qb_vend_active ON qb_vendors(is_active);
CREATE INDEX IF NOT EXISTS idx_qb_vend_sync_status ON qb_vendors(sync_status);

-- ============================================================================
-- 4. QB_INVOICES - Accounts Receivable invoices from QuickBooks
-- ============================================================================

CREATE TABLE IF NOT EXISTS qb_invoices (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  realm_id VARCHAR(100) NOT NULL,
  
  -- Invoice identifiers
  qb_invoice_id VARCHAR(100) UNIQUE NOT NULL,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  
  -- Customer information
  qb_customer_id VARCHAR(100) NOT NULL,
  customer_name VARCHAR(255),
  
  -- Amount details
  subtotal DECIMAL(15, 2) DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL,
  balance DECIMAL(15, 2),
  currency_code VARCHAR(3) DEFAULT 'AED',
  
  -- Payment information
  paid_amount DECIMAL(15, 2) DEFAULT 0,
  remaining_amount DECIMAL(15, 2),
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'Draft', -- Draft, Sent, Open, Overdue, Paid, Voided
  payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid, partial, paid
  
  -- Payment details
  payment_terms VARCHAR(100),
  payment_method_ref VARCHAR(100),
  
  -- Description
  description TEXT,
  notes TEXT,
  
  -- Sync tracking
  qb_synced_at TIMESTAMP WITH TIME ZONE,
  qb_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced',
  ledgr_invoice_id UUID REFERENCES vat_invoices(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT check_amounts CHECK (paid_amount >= 0 AND paid_amount <= total_amount)
);

CREATE INDEX IF NOT EXISTS idx_qb_inv_org_id ON qb_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_inv_realm_id ON qb_invoices(realm_id);
CREATE INDEX IF NOT EXISTS idx_qb_inv_id ON qb_invoices(qb_invoice_id);
CREATE INDEX IF NOT EXISTS idx_qb_inv_number ON qb_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_qb_inv_customer ON qb_invoices(qb_customer_id);
CREATE INDEX IF NOT EXISTS idx_qb_inv_date ON qb_invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_qb_inv_status ON qb_invoices(status);
CREATE INDEX IF NOT EXISTS idx_qb_inv_sync_status ON qb_invoices(sync_status);

-- ============================================================================
-- 5. QB_BILLS - Accounts Payable bills from QuickBooks
-- ============================================================================

CREATE TABLE IF NOT EXISTS qb_bills (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  realm_id VARCHAR(100) NOT NULL,
  
  -- Bill identifiers
  qb_bill_id VARCHAR(100) UNIQUE NOT NULL,
  bill_number VARCHAR(50) NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE,
  
  -- Vendor information
  qb_vendor_id VARCHAR(100) NOT NULL,
  vendor_name VARCHAR(255),
  
  -- Amount details
  subtotal DECIMAL(15, 2) DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL,
  balance DECIMAL(15, 2),
  currency_code VARCHAR(3) DEFAULT 'AED',
  
  -- Payment information
  paid_amount DECIMAL(15, 2) DEFAULT 0,
  remaining_amount DECIMAL(15, 2),
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'Draft', -- Draft, Sent, Open, Overdue, Paid, Voided
  payment_status VARCHAR(50) DEFAULT 'unpaid',
  
  -- Payment details
  payment_terms VARCHAR(100),
  payment_method_ref VARCHAR(100),
  
  -- Description
  description TEXT,
  notes TEXT,
  
  -- Sync tracking
  qb_synced_at TIMESTAMP WITH TIME ZONE,
  qb_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced',
  ledgr_bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT check_amounts CHECK (paid_amount >= 0 AND paid_amount <= total_amount)
);

CREATE INDEX IF NOT EXISTS idx_qb_bill_org_id ON qb_bills(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_bill_realm_id ON qb_bills(realm_id);
CREATE INDEX IF NOT EXISTS idx_qb_bill_id ON qb_bills(qb_bill_id);
CREATE INDEX IF NOT EXISTS idx_qb_bill_number ON qb_bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_qb_bill_vendor ON qb_bills(qb_vendor_id);
CREATE INDEX IF NOT EXISTS idx_qb_bill_date ON qb_bills(bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_qb_bill_status ON qb_bills(status);
CREATE INDEX IF NOT EXISTS idx_qb_bill_sync_status ON qb_bills(sync_status);

-- ============================================================================
-- 6. QB_JOURNAL_ENTRIES - General Ledger entries from QuickBooks
-- ============================================================================

CREATE TABLE IF NOT EXISTS qb_journal_entries (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  realm_id VARCHAR(100) NOT NULL,
  
  -- Journal entry identifiers
  qb_journal_entry_id VARCHAR(100) UNIQUE NOT NULL,
  journal_entry_number VARCHAR(50),
  transaction_date DATE NOT NULL,
  
  -- Details
  description TEXT,
  notes TEXT,
  
  -- Reference
  reference_id VARCHAR(100),
  reference_type VARCHAR(50), -- Invoice, Bill, Expense, etc.
  
  -- Amount tracking (total debits = total credits)
  total_debits DECIMAL(15, 2) DEFAULT 0,
  total_credits DECIMAL(15, 2) DEFAULT 0,
  
  -- Status
  status VARCHAR(50) DEFAULT 'posted', -- draft, posted
  
  -- Sync tracking
  qb_synced_at TIMESTAMP WITH TIME ZONE,
  qb_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced',
  ledgr_journal_id BIGINT REFERENCES wafeq_gl_entries(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_je_org_id ON qb_journal_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_je_realm_id ON qb_journal_entries(realm_id);
CREATE INDEX IF NOT EXISTS idx_qb_je_id ON qb_journal_entries(qb_journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_qb_je_date ON qb_journal_entries(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_qb_je_sync_status ON qb_journal_entries(sync_status);

-- ============================================================================
-- 7. QB_BANK_TRANSACTIONS - Bank transactions from QuickBooks
-- ============================================================================

CREATE TABLE IF NOT EXISTS qb_bank_transactions (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  realm_id VARCHAR(100) NOT NULL,
  
  -- Transaction identifiers
  qb_transaction_id VARCHAR(100) UNIQUE NOT NULL,
  qb_account_id VARCHAR(100),
  account_name VARCHAR(255),
  
  -- Transaction details
  transaction_date DATE NOT NULL,
  transaction_type VARCHAR(50), -- Check, Deposit, Transfer, Payment, etc.
  transaction_number VARCHAR(50),
  
  -- Amount
  amount DECIMAL(15, 2) NOT NULL,
  currency_code VARCHAR(3) DEFAULT 'AED',
  
  -- Description
  payee_name VARCHAR(255),
  description TEXT,
  memo TEXT,
  
  -- Reconciliation
  is_reconciled BOOLEAN DEFAULT FALSE,
  reconciliation_date TIMESTAMP WITH TIME ZONE,
  
  -- Sync tracking
  qb_synced_at TIMESTAMP WITH TIME ZONE,
  qb_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_bank_org_id ON qb_bank_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_bank_realm_id ON qb_bank_transactions(realm_id);
CREATE INDEX IF NOT EXISTS idx_qb_bank_txn_id ON qb_bank_transactions(qb_transaction_id);
CREATE INDEX IF NOT EXISTS idx_qb_bank_account ON qb_bank_transactions(qb_account_id);
CREATE INDEX IF NOT EXISTS idx_qb_bank_date ON qb_bank_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_qb_bank_reconciled ON qb_bank_transactions(is_reconciled);

-- ============================================================================
-- 8. QB_SYNC_LOG - Tracking QB sync operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS qb_sync_log (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  realm_id VARCHAR(100) NOT NULL,
  
  -- Sync identifiers
  sync_type VARCHAR(50) NOT NULL, -- full, incremental
  sync_data_type VARCHAR(50) NOT NULL, -- accounts, customers, vendors, invoices, bills, journal_entries
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
  error_message TEXT,
  
  -- Record counts
  records_fetched INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  
  -- Query tracking
  query_string TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_sync_log_org ON qb_sync_log(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_sync_log_realm ON qb_sync_log(realm_id);
CREATE INDEX IF NOT EXISTS idx_qb_sync_log_status ON qb_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_qb_sync_log_created ON qb_sync_log(created_at DESC);

-- ============================================================================
-- 9. QB_CONNECTIONS - Connection state and tokens
-- ============================================================================

CREATE TABLE IF NOT EXISTS qb_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL,
  realm_id VARCHAR(100) NOT NULL, -- QB Company ID
  company_name VARCHAR(255) NOT NULL,
  
  -- OAuth tokens (encrypted in production)
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Connection status
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, inactive, expired
  is_healthy BOOLEAN DEFAULT TRUE,
  last_health_check TIMESTAMP WITH TIME ZONE,
  
  -- Sync scheduling
  last_full_sync_at TIMESTAMP WITH TIME ZONE,
  last_incremental_sync_at TIMESTAMP WITH TIME ZONE,
  next_scheduled_sync TIMESTAMP WITH TIME ZONE,
  auto_sync_enabled BOOLEAN DEFAULT TRUE,
  sync_frequency_minutes INTEGER DEFAULT 15,
  
  -- Timestamps
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(org_id, realm_id)
);

CREATE INDEX IF NOT EXISTS idx_qb_conn_org ON qb_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_qb_conn_realm ON qb_connections(realm_id);
CREATE INDEX IF NOT EXISTS idx_qb_conn_status ON qb_connections(status);
CREATE INDEX IF NOT EXISTS idx_qb_conn_next_sync ON qb_connections(next_scheduled_sync);

-- ============================================================================
-- End of QuickBooks Sync Tables Migration
-- ============================================================================