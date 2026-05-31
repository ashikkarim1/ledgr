-- Migration 002: Onboarding Flow Schema
-- Created for Ledgr onboarding implementation
-- Supports 5-step wizard with persistent progress tracking, auto-save, and backup

-- ============================================================================
-- MAIN ONBOARDING PROGRESS TABLE
-- ============================================================================

CREATE TABLE onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  current_step VARCHAR(50) NOT NULL CHECK (current_step IN (
    'COMPANY_REGISTRATION',
    'ACCOUNTING_SETUP',
    'TEAM_SETUP',
    'AGENT_DEPLOYMENT',
    'VERIFICATION_GOLIVE'
  )),
  status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN (
    'NOT_STARTED',
    'IN_PROGRESS',
    'PAUSED',
    'COMPLETED',
    'FAILED'
  )),
  
  -- Step Data (JSONB for flexibility during iteration)
  company_data JSONB,
  accounting_data JSONB,
  team_data JSONB,
  agent_data JSONB,
  verification_data JSONB,
  
  -- Progress Tracking
  completed_steps TEXT[] DEFAULT '{}',
  skipped_steps TEXT[] DEFAULT '{}',
  step_started_at JSONB DEFAULT '{}', -- {STEP_NAME: timestamp}
  step_completed_at JSONB DEFAULT '{}',
  
  -- Configuration
  estimated_minutes_to_completion INTEGER DEFAULT 45,
  auto_save_enabled BOOLEAN DEFAULT TRUE,
  auto_save_interval_ms INTEGER DEFAULT 10000, -- 10 seconds
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_saved_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  -- Audit
  created_by UUID,
  updated_by UUID
);

-- Indexes for efficient querying
CREATE INDEX idx_onboarding_progress_org_client 
  ON onboarding_progress(organization_id, client_id);
CREATE INDEX idx_onboarding_progress_status 
  ON onboarding_progress(organization_id, status);
CREATE INDEX idx_onboarding_progress_updated 
  ON onboarding_progress(organization_id, updated_at DESC);

-- Enable RLS
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY onboarding_progress_select ON onboarding_progress
  FOR SELECT USING (
    organization_id = current_setting('app.current_org_id')::uuid OR
    current_user = 'ledgr_audit'
  );

CREATE POLICY onboarding_progress_insert ON onboarding_progress
  FOR INSERT WITH CHECK (
    organization_id = current_setting('app.current_org_id')::uuid
  );

CREATE POLICY onboarding_progress_update ON onboarding_progress
  FOR UPDATE USING (
    organization_id = current_setting('app.current_org_id')::uuid
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON onboarding_progress TO ledgr_app_write;
GRANT SELECT ON onboarding_progress TO ledgr_app_read;
GRANT SELECT ON onboarding_progress TO ledgr_audit;

-- ============================================================================
-- ONBOARDING ERRORS & VALIDATION LOG
-- ============================================================================

CREATE TABLE onboarding_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES onboarding_progress(id) ON DELETE CASCADE,
  step VARCHAR(50) NOT NULL,
  field VARCHAR(100),
  message TEXT NOT NULL,
  code VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('ERROR', 'WARNING', 'INFO')),
  timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_onboarding_errors_onboarding 
  ON onboarding_errors(onboarding_id);
CREATE INDEX idx_onboarding_errors_step 
  ON onboarding_errors(step);
CREATE INDEX idx_onboarding_errors_resolved 
  ON onboarding_errors(resolved);

ALTER TABLE onboarding_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_errors_select ON onboarding_errors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM onboarding_progress op 
      WHERE op.id = onboarding_errors.onboarding_id 
      AND op.organization_id = current_setting('app.current_org_id')::uuid
    )
  );

GRANT SELECT, INSERT ON onboarding_errors TO ledgr_app_write;
GRANT SELECT ON onboarding_errors TO ledgr_app_read;

-- ============================================================================
-- ONBOARDING BACKUP (Auto-save checkpoint)
-- ============================================================================

CREATE TABLE onboarding_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES onboarding_progress(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL, -- Full state snapshot
  step VARCHAR(50) NOT NULL,
  checkpoint_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID
);

CREATE INDEX idx_onboarding_backups_onboarding 
  ON onboarding_backups(onboarding_id, created_at DESC);
CREATE INDEX idx_onboarding_backups_step 
  ON onboarding_backups(step);

-- Keep only last 10 backups per onboarding
CREATE OR REPLACE FUNCTION cleanup_old_onboarding_backups()
RETURNS void AS $$
DELETE FROM onboarding_backups
WHERE id IN (
  SELECT id FROM onboarding_backups
  WHERE onboarding_id = onboarding_backups.onboarding_id
  ORDER BY created_at DESC OFFSET 10
);
$$ LANGUAGE SQL;

ALTER TABLE onboarding_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_backups_select ON onboarding_backups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM onboarding_progress op 
      WHERE op.id = onboarding_backups.onboarding_id 
      AND op.organization_id = current_setting('app.current_org_id')::uuid
    )
  );

