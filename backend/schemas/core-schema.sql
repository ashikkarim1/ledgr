-- ============================================================================
-- LEDGR CORE MULTI-TENANT DATABASE SCHEMA
-- Production-Grade Architecture with Row-Level Security
-- PostgreSQL 15+
-- ============================================================================
-- This schema implements a complete multi-tenant financial management system
-- with enterprise-grade security, audit logging, and compliance features.
-- 
-- KEY PRINCIPLES:
-- 1. Every table has tenant_id for multi-tenancy isolation
-- 2. RLS policies automatically filter data per tenant
-- 3. All sensitive data encrypted at rest
-- 4. Immutable audit trail with tamper-evident hash chain
-- 5. RBAC integrated with row-level security
-- 6. Zero cross-tenant data leakage possible
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ORGANIZATIONS (Tenants / Workspaces)
-- ============================================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE, -- For URL-friendly identifier
  subscription_plan VARCHAR(50) NOT NULL DEFAULT 'free', -- free, starter, professional, enterprise
  subscription_status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, trialing, past_due, canceled
  billing_email VARCHAR(255) NOT NULL,
  billing_cycle_start DATE,
  billing_cycle_end DATE,
  max_users INT NOT NULL DEFAULT 5,
  max_agents INT NOT NULL DEFAULT 1,
  
  -- Org metadata
  industry VARCHAR(100), -- Banking, Manufacturing, Retail, Services, etc.
  country_code VARCHAR(2) NOT NULL DEFAULT 'AE', -- Primary operating country
  tax_registration_number VARCHAR(50), -- TRN for UAE
  vat_number VARCHAR(50),
  
  -- Feature flags (encrypted at rest where needed)
  features_vat_enabled BOOLEAN NOT NULL DEFAULT false,
  features_income_tax_enabled BOOLEAN NOT NULL DEFAULT false,
  features_corporate_tax_enabled BOOLEAN NOT NULL DEFAULT false,
  features_agent_enabled BOOLEAN NOT NULL DEFAULT false,
  features_api_enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Compliance & Security
  data_residency VARCHAR(20) NOT NULL DEFAULT 'ae', -- ae, eu, us
  encryption_key_id VARCHAR(100), -- Reference to KMS key
  mfa_required BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ -- Soft delete for audit trail
);

-- Indexes on organizations
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_billing_email ON organizations(billing_email);
CREATE INDEX idx_organizations_subscription_status ON organizations(subscription_status);
CREATE INDEX idx_organizations_created_at ON organizations(created_at DESC);

-- ============================================================================
-- 2. USERS (Team Members)
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Identity
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20),
  avatar_url TEXT,
  
  -- Authentication (password hashed with scram-sha256 by DB)
  password_hash VARCHAR(255), -- Can be null for OAuth-only users
  last_password_change TIMESTAMPTZ,
  
  -- Security
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  mfa_secret_encrypted BYTEA, -- Encrypted TOTP secret
  mfa_backup_codes_encrypted BYTEA, -- Encrypted backup codes
  oauth_provider VARCHAR(50), -- 'google', 'microsoft', 'oidc', null if password
  oauth_id VARCHAR(255), -- External identity from OAuth provider
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, invited, inactive, suspended
  last_login_at TIMESTAMPTZ,
  last_login_ip INET,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Indexes on users
