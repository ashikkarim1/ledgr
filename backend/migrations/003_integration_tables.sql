-- ============================================================================
-- INTEGRATION LAYER TABLES
-- Stores OAuth tokens, sync jobs, and integration state
-- Migration: 003_integration_tables.sql
-- ============================================================================

-- ============================================================================
-- 1. OAUTH TOKENS
-- Encrypted storage of OAuth access/refresh tokens
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Token data (encrypted)
  access_token_encrypted BYTEA NOT NULL,
  refresh_token_encrypted BYTEA,
  token_type VARCHAR(50) NOT NULL DEFAULT 'Bearer', -- Bearer, Basic, etc.

  -- Token metadata
  expires_at TIMESTAMP WITH TIME ZONE,
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  scope TEXT,

  -- Encryption metadata
  iv BYTEA NOT NULL, -- Initialization vector for AES-256-GCM
  auth_tag BYTEA NOT NULL, -- Authentication tag for GCM mode
  encryption_key_id VARCHAR(100), -- Key ID for key rotation

  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  revoked_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT valid_expiry CHECK (expires_at IS NULL OR expires_at > issued_at)
);

-- Indexes
CREATE INDEX idx_oauth_tokens_org ON oauth_tokens(organization_id);
CREATE INDEX idx_oauth_tokens_integration ON oauth_tokens(integration_id);
CREATE INDEX idx_oauth_tokens_expires ON oauth_tokens(expires_at) WHERE revoked_at IS NULL;

-- RLS for oauth_tokens
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY oauth_tokens_access_by_org ON oauth_tokens
  USING (organization_id = current_setting('app.org_id')::uuid);

CREATE POLICY oauth_tokens_modify_by_org ON oauth_tokens
  USING (organization_id = current_setting('app.org_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.org_id')::uuid);

-- ============================================================================
-- 2. SYNC JOBS
-- Tracks data synchronization execution and status
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Job tracking
  job_type VARCHAR(50) NOT NULL, -- 'full_sync', 'incremental_sync', 'webhook'
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, running, completed, partial, failed

  -- Execution details
  initiated_by VARCHAR(50), -- 'user', 'schedule', 'webhook', 'system'
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Data sync metrics
  accounts_synced INTEGER DEFAULT 0,
  invoices_synced INTEGER DEFAULT 0,
  bills_synced INTEGER DEFAULT 0,
  transactions_synced INTEGER DEFAULT 0,
  bank_accounts_synced INTEGER DEFAULT 0,
  bank_transactions_synced INTEGER DEFAULT 0,

  accounts_created INTEGER DEFAULT 0,
  accounts_updated INTEGER DEFAULT 0,
  invoices_created INTEGER DEFAULT 0,
  invoices_updated INTEGER DEFAULT 0,
  bills_created INTEGER DEFAULT 0,
  bills_updated INTEGER DEFAULT 0,
  transactions_created INTEGER DEFAULT 0,
  transactions_updated INTEGER DEFAULT 0,
  duplicates_detected INTEGER DEFAULT 0,

  -- Error tracking
  error_count INTEGER DEFAULT 0,
  last_error_message TEXT,
  last_error_code VARCHAR(50),

  -- Retry information
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  max_retries INTEGER DEFAULT 3,

  -- Sync window
  sync_start_date DATE, -- Date range synced
  sync_end_date DATE,

  -- Metadata
  metadata JSONB, -- Custom sync data like API response timing, pagination info
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT valid_timestamps CHECK (started_at IS NULL OR completed_at IS NULL OR completed_at >= started_at),
  CONSTRAINT valid_retry CHECK (retry_count >= 0 AND retry_count <= max_retries)
);

-- Indexes
CREATE INDEX idx_sync_jobs_org ON sync_jobs(organization_id);
CREATE INDEX idx_sync_jobs_integration ON sync_jobs(integration_id);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status) WHERE status IN ('pending', 'running');
CREATE INDEX idx_sync_jobs_created ON sync_jobs(created_at DESC);
CREATE INDEX idx_sync_jobs_retry ON sync_jobs(next_retry_at) WHERE status = 'failed';

-- RLS for sync_jobs
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_jobs_access_by_org ON sync_jobs
  USING (organization_id = current_setting('app.org_id')::uuid);

CREATE POLICY sync_jobs_modify_by_org ON sync_jobs
  USING (organization_id = current_setting('app.org_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.org_id')::uuid);

