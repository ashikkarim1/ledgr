/**
 * Debug script to inspect login response structure
 */

import { Pool } from 'pg';
import { createApp } from "./server.js";
import request from 'supertest';

async function debugLoginResponse() {
  console.log('Debugging Login Response Structure...\n');

  const pool = new Pool({
    user: process.env.DB_USER || 'test',
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'ledgr',
  });

  try {
    const app = createApp(undefined, pool);

    // Signup a test user
    const testUser = {
      email: `debug-${Date.now()}@example.com`,
      password: 'SecurePassword123!@#',
      full_name: 'Debug User',
      workspace_name: 'Debug Workspace',
      country: 'AE',
    };

    const signupResponse = await request(app)
      .post('/v1/auth/signup-trial')
      .send(testUser)
      .expect(201);

    console.log('Signup successful. User ID:', signupResponse.body.data.user_id);
    console.log('Workspace ID:', signupResponse.body.data.workspace_id);
    console.log('');

    // Now test login
    const loginResponse = await request(app)
      .post('/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    console.log('Login Response Status:', loginResponse.status);
    console.log('');
    console.log('Full Login Response Body:');
    console.log(JSON.stringify(loginResponse.body, null, 2));
    
    // Check database state
    console.log('\n\nDatabase State Check:');
    const userResult = await pool.query(
      'SELECT id, email, trial_status, trial_started_at, trial_ends_at FROM users WHERE email = $1',
      [testUser.email]
    );
    
    if (userResult.rows.length > 0) {
      console.log('User in DB:');
      console.log(JSON.stringify(userResult.rows[0], null, 2));
    }

    const trialResult = await pool.query(
      'SELECT * FROM trial_usage WHERE organization_id = $1',
      [signupResponse.body.data.workspace_id]
    );
    
    if (trialResult.rows.length > 0) {
      console.log('\nTrial Usage in DB:');
      console.log(JSON.stringify(trialResult.rows[0], null, 2));
    }

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

debugLoginResponse();