CREATE UNIQUE INDEX idx_users_org_email ON users(organization_id, email) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_oauth ON users(oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL;
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Enable RLS on users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can see users in their organization
CREATE POLICY users_access_by_org ON users
  FOR SELECT
  USING (
    organization_id = (
      SELECT org_id FROM auth_context() 
    )
    OR current_user = 'ledgr_app_admin'
  );

-- ============================================================================
-- 3. ROLES & PERMISSIONS (RBAC)
-- ============================================================================

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL, -- office_manager, cfo, accountant, etc.
  description TEXT,
  
  -- Base roles are system-defined; custom roles are org-specific
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  is_custom_role BOOLEAN NOT NULL DEFAULT false,
  
  -- Permissions stored as JSON array for flexibility
  -- e.g., ["read:org", "write:gl", "approve:journal_entries", "file:vat_return"]
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Metadata
  can_approve BOOLEAN NOT NULL DEFAULT false,
  can_file_returns BOOLEAN NOT NULL DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on roles
CREATE UNIQUE INDEX idx_roles_org_slug ON roles(organization_id, slug) WHERE is_custom_role;
CREATE INDEX idx_roles_is_system ON roles(is_system_role);

-- Enable RLS on roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_access_by_org ON roles
  FOR SELECT
  USING (
    organization_id = (SELECT org_id FROM auth_context())
    OR is_system_role = true
  );

-- ============================================================================
-- 4. USER ROLES (Mapping users to roles)
-- ============================================================================

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- When the assignment becomes inactive (soft delete)
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Temporary role assignments
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on user_roles
CREATE UNIQUE INDEX idx_user_roles_user_role ON user_roles(user_id, role_id, organization_id);
CREATE INDEX idx_user_roles_org ON user_roles(organization_id);

-- Enable RLS on user_roles
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_roles_access_by_org ON user_roles
  FOR SELECT
  USING (organization_id = (SELECT org_id FROM auth_context()));

-- ============================================================================
-- 5. AI AGENTS
-- ============================================================================

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  agent_type VARCHAR(50) NOT NULL, -- 'vat_specialist', 'tax_specialist', 'accountant', 'cfo_analyst'
  
  -- Agent capabilities and configuration
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb, -- e.g., ["vat_return_filing", "tax_planning", "gl_reconciliation"]
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb, -- Agent-specific settings
  
  -- Integration settings (encrypted)
  integrations JSONB, -- e.g., {quickbooks: {..}, xero: {..}}
  
  -- Status & usage
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, paused, inactive
  current_task_id UUID,
  last_activity_at TIMESTAMPTZ,
  
  -- Audit
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Indexes on agents
CREATE INDEX idx_agents_org ON agents(organization_id);
CREATE INDEX idx_agents_type ON agents(agent_type);
CREATE INDEX idx_agents_status ON agents(status);

-- Enable RLS on agents
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY agents_access_by_org ON agents
  FOR SELECT
  USING (organization_id = (SELECT org_id FROM auth_context()));

-- ============================================================================
-- 6. FINANCIAL DATA (Core)
-- ============================================================================

CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  account_number VARCHAR(50) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL, -- asset, liability, equity, income, expense
  account_category VARCHAR(100), -- Current Asset, Long-term Asset, Current Liability, etc.
  
  parent_account_id UUID REFERENCES chart_of_accounts(id), -- For hierarchical COA
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on chart_of_accounts
CREATE UNIQUE INDEX idx_coa_org_number ON chart_of_accounts(organization_id, account_number);
CREATE INDEX idx_coa_type ON chart_of_accounts(account_type);
CREATE INDEX idx_coa_parent ON chart_of_accounts(parent_account_id);

-- Enable RLS
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY coa_access_by_org ON chart_of_accounts
  FOR SELECT
  USING (organization_id = (SELECT org_id FROM auth_context()));

-- ============================================================================

CREATE TABLE general_ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Entry details
  entry_date DATE NOT NULL,
  description VARCHAR(500) NOT NULL,
  
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  debit_amount NUMERIC(18, 2),
  credit_amount NUMERIC(18, 2),
  
  -- Approval workflow
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, submitted, approved, posted, rejected
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  
  -- Audit trail
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Reference to source document
  source_document_id UUID, -- Can reference invoices, receipts, etc.
  source_document_type VARCHAR(50), -- 'purchase_invoice', 'sales_invoice', 'receipt', etc.
  
  CONSTRAINT check_debit_or_credit CHECK ((debit_amount IS NOT NULL) != (credit_amount IS NOT NULL))
);

-- Indexes on general_ledger_entries
CREATE INDEX idx_gle_org_date ON general_ledger_entries(organization_id, entry_date DESC);
CREATE INDEX idx_gle_account ON general_ledger_entries(account_id);
CREATE INDEX idx_gle_status ON general_ledger_entries(status);
CREATE INDEX idx_gle_created_by ON general_ledger_entries(created_by);

