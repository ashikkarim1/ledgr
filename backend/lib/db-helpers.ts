/**
 * Database Helper Functions
 * Core CRUD operations for users, organizations, subscriptions, and trial management
 */

import { Pool } from 'pg';
import { TrialUsage } from '../billing/billing-types';

// Global database pool (set by middleware or server initialization)
let dbPool: Pool | null = null;

/**
 * Set the global database pool reference
 */
export function setDbPool(pool: Pool): void {
  dbPool = pool;
}

/**
 * Get the global database pool
 */
export function getDbPool(): Pool {
  if (!dbPool) {
    throw new Error('Database pool not initialized. Call setDbPool() first.');
  }
  return dbPool;
}

/**
 * Create a new user with trial fields
 */
export async function createUserWithTrial(data: {
  user_id: string;
  workspace_id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: string;
  trial_started_at: Date;
  trial_ends_at: Date;
  trial_status: string;
}): Promise<any> {
  const pool = getDbPool();
  
  const query = `
    INSERT INTO users (
      id, organization_id, email, first_name, last_name,
      password_hash, status, 
      trial_started_at, trial_ends_at, trial_status
    )
    SELECT
      $1, org.id, $2, $3, $4, $5, 'active',
      $6, $7, $8
    FROM organizations org
    WHERE org.id = $9
    RETURNING id, email, organization_id, status
  `;

  const result = await pool.query(query, [
    data.user_id,
    data.email,
    data.full_name.split(' ')[0] || 'User',
    data.full_name.split(' ').slice(1).join(' ') || '',
    data.password_hash,
    data.trial_started_at,
    data.trial_ends_at,
    data.trial_status,
    data.workspace_id,
  ]);

  if (result.rows.length === 0) {
    throw new Error(`Failed to create user for workspace ${data.workspace_id}`);
  }

  return result.rows[0];
}

/**
 * Create a new organization with trial plan
 */
export async function createWorkspaceWithTrial(data: {
  workspace_id: string;
  name: string;
  industry: string;
  country: string;
  created_by: string;
  plan: string;
  trial_status: string;
  trial_start_date: Date;
  trial_end_date: Date;
}): Promise<any> {
  const pool = getDbPool();

  const query = `
    INSERT INTO organizations (
      id, name, slug, subscription_plan, subscription_status,
      billing_email, max_users, max_agents,
      industry, country_code,
      features_vat_enabled, features_agent_enabled,
      data_residency,
      created_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4, 'active',
      $5, $6, $7,
      $8, $9,
      false, true,
      $10,
      $11, $12
    )
    RETURNING id, name, slug, subscription_plan, subscription_status
  `;

  // Create a slug from the workspace name
  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);

  const now = new Date();
  const result = await pool.query(query, [
    data.workspace_id,
    data.name,
    `${slug}-${Date.now()}`, // Ensure unique slug
    data.plan,
    data.created_by, // Using as billing_email for now (should be org email)
    1, // max_users: 1 for trial
    1, // max_agents: 1 for trial
    data.industry,
    (data.country || 'AE').toUpperCase(),
    data.country || 'ae', // data_residency
    now, // created_at
    now, // updated_at
  ]);

  if (result.rows.length === 0) {
    throw new Error('Failed to create workspace');
  }

  return result.rows[0];
}

/**
 * Create a trial subscription
 */
export async function createTrialSubscription(data: {
  subscription_id: string;
  workspace_id: string;
  user_id: string;
  plan: string;
  status: string;
  documents_limit: number;
  agent_executions_limit: number;
  users_limit: number;
  trial_started_at: Date;
  trial_ends_at: Date;
}): Promise<any> {
  const pool = getDbPool();

  const now = new Date();
  const query = `
    INSERT INTO subscriptions (
      id, organization_id, plan, amount_per_cycle,
      currency, current_period_start, current_period_end,
      trial_end_date, status,
      created_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7,
      $8, $9,
      $10, $11
    )
    RETURNING id, organization_id, plan, status, trial_end_date
  `;

  const result = await pool.query(query, [
    data.subscription_id,
    data.workspace_id,
    data.plan,
    0, // amount_per_cycle: 0 for free trial
    'AED',
    data.trial_started_at,
    data.trial_ends_at,
    data.trial_ends_at,
    data.status,
    now,
    now,
  ]);

  if (result.rows.length === 0) {
    throw new Error('Failed to create subscription');
  }

  return result.rows[0];
}

