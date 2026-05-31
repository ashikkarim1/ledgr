/**
 * Ledgr Encryption & Decryption Utilities
 * AES-256-GCM for sensitive data + password hashing with bcrypt
 * Envelope encryption: DEK from AWS Secrets Manager, encrypted with KMS master key
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';

// ============================================================================
// Types
// ============================================================================

export interface EncryptionOptions {
  algorithm?: string;
  encoding?: BufferEncoding;
  delimiter?: string;
}

export interface EncryptedData {
  iv: string;
  authTag: string;
  ciphertext: string;
  algorithm: string;
}

// ============================================================================
// AES-256-GCM Encryption (Envelope Encryption)
// ============================================================================

/**
 * Encrypt sensitive data using AES-256-GCM
 * Format: base64(iv || authTag || ciphertext)
 * @param plaintext Data to encrypt
 * @param dek Data Encryption Key (32 bytes from Secrets Manager)
 * @param aad Optional Additional Authenticated Data (e.g., user_id)
 * @returns Base64-encoded encrypted data
 */
export function encryptSensitiveData(
  plaintext: string,
  dek: Buffer,
  aad?: string
): string {
  // Validate DEK (must be 256-bit = 32 bytes)
  if (dek.length !== 32) {
    throw new Error(`Invalid DEK length: expected 32 bytes, got ${dek.length}`);
  }

  // Generate random IV (16 bytes for AES)
  const iv = crypto.randomBytes(16);

  // Create cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);

  // Set additional authenticated data (optional)
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf-8'));
  }

  // Encrypt plaintext
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final()
  ]);

  // Get authentication tag (16 bytes)
  const authTag = cipher.getAuthTag();

  // Return: base64(iv || authTag || ciphertext)
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt AES-256-GCM encrypted data
 * @param encryptedData Base64-encoded encrypted data from encryptSensitiveData()
 * @param dek Data Encryption Key (32 bytes)
 * @param aad Additional Authenticated Data (must match encryption AAD)
 * @returns Decrypted plaintext
 */
export function decryptSensitiveData(
  encryptedData: string,
  dek: Buffer,
  aad?: string
): string {
  try {
    // Validate DEK
    if (dek.length !== 32) {
      throw new Error(`Invalid DEK length: expected 32 bytes, got ${dek.length}`);
    }

    // Decode base64
    const buffer = Buffer.from(encryptedData, 'base64');

    // Extract components
    // Format: iv (16) || authTag (16) || ciphertext (remaining)
    const iv = buffer.subarray(0, 16);
    const authTag = buffer.subarray(16, 32);
    const ciphertext = buffer.subarray(32);

    // Validate minimum length
    if (buffer.length < 32) {
      throw new Error('Encrypted data too short (minimum 32 bytes)');
    }

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);

    // Set auth tag and AAD
    decipher.setAuthTag(authTag);
    if (aad) {
      decipher.setAAD(Buffer.from(aad, 'utf-8'));
    }

    // Decrypt
    const decrypted = decipher.update(ciphertext) + decipher.final('utf-8');
    return decrypted;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
    throw error;
  }
}

// ============================================================================
// Password Hashing (bcrypt)
// ============================================================================

/**
 * Hash a password using bcrypt (salt rounds >= 12)
 * @param password Plain-text password
 * @param saltRounds Number of salt rounds (default: 12, minimum: 10)
 * @returns bcrypt hash
 */
export async function hashPassword(
  password: string,
  saltRounds: number = 12
): Promise<string> {
  if (saltRounds < 10) {
    throw new Error('Salt rounds must be >= 10 (recommended >= 12)');
  }

  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters');
  }

  return bcrypt.hash(password, saltRounds);
}

/**
 * Compare a plain-text password with a bcrypt hash
 * @param password Plain-text password to verify
 * @param hash bcrypt hash from hashPassword()
 * @returns true if password matches hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============================================================================
// JWT Token Encryption (for storing OAuth tokens in DB)
// ============================================================================

/**
 * Encrypt an OAuth token for secure storage in database
 * (Different from JWTs: this is for 3rd-party tokens)
 * @param token OAuth access token
 * @param dek Data Encryption Key
 * @param userId User ID for AAD (additional authenticated data)
 * @returns Encrypted token suitable for database storage
 */
export function encryptOAuthToken(
  token: string,
  dek: Buffer,
  userId: string
): string {
  // Use userId as AAD to prevent token reuse across users
  return encryptSensitiveData(token, dek, userId);
}

/**
 * Decrypt an OAuth token from database
 * @param encryptedToken Encrypted token from database
 * @param dek Data Encryption Key
 * @param userId User ID (must match AAD from encryption)
 * @returns Decrypted OAuth token
 */
export function decryptOAuthToken(
  encryptedToken: string,
  dek: Buffer,
  userId: string
): string {
  return decryptSensitiveData(encryptedToken, dek, userId);
}

// ============================================================================
// Key Derivation (for testing/dev environments only)
// ============================================================================

/**
 * Derive a Data Encryption Key from a password (PBKDF2)
 * WARNING: For development/testing only. Production should use AWS Secrets Manager.
 * @param password Password to derive key from
 * @param salt Salt (16+ bytes, random or from user data)
 * @param iterations PBKDF2 iterations (default: 100000)
 * @returns 32-byte DEK
 */
export function deriveKeyFromPassword(
  password: string,
  salt: Buffer = crypto.randomBytes(16),
  iterations: number = 100000
): { key: Buffer; salt: Buffer } {
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return { key, salt };
}

// ============================================================================
// Hash & Signature Utilities (for audit trail)
// ============================================================================

