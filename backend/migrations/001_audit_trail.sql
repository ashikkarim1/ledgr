-- Migration 001: Audit Trail Schema with Tamper-Evident Hash Chain
-- Created for Ledgr Week 1-2 foundation security implementation
-- All audit events are immutable (INSERT-only); tamper detection via SHA-256 hash chain

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'FILE', 'LOGIN', 'LOGOUT', 'MFA_SETUP')),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  before_state JSONB,
  after_state JSONB,
  ip_address INET,
  user_agent TEXT,
  hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of tamper-evident chain
  parent_hash VARCHAR(64), -- Previous audit log hash for chain integrity
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for common queries
CREATE INDEX idx_audit_log_org_timestamp ON audit_log(org_id, timestamp DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, timestamp DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_hash_chain ON audit_log(parent_hash);

-- Enforce immutability: only INSERT allowed for app roles
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: app roles can INSERT, but never UPDATE/DELETE
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY audit_log_select_read ON audit_log
  FOR SELECT
  USING (org_id = current_setting('app.current_org_id')::uuid OR current_user = 'ledgr_audit');

-- Revoke dangerous operations
REVOKE UPDATE, DELETE ON audit_log FROM public;
REVOKE UPDATE, DELETE ON audit_log FROM ledgr_app_read;
REVOKE UPDATE, DELETE ON audit_log FROM ledgr_app_write;
REVOKE UPDATE, DELETE ON audit_log FROM ledgr_app_admin;

-- Grant appropriate permissions
GRANT INSERT ON audit_log TO ledgr_app_write;
GRANT SELECT ON audit_log TO ledgr_audit;
GRANT SELECT ON audit_log TO ledgr_app_read;

-- Grant sequence permission for BIGSERIAL
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO ledgr_app_write;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO ledgr_audit;