/**
 * Initialize trial usage tracking
 */
export async function initializeTrialUsage(
  workspace_id: string,
  usage: TrialUsage
): Promise<any> {
  const pool = getDbPool();

  // Create trial_usage table entry
  const query = `
    INSERT INTO trial_usage (
      organization_id, documents_used, documents_limit,
      agent_executions_used, agent_executions_limit,
      users_added, users_limit,
      last_reset_date, days_remaining,
      created_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      NOW(), NOW()
    )
    ON CONFLICT (organization_id) DO UPDATE SET
      documents_used = $2,
      agent_executions_used = $4,
      users_added = $6,
      last_reset_date = $8,
      days_remaining = $9,
      updated_at = NOW()
    RETURNING *
  `;

  const result = await pool.query(query, [
    workspace_id,
    usage.documentsUsed,
    usage.maxDocuments,
    usage.agentExecutionsUsed,
    usage.maxAgentExecutions,
    usage.usersAdded,
    usage.maxUsers,
    usage.lastResetDate,
    usage.daysRemaining,
  ]);

  if (result.rows.length === 0) {
    throw new Error('Failed to initialize trial usage');
  }

  return result.rows[0];
}

/**
 * Find user by email
 */
export async function findUserByEmail(email: string): Promise<any> {
  const pool = getDbPool();

  const query = `
    SELECT 
      u.id as user_id,
      u.organization_id as workspace_id,
      u.email, 
      u.password_hash, 
      u.status,
      u.trial_started_at, 
      u.trial_ends_at, 
      u.trial_status,
      COALESCE(r.name, 'member') as role
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    WHERE u.email = $1 AND u.deleted_at IS NULL
    LIMIT 1
  `;

  const result = await pool.query(query, [email]);
  return result.rows[0] || null;
}

/**
 * Get user by ID
 */
export async function getUserById(user_id: string): Promise<any> {
  const pool = getDbPool();

  const query = `
    SELECT 
      u.id as user_id,
      u.organization_id as workspace_id,
      u.email, 
      u.password_hash, 
      u.status,
      u.trial_started_at, 
      u.trial_ends_at, 
      u.trial_status,
      COALESCE(r.name, 'member') as role
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    WHERE u.id = $1 AND u.deleted_at IS NULL
    LIMIT 1
  `;

  const result = await pool.query(query, [user_id]);
  return result.rows[0] || null;
}

/**
 * Update user's last login timestamp
 */
export async function updateUserLastLogin(user_id: string): Promise<any> {
  const pool = getDbPool();

  const query = `
    UPDATE users
    SET last_login_at = NOW(), updated_at = NOW()
    WHERE id = $1
    RETURNING id, last_login_at
  `;

  const result = await pool.query(query, [user_id]);
  return result.rows[0] || null;
}

/**
 * Get organization (workspace) by ID
 */
export async function getWorkspaceById(workspace_id: string): Promise<any> {
  const pool = getDbPool();

  const query = `
    SELECT id, name, slug, subscription_plan, subscription_status,
           max_users, max_agents, features_vat_enabled, features_agent_enabled,
           created_at, updated_at
    FROM organizations
    WHERE id = $1 AND deleted_at IS NULL
    LIMIT 1
  `;

  const result = await pool.query(query, [workspace_id]);
  return result.rows[0] || null;
}

/**
 * Get subscription by workspace ID
 */
export async function getSubscriptionByWorkspace(workspace_id: string): Promise<any> {
  const pool = getDbPool();

  const query = `
    SELECT id, organization_id, plan, status, trial_end_date,
           current_period_start, current_period_end,
           created_at, updated_at
    FROM subscriptions
    WHERE organization_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [workspace_id]);
  return result.rows[0] || null;
}

/**
 * Get trial usage for workspace
 */
export async function getTrialUsage(workspace_id: string): Promise<any> {
  const pool = getDbPool();

  const query = `
    SELECT organization_id, documents_used, documents_limit,
           agent_executions_used, agent_executions_limit,
           users_added, users_limit,
           last_reset_date, days_remaining,
           created_at, updated_at
    FROM trial_usage
    WHERE organization_id = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [workspace_id]);
  return result.rows[0] || null;
}

