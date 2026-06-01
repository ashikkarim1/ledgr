/**
 * Trial System Integration Tests
 * Comprehensive test suite for trial signup, usage tracking, limits, and upgrades
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createApp } from './server';
import request from 'supertest';

describe('Trial System Integration', () => {
  let pool: Pool;
  let testUserEmail: string;
  let testWorkspaceId: string;
  let testUserId: string;
  let accessToken: string;

  beforeAll(() => {
    // Create database pool
    pool = new Pool({
      user: process.env.DB_USER || 'test',
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: 'ledgr',
    });

    testUserEmail = `trial-test-${Date.now()}@example.com`;
  });

  afterAll(async () => {
    // Cleanup
    if (testWorkspaceId) {
      await pool.query('DELETE FROM trial_usage WHERE organization_id = $1', [testWorkspaceId]);
      await pool.query('DELETE FROM subscriptions WHERE organization_id = $1', [testWorkspaceId]);
      await pool.query('DELETE FROM users WHERE organization_id = $1', [testWorkspaceId]);
      await pool.query('DELETE FROM organizations WHERE id = $1', [testWorkspaceId]);
    }
    await pool.end();
  });

  describe('Trial Signup Flow', () => {
    it('should create user, workspace, subscription, and trial usage on signup', async () => {
      const app = createApp(undefined, pool);

      const testUser = {
        email: testUserEmail,
        password: 'SecurePassword123!@#',
        full_name: 'Trial Test User',
        workspace_name: 'Trial Test Workspace',
        country: 'AE',
      };

      const response = await request(app)
        .post('/v1/auth/signup-trial')
        .send(testUser)
        .expect(201);

      const { data, success } = response.body;
      testUserId = data.user_id;
      testWorkspaceId = data.workspace_id;
      accessToken = data.access_token;

      // Verify response
      expect(success).toBe(true);
      expect(data.user_id).toBeDefined();
      expect(data.workspace_id).toBeDefined();
      expect(data.access_token).toBeDefined();
      expect(data.refresh_token).toBeDefined();
      expect(data.token_expires_in).toBe(3600);

      // Verify user record
      const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [testUserId]
      );
      expect(userResult.rows.length).toBe(1);
      expect(userResult.rows[0].trial_status).toBe('active');
      expect(userResult.rows[0].trial_started_at).toBeDefined();
      expect(userResult.rows[0].trial_ends_at).toBeDefined();

      // Verify workspace record
      const workspaceResult = await pool.query(
        'SELECT * FROM organizations WHERE id = $1',
        [testWorkspaceId]
      );
      expect(workspaceResult.rows.length).toBe(1);
      expect(workspaceResult.rows[0].subscription_plan).toBe('free_trial');

      // Verify subscription record
      const subResult = await pool.query(
        'SELECT * FROM subscriptions WHERE organization_id = $1',
        [testWorkspaceId]
      );
      expect(subResult.rows.length).toBe(1);
      expect(subResult.rows[0].plan).toBe('free_trial');
      expect(subResult.rows[0].status).toBe('active');

      // Verify trial usage record
      const usageResult = await pool.query(
        'SELECT * FROM trial_usage WHERE organization_id = $1',
        [testWorkspaceId]
      );
      expect(usageResult.rows.length).toBe(1);
      expect(usageResult.rows[0].documents_used).toBe(0);
      expect(usageResult.rows[0].documents_limit).toBe(5);
      expect(usageResult.rows[0].agent_executions_used).toBe(0);
      expect(usageResult.rows[0].agent_executions_limit).toBe(10);
      expect(usageResult.rows[0].users_added).toBe(1);
      expect(usageResult.rows[0].users_limit).toBe(1);
      expect(usageResult.rows[0].days_remaining).toBe(14);
    });
  });

  describe('Trial Usage Tracking', () => {
    it('should track trial info with correct days remaining', async () => {
      const app = createApp(undefined, pool);

      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: testUserEmail,
          password: 'SecurePassword123!@#',
        })
        .expect(200);

      const { data } = response.body;

      // Check trial info in response
      expect(data.trial_status).toBe('active');
      expect(data.trial_ends_at).toBeDefined();
      expect(data.days_remaining).toBeGreaterThanOrEqual(0);
      expect(data.days_remaining).toBeLessThanOrEqual(14);
    });

    it('should return trial usage stats', async () => {
      const app = createApp(undefined, pool);

      const response = await request(app)
        .get(`/v1/billing/subscription`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const { data } = response.body;

      // Check subscription includes trial info
      expect(data.plan).toBe('free_trial');
      expect(data.status).toBe('active');
      expect(data.trial_end_date).toBeDefined();
    });
  });

  describe('Trial Limit Enforcement', () => {
    it('should validate document limit is enforced', async () => {
      // Query current usage
      const usageResult = await pool.query(
        'SELECT * FROM trial_usage WHERE organization_id = $1',
        [testWorkspaceId]
      );

      expect(usageResult.rows[0].documents_used).toBeLessThan(
        usageResult.rows[0].documents_limit
      );
    });

    it('should validate execution limit is enforced', async () => {
      // Query current usage
      const usageResult = await pool.query(
        'SELECT * FROM trial_usage WHERE organization_id = $1',
        [testWorkspaceId]
      );

      expect(usageResult.rows[0].agent_executions_used).toBeLessThan(
        usageResult.rows[0].agent_executions_limit
      );
    });

    it('should validate user limit is enforced', async () => {
      // Query current usage
      const usageResult = await pool.query(
        'SELECT * FROM trial_usage WHERE organization_id = $1',
        [testWorkspaceId]
      );

      expect(usageResult.rows[0].users_added).toBeLessThanOrEqual(
        usageResult.rows[0].users_limit
      );
    });
  });

  describe('Trial Upgrade Flow', () => {
    it('should upgrade trial subscription to professional plan', async () => {
      const app = createApp(undefined, pool);

      const response = await request(app)
        .post('/v1/billing/subscription/upgrade')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          plan: 'professional',
          billing_interval: 'monthly',
        })
        .expect(200);

      const { data, success } = response.body;

      expect(success).toBe(true);
      expect(data.plan).toBe('professional');
      expect(data.status).toBe('active');
      expect(data.billing_interval).toBe('monthly');
      expect(data.amount_per_cycle).toBeGreaterThan(0);
      expect(data.next_billing_date).toBeDefined();

      // Verify subscription updated in database
      const subResult = await pool.query(
        'SELECT * FROM subscriptions WHERE organization_id = $1',
        [testWorkspaceId]
      );
      expect(subResult.rows[0].plan).toBe('professional');
      expect(subResult.rows[0].trial_end_date).toBeNull();

      // Verify trial usage limits removed
      const usageResult = await pool.query(
        'SELECT * FROM trial_usage WHERE organization_id = $1',
        [testWorkspaceId]
      );
      expect(usageResult.rows.length).toBe(0);

      // Verify user trial status updated
      const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [testUserId]
      );
      expect(userResult.rows[0].trial_status).toBe('upgraded');
    });

    it('should reject upgrade for non-trial users', async () => {
      const app = createApp(undefined, pool);

      const response = await request(app)
        .post('/v1/billing/subscription/upgrade')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          plan: 'enterprise',
          billing_interval: 'annual',
        })
        .expect(400);

      const { errors } = response.body;
      expect(errors[0].code).toBe('NOT_ON_TRIAL');
    });
  });

  describe('Non-Trial Signup Flow', () => {
    it('should create regular free tier user without trial limits', async () => {
      const app = createApp(undefined, pool);

      const testUser = {
        email: `free-user-${Date.now()}@example.com`,
        password: 'SecurePassword123!@#',
        full_name: 'Free User',
        workspace_name: 'Free Workspace',
        country: 'AE',
      };

      const response = await request(app)
        .post('/v1/auth/signup')
        .send(testUser)
        .expect(201);

      const { data, success } = response.body;
      const freeUserId = data.user_id;
      const freeWorkspaceId = data.workspace_id;

      expect(success).toBe(true);
      expect(data.user_id).toBeDefined();

      // Verify user has no trial
      const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [freeUserId]
      );
      expect(userResult.rows[0].trial_status).toBe('inactive');

      // Verify workspace is "free" plan, not "free_trial"
      const workspaceResult = await pool.query(
        'SELECT * FROM organizations WHERE id = $1',
        [freeWorkspaceId]
      );
      expect(workspaceResult.rows[0].subscription_plan).toBe('free');

      // Cleanup
      await pool.query('DELETE FROM trial_usage WHERE organization_id = $1', [freeWorkspaceId]);
      await pool.query('DELETE FROM subscriptions WHERE organization_id = $1', [freeWorkspaceId]);
      await pool.query('DELETE FROM users WHERE organization_id = $1', [freeWorkspaceId]);
      await pool.query('DELETE FROM organizations WHERE id = $1', [freeWorkspaceId]);
    });
  });
});
