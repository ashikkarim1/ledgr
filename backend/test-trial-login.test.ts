/**
 * Test Trial Login Flow
 * Tests the /auth/login endpoint returns trial metadata
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createApp } from "./server.js";
import request from 'supertest';

describe('Trial Login Flow', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({
      user: process.env.DB_USER || 'test',
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: 'ledgr',
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should allow trial user login with trial metadata', async () => {
    const app = createApp(undefined, pool);

    const testUser = {
      email: `trial-login-${Date.now()}@example.com`,
      password: 'SecurePassword123!@#',
      full_name: 'Trial Login Test',
      workspace_name: 'Trial Login Workspace',
      country: 'AE',
    };

    // Signup
    const signupResponse = await request(app)
      .post('/v1/auth/signup-trial')
      .send(testUser);

    expect(signupResponse.status).toBe(201);
    const { data: signupData } = signupResponse.body;
    expect(signupData.user_id).toBeDefined();
    expect(signupData.workspace_id).toBeDefined();

    // Login
    const loginResponse = await request(app)
      .post('/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(loginResponse.status).toBe(200);
    const { data: loginData } = loginResponse.body;
    
    expect(loginData.user_id).toBeDefined();
    expect(loginData.workspace_id).toBeDefined();
    expect(loginData.role).toBeDefined();
    expect(loginData.token_expires_in).toBe(3600);
    expect(loginData.access_token).toBeDefined();
    expect(loginData.refresh_token).toBeDefined();
  });
});
