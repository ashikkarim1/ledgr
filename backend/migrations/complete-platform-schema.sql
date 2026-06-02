-- ============================================================
-- Ledgr Complete Platform Schema
-- Multi-Agent Accounting System with Full GL, AP/AR, Tax, Reporting
-- ============================================================

-- ============================================================
-- AGENT MANAGEMENT SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(100) NOT NULL, -- 'tax', 'ap', 'ar', 'reconciliation', 'reporting', 'supervisor'
  specialization VARCHAR(255), -- comma-separated: VAT, Payroll, Invoicing, etc.
  status VARCHAR(50) DEFAULT 'offline', -- offline, online, busy, away, unavailable
  availability_status VARCHAR(50) DEFAULT 'available', -- available, busy, on-break, in-meeting
  current_utilization_percent INT DEFAULT 0,
  max_concurrent_tasks INT DEFAULT 5,
  performance_score DECIMAL(5,2) DEFAULT 100.0, -- 0-100
  resolution_time_avg_minutes INT, -- average task resolution time
  accuracy_percent DECIMAL(5,2) DEFAULT 95.0,
  total_tasks_completed INT DEFAULT 0,
  assigned_tasks_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_activity_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  task_id UUID NOT NULL,
  task_type VARCHAR(100), -- 'invoice_review', 'vat_calculation', 'reconciliation', etc.
  status VARCHAR(50) DEFAULT 'assigned', -- assigned, in_progress, completed, escalated
  priority INT DEFAULT 3, -- 1=urgent, 5=low
  assigned_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  resolution_time_minutes INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS agent_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  month DATE NOT NULL,
  tasks_completed INT DEFAULT 0,
  avg_resolution_time_minutes INT,
  accuracy_percent DECIMAL(5,2),
  escalations_count INT DEFAULT 0,
  customer_satisfaction_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  UNIQUE(org_id, agent_id, month)
);

-- ============================================================
-- CORE ACCOUNTING STRUCTURE
-- ============================================================

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL, -- asset, liability, equity, revenue, expense
  account_class VARCHAR(50), -- current_asset, fixed_asset, current_liability, etc.
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  normal_balance VARCHAR(10), -- DEBIT or CREDIT
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  UNIQUE(org_id, account_number)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  entry_date DATE NOT NULL,
  description VARCHAR(500) NOT NULL,
  created_by_agent_id UUID,
  approved_by_agent_id UUID,
  posted_by_agent_id UUID,
  status VARCHAR(50) DEFAULT 'draft', -- draft, pending_approval, posted, reversed
  posting_date DATE,
  reference_number VARCHAR(100),
  notes TEXT,
  total_debit DECIMAL(15,2),
  total_credit DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  posted_at TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (created_by_agent_id) REFERENCES agents(id),
  FOREIGN KEY (approved_by_agent_id) REFERENCES agents(id),
  FOREIGN KEY (posted_by_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS journal_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  journal_entry_id UUID NOT NULL,
  account_id UUID NOT NULL,
  debit_amount DECIMAL(15,2),
  credit_amount DECIMAL(15,2),
  description VARCHAR(500),
  line_order INT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);

-- ============================================================
-- ACCOUNTS PAYABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_number VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  tax_id VARCHAR(100),
  payment_terms VARCHAR(100), -- NET30, NET60, etc.
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  UNIQUE(org_id, vendor_number)
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  invoice_number VARCHAR(100) NOT NULL,
  invoice_type VARCHAR(20) DEFAULT 'purchase', -- purchase or sales
  vendor_id UUID NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  amount DECIMAL(15,2) NOT NULL,
  vat_amount DECIMAL(15,2),
  total_amount DECIMAL(15,2),
  currency VARCHAR(3) DEFAULT 'AED',
  status VARCHAR(50) DEFAULT 'received', -- received, matched, approved, paid, overdue
  reference_number VARCHAR(100),
  notes TEXT,
  assigned_to_agent_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (assigned_to_agent_id) REFERENCES agents(id),
  UNIQUE(org_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  account_id UUID NOT NULL,
  description VARCHAR(500),
  quantity DECIMAL(15,2),
  unit_price DECIMAL(15,2),
  line_amount DECIMAL(15,2),
  vat_rate DECIMAL(5,2),
  vat_amount DECIMAL(15,2),
  line_order INT,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);

-- ============================================================
-- ACCOUNTS RECEIVABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_number VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  tax_id VARCHAR(100),
  credit_limit DECIMAL(15,2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  UNIQUE(org_id, customer_number)
);

CREATE TABLE IF NOT EXISTS sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  invoice_number VARCHAR(100) NOT NULL,
  customer_id UUID NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  amount DECIMAL(15,2) NOT NULL,
  vat_amount DECIMAL(15,2),
  total_amount DECIMAL(15,2),
  currency VARCHAR(3) DEFAULT 'AED',
  status VARCHAR(50) DEFAULT 'issued', -- issued, partially_paid, paid, overdue, cancelled
  assigned_to_agent_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (assigned_to_agent_id) REFERENCES agents(id),
  UNIQUE(org_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS sales_invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  account_id UUID NOT NULL,
  description VARCHAR(500),
  quantity DECIMAL(15,2),
  unit_price DECIMAL(15,2),
  line_amount DECIMAL(15,2),
  vat_rate DECIMAL(5,2),
  vat_amount DECIMAL(15,2),
  line_order INT,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  payment_type VARCHAR(20), -- 'vendor' or 'customer'
  invoice_id UUID NOT NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50), -- bank_transfer, check, cash, credit_card
  reference_number VARCHAR(100),
  recorded_by_agent_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (recorded_by_agent_id) REFERENCES agents(id)
);