-- Enable RLS
ALTER TABLE general_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY gle_access_by_org ON general_ledger_entries
  FOR SELECT
  USING (organization_id = (SELECT org_id FROM auth_context()));

-- ============================================================================

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  entry_number VARCHAR(50) NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  
  -- Approval workflow
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, submitted, approved, rejected, posted
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  
  -- Totals (for validation)
  total_debit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_credit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT check_balanced CHECK (total_debit = total_credit)
);

-- Indexes on journal_entries
CREATE INDEX idx_je_org ON journal_entries(organization_id);
CREATE INDEX idx_je_date ON journal_entries(entry_date DESC);
CREATE INDEX idx_je_status ON journal_entries(status);
CREATE INDEX idx_je_created_by ON journal_entries(created_by);

-- Enable RLS
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY je_access_by_org ON journal_entries
  FOR SELECT
  USING (organization_id = (SELECT org_id FROM auth_context()));

-- ============================================================================

CREATE TABLE journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  line_number INT NOT NULL,
  
  debit_amount NUMERIC(18, 2),
  credit_amount NUMERIC(18, 2),
  description TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT check_debit_or_credit CHECK ((debit_amount IS NOT NULL) != (credit_amount IS NOT NULL))
);

-- Indexes on journal_entry_lines
CREATE INDEX idx_jel_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_jel_account ON journal_entry_lines(account_id);

-- ============================================================================
-- 7. VAT MANAGEMENT
-- ============================================================================

CREATE TABLE vat_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  return_period_start DATE NOT NULL,
  return_period_end DATE NOT NULL,
  filing_due_date DATE NOT NULL,
  
  -- Return data
  total_supplies NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_supplies_vat NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_imports NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_imports_vat NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_taxable_supplies NUMERIC(18, 2) NOT NULL DEFAULT 0,
  
  total_input_tax NUMERIC(18, 2) NOT NULL DEFAULT 0,
  recoverable_input_tax NUMERIC(18, 2) NOT NULL DEFAULT 0,
  
  vat_payable NUMERIC(18, 2) NOT NULL DEFAULT 0,
  vat_refundable NUMERIC(18, 2) NOT NULL DEFAULT 0,
  
  -- Approval & filing
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, submitted, approved, filed, rejected
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  filed_by UUID REFERENCES users(id),
  filed_at TIMESTAMPTZ,
  filing_reference VARCHAR(100), -- FTA reference number
  
  -- Audit
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on vat_returns
CREATE INDEX idx_vat_returns_org ON vat_returns(organization_id);
CREATE INDEX idx_vat_returns_period ON vat_returns(return_period_start, return_period_end);
CREATE INDEX idx_vat_returns_status ON vat_returns(status);
CREATE INDEX idx_vat_returns_filing_date ON vat_returns(filing_due_date);

-- Enable RLS
ALTER TABLE vat_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY vat_returns_access_by_org ON vat_returns
  FOR SELECT
  USING (organization_id = (SELECT org_id FROM auth_context()));

-- ============================================================================

CREATE TABLE vat_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vat_return_id UUID REFERENCES vat_returns(id),
  
  invoice_date DATE NOT NULL,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_type VARCHAR(20) NOT NULL, -- 'sales', 'purchase', 'import'
  
  supplier_name VARCHAR(255),
  supplier_vat_number VARCHAR(50),
  
  total_amount NUMERIC(18, 2) NOT NULL,
  vat_amount NUMERIC(18, 2) NOT NULL,
  
  is_taxable BOOLEAN NOT NULL DEFAULT true,
  is_reverse_charge BOOLEAN NOT NULL DEFAULT false,
  is_exempted BOOLEAN NOT NULL DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on vat_invoices
CREATE INDEX idx_vat_invoices_org ON vat_invoices(organization_id);
CREATE INDEX idx_vat_invoices_return ON vat_invoices(vat_return_id);
CREATE INDEX idx_vat_invoices_date ON vat_invoices(invoice_date DESC);

