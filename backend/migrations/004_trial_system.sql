-- ============================================================================
-- Migration: 004_trial_system.sql
-- Purpose: Add free trial support to Ledgr billing system
-- Date: 2026-06-01
-- ============================================================================

-- ============================================================================
-- 1. ALTER USERS TABLE - Add trial fields
-- ============================================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_status VARCHAR(20); -- 'active', 'expired', 'upgraded', 'cancelled'

-- Index for trial lookups
CREATE INDEX IF NOT EXISTS idx_users_trial_status ON users(trial_status) WHERE trial_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_trial_end ON users(trial_ends_at) WHERE trial_ends_at IS NOT NULL;

-- ============================================================================
-- 2. ALTER ORGANIZATIONS TABLE - Add trial plan support
-- ============================================================================

-- Update subscription_plan enum to include 'free_trial'
-- Note: PostgreSQL doesn't support direct enum modifications in standard ALTER
-- For now, we rely on VARCHAR constraint, which is flexible

-- Add trial metadata columns if not present
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_status VARCHAR(20); -- 'active', 'expired', 'upgraded', 'cancelled'

-- Index for trial lookups
CREATE INDEX IF NOT EXISTS idx_organizations_trial_status ON organizations(trial_status) WHERE trial_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_plan_status ON organizations(subscription_plan, subscription_status);

-- ============================================================================
-- 3. ALTER SUBSCRIPTIONS TABLE - Add trial-specific fields
-- ============================================================================

-- The trial_end_date column already exists in the original schema
-- Just ensure it's indexed properly

CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end ON subscriptions(trial_end_date) WHERE trial_end_date IS NOT NULL;

-- ============================================================================
-- 4. CREATE TRIAL_USAGE TABLE - Track usage metrics for free trials
-- ============================================================================

CREATE TABLE IF NOT EXISTS trial_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Document usage tracking
  documents_used INT NOT NULL DEFAULT 0,
  documents_limit INT NOT NULL DEFAULT 5,
  
  -- Agent execution tracking (monthly)
  agent_executions_used INT NOT NULL DEFAULT 0,
  agent_executions_limit INT NOT NULL DEFAULT 10,
  
  -- User management
  users_added INT NOT NULL DEFAULT 1,
  users_limit INT NOT NULL DEFAULT 1,
  
  -- Monthly reset tracking
  last_reset_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Trial lifecycle
  days_remaining INT NOT NULL DEFAULT 14,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on trial_usage
CREATE INDEX IF NOT EXISTS idx_trial_usage_org ON trial_usage(organization_id);
CREATE INDEX IF NOT EXISTS idx_trial_usage_reset ON trial_usage(last_reset_date);

-- ============================================================================
-- 5. CREATE TRIAL_LIMITS TABLE - Define tier limits (reference data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trial_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier VARCHAR(50) NOT NULL UNIQUE, -- 'free_trial', 'free', 'professional', 'enterprise'
  duration_days INT NOT NULL, -- 14 for free_trial
  max_documents INT NOT NULL,
  max_agent_executions INT NOT NULL,
  max_concurrent_users INT NOT NULL,
  max_storage_mb INT NOT NULL,
  features_vat BOOLEAN NOT NULL DEFAULT false,
  features_income_tax BOOLEAN NOT NULL DEFAULT false,
  features_corporate_tax BOOLEAN NOT NULL DEFAULT false,
  features_agent BOOLEAN NOT NULL DEFAULT false,
  features_api BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert trial tier configuration
INSERT INTO trial_limits (
  tier, duration_days, max_documents, max_agent_executions,
  max_concurrent_users, max_storage_mb,
  features_vat, features_agent
) VALUES (
  'free_trial', 14, 5, 10, 1, 100, false, true
)
ON CONFLICT (tier) DO UPDATE SET
  duration_days = EXCLUDED.duration_days,
  max_documents = EXCLUDED.max_documents,
  max_agent_executions = EXCLUDED.max_agent_executions,
  max_concurrent_users = EXCLUDED.max_concurrent_users,
  max_storage_mb = EXCLUDED.max_storage_mb;

-- Insert free tier configuration (post-trial)
INSERT INTO trial_limits (
  tier, duration_days, max_documents, max_agent_executions,
  max_concurrent_users, max_storage_mb,
  features_vat, features_agent
) VALUES (
  'free', 0, 10, 20, 1, 200, false, true
)
ON CONFLICT (tier) DO NOTHING;

-- ============================================================================
-- 6. CREATE TRIAL_TRANSITIONS TABLE - Track trial status changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS trial_transitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  
  reason VARCHAR(255), -- 'expired', 'manual_upgrade', 'user_cancelled', etc.
  metadata JSONB, -- Additional context (old plan, new plan, etc.)
  
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on trial_transitions
CREATE INDEX IF NOT EXISTS idx_trial_transitions_org ON trial_transitions(organization_id);
CREATE INDEX IF NOT EXISTS idx_trial_transitions_created ON trial_transitions(created_at DESC);

-- ============================================================================
-- 7. HELPER FUNCTION: Calculate trial expiry
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_trial_days_remaining(
  p_end_date TIMESTAMPTZ
)
RETURNS INT AS $$
BEGIN
  IF p_end_date IS NULL THEN
    RETURN 0;  -- No trial end date means trial is no longer active (0 days remaining)
  END IF;
  
  RETURN GREATEST(0, DATE_PART('day', p_end_date - NOW())::INT);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 8. HELPER FUNCTION: Check if trial is active
-- ============================================================================

CREATE OR REPLACE FUNCTION is_trial_active(
  p_trial_status VARCHAR,
  p_trial_end_date TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_trial_status = 'active' AND p_trial_end_date > NOW();
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 9. TRIGGER: Update trial_usage when subscription changes
-- ============================================================================

CREATE OR REPLACE FUNCTION trial_usage_update_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- When subscription status changes, update trial_usage.days_remaining
  UPDATE trial_usage
  SET days_remaining = calculate_trial_days_remaining(NEW.trial_end_date),
      updated_at = NOW()
  WHERE organization_id = NEW.organization_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_trial_usage_on_subscription_change ON subscriptions;

CREATE TRIGGER update_trial_usage_on_subscription_change
AFTER UPDATE ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION trial_usage_update_trigger();

-- ============================================================================
-- 10. VERIFY MIGRATION
-- ============================================================================

-- Check that users table has trial columns
SELECT COUNT(*) as users_with_trial_fields
FROM information_schema.columns
WHERE table_name = 'users' 
  AND column_name IN ('trial_started_at', 'trial_ends_at', 'trial_status');

-- Check that trial_usage table exists
SELECT COUNT(*) as trial_usage_tables
FROM information_schema.tables
WHERE table_name = 'trial_usage';

-- Check that trial_limits are initialized
SELECT COUNT(*) as trial_tier_configs
FROM trial_limits;

COMMIT;
