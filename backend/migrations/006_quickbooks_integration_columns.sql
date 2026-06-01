-- ============================================================================
-- QB INTEGRATION COLUMNS
-- Adds QuickBooks-specific tracking columns to main tables
-- Migration: 006_quickbooks_integration_columns.sql
-- ============================================================================

-- ============================================================================
-- 1. ADD QB COLUMNS TO chart_of_accounts
-- ============================================================================

ALTER TABLE chart_of_accounts
ADD COLUMN IF NOT EXISTS qb_account_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS qb_account_type VARCHAR(50), -- QB-specific type (Asset, Liability, etc.)
ADD COLUMN IF NOT EXISTS qb_sync_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS qb_last_synced TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(50); -- 'synced', 'pending', 'failed'

-- Create index for QB lookups
CREATE INDEX IF NOT EXISTS idx_coa_qb_account_id ON chart_of_accounts(qb_account_id) 
WHERE qb_account_id IS NOT NULL;

-- ============================================================================
-- 2. ADD QB COLUMNS TO vat_invoices
-- ============================================================================

ALTER TABLE vat_invoices
ADD COLUMN IF NOT EXISTS qb_invoice_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS qb_customer_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS qb_sync_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS qb_last_synced TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(50); -- 'synced', 'pending', 'failed'

-- Create index for QB lookups
CREATE INDEX IF NOT EXISTS idx_inv_qb_invoice_id ON vat_invoices(qb_invoice_id) 
WHERE qb_invoice_id IS NOT NULL;

-- ============================================================================
-- 3. CREATE bills TABLE (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Bill identifiers
  bill_number VARCHAR(50) NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE,
  
  -- Vendor details
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_email VARCHAR(255),
  
  -- Amount tracking
  amount DECIMAL(15, 2) NOT NULL,
  amount_paid DECIMAL(15, 2) DEFAULT 0,
  amount_due DECIMAL(15, 2),
  currency_code VARCHAR(3) DEFAULT 'AED',
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, received, paid, overdue, cancelled
  payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid, partially_paid, paid
  
  -- QB Integration columns
  qb_bill_id VARCHAR(100),
  qb_vendor_id VARCHAR(100),
  qb_sync_enabled BOOLEAN DEFAULT false,
  qb_last_synced TIMESTAMP WITH TIME ZONE,
  qb_sync_status VARCHAR(50),
  
  -- Notes and description
  description TEXT,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_amounts CHECK (amount_paid >= 0 AND amount_paid <= amount),
  CONSTRAINT valid_due_date CHECK (due_date IS NULL OR due_date >= bill_date),
  CONSTRAINT unique_bill_number CHECK (bill_number IS NOT NULL)
);

-- Indexes for bills
CREATE INDEX idx_bills_org ON bills(organization_id);
CREATE INDEX idx_bills_vendor ON bills(vendor_id);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_bills_qb_id ON bills(qb_bill_id) WHERE qb_bill_id IS NOT NULL;
CREATE INDEX idx_bills_created ON bills(created_at DESC);

-- Enable RLS for bills
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY bills_access_by_org ON bills
  USING (organization_id = current_setting('app.org_id')::uuid);

CREATE POLICY bills_modify_by_org ON bills
  USING (organization_id = current_setting('app.org_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.org_id')::uuid);

-- ============================================================================
-- 4. CREATE transactions TABLE (if not exists)
-- For storing synthesized transactions from QB invoices/bills
-- ============================================================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Transaction identifiers
  external_id VARCHAR(255), -- QB transaction ID (synthetic: qb_txn_inv_{id}_{line})
  transaction_date DATE NOT NULL,
  
  -- Related entities
  account_id UUID REFERENCES chart_of_accounts(id),
  counterparty_id UUID, -- customer or vendor ID
  counterparty_name VARCHAR(255),
  
  -- Amount and type
  amount DECIMAL(15, 2) NOT NULL,
  currency_code VARCHAR(3) DEFAULT 'AED',
  transaction_type VARCHAR(50) NOT NULL, -- 'invoice', 'bill', 'payment', 'deposit'
  
  -- QB Sync tracking
  qb_source_type VARCHAR(50), -- 'invoice', 'bill', 'bank_transaction'
  qb_source_id VARCHAR(100),
  qb_sync_enabled BOOLEAN DEFAULT false,
  qb_last_synced TIMESTAMP WITH TIME ZONE,
  qb_sync_status VARCHAR(50),
  
  -- Description
  description TEXT,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for transactions
CREATE INDEX idx_txn_org ON transactions(organization_id);
CREATE INDEX idx_txn_account ON transactions(account_id);
CREATE INDEX idx_txn_date ON transactions(transaction_date DESC);
CREATE INDEX idx_txn_external_id ON transactions(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_txn_qb_source ON transactions(qb_source_id) WHERE qb_source_id IS NOT NULL;

-- Enable RLS for transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_access_by_org ON transactions
  USING (organization_id = current_setting('app.org_id')::uuid);

CREATE POLICY transactions_modify_by_org ON transactions
  USING (organization_id = current_setting('app.org_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.org_id')::uuid);

-- ============================================================================
-- End of QB Integration Columns Migration
-- ============================================================================