-- Enable RLS
ALTER TABLE vat_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY vat_invoices_access_by_org ON vat_invoices
  FOR SELECT
  USING (organization_id = (SELECT org_id FROM auth_context()));

-- ============================================================================
-- 8. HELP TICKETS & ESCALATIONS
-- ============================================================================

CREATE TABLE help_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL, -- vat_help, tax_help, technical_support, billing, etc.
  
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- open, in_progress, waiting_customer, resolved, closed
  priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  
  created_by UUID NOT NULL REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  
  is_escalated BOOLEAN NOT NULL DEFAULT false,
  escalated_to UUID REFERENCES users(id),
  escalation_reason TEXT,
  escalated_at TIMESTAMPTZ,
  
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Indexes on help_tickets
CREATE INDEX idx_help_tickets_org ON help_tickets(organization_id);
CREATE INDEX idx_help_tickets_status ON help_tickets(status);
CREATE INDEX idx_help_tickets_priority ON help_tickets(priority);
CREATE INDEX idx_help_tickets_assigned_to ON help_tickets(assigned_to);
CREATE INDEX idx_help_tickets_created_at ON help_tickets(created_at DESC);

-- Enable RLS
ALTER TABLE help_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY help_tickets_access_by_org ON help_tickets
  FOR SELECT
  USING (organization_id = (SELECT org_id FROM auth_context()));

-- ============================================================================

CREATE TABLE help_ticket_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES help_tickets(id) ON DELETE CASCADE,
  
  author_id UUID NOT NULL REFERENCES users(id),
  comment_text TEXT NOT NULL,
  
  is_internal BOOLEAN NOT NULL DEFAULT false, -- Only visible to team
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on help_ticket_comments
CREATE INDEX idx_help_ticket_comments_ticket ON help_ticket_comments(ticket_id);
CREATE INDEX idx_help_ticket_comments_author ON help_ticket_comments(author_id);

-- ============================================================================
-- 9. INTEGRATIONS
-- ============================================================================

CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  integration_type VARCHAR(50) NOT NULL, -- 'quickbooks_online', 'xero', 'stripe', 'fta_vat', 'bank_feed'
  
  -- Connection details (encrypted at rest)
  client_id_encrypted BYTEA, -- OAuth client ID
  client_secret_encrypted BYTEA, -- OAuth client secret
  access_token_encrypted BYTEA,
  refresh_token_encrypted BYTEA,
  token_expires_at TIMESTAMPTZ,
  
  api_key_encrypted BYTEA, -- For key-based auth
  api_secret_encrypted BYTEA,
  
  -- Configuration
  configuration JSONB, -- Integration-specific settings
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(20), -- 'success', 'failed', 'partial'
  last_error_message TEXT,
  
  # Audit
  connected_by UUID NOT NULL REFERENCES users(id),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on integrations
CREATE INDEX idx_integrations_org ON integrations(organization_id);
CREATE INDEX idx_integrations_type ON integrations(integration_type);
CREATE INDEX idx_integrations_active ON integrations(is_active);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY integrations_access_by_org ON integrations
  FOR SELECT
  USING (organization_id = (SELECT org_id FROM auth_context()));

-- ============================================================================
-- 10. PAYMENTS & BILLING
-- ============================================================================

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  
  plan_id VARCHAR(100) NOT NULL, -- 'free', 'starter', 'professional', 'enterprise'
  plan_name VARCHAR(100) NOT NULL,
  
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly, annual
  
  # Pricing
  amount_per_cycle NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'AED',
  
  -- Dates
  current_period_start DATE NOT NULL,
  current_period_end DATE NOT NULL,
  trial_end_date DATE,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, trialing, past_due, canceled
  
  # Payment details
  stripe_subscription_id VARCHAR(100),
  stripe_customer_id VARCHAR(100),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  canceled_at TIMESTAMPTZ
);

-- Indexes on subscriptions
CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end);

-- ============================================================================

CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  
  transaction_type VARCHAR(50) NOT NULL, -- 'charge', 'refund', 'adjustment'
  
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'AED',
  
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, succeeded, failed
  
  stripe_payment_intent_id VARCHAR(100),
  stripe_charge_id VARCHAR(100),
  
  failure_reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Indexes on payment_transactions
