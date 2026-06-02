-- ============================================================================
-- HILAL TRADING FZ-LLC COMPANY-SPECIFIC AGENTS
-- Creates specialized agents for Hilal Trading FZ-LLC integrated with Wafeq
-- and QuickBooks
-- Migration: 010_hilal_trading_agents.sql
-- Date: 2026-06-02
-- ============================================================================

-- Organization ID for Hilal Trading FZ-LLC: f47ac10b-58cc-4372-a567-0e02b2c3d479

-- ============================================================================
-- 1. INSERT COMPANY-SPECIFIC AGENTS FOR HILAL TRADING FZ-LLC
-- ============================================================================

INSERT INTO agents (
  org_id, name, email, phone, role, specialization,
  current_status, max_concurrent_tasks, performance_score
) VALUES

-- Accounts Receivable Agent - Handles customer invoices and receivables
(
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'AR Agent - Hilal Trading',
  'ar-agent@hilal-trading.local',
  '+971501111001',
  'ar',
  ARRAY['invoice_processing', 'customer_management', 'payment_tracking', 'wafeq_ar_sync', 'quickbooks_ar_sync'],
  'online',
  8,
  99.8
),

-- Accounts Payable Agent - Handles vendor bills and payables
(
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'AP Agent - Hilal Trading',
  'ap-agent@hilal-trading.local',
  '+971501111002',
  'ap',
  ARRAY['bill_processing', 'vendor_management', 'payment_authorization', 'wafeq_ap_sync', 'quickbooks_ap_sync'],
  'online',
  8,
  99.7
),

-- General Ledger Agent - Handles journal entries and GL reconciliation
(
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'GL Agent - Hilal Trading',
  'gl-agent@hilal-trading.local',
  '+971501111003',
  'reconciliation',
  ARRAY['journal_entries', 'gl_reconciliation', 'account_reconciliation', 'wafeq_gl_sync', 'quickbooks_gl_sync'],
  'online',
  6,
  99.9
),

-- Bank Reconciliation Agent - Handles bank statement reconciliation
(
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'Bank Reconciliation Agent - Hilal Trading',
  'bank-agent@hilal-trading.local',
  '+971501111004',
  'reconciliation',
  ARRAY['bank_reconciliation', 'bank_statement_analysis', 'transaction_matching', 'wafeq_bank_sync', 'quickbooks_bank_sync'],
  'online',
  5,
  99.95
),

-- VAT Compliance Agent - Handles VAT returns and tax compliance
(
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'VAT Compliance Agent - Hilal Trading',
  'vat-agent@hilal-trading.local',
  '+971501111005',
  'tax',
  ARRAY['vat_compliance', 'vat_return_filing', 'input_vat_recovery', 'wafeq_vat_sync', 'fta_compliance'],
  'online',
  4,
  99.85
),