/**
 * Update trial usage
 */
export async function updateTrialUsage(
  workspace_id: string,
  updates: Partial<TrialUsage>
): Promise<any> {
  const pool = getDbPool();

  const query = `
    UPDATE trial_usage
    SET
      documents_used = COALESCE($2, documents_used),
      agent_executions_used = COALESCE($3, agent_executions_used),
      users_added = COALESCE($4, users_added),
      last_reset_date = COALESCE($5, last_reset_date),
      days_remaining = COALESCE($6, days_remaining),
      updated_at = NOW()
    WHERE organization_id = $1
    RETURNING *
  `;

  const result = await pool.query(query, [
    workspace_id,
    updates.documentsUsed ?? null,
    updates.agentExecutionsUsed ?? null,
    updates.usersAdded ?? null,
    updates.lastResetDate ?? null,
    updates.daysRemaining ?? null,
  ]);

  return result.rows[0] || null;
}

/**
 * Get trial info for workspace
 */
export async function getTrialInfo(workspace_id: string): Promise<any> {
  const pool = getDbPool();

  const query = `
    SELECT
      org.subscription_plan as plan,
      sub.trial_end_date,
      u.trial_status,
      u.trial_started_at,
      u.trial_ends_at,
      CEIL(EXTRACT(EPOCH FROM (u.trial_ends_at - NOW())) / 86400)::int as days_remaining
    FROM organizations org
    LEFT JOIN subscriptions sub ON sub.organization_id = org.id
    LEFT JOIN users u ON u.organization_id = org.id
    WHERE org.id = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [workspace_id]);
  return result.rows[0] || null;
}

/**
 * Get trial usage stats for workspace
 * Returns current usage with limits for feature gating
 */
export async function getTrialUsageStats(workspace_id: string): Promise<any> {
  const pool = getDbPool();

  const query = `
    SELECT
      COALESCE(tu.documents_used, 0) as documents_used,
      COALESCE(tu.documents_limit, 5) as documents_limit,
      COALESCE(tu.agent_executions_used, 0) as agent_executions_used,
      COALESCE(tu.agent_executions_limit, 10) as agent_executions_limit,
      COALESCE(tu.users_added, 1) as users_added,
      COALESCE(tu.users_limit, 1) as users_limit
    FROM trial_usage tu
    WHERE tu.organization_id = $1
  `;

  const result = await pool.query(query, [workspace_id]);
  
  // Return default limits if no trial usage record found
  if (result.rows.length === 0) {
    return {
      documents_used: 0,
      documents_limit: 5,
      agent_executions_used: 0,
      agent_executions_limit: 10,
      users_added: 1,
      users_limit: 1,
    };
  }

  return result.rows[0];
}

/**
 * Check if trial document limit is exceeded
 */
export async function checkTrialDocumentLimit(workspace_id: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const stats = await getTrialUsageStats(workspace_id);
  const allowed = stats.documents_used < stats.documents_limit;
  
  return {
    allowed,
    current: stats.documents_used,
    limit: stats.documents_limit,
  };
}

/**
 * Check if trial agent execution limit is exceeded
 */
export async function checkTrialExecutionLimit(workspace_id: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const stats = await getTrialUsageStats(workspace_id);
  const allowed = stats.agent_executions_used < stats.agent_executions_limit;
  
  return {
    allowed,
    current: stats.agent_executions_used,
    limit: stats.agent_executions_limit,
  };
}

/**
 * Check if trial user limit is exceeded
 */
export async function checkTrialUserLimit(workspace_id: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const stats = await getTrialUsageStats(workspace_id);
  const allowed = stats.users_added < stats.users_limit;
  
  return {
    allowed,
    current: stats.users_added,
    limit: stats.users_limit,
  };
}