/**
 * Generate SHA-256 hash (for audit trail chain)
 * @param data Data to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function generateHash(data: string | Buffer): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate HMAC-SHA256 (for signature verification)
 * @param data Data to sign
 * @param key Signing key
 * @returns Hex-encoded HMAC
 */
export function generateHMAC(data: string, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

/**
 * Verify HMAC signature
 * @param data Original data
 * @param signature HMAC from generateHMAC()
 * @param key Signing key (must match original)
 * @returns true if signature is valid
 */
export function verifyHMAC(
  data: string,
  signature: string,
  key: Buffer
): boolean {
  const expected = generateHMAC(data, key);
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// ============================================================================
// Random Token Generation (for session tokens, reset links, etc.)
// ============================================================================

/**
 * Generate a cryptographically secure random token
 * @param length Length in bytes (default: 32)
 * @param encoding Encoding (default: 'hex')
 * @returns Random token
 */
export function generateSecureToken(
  length: number = 32,
  encoding: BufferEncoding = 'hex'
): string {
  if (length < 16) {
    throw new Error('Token length must be >= 16 bytes');
  }
  return crypto.randomBytes(length).toString(encoding);
}

/**
 * Generate a UUID (for entity IDs)
 * @returns UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Data Masking (for logs/exports)
// ============================================================================

/**
 * Mask sensitive data for display in logs
 * @param value Value to mask
 * @param visibleChars Number of chars to show at start/end (default: 2)
 * @returns Masked value (e.g., "AB****EF")
 */
export function maskSensitive(value: string, visibleChars: number = 2): string {
  if (value.length <= visibleChars * 2) {
    return '*'.repeat(value.length);
  }

  const start = value.substring(0, visibleChars);
  const end = value.substring(value.length - visibleChars);
  const masked = '*'.repeat(Math.max(1, value.length - visibleChars * 2));

  return `${start}${masked}${end}`;
}

/**
 * Remove sensitive fields from object (for logging)
 * @param obj Object to sanitize
 * @returns New object with sensitive fields masked
 */
export function maskSensitiveFields(obj: any): any {
  const sensitiveFields = [
    'ssn',
    'national_id',
    'passport',
    'account_number',
    'credit_card',
    'password',
    'password_hash',
    'oauth_token',
    'api_key',
    'jwt_secret',
    'hmac_key',
    'encryption_key'
  ];

  const masked = JSON.parse(JSON.stringify(obj)); // Deep clone

  for (const key of sensitiveFields) {
    if (masked[key]) {
      masked[key] = maskSensitive(String(masked[key]));
    }

    // Check nested objects
    for (const nestedKey in masked) {
      if (typeof masked[nestedKey] === 'object' && masked[nestedKey]) {
        if (masked[nestedKey][key]) {
          masked[nestedKey][key] = maskSensitive(
            String(masked[nestedKey][key])
          );
        }
      }
    }
  }

  return masked;
}

// ============================================================================
// Envelope Encryption Utilities (for DEK management)
// ============================================================================

/**
 * Generate a Data Encryption Key
 * (In production, fetch from AWS Secrets Manager)
 * @returns 32-byte DEK
 */
export function generateDEK(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Simulate KMS envelope encryption (development only)
 * @param plaintext Text to encrypt
 * @param masterKeyId KMS master key ID (unused in dev)
 * @returns Encrypted text (base64)
 */
export function envelopeEncrypt(plaintext: string, masterKeyId?: string): string {
  // In production: use AWS SDK to encrypt plaintext with master key
  // In dev: just base64 encode for testing
  if (!masterKeyId) {
    console.warn('⚠️ envelope encryption: masterKeyId not provided (dev mode)');
  }
  return Buffer.from(plaintext).toString('base64');
}

/**
 * Simulate KMS envelope decryption (development only)
 * @param ciphertext Encrypted text (base64)
 * @param masterKeyId KMS master key ID (unused in dev)
 * @returns Decrypted text
 */
export function envelopeDecrypt(ciphertext: string, masterKeyId?: string): string {
  // In production: use AWS SDK to decrypt with master key
  // In dev: just base64 decode
  if (!masterKeyId) {
    console.warn('⚠️ envelope decryption: masterKeyId not provided (dev mode)');
  }
  return Buffer.from(ciphertext, 'base64').toString('utf-8');
}

// ============================================================================
// Testing Utilities (dev only)
// ============================================================================

export const __DEV__ = {
  /**
   * Generate test DEK for development
   */
  generateTestDEK(): Buffer {
    // WARNING: Never use in production
    // This is deterministic for testing purposes
    return Buffer.alloc(32, 'test-dek-dev-only');
  },

  /**
   * Generate test password hash
   */
  async generateTestPasswordHash(): Promise<string> {
    return hashPassword('Test@Password123456', 10); // Lower rounds for speed in tests
  },

  /**
   * Inspect encrypted data structure
   */
  inspectEncrypted(encrypted: string) {
    const buffer = Buffer.from(encrypted, 'base64');
    return {
      iv: buffer.subarray(0, 16).toString('hex'),
      authTag: buffer.subarray(16, 32).toString('hex'),
      ciphertext: buffer.subarray(32).toString('hex'),
      totalLength: buffer.length
    };
  }
};

// ============================================================================
// Exports
// ============================================================================

export default {
  encryptSensitiveData,
  decryptSensitiveData,
  hashPassword,
  verifyPassword,
  encryptOAuthToken,
  decryptOAuthToken,
  generateHash,
  generateHMAC,
  verifyHMAC,
  generateSecureToken,
  generateUUID,
  maskSensitive,
  maskSensitiveFields,
  generateDEK,
  envelopeEncrypt,
  envelopeDecrypt,
  deriveKeyFromPassword
};
