/**
 * Test Trial Signup Flow
 * Tests the /auth/signup-trial endpoint with database integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createApp } from "./server.js";
import request from 'supertest';

describe('Trial Signup Flow', () => {
  let pool: Pool;

  beforeAll(() => {
    // Create database pool
    pool = new Pool({
      user: process.env.DB_USER || 'test',
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: 'ledgr',
    });
  });

  afterAll(async () => {
    // Cleanup
    await pool.end();
  });

  it('should create user, workspace, subscription, and trial usage on signup', async () => {
    try {
      // Create Express app with database pool
      const app = createApp(undefined, pool);

      // Test payload
      const testUser = {
        email: `trial-user-${Date.now()}@example.com`,
        password: 'SecurePassword123!@#',
        full_name: 'Test User',
        workspace_name: 'Test Workspace',
        country: 'AE',
      };

      // Make request
      const response = await request(app)
        .post('/v1/auth/signup-trial')
        .send(testUser)
        .expect(201);

      // Validate response structure
      const { data, success } = response.body;
      expect(success).toBe(true);
      expect(data).toBeDefined();
      expect(data.user_id).toBeDefined();
      expect(data.workspace_id).toBeDefined();
      expect(data.access_token).toBeDefined();
      expect(data.refresh_token).toBeDefined();
      expect(data.token_expires_in).toBe(3600);

      // Verify user record
      const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [data.user_id]
      );

      expect(userResult.rows.length).toBe(1);
      const user = userResult.rows[0];
      expect(user.email).toBe(testUser.email);
      expect(user.trial_status).toBe('active');
      expect(user.trial_started_at).toBeDefined();
      expect(user.trial_ends_at).toBeDefined();

      // Verify subscription record
      const subResult = await pool.query(
        'SELECT * FROM subscriptions WHERE organization_id = $1',
        [data.workspace_id]
      );

      expect(subResult.rows.length).toBe(1);
      const subscription = subResult.rows[0];
      expect(subscription.plan).toBe('free_trial');
      expect(subscription.status).toBe('active');
      expect(subscription.trial_end_date).toBeDefined();

      // Verify trial usage record
      const usageResult = await pool.query(
        'SELECT * FROM trial_usage WHERE organization_id = $1',
        [data.workspace_id]
      );

      expect(usageResult.rows.length).toBe(1);
      const usage = usageResult.rows[0];
      expect(usage.documents_used).toBe(0);
      expect(usage.documents_limit).toBe(5);
      expect(usage.agent_executions_used).toBe(0);
      expect(usage.agent_executions_limit).toBe(10);
      expect(usage.users_added).toBe(1);
      expect(usage.users_limit).toBe(1);
      expect(usage.days_remaining).toBe(14);
    } catch (error) {
      throw error;
    }
  });
});
