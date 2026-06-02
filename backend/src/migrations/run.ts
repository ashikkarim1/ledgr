#!/usr/bin/env node

/**
 * Database Migration Runner
 * 
 * This script reads and executes all SQL migration files
 * in the migrations directory in order.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, '../../migrations');

async function runMigrations() {
  console.log('Starting database migrations...\n');

  try {
    // Get all SQL files in migrations directory
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      process.exit(0);
    }

    console.log(`Found ${files.length} migration file(s):\n`);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      console.log(`Running migration: ${file}`);

      try {
        const sql = fs.readFileSync(filePath, 'utf-8');
        
        // Split by semicolon to handle multiple statements
        const statements = sql
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0);

        for (const statement of statements) {
          await db.query(statement);
        }

        console.log(`✓ ${file} completed\n`);
      } catch (error) {
        console.error(`✗ Error running ${file}:`, error);
        throw error;
      }
    }

    console.log('All migrations completed successfully! ✓');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
