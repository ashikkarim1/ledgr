-- Migration: Wafeq Integration Schema Updates
-- Date: 2026-06-01
-- Description: Add Arabic language support and Wafeq-specific columns for the Wafeq ERP integration

-- 1. Extend chart_of_accounts table with Arabic columns and Wafeq fields
ALTER TABLE chart_of_accounts
ADD COLUMN IF NOT EXISTS account_name_ar VARCHAR(255),
ADD COLUMN IF NOT EXISTS wafeq_gl_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS wafeq_sync_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_vat_account BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS vat_type VARCHAR(20), -- 'input' or 'output'
ADD COLUMN IF NOT EXISTS account_fingerprint VARCHAR(64), -- SHA-256 hash for deduplication
ADD COLUMN IF NOT EXISTS created_from_import_at TIMESTAMP;

-- Add indexes for performance on commonly queried fields
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_wafeq_gl_code ON chart_of_accounts(wafeq_gl_code);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_is_vat_account ON chart_of_accounts(is_vat_account);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_wafeq_sync_id ON chart_of_accounts(wafeq_sync_id);

-- 2. Extend transactions table with Arabic description field
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS description_ar VARCHAR(500),
ADD COLUMN IF NOT EXISTS wafeq_sync_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_transactions_wafeq_sync_id ON transactions(wafeq_sync_id);

-- 3. Extend customers/vendors table with Arabic name
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS name_ar VARCHAR(255),
ADD COLUMN IF NOT EXISTS wafeq_sync_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS customer_fingerprint VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_customers_wafeq_sync_id ON customers(wafeq_sync_id);

-- 4. Add audit column to integrations table to track Wafeq imports
ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(20), -- 'success' or 'failure'
ADD COLUMN IF NOT EXISTS sync_record_count INTEGER DEFAULT 0;

-- 5. Create wafeq_sync_log table for detailed import tracking
CREATE TABLE IF NOT EXISTS wafeq_sync_log (
  id SERIAL PRIMARY KEY,
  integration_id INTEGER NOT NULL REFERENCES integrations(id),
  sync_type VARCHAR(20) NOT NULL, -- 'gl', 'customers', 'transactions'
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  status VARCHAR(20) NOT NULL, -- 'pending', 'success', 'failure'
  records_imported INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  file_name VARCHAR(255),
  file_hash VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wafeq_sync_log_integration_id ON wafeq_sync_log(integration_id);
CREATE INDEX IF NOT EXISTS idx_wafeq_sync_log_status ON wafeq_sync_log(status);

-- 6. Create table to track VAT account mappings
CREATE TABLE IF NOT EXISTS vat_accounts (
  id SERIAL PRIMARY KEY,
  integration_id INTEGER NOT NULL REFERENCES integrations(id),
  account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  vat_type VARCHAR(20) NOT NULL, -- 'input' or 'output'
  vat_rate DECIMAL(5, 2) NOT NULL DEFAULT 5.00, -- UAE standard VAT rate
  country_code VARCHAR(2) DEFAULT 'AE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vat_accounts_integration_id ON vat_accounts(integration_id);
CREATE INDEX IF NOT EXISTS idx_vat_accounts_vat_type ON vat_accounts(vat_type);

-- 7. Add constraint to ensure valid UTF-8 in Arabic fields (documented requirement)
-- Note: PostgreSQL validates UTF-8 at the server level when using UTF-8 encoding
-- Ensure the database is created with: CREATE DATABASE ledgr ENCODING 'UTF8';

-- 8. Create index on account_fingerprint for deduplication checks
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_fingerprint ON chart_of_accounts(account_fingerprint);
