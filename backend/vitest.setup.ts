/**
 * Vitest Setup File
 * Configures environment variables and test fixtures
 */

import dotenv from 'dotenv';

// Load .env file
dotenv.config();

// Set default test environment variables if not already set
if (!process.env.TOKEN_ENCRYPTION_KEY) {
  process.env.TOKEN_ENCRYPTION_KEY = 'test_encryption_key_1234567890123456';
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_very_long_secret_key_123';
}

if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_very_long_key_456';
}

if (!process.env.DB_HOST) {
  process.env.DB_HOST = 'localhost';
}

if (!process.env.DB_PORT) {
  process.env.DB_PORT = '5432';
}

if (!process.env.DB_USER) {
  process.env.DB_USER = 'test';
}

if (!process.env.DB_PASSWORD) {
  process.env.DB_PASSWORD = '';
}

if (!process.env.ENCRYPTION_KEY) {
  // Must be exactly 32 bytes (256 bits) for AES-256
  // This is a 64-character hex string which converts to 32 bytes
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