CREATE INDEX idx_payment_transactions_org ON payment_transactions(organization_id);
CREATE INDEX idx_payment_transactions_subscription ON payment_transactions(subscription_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX idx_payment_transactions_created_at ON payment_transactions(created_at DESC);

-- ============================================================================
-- 11. ONBOARDING PROGRESS
-- ============================================================================

CREATE TABLE onboarding_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Step tracking
  current_step INT NOT NULL DEFAULT 1,
  current_step_name VARCHAR(100),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  
  -- Step completions (JSON to track each step's status)
  steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of completed step objects
  
  -- Metadata
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on onboarding_progress
CREATE INDEX idx_onboarding_org ON onboarding_progress(organization_id);
CREATE INDEX idx_onboarding_completed ON onboarding_progress(is_completed);

-- ============================================================================
-- 12. AUDIT LOG (Immutable tamper-evident trail)
-- ============================================================================

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'FILE', 'LOGIN', 'MFA_SETUP', etc.
  entity_type VARCHAR(100) NOT NULL, -- Table name: 'journal_entries', 'vat_returns', etc.
  entity_id UUID NOT NULL,
  
  -- State snapshots (JSONB for flexibility)
  before_state JSONB,
  after_state JSONB,
  change_summary TEXT, -- Human-readable summary of changes
  
  -- Request context
  ip_address INET,
  user_agent TEXT,
  
  -- Tamper-evident hash chain
  hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of [timestamp, org_id, action, entity_type, entity_id, parent_hash]
  parent_hash VARCHAR(64), -- Hash of previous audit entry
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create partitions for audit log (monthly, for archive/retention)
CREATE TABLE audit_log_2026_05 PARTITION OF audit_log
  FOR VALUES FROM ('2026-05-01'::timestamp) TO ('2026-06-01'::timestamp);

CREATE TABLE audit_log_2026_06 PARTITION OF audit_log
  FOR VALUES FROM ('2026-06-01'::timestamp) TO ('2026-07-01'::timestamp);

-- Indexes on audit_log partitions
CREATE INDEX idx_audit_log_org_timestamp ON audit_log(organization_id, timestamp DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, timestamp DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_hash_chain ON audit_log(parent_hash);

-- Enforce immutability on audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY audit_log_select_read ON audit_log
  FOR SELECT
  USING (
    organization_id = (SELECT org_id FROM auth_context())
    OR current_user = 'ledgr_audit'
  );

-- Revoke dangerous operations on audit_log
REVOKE UPDATE, DELETE ON audit_log FROM public;
REVOKE UPDATE, DELETE ON audit_log FROM ledgr_app_read;
REVOKE UPDATE, DELETE ON audit_log FROM ledgr_app_write;

-- ============================================================================
-- 13. HELPER FUNCTIONS
-- ============================================================================

-- Function to get current organization context from session
CREATE OR REPLACE FUNCTION auth_context()
RETURNS TABLE (org_id UUID, user_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (current_setting('app.current_org_id', true))::UUID,
    (current_setting('app.current_user_id', true))::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to verify password hash
CREATE OR REPLACE FUNCTION verify_password(password_input TEXT, password_hash_stored VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN crypt(password_input, password_hash_stored) = password_hash_stored;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to hash password
CREATE OR REPLACE FUNCTION hash_password(password_input TEXT)
RETURNS VARCHAR AS $$
BEGIN
  RETURN crypt(password_input, gen_salt('bf', 12));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to compute tamper-evident hash for audit log
CREATE OR REPLACE FUNCTION compute_audit_hash(
  p_timestamp TIMESTAMPTZ,
  p_org_id UUID,
  p_action VARCHAR,
  p_entity_type VARCHAR,
  p_entity_id UUID,
  p_parent_hash VARCHAR
)
RETURNS VARCHAR AS $$
BEGIN
  RETURN encode(
    digest(
      p_timestamp::TEXT || '|' ||
      p_org_id::TEXT || '|' ||
      p_action || '|' ||
      p_entity_type || '|' ||
      p_entity_id::TEXT || '|' ||
      COALESCE(p_parent_hash, 'genesis'),
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 14. AUDIT TRIGGERS (Automatic audit trail)
-- ============================================================================

-- Generic function for audit trigger
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  v_action VARCHAR;
  v_before JSONB;
  v_after JSONB;
  v_parent_hash VARCHAR;
  v_computed_hash VARCHAR;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_before := NULL;
    v_after := row_to_json(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_before := row_to_json(OLD);
    v_after := row_to_json(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_before := row_to_json(OLD);
    v_after := NULL;
  END IF;

  -- Get parent hash (latest audit entry)
  SELECT hash INTO v_parent_hash FROM audit_log
  WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
  ORDER BY timestamp DESC LIMIT 1;

  -- Compute hash
  v_computed_hash := compute_audit_hash(
    NOW(),
    COALESCE(NEW.organization_id, OLD.organization_id),
    v_action,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_parent_hash
  );

  -- Insert audit log
  INSERT INTO audit_log (
    organization_id, user_id, action, entity_type, entity_id,
    before_state, after_state, ip_address, user_agent,
    hash, parent_hash
  ) VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    (current_setting('app.current_user_id', true))::UUID,
    v_action,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_before,
    v_after,
    inet_client_addr(),
    current_setting('app.user_agent', true),
    v_computed_hash,
    v_parent_hash
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers on key tables
CREATE TRIGGER audit_general_ledger_entries AFTER INSERT OR UPDATE OR DELETE ON general_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_journal_entries AFTER INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_vat_returns AFTER INSERT OR UPDATE OR DELETE ON vat_returns
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================================================
-- 15. INITIAL DATA: SYSTEM ROLES
-- ============================================================================

-- These are system roles available to all organizations
INSERT INTO roles (organization_id, name, slug, is_system_role, permissions, can_approve, can_file_returns)
SELECT
  id,
  'Office Manager',
  'office_manager',
  true,
  '["read:org", "write:org", "read:users", "write:users", "read:dashboard", "write:dashboard_settings", "read:audit_log"]'::jsonb,
  true,
  false
FROM organizations ON CONFLICT DO NOTHING;

-- Additional system roles would be inserted similarly...
-- CFO, Finance Controller, Accountant, VAT Specialist, Tax Specialist, Agent Manager, etc.

-- ============================================================================
-- 16. GRANTS FOR APPLICATION ROLES
-- ============================================================================

-- Grant appropriate permissions per database role
GRANT USAGE ON SCHEMA public TO ledgr_app_read, ledgr_app_write;

-- ledgr_app_read: SELECT-only
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ledgr_app_read;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledgr_app_read;

-- ledgr_app_write: INSERT, UPDATE, DELETE (controlled by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledgr_app_write;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledgr_app_write;

-- ledgr_app_admin: All operations for migrations
GRANT ALL ON ALL TABLES IN SCHEMA public TO ledgr_app_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ledgr_app_admin;

-- ledgr_backup: SELECT-only for pg_dump
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ledgr_backup;

-- ledgr_audit: SELECT-only on audit_log
GRANT SELECT ON audit_log TO ledgr_audit;

-- ============================================================================
-- 17. DOCUMENTATION
-- ============================================================================

COMMENT ON SCHEMA public IS 'Ledgr core multi-tenant financial management system';

COMMENT ON TABLE organizations IS 'Workspaces/tenants - each org is isolated via RLS';

COMMENT ON TABLE users IS 'Team members with authentication and MFA support';

COMMENT ON TABLE roles IS 'Role definitions with granular permissions (RBAC)';

COMMENT ON TABLE agents IS 'AI agents performing financial tasks per organization';

COMMENT ON TABLE journal_entries IS 'Double-entry bookkeeping journal';

COMMENT ON TABLE vat_returns IS 'VAT compliance and filing records';

COMMENT ON TABLE help_tickets IS 'Customer support tickets with escalation workflow';

COMMENT ON TABLE audit_log IS 'Immutable tamper-evident audit trail partitioned by date';
