-- ============================================================================
-- WAFEQ INTEGRATION SYNC TABLES
-- Complete schema for Wafeq data synchronization
-- Migration: 008_wafeq_sync_tables.sql
-- Date: 2026-06-02
-- Description: Create dedicated tables for Wafeq GL entries, invoices, bills, 
--              bank transactions, and VAT returns with full sync tracking
-- ============================================================================

-- ============================================================================
-- 1. WAFEQ_GL_ENTRIES - General Ledger entries from Wafeq
-- ============================================================================

CREATE TABLE IF NOT EXISTS wafeq_gl_entries (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  company_id VARCHAR(100) NOT NULL, -- Wafeq company identifier
  
  -- GL Entry identifiers
  wafeq_entry_id VARCHAR(100) UNIQUE NOT NULL,
  journal_id VARCHAR(100),
  journal_name VARCHAR(255),
  entry_number VARCHAR(50),
  
  -- Account information
  account_code VARCHAR(20) NOT NULL,
  account_name VARCHAR(255),
  account_name_ar VARCHAR(255),
  
  -- Entry details
  entry_date DATE NOT NULL,
  description TEXT,
  description_ar TEXT,
  
  -- Amount details
  debit_amount DECIMAL(15, 2) DEFAULT 0,
  credit_amount DECIMAL(15, 2) DEFAULT 0,
  amount_aed DECIMAL(15, 2), -- Amount in AED
  currency_code VARCHAR(3) DEFAULT 'AED',
  
  -- Reference information
  reference_document_type VARCHAR(50), -- invoice, bill, payment, etc.
  reference_document_id VARCHAR(100),
  
  -- VAT tracking
  is_vat_entry BOOLEAN DEFAULT FALSE,
  vat_type VARCHAR(20), -- input, output
  vat_amount DECIMAL(15, 2),
  vat_rate DECIMAL(5, 2),
  
  -- Sync tracking
  wafeq_synced_at TIMESTAMP WITH TIME ZONE,
  wafeq_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced', -- synced, pending, failed
  ledgr_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT check_amounts CHECK (debit_amount >= 0 AND credit_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_wafeq_gl_org_id ON wafeq_gl_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_gl_company_id ON wafeq_gl_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_gl_entry_id ON wafeq_gl_entries(wafeq_entry_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_gl_account_code ON wafeq_gl_entries(account_code);
CREATE INDEX IF NOT EXISTS idx_wafeq_gl_entry_date ON wafeq_gl_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_wafeq_gl_sync_status ON wafeq_gl_entries(sync_status);
CREATE INDEX IF NOT EXISTS idx_wafeq_gl_is_vat ON wafeq_gl_entries(is_vat_entry);

-- ============================================================================
-- 2. WAFEQ_INVOICES - Accounts Receivable (AR) invoices from Wafeq
-- ============================================================================

CREATE TABLE IF NOT EXISTS wafeq_invoices (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  company_id VARCHAR(100) NOT NULL,
  
  -- Invoice identifiers
  wafeq_invoice_id VARCHAR(100) UNIQUE NOT NULL,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  
  -- Customer details
  customer_code VARCHAR(50),
  customer_name VARCHAR(255),
  customer_name_ar VARCHAR(255),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(20),
  
  -- Amount details
  gross_amount DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  tax_type VARCHAR(50), -- VAT, GST, etc.
  tax_rate DECIMAL(5, 2),
  net_amount DECIMAL(15, 2),
  currency_code VARCHAR(3) DEFAULT 'AED',
  
  -- Payment tracking
  paid_amount DECIMAL(15, 2) DEFAULT 0,
  remaining_amount DECIMAL(15, 2),
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, issued, sent, paid, overdue, cancelled
  payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid, partial, paid
  payment_terms VARCHAR(100),
  
  -- Description
  description TEXT,
  description_ar TEXT,
  notes TEXT,
  
  -- GL Entry reference
  gl_entry_id BIGINT REFERENCES wafeq_gl_entries(id) ON DELETE SET NULL,
  
  -- Sync tracking
  wafeq_synced_at TIMESTAMP WITH TIME ZONE,
  wafeq_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced',
  ledgr_invoice_id UUID REFERENCES vat_invoices(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT check_amounts CHECK (paid_amount >= 0 AND paid_amount <= gross_amount)
);

CREATE INDEX IF NOT EXISTS idx_wafeq_inv_org_id ON wafeq_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_inv_company_id ON wafeq_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_inv_id ON wafeq_invoices(wafeq_invoice_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_inv_number ON wafeq_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_wafeq_inv_date ON wafeq_invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_wafeq_inv_customer ON wafeq_invoices(customer_code);
CREATE INDEX IF NOT EXISTS idx_wafeq_inv_status ON wafeq_invoices(status);
CREATE INDEX IF NOT EXISTS idx_wafeq_inv_sync_status ON wafeq_invoices(sync_status);

-- ============================================================================
-- 3. WAFEQ_BILLS - Accounts Payable (AP) bills from Wafeq
-- ============================================================================

CREATE TABLE IF NOT EXISTS wafeq_bills (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  company_id VARCHAR(100) NOT NULL,
  
  -- Bill identifiers
  wafeq_bill_id VARCHAR(100) UNIQUE NOT NULL,
  bill_number VARCHAR(50) NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE,
  
  -- Vendor details
  vendor_code VARCHAR(50),
  vendor_name VARCHAR(255),
  vendor_name_ar VARCHAR(255),
  vendor_email VARCHAR(255),
  vendor_phone VARCHAR(20),
  
  -- Amount details
  gross_amount DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  tax_type VARCHAR(50),
  tax_rate DECIMAL(5, 2),
  net_amount DECIMAL(15, 2),
  currency_code VARCHAR(3) DEFAULT 'AED',
  
  -- Payment tracking
  paid_amount DECIMAL(15, 2) DEFAULT 0,
  remaining_amount DECIMAL(15, 2),
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, received, approved, paid, overdue, cancelled
  payment_status VARCHAR(50) DEFAULT 'unpaid',
  payment_terms VARCHAR(100),
  
  -- Description
  description TEXT,
  description_ar TEXT,
  notes TEXT,
  
  -- GL Entry reference
  gl_entry_id BIGINT REFERENCES wafeq_gl_entries(id) ON DELETE SET NULL,
  
  -- Sync tracking
  wafeq_synced_at TIMESTAMP WITH TIME ZONE,
  wafeq_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced',
  ledgr_bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT check_amounts CHECK (paid_amount >= 0 AND paid_amount <= gross_amount)
);

CREATE INDEX IF NOT EXISTS idx_wafeq_bill_org_id ON wafeq_bills(org_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_bill_company_id ON wafeq_bills(company_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_bill_id ON wafeq_bills(wafeq_bill_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_bill_number ON wafeq_bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_wafeq_bill_date ON wafeq_bills(bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_wafeq_bill_vendor ON wafeq_bills(vendor_code);
CREATE INDEX IF NOT EXISTS idx_wafeq_bill_status ON wafeq_bills(status);
CREATE INDEX IF NOT EXISTS idx_wafeq_bill_sync_status ON wafeq_bills(sync_status);

-- ============================================================================
-- 4. WAFEQ_BANK_TRANSACTIONS - Bank reconciliation data from Wafeq
-- ============================================================================

CREATE TABLE IF NOT EXISTS wafeq_bank_transactions (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  company_id VARCHAR(100) NOT NULL,
  
  -- Transaction identifiers
  wafeq_transaction_id VARCHAR(100) UNIQUE NOT NULL,
  bank_transaction_number VARCHAR(50),
  
  -- Bank account information
  bank_account_code VARCHAR(20),
  bank_account_name VARCHAR(255),
  bank_account_name_ar VARCHAR(255),
  bank_account_iban VARCHAR(50),
  
  -- Transaction details
  transaction_date DATE NOT NULL,
  value_date DATE,
  
  -- Amount details
  debit_amount DECIMAL(15, 2) DEFAULT 0,
  credit_amount DECIMAL(15, 2) DEFAULT 0,
  amount_aed DECIMAL(15, 2),
  currency_code VARCHAR(3) DEFAULT 'AED',
  
  -- Description
  description TEXT,
  description_ar TEXT,
  reference_number VARCHAR(100),
  cheque_number VARCHAR(50),
  
  -- Reconciliation status
  is_reconciled BOOLEAN DEFAULT FALSE,
  reconciled_at TIMESTAMP WITH TIME ZONE,
  reconciliation_note TEXT,
  
  -- Sync tracking
  wafeq_synced_at TIMESTAMP WITH TIME ZONE,
  wafeq_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT check_amounts CHECK (debit_amount >= 0 AND credit_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_wafeq_bank_org_id ON wafeq_bank_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_bank_company_id ON wafeq_bank_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_bank_txn_id ON wafeq_bank_transactions(wafeq_transaction_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_bank_account ON wafeq_bank_transactions(bank_account_code);
CREATE INDEX IF NOT EXISTS idx_wafeq_bank_date ON wafeq_bank_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_wafeq_bank_reconciled ON wafeq_bank_transactions(is_reconciled);
CREATE INDEX IF NOT EXISTS idx_wafeq_bank_sync_status ON wafeq_bank_transactions(sync_status);

-- ============================================================================
-- 5. WAFEQ_VAT_RETURNS - VAT compliance data from Wafeq
-- ============================================================================

CREATE TABLE IF NOT EXISTS wafeq_vat_returns (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  company_id VARCHAR(100) NOT NULL,
  
  -- VAT Return identifiers
  wafeq_return_id VARCHAR(100) UNIQUE NOT NULL,
  return_period VARCHAR(20) NOT NULL, -- e.g., "2026-Q2"
  return_year INTEGER NOT NULL,
  return_quarter INTEGER,
  return_month INTEGER,
  
  -- VAT amounts
  total_output_vat DECIMAL(15, 2) DEFAULT 0, -- VAT on sales
  total_input_vat DECIMAL(15, 2) DEFAULT 0, -- VAT on purchases
  net_vat_payable DECIMAL(15, 2), -- output - input
  
  -- Filing details
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, pending, filed, approved
  filing_date DATE,
  filing_reference VARCHAR(100),
  tax_authority VARCHAR(100), -- FTA, etc.
  
  -- Description
  description TEXT,
  notes TEXT,
  
  -- Sync tracking
  wafeq_synced_at TIMESTAMP WITH TIME ZONE,
  wafeq_last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'synced',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wafeq_vat_org_id ON wafeq_vat_returns(org_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_vat_company_id ON wafeq_vat_returns(company_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_vat_id ON wafeq_vat_returns(wafeq_return_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_vat_period ON wafeq_vat_returns(return_period);
CREATE INDEX IF NOT EXISTS idx_wafeq_vat_status ON wafeq_vat_returns(status);
CREATE INDEX IF NOT EXISTS idx_wafeq_vat_sync_status ON wafeq_vat_returns(sync_status);

-- ============================================================================
-- 6. WAFEQ_SYNC_LOG - Tracking sync operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS wafeq_sync_log (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  company_id VARCHAR(100) NOT NULL,
  
  -- Sync identifiers
  sync_type VARCHAR(50) NOT NULL, -- full, incremental
  sync_data_type VARCHAR(50) NOT NULL, -- gl, invoices, bills, bank, vat
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- in_progress, success, failure
  error_message TEXT,
  
  -- Record counts
  records_fetched INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  
  -- Pagination info
  last_synced_timestamp TIMESTAMP WITH TIME ZONE,
  next_sync_timestamp TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wafeq_sync_log_org ON wafeq_sync_log(org_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_sync_log_company ON wafeq_sync_log(company_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_sync_log_status ON wafeq_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_wafeq_sync_log_created ON wafeq_sync_log(created_at DESC);

-- ============================================================================
-- 7. WAFEQ_CONNECTIONS - Connection state and tokens
-- ============================================================================

CREATE TABLE IF NOT EXISTS wafeq_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL,
  company_id VARCHAR(100) NOT NULL,
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
  
  UNIQUE(org_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_wafeq_conn_org ON wafeq_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_conn_status ON wafeq_connections(status);
CREATE INDEX IF NOT EXISTS idx_wafeq_conn_next_sync ON wafeq_connections(next_scheduled_sync);

-- ============================================================================
-- End of Wafeq Sync Tables Migration
-- ============================================================================