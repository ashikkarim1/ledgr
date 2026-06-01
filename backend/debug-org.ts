/**
 * Debug organizations table
 */

import { Pool } from 'pg';

async function debugOrg() {
  const pool = new Pool({
    user: process.env.DB_USER || 'test',
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'ledgr',
  });

  try {
    // Check the last organization created
    const result = await pool.query(
      'SELECT id, name, subscription_plan, subscription_status FROM organizations ORDER BY created_at DESC LIMIT 1'
    );

    if (result.rows.length > 0) {
      console.log('Latest Organization:');
      console.log(JSON.stringify(result.rows[0], null, 2));
    } else {
      console.log('No organizations found');
    }

    // Check if trial signup created the org - search for one with workspace_id from latest user
    const userResult = await pool.query(
      'SELECT user_id, workspace_id FROM users ORDER BY created_at DESC LIMIT 1'
    );

    if (userResult.rows.length > 0) {
      const { workspace_id } = userResult.rows[0];
      console.log('\nSearching for organization with ID:', workspace_id);
      
      const orgResult = await pool.query(
        'SELECT * FROM organizations WHERE id = $1',
        [workspace_id]
      );

      if (orgResult.rows.length > 0) {
        console.log('Found organization:');
        console.log(JSON.stringify(orgResult.rows[0], null, 2));
      } else {
        console.log('Organization NOT found!');
      }

      // Check subscriptions
      console.log('\nSearching for subscriptions with organization_id:', workspace_id);
      const subResult = await pool.query(
        'SELECT * FROM subscriptions WHERE organization_id = $1',
        [workspace_id]
      );

      if (subResult.rows.length > 0) {
        console.log('Found subscription:');
        console.log(JSON.stringify(subResult.rows[0], null, 2));
      } else {
        console.log('Subscription NOT found!');
      }
    }

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

debugOrg();