-- ============================================================================
-- 3. SYNC ERRORS LOG
-- Detailed error tracking for troubleshooting sync issues
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sync_job_id UUID REFERENCES sync_jobs(id) ON DELETE CASCADE,

  -- Error details
  error_code VARCHAR(100) NOT NULL, -- 'AUTH_FAILED', 'RATE_LIMITED', 'INVALID_DATA', etc.
  error_message TEXT NOT NULL,
  error_type VARCHAR(50), -- 'retryable', 'permanent', 'validation'

  -- Context
  entity_type VARCHAR(50), -- 'invoice', 'bill', 'transaction', etc.
  entity_id VARCHAR(255), -- ID in external system

  -- Debugging
  http_status_code INTEGER,
  request_url TEXT,
  response_body JSONB,
  stack_trace TEXT,

  -- Tracking
  is_resolved BOOLEAN DEFAULT false,
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sync_errors_org ON sync_errors(organization_id);
CREATE INDEX idx_sync_errors_job ON sync_errors(sync_job_id);
CREATE INDEX idx_sync_errors_code ON sync_errors(error_code);
CREATE INDEX idx_sync_errors_unresolved ON sync_errors(is_resolved) WHERE is_resolved = false;

-- RLS for sync_errors
ALTER TABLE sync_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_errors_access_by_org ON sync_errors
  USING (organization_id = current_setting('app.org_id')::uuid);

-- ============================================================================
-- 4. WEBHOOK EVENT LOG
-- Tracks incoming webhook events for audit and replay
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(100) NOT NULL, -- 'TRANSACTIONS', 'ITEM', 'AUTH_EXPIRING', etc.
  event_code VARCHAR(50),

  -- Webhook signature verification
  signature VARCHAR(255) NOT NULL,
  signature_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT true,

  -- Payload
  payload JSONB NOT NULL,

  -- Processing
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_error TEXT,

  -- Related sync job
  sync_job_id UUID REFERENCES sync_jobs(id) ON DELETE SET NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_webhook_events_org ON webhook_events(organization_id);
CREATE INDEX idx_webhook_events_integration ON webhook_events(integration_id);
CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed) WHERE processed = false;
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at DESC);

-- RLS for webhook_events
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_events_access_by_org ON webhook_events
  USING (organization_id = current_setting('app.org_id')::uuid);

-- ============================================================================
-- 5. INTEGRATION AUDIT LOG
-- Tracks all integration configuration changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Action tracking
  action VARCHAR(50) NOT NULL, -- 'created', 'connected', 'disconnected', 'config_changed', 'deleted'
  performed_by VARCHAR(255), -- User ID or 'system'

  -- Changes
  previous_values JSONB, -- Old values for modified fields
  new_values JSONB, -- New values for modified fields

  -- Details
  description TEXT,
  metadata JSONB,

  -- Compliance
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_integration_audit_org ON integration_audit_log(organization_id);
CREATE INDEX idx_integration_audit_integration ON integration_audit_log(integration_id);
CREATE INDEX idx_integration_audit_action ON integration_audit_log(action);
CREATE INDEX idx_integration_audit_created ON integration_audit_log(created_at DESC);

-- RLS for integration_audit_log
ALTER TABLE integration_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_audit_access_by_org ON integration_audit_log
  USING (organization_id = current_setting('app.org_id')::uuid);

-- ============================================================================
-- 6. DATA DEDUPLICATION INDEX
-- Helps detect duplicate transactions across imports
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_deduplication_index (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Record identification
  entity_type VARCHAR(50) NOT NULL, -- 'invoice', 'bill', 'transaction'
  entity_id VARCHAR(255), -- ID in external system

  -- Fingerprint for deduplication (hash of key fields)
  fingerprint VARCHAR(64) NOT NULL, -- SHA-256 hash of normalized record

  -- Source tracking
  source_integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  source_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Ledger tracking
  ledgr_entity_id UUID, -- Reference to actual entity in Ledgr

  -- Dedup result
  is_duplicate BOOLEAN DEFAULT false,
  duplicate_of UUID REFERENCES data_deduplication_index(id) ON DELETE SET NULL,
  dedup_confidence DECIMAL(3, 2), -- 0.0 to 1.0

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_dedup_org ON data_deduplication_index(organization_id);
CREATE INDEX idx_dedup_fingerprint ON data_deduplication_index(organization_id, entity_type, fingerprint);
CREATE INDEX idx_dedup_source ON data_deduplication_index(source_integration_id);
CREATE INDEX idx_dedup_duplicate ON data_deduplication_index(is_duplicate) WHERE is_duplicate = true;

-- RLS for data_deduplication_index
ALTER TABLE data_deduplication_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY dedup_access_by_org ON data_deduplication_index
  USING (organization_id = current_setting('app.org_id')::uuid);

-- ============================================================================
-- End of Integration Tables Migration
-- ============================================================================