-- Integration Sync Agent - Manages data synchronization between systems
(
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'Integration Sync Agent - Hilal Trading',
  'sync-agent@hilal-trading.local',
  '+971501111006',
  'reporting',
  ARRAY['data_synchronization', 'wafeq_sync_orchestration', 'quickbooks_sync_orchestration', 'cross_system_reconciliation', 'sync_error_handling'],
  'online',
  6,
  99.9
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. CREATE AGENT SPECIALIZATION PROFILES FOR HILAL TRADING
-- ============================================================================

-- This creates task assignment rules and capabilities for each agent

-- AR Agent - Invoice processing from both Wafeq and QB
CREATE TABLE IF NOT EXISTS hilal_ar_agent_config (
  id SERIAL PRIMARY KEY,
  agent_id UUID UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  
  -- Processing preferences
  auto_approve_threshold_aed DECIMAL(15, 2) DEFAULT 10000.00,
  payment_term_days INTEGER DEFAULT 30,
  dunning_cycle_days INTEGER DEFAULT 60,
  
  -- Sync preferences
  wafeq_sync_enabled BOOLEAN DEFAULT TRUE,
  quickbooks_sync_enabled BOOLEAN DEFAULT TRUE,
  auto_match_invoices BOOLEAN DEFAULT TRUE,
  
  -- Escalation rules
  escalate_on_overdue_days INTEGER DEFAULT 90,
  escalate_on_amount_threshold DECIMAL(15, 2) DEFAULT 50000.00,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AP Agent - Bill processing from both Wafeq and QB
CREATE TABLE IF NOT EXISTS hilal_ap_agent_config (
  id SERIAL PRIMARY KEY,
  agent_id UUID UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  
  -- Processing preferences
  auto_approve_threshold_aed DECIMAL(15, 2) DEFAULT 5000.00,
  three_way_match_required BOOLEAN DEFAULT TRUE,
  
  -- Sync preferences
  wafeq_sync_enabled BOOLEAN DEFAULT TRUE,
  quickbooks_sync_enabled BOOLEAN DEFAULT TRUE,
  auto_match_po_to_bills BOOLEAN DEFAULT TRUE,
  
  -- Payment preferences
  payment_term_days INTEGER DEFAULT 30,
  early_payment_discount_percent DECIMAL(5, 2) DEFAULT 2.00,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GL Agent - General ledger reconciliation
CREATE TABLE IF NOT EXISTS hilal_gl_agent_config (
  id SERIAL PRIMARY KEY,
  agent_id UUID UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  
  -- Reconciliation preferences
  auto_reconcile_tolerance_aed DECIMAL(15, 2) DEFAULT 10.00,
  monthly_close_enabled BOOLEAN DEFAULT TRUE,
  quarter_close_enabled BOOLEAN DEFAULT TRUE,
  
  -- Sync preferences
  wafeq_sync_enabled BOOLEAN DEFAULT TRUE,
  quickbooks_sync_enabled BOOLEAN DEFAULT TRUE,
  cross_system_match_required BOOLEAN DEFAULT TRUE,
  
  -- Reporting
  gl_summary_report_frequency VARCHAR(50) DEFAULT 'daily', -- daily, weekly, monthly
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bank Reconciliation Agent
CREATE TABLE IF NOT EXISTS hilal_bank_agent_config (
  id SERIAL PRIMARY KEY,
  agent_id UUID UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  
  -- Bank account preferences
  bank_account_codes TEXT[], -- Comma-separated list of bank account codes to monitor
  reconciliation_frequency VARCHAR(50) DEFAULT 'daily',
  auto_reconcile_tolerance_aed DECIMAL(15, 2) DEFAULT 50.00,
  
  -- Sync preferences
  wafeq_sync_enabled BOOLEAN DEFAULT TRUE,
  quickbooks_sync_enabled BOOLEAN DEFAULT TRUE,
  
  -- Matching rules
  auto_match_cleared_items BOOLEAN DEFAULT TRUE,
  outstanding_item_age_days INTEGER DEFAULT 180,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- VAT Compliance Agent
CREATE TABLE IF NOT EXISTS hilal_vat_agent_config (
  id SERIAL PRIMARY KEY,
  agent_id UUID UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  
  -- VAT settings
  vat_registration_number VARCHAR(50),
  vat_rate DECIMAL(5, 2) DEFAULT 5.00, -- UAE standard VAT
  filing_frequency VARCHAR(50) DEFAULT 'quarterly', -- quarterly, monthly
  filing_deadline_day_of_month INTEGER DEFAULT 15,
  
  -- Sync preferences
  wafeq_sync_enabled BOOLEAN DEFAULT TRUE,
  quickbooks_sync_enabled BOOLEAN DEFAULT FALSE, -- QB doesn't have VAT tracking like Wafeq
  
  -- Filing preferences
  auto_file_returns BOOLEAN DEFAULT FALSE,
  tax_authority VARCHAR(100) DEFAULT 'FTA', -- Federal Tax Authority
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Integration Sync Agent
CREATE TABLE IF NOT EXISTS hilal_sync_agent_config (
  id SERIAL PRIMARY KEY,
  agent_id UUID UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  
  -- Sync scheduling
  full_sync_frequency_hours INTEGER DEFAULT 24,
  incremental_sync_frequency_minutes INTEGER DEFAULT 15,
  webhook_sync_enabled BOOLEAN DEFAULT TRUE,
  
  -- Data types to sync
  sync_chart_of_accounts BOOLEAN DEFAULT TRUE,
  sync_invoices BOOLEAN DEFAULT TRUE,
  sync_bills BOOLEAN DEFAULT TRUE,
  sync_gl_entries BOOLEAN DEFAULT TRUE,
  sync_bank_transactions BOOLEAN DEFAULT TRUE,
  sync_vat_returns BOOLEAN DEFAULT TRUE,
  
  -- Reconciliation
  auto_reconcile_between_systems BOOLEAN DEFAULT TRUE,
  reconciliation_tolerance_aed DECIMAL(15, 2) DEFAULT 100.00,
  
  -- Error handling
  halt_on_sync_error BOOLEAN DEFAULT FALSE,
  error_notification_enabled BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 3. CREATE SYNC TASK QUEUE FOR AGENT ASSIGNMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS hilal_sync_tasks (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  
  -- Task identification
  task_type VARCHAR(50) NOT NULL, -- wafeq_sync, quickbooks_sync, reconciliation, matching
  data_type VARCHAR(50) NOT NULL, -- gl, invoices, bills, bank, vat
  
  -- Assignment
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  
  -- Status and timing
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed
  priority INTEGER DEFAULT 3,
  
  -- Execution details
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  
  -- Sync details
  sync_id VARCHAR(100),
  records_processed INTEGER,
  records_failed INTEGER,
  error_message TEXT,
  
  -- Source system
  source_system VARCHAR(50), -- wafeq, quickbooks
  destination_system VARCHAR(50), -- ledgr, wafeq, quickbooks
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hilal_sync_tasks_org ON hilal_sync_tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_hilal_sync_tasks_status ON hilal_sync_tasks(status);
CREATE INDEX IF NOT EXISTS idx_hilal_sync_tasks_agent ON hilal_sync_tasks(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_hilal_sync_tasks_created ON hilal_sync_tasks(created_at DESC);

-- ============================================================================
-- End of Hilal Trading Company-Specific Agents Migration
-- ============================================================================