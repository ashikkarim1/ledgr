/**
 * Integration System Initialization
 * Sets up database connections, persistence layer, and integration manager
 */

import { Pool, Client } from 'pg';
import { PersistentIntegrationManager } from "../integrations/integration-manager.js";
import { IntegrationPersistence, TokenEncryption } from "./integration-persistence.js";

/**
 * Initialize integration system with database connection
 */
export async function initializeIntegrationSystem(): Promise<{
  pool: Pool;
  manager: PersistentIntegrationManager;
  persistence: IntegrationPersistence;
}> {
  // Create database pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test connection
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW()');
    console.log('Database connected:', result.rows[0]);
  } finally {
    client.release();
  }

  // Initialize token encryption
  let encryption: TokenEncryption;
  try {
    encryption = new TokenEncryption();
    console.log('Token encryption initialized');
  } catch (error) {
    console.warn('Token encryption not configured, using in-memory storage:', error instanceof Error ? error.message : String(error));
    // Continue without encryption - fallback to unencrypted tokens
    const keyHex = Buffer.alloc(32).toString('hex'); // Dummy key
    encryption = new TokenEncryption(keyHex);
  }

  // Initialize persistence layer
  const persistence = new IntegrationPersistence(pool, encryption);

  // Initialize integration manager
  const manager = new PersistentIntegrationManager(pool, persistence);

  return { pool, manager, persistence };
}

/**
 * Run database migrations
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('Running database migrations...');

    // Check if migrations have been run (look for integration tables)
    const result = await client.query(`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'oauth_tokens'
      )
    `);

    if (!result.rows[0].exists) {
      console.log('Integration tables not found, running 003_integration_tables.sql migration...');
      // In production, use a migration runner like Flyway or db-migrate
      // This is a simplified example - proper migrations should be run separately
      console.warn('Please run migrations manually: psql -f backend/migrations/003_integration_tables.sql');
    } else {
      console.log('Integration tables already exist');
    }
  } finally {
    client.release();
  }
}

/**
 * Setup RLS (Row Level Security) context for database queries
 */
export async function setupRLSContext(
  client: any,
  organizationId: string
): Promise<void> {
  await client.query(
    "SELECT set_config('app.org_id', $1, false)",
    [organizationId]
  );
}

/**
 * Gracefully shutdown integration system
 */
export async function shutdownIntegrationSystem(
  manager: PersistentIntegrationManager,
  pool: Pool
): Promise<void> {
  try {
    console.log('Shutting down integration system...');

    // Shutdown manager
    await manager.shutdown();
    console.log('Integration manager shutdown complete');

    // Close database pool
    await pool.end();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error during shutdown:', error);
    throw error;
  }
}

export default {
  initializeIntegrationSystem,
  runMigrations,
  setupRLSContext,
  shutdownIntegrationSystem
};