-- ============================================================
-- VAT & TAX COMPLIANCE (UAE-Specific)
-- ============================================================

CREATE TABLE IF NOT EXISTS vat_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  transaction_date DATE NOT NULL,
  transaction_type VARCHAR(50), -- purchase, sales, service
  vat_rate DECIMAL(5,2), -- 5% for UAE
  gross_amount DECIMAL(15,2),
  vat_amount DECIMAL(15,2),
  net_amount DECIMAL(15,2),
  invoice_reference VARCHAR(100),
  partner_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'recorded', -- recorded, filed, adjusted
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS vat_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  return_period DATE NOT NULL,
  submission_date DATE,
  due_date DATE,
  total_output_vat DECIMAL(15,2), -- VAT on sales
  total_input_vat DECIMAL(15,2), -- VAT on purchases
  net_vat_payable DECIMAL(15,2),
  status VARCHAR(50) DEFAULT 'draft', -- draft, submitted, filed, paid
  fta_submission_id VARCHAR(100),
  assigned_to_agent_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (assigned_to_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS tax_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  code VARCHAR(50) NOT NULL,
  description VARCHAR(255),
  account_id UUID NOT NULL,
  tax_rate DECIMAL(5,2),
  is_vat BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);

-- ============================================================
-- BANK RECONCILIATION
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  account_name VARCHAR(255),
  bank_name VARCHAR(255),
  currency VARCHAR(3) DEFAULT 'AED',
  balance DECIMAL(15,2),
  gl_account_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id),
  UNIQUE(org_id, account_number)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  bank_account_id UUID NOT NULL,
  transaction_date DATE NOT NULL,
  amount DECIMAL(15,2),
  transaction_type VARCHAR(20), -- debit or credit
  description VARCHAR(500),
  reference_number VARCHAR(100),
  matched_to_ledger BOOLEAN DEFAULT FALSE,
  matched_entry_id UUID,
  imported_from VARCHAR(100), -- plaid, manual, etc.
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id),
  FOREIGN KEY (matched_entry_id) REFERENCES journal_entries(id)
);

-- ============================================================
-- BUDGETING & FORECASTING
-- ============================================================

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  budget_name VARCHAR(255) NOT NULL,
  fiscal_period VARCHAR(20), -- Q1/2024, 2024, etc.
  start_date DATE,
  end_date DATE,
  created_by_agent_id UUID,
  status VARCHAR(50) DEFAULT 'draft', -- draft, approved, active, closed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (created_by_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS budget_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  budget_id UUID NOT NULL,
  account_id UUID NOT NULL,
  budgeted_amount DECIMAL(15,2),
  actual_amount DECIMAL(15,2),
  variance DECIMAL(15,2),
  variance_percent DECIMAL(5,2),
  notes TEXT,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);

-- ============================================================
-- FINANCIAL REPORTING
-- ============================================================

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  report_name VARCHAR(255) NOT NULL,
  report_type VARCHAR(50), -- 'p_and_l', 'balance_sheet', 'cash_flow', 'trial_balance', 'custom'
  period_start DATE,
  period_end DATE,
  generated_by_agent_id UUID,
  generated_at TIMESTAMP DEFAULT NOW(),
  content JSON, -- stores the report data
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (generated_by_agent_id) REFERENCES agents(id)
);

-- ============================================================
-- INTEGRATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  integration_type VARCHAR(100), -- 'quickbooks', 'xero', 'plaid', 'stripe', 'email'
  status VARCHAR(50) DEFAULT 'connected', -- connected, disconnected, error
  last_sync TIMESTAMP,
  sync_frequency VARCHAR(50) DEFAULT 'hourly', -- hourly, daily, manual
  config JSON, -- stores API credentials (encrypted)
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  integration_id UUID NOT NULL,
  sync_start TIMESTAMP,
  sync_end TIMESTAMP,
  records_imported INT,
  records_updated INT,
  errors_count INT,
  status VARCHAR(50), -- success, partial, error
  error_details TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (integration_id) REFERENCES integrations(id)
);

-- ============================================================
-- AUDIT & COMPLIANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  agent_id UUID,
  action VARCHAR(255),
  entity_type VARCHAR(100),
  entity_id UUID,
  old_values JSON,
  new_values JSON,
  timestamp TIMESTAMP DEFAULT NOW(),
  ip_address VARCHAR(50),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX idx_agents_org_status ON agents(org_id, status);
CREATE INDEX idx_agents_availability ON agents(org_id, availability_status);
CREATE INDEX idx_journal_entries_date ON journal_entries(org_id, entry_date);
CREATE INDEX idx_journal_entries_status ON journal_entries(org_id, status);
CREATE INDEX idx_invoices_date ON invoices(org_id, invoice_date);
CREATE INDEX idx_invoices_status ON invoices(org_id, status);
CREATE INDEX idx_sales_invoices_date ON sales_invoices(org_id, invoice_date);
CREATE INDEX idx_sales_invoices_status ON sales_invoices(org_id, status);
CREATE INDEX idx_vat_transactions_date ON vat_transactions(org_id, transaction_date);
CREATE INDEX idx_bank_transactions_date ON bank_transactions(org_id, transaction_date);
CREATE INDEX idx_audit_log_org_time ON audit_log(org_id, timestamp DESC);
CREATE INDEX idx_agent_assignments_agent_status ON agent_assignments(agent_id, status);

-- ============================================================
-- END OF SCHEMA
-- ============================================================