GRANT SELECT, INSERT ON onboarding_backups TO ledgr_app_write;
GRANT SELECT ON onboarding_backups TO ledgr_app_read;

-- ============================================================================
-- TEAM MEMBERS (Step 3 Integration)
-- ============================================================================

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) NOT NULL CHECK (role IN (
    'CLIENT_ADMIN',
    'ACCOUNTANT',
    'CFO',
    'AGENT_MANAGER',
    'FINANCE_TEAM',
    'OPERATIONAL',
    'VIEWER'
  )),
  invited_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  accepted_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'ACTIVE',
    'INACTIVE',
    'REMOVED'
  )),
  mfa_enabled BOOLEAN DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  UNIQUE(organization_id, email)
);

CREATE INDEX idx_team_members_org 
  ON team_members(organization_id);
CREATE INDEX idx_team_members_email 
  ON team_members(email);
CREATE INDEX idx_team_members_status 
  ON team_members(organization_id, status);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_members_select ON team_members
  FOR SELECT USING (
    organization_id = current_setting('app.current_org_id')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON team_members TO ledgr_app_write;
GRANT SELECT ON team_members TO ledgr_app_read;

-- ============================================================================
-- ROLE PERMISSIONS (Step 3 Integration)
-- ============================================================================

CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(50) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN (
    'READ',
    'CREATE',
    'UPDATE',
    'DELETE',
    'APPROVE'
  )),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  UNIQUE(role, resource, action)
);

-- Pre-populate with default role permissions
INSERT INTO role_permissions (role, resource, action, description) VALUES
  ('CLIENT_ADMIN', 'COMPANY_SETTINGS', 'READ', 'Can view company settings'),
  ('CLIENT_ADMIN', 'COMPANY_SETTINGS', 'UPDATE', 'Can edit company settings'),
  ('CLIENT_ADMIN', 'TEAM_MEMBERS', 'READ', 'Can view team'),
  ('CLIENT_ADMIN', 'TEAM_MEMBERS', 'CREATE', 'Can invite team members'),
  ('CLIENT_ADMIN', 'TEAM_MEMBERS', 'UPDATE', 'Can edit team member roles'),
  ('CLIENT_ADMIN', 'TEAM_MEMBERS', 'DELETE', 'Can remove team members'),
  ('CLIENT_ADMIN', 'TRANSACTIONS', 'READ', 'Can view transactions'),
  ('CLIENT_ADMIN', 'TRANSACTIONS', 'APPROVE', 'Can approve transactions'),
  ('CLIENT_ADMIN', 'REPORTS', 'READ', 'Can view all reports'),
  ('CLIENT_ADMIN', 'AGENTS', 'READ', 'Can view agents'),
  ('CLIENT_ADMIN', 'AGENTS', 'UPDATE', 'Can configure agents'),
  
  ('ACCOUNTANT', 'TRANSACTIONS', 'READ', 'Can view transactions'),
  ('ACCOUNTANT', 'TRANSACTIONS', 'CREATE', 'Can create transactions'),
  ('ACCOUNTANT', 'TRANSACTIONS', 'UPDATE', 'Can edit transactions'),
  ('ACCOUNTANT', 'REPORTS', 'READ', 'Can view accounting reports'),
  ('ACCOUNTANT', 'COMPANY_SETTINGS', 'READ', 'Can view company settings'),
  
  ('CFO', 'TRANSACTIONS', 'READ', 'Can view transactions'),
  ('CFO', 'REPORTS', 'READ', 'Can view all reports'),
  ('CFO', 'COMPANY_SETTINGS', 'READ', 'Can view company settings'),
  ('CFO', 'AGENTS', 'READ', 'Can view agents'),
  
  ('AGENT_MANAGER', 'AGENTS', 'READ', 'Can view agents'),
  ('AGENT_MANAGER', 'AGENTS', 'UPDATE', 'Can configure agents'),
  ('AGENT_MANAGER', 'TRANSACTIONS', 'READ', 'Can view transactions'),
  
  ('FINANCE_TEAM', 'TRANSACTIONS', 'READ', 'Can view transactions'),
  ('FINANCE_TEAM', 'TRANSACTIONS', 'CREATE', 'Can create transactions'),
  ('FINANCE_TEAM', 'REPORTS', 'READ', 'Can view reports'),
  
  ('OPERATIONAL', 'TRANSACTIONS', 'READ', 'Can view transactions'),
  ('OPERATIONAL', 'REPORTS', 'READ', 'Can view reports'),
  
  ('VIEWER', 'TRANSACTIONS', 'READ', 'Can view transactions'),
  ('VIEWER', 'REPORTS', 'READ', 'Can view reports')
ON CONFLICT DO NOTHING;

CREATE INDEX idx_role_permissions_role 
  ON role_permissions(role);

GRANT SELECT ON role_permissions TO ledgr_app_write;
GRANT SELECT ON role_permissions TO ledgr_app_read;

-- ============================================================================
-- ACCOUNTING SOFTWARE CONNECTIONS (Step 2 Integration)
-- ============================================================================

CREATE TABLE accounting_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN (
    'QUICKBOOKS',
    'XERO',
    'FRESHBOOKS',
    'SAP',
    'ORACLE',
    'NONE'
  )),
  is_connected BOOLEAN DEFAULT FALSE,
  connection_status VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED' CHECK (
    connection_status IN ('PENDING', 'CONNECTED', 'FAILED', 'DISCONNECTED')
  ),
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  sync_errors TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  UNIQUE(organization_id, provider)
);

CREATE INDEX idx_accounting_connections_org 
  ON accounting_connections(organization_id);
CREATE INDEX idx_accounting_connections_status 
  ON accounting_connections(connection_status);

ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounting_connections_select ON accounting_connections
  FOR SELECT USING (
    organization_id = current_setting('app.current_org_id')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON accounting_connections TO ledgr_app_write;
GRANT SELECT ON accounting_connections TO ledgr_app_read;

-- ============================================================================
-- GL ACCOUNT MAPPINGS (Step 2 Integration)
-- ============================================================================

CREATE TABLE gl_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'ASSET',
    'LIABILITY',
    'EQUITY',
    'REVENUE',
    'EXPENSE'
  )),
  default_account BOOLEAN DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  UNIQUE(organization_id, code)
);

CREATE INDEX idx_gl_account_mappings_org 
  ON gl_account_mappings(organization_id);

ALTER TABLE gl_account_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY gl_account_mappings_select ON gl_account_mappings
  FOR SELECT USING (
    organization_id = current_setting('app.current_org_id')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON gl_account_mappings TO ledgr_app_write;
GRANT SELECT ON gl_account_mappings TO ledgr_app_read;

-- ============================================================================
-- AGENT CONFIGURATIONS (Step 4 Integration)
-- ============================================================================

CREATE TABLE agent_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_type VARCHAR(50) NOT NULL CHECK (agent_type IN (
    'INVOICING',
    'PAYABLES',
    'RECONCILIATION',
    'FORECASTING',
    'TAX_FILING',
    'VAT_MANAGEMENT',
    'EXPENSE_CATEGORIZATION',
    'CASH_FLOW'
  )),
  is_enabled BOOLEAN DEFAULT FALSE,
  confidence NUMERIC(5,2) DEFAULT 0,
  estimated_accuracy NUMERIC(5,2) DEFAULT 0,
  cost_per_month NUMERIC(10,2),
  go_live_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  UNIQUE(organization_id, agent_type)
);

CREATE INDEX idx_agent_deployments_org 
  ON agent_deployments(organization_id);
CREATE INDEX idx_agent_deployments_enabled 
  ON agent_deployments(organization_id, is_enabled);

ALTER TABLE agent_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_deployments_select ON agent_deployments
  FOR SELECT USING (
    organization_id = current_setting('app.current_org_id')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON agent_deployments TO ledgr_app_write;
GRANT SELECT ON agent_deployments TO ledgr_app_read;

-- ============================================================================
-- GO-LIVE CHECKLIST (Step 5 Integration)
-- ============================================================================

CREATE TABLE golive_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES onboarding_progress(id) ON DELETE CASCADE,
  item VARCHAR(500) NOT NULL,
  required BOOLEAN DEFAULT TRUE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  verified_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_golive_checklists_onboarding 
  ON golive_checklists(onboarding_id);

ALTER TABLE golive_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY golive_checklists_select ON golive_checklists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM onboarding_progress op 
      WHERE op.id = golive_checklists.onboarding_id 
      AND op.organization_id = current_setting('app.current_org_id')::uuid
    )
  );

GRANT SELECT, INSERT, UPDATE ON golive_checklists TO ledgr_app_write;
GRANT SELECT ON golive_checklists TO ledgr_app_read;

-- ============================================================================
-- COMPLETION CERTIFICATES
-- ============================================================================

CREATE TABLE completion_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES onboarding_progress(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  certificate_url VARCHAR(500),
  completed_at TIMESTAMPTZ NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  UNIQUE(onboarding_id)
);

CREATE INDEX idx_completion_certificates_org 
  ON completion_certificates(organization_id);

ALTER TABLE completion_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY completion_certificates_select ON completion_certificates
  FOR SELECT USING (
    organization_id = current_setting('app.current_org_id')::uuid
  );

GRANT SELECT, INSERT ON completion_certificates TO ledgr_app_write;
GRANT SELECT ON completion_certificates TO ledgr_app_read;

-- ============================================================================
-- FUNCTION: Update onboarding updated_at on save
-- ============================================================================

CREATE OR REPLACE FUNCTION update_onboarding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER onboarding_progress_updated_at_trigger
  BEFORE UPDATE ON onboarding_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_onboarding_updated_at();
