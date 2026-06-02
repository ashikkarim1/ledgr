import {
  SecretsManagerClient,
  GetSecretValueCommand,
  UpdateSecretCommand,
  RotateSecretCommand,
  ListSecretsCommand,
  CreateSecretCommand,
  TagResourceCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { generateSecureToken } from "./encryption.js";

/**
 * Secret Types - Standardized naming and rotation schedules
 */
export type SecretType =
  | 'database_password'
  | 'jwt_signing_key'
  | 'jwt_public_key'
  | 'oauth_provider_credentials'
  | 'twilio_auth_token'
  | 'stripe_api_key'
  | 'encryption_dek'
  | 'hmac_secret';

/**
 * Ledgr Secrets Manager - Handles secret lifecycle and envelope encryption
 *
 * Design:
 * 1. Envelope Encryption: DEK from Secrets Manager, encrypted by KMS master key
 * 2. Automatic Rotation: Database passwords (90 days), manual for JWT/API keys
 * 3. Audit Trail: All secret access logged to CloudTrail + audit_log table
 * 4. Least Privilege: IAM policies restrict access per secret, per service
 * 5. Version Control: Maintains secret history for rollback, immutable records
 *
 * Secret Naming Convention:
 *   - ledgr/{environment}/{secret_type}/{service}
 *   - Example: ledgr/prod/database_password/app-server
 */
export class SecretsManager {
  private secretsClient: SecretsManagerClient;
  private kmsClient: KMSClient;
  private kmsKeyId: string;
  private environment: 'dev' | 'staging' | 'prod';

  /**
   * @param kmsKeyId - KMS master key ID (HSM-backed in production)
   * @param environment - Deployment environment
   * @param region - AWS region
   */
  constructor(kmsKeyId: string, environment: 'dev' | 'staging' | 'prod', region: string = 'us-east-1') {
    this.secretsClient = new SecretsManagerClient({ region });
    this.kmsClient = new KMSClient({ region });
    this.kmsKeyId = kmsKeyId;
    this.environment = environment;
  }

  /**
   * Retrieve a secret with automatic decryption
   * Returns plaintext secret for immediate use
   * All accesses logged to CloudTrail
   */
  async getSecret(secretType: SecretType, service: string): Promise<string> {
    const secretName = `ledgr/${this.environment}/${secretType}/${service}`;

    try {
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await this.secretsClient.send(command);

      if (response.SecretString) {
        return response.SecretString;
      } else if (response.SecretBinary) {
        // Binary secret (rare, for encryption keys)
        return Buffer.from(response.SecretBinary).toString('base64');
      }

      throw new Error(`Secret ${secretName} is empty`);
    } catch (error) {
      console.error(`Failed to retrieve secret ${secretName}:`, error);
      throw new Error(`Secret retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve multiple secrets in a single batch call
   * Reduces API calls for initialization
   */
  async getSecrets(specs: Array<{ type: SecretType; service: string }>): Promise<Record<string, string>> {
    const secrets: Record<string, string> = {};

    for (const spec of specs) {
      try {
        secrets[`${spec.type}:${spec.service}`] = await this.getSecret(spec.type, spec.service);
      } catch (error) {
        console.error(`Failed to get secret ${spec.type}/${spec.service}:`, error);
        // Continue with other secrets
      }
    }

    return secrets;
  }

  /**
   * Create a new secret with KMS encryption and tagging
   * Used during initial setup or when adding new services
   */
  async createSecret(
    secretType: SecretType,
    service: string,
    secretValue: string,
    tags?: Record<string, string>
  ): Promise<{ arn: string; versionId: string }> {
    const secretName = `ledgr/${this.environment}/${secretType}/${service}`;

    try {
      const command = new CreateSecretCommand({
        Name: secretName,
        SecretString: secretValue,
        KmsKeyId: this.kmsKeyId,
        Tags: tags
          ? Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value }))
          : [
              { Key: 'environment', Value: this.environment },
              { Key: 'secret-type', Value: secretType },
              { Key: 'service', Value: service },
              { Key: 'managed-by', Value: 'ledgr-secrets-manager' },
            ],
      });

      const response = await this.secretsClient.send(command);

      return {
        arn: response.ARN || '',
        versionId: response.VersionId || '',
      };
    } catch (error) {
      console.error(`Failed to create secret ${secretName}:`, error);
      throw new Error(`Secret creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update a secret with new value
   * Creates new version, maintains version history
   * For passwords: triggers rotation lambda
   * For API keys: manual rotation only
   */
  async updateSecret(
    secretType: SecretType,
    service: string,
    newSecretValue: string,
    rotationTrigger: boolean = false
  ): Promise<{ versionId: string; arn: string }> {
    const secretName = `ledgr/${this.environment}/${secretType}/${service}`;

    try {
      const command = new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: newSecretValue,
        ClientRequestToken: generateSecureToken(32), // Unique version ID
      });

      const response = await this.secretsClient.send(command);

      // Log rotation event
      console.log(`Secret rotated: ${secretName}`, {
        versionId: response.VersionId,
        timestamp: new Date().toISOString(),
        rotationTrigger,
      });

      return {
        versionId: response.VersionId || '',
        arn: response.ARN || '',
      };
    } catch (error) {
      console.error(`Failed to update secret ${secretName}:`, error);
      throw new Error(`Secret update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rotate a secret automatically
   * Used for database passwords (90-day rotation)
   * Rotation function must be Lambda/ECS task with new password generation logic
   */
  async rotateSecret(secretType: SecretType, service: string): Promise<{ versionId: string }> {
    const secretName = `ledgr/${this.environment}/${secretType}/${service}`;

    try {
      const command = new RotateSecretCommand({
        SecretId: secretName,
        RotationLambdaARN: `arn:aws:lambda:us-east-1:ACCOUNT_ID:function:rotate-${secretType}`,
        RotationRules: {
          AutomaticallyAfterDays: secretType === 'database_password' ? 90 : undefined,
          Duration: '3h',
          ScheduleExpression: 'rate(90 days)',
        },
      });

      const response = await this.secretsClient.send(command);

      return {
        versionId: response.VersionId || '',
      };
    } catch (error) {
      console.error(`Failed to rotate secret ${secretName}:`, error);
      throw new Error(`Secret rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a new Data Encryption Key (DEK)
   * Uses KMS master key for encryption (envelope encryption pattern)
   * Returns both plaintext DEK (for immediate use) and encrypted DEK (for storage)
   */
  async generateAndStoreDataEncryptionKey(service: string): Promise<{
    plaintextDEK: Buffer;
    encryptedDEK: Buffer;
    keyId: string;
  }> {
    try {
      const command = new GenerateDataKeyCommand({
        KeyId: this.kmsKeyId,
        KeySpec: 'AES_256', // 256-bit key for AES-256-GCM
      });

      const response = await this.kmsClient.send(command);

      if (!response.Plaintext || !response.CiphertextBlob) {
        throw new Error('KMS GenerateDataKey returned incomplete response');
      }

      const plaintextDEK = Buffer.from(response.Plaintext);
      const encryptedDEK = Buffer.from(response.CiphertextBlob);

      // Store encrypted DEK in Secrets Manager for rotation/backup
      await this.createSecret('encryption_dek', service, encryptedDEK.toString('base64'));

      return {
        plaintextDEK,
        encryptedDEK,
        keyId: response.KeyId || '',
      };
    } catch (error) {
      console.error('Failed to generate DEK:', error);
      throw new Error(`DEK generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt a stored DEK using KMS
   * Used to restore DEK for encryption operations after key rotation
   */
  async decryptDataEncryptionKey(encryptedDEK: Buffer): Promise<Buffer> {
    try {
      const command = new DecryptCommand({
        CiphertextBlob: encryptedDEK,
        KeyId: this.kmsKeyId,
      });

      const response = await this.kmsClient.send(command);

      if (!response.Plaintext) {
        throw new Error('KMS Decrypt returned empty plaintext');
      }

      return Buffer.from(response.Plaintext);
    } catch (error) {
      console.error('Failed to decrypt DEK:', error);
      throw new Error(`DEK decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all secrets for an organization/environment
   * Used for initialization, audit, and rotation tracking
   */
  async listSecrets(filter?: {
    secretType?: SecretType;
    service?: string;
  }): Promise<
    Array<{
      name: string;
      arn: string;
      lastRotatedDate?: Date;
      nextRotationDate?: Date;
      tags: Record<string, string>;
    }>
  > {
    try {
      const command = new ListSecretsCommand({
        Filters: [
          {
            Key: 'tag-key',
            Values: ['managed-by'],
          },
          {
            Key: 'tag-value',
            Values: ['ledgr-secrets-manager'],
          },
        ],
      });

      const response = await this.secretsClient.send(command);

      let secrets =
        response.SecretList?.map((secret) => ({
          name: secret.Name || '',
          arn: secret.ARN || '',
          lastRotatedDate: secret.LastRotatedDate,
          nextRotationDate: secret.NextRotationDate,
          tags: secret.Tags?.reduce((acc, tag) => ({ ...acc, [tag.Key || '']: tag.Value || '' }), {}) || {},
        })) || [];

      // Apply filters
      if (filter?.secretType) {
        secrets = secrets.filter((s) => s.name.includes(`/${filter.secretType}/`));
      }

      if (filter?.service) {
        secrets = secrets.filter((s) => s.name.endsWith(`/${filter.service}`));
      }

      return secrets;
    } catch (error) {
      console.error('Failed to list secrets:', error);
      throw new Error(`Secret listing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate new JWT signing key pair
   * Uses cryptographically secure random bytes
   * RS256 keys stored separately in Secrets Manager
   */
  async generateJWTKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    // In production, use OpenSSL or @noble/ed25519
    // This is pseudocode - actual implementation requires proper key generation

    const publicKey = generateSecureToken(128); // Placeholder
    const privateKey = generateSecureToken(256); // Placeholder

    // Store private key in Secrets Manager
    await this.createSecret('jwt_signing_key', 'auth-service', privateKey);

    return { publicKey, privateKey };
  }

  /**
   * Generate new OAuth provider credentials
   * Creates consumer_key/consumer_secret for OAuth2.0 flows
   */
  async generateOAuthCredentials(provider: string): Promise<{
    clientId: string;
    clientSecret: string;
  }> {
    const clientId = `ledgr_${this.environment}_${generateSecureToken(16)}`;
    const clientSecret = generateSecureToken(64);

    await this.createSecret('oauth_provider_credentials', provider, JSON.stringify({ clientId, clientSecret }));

    return { clientId, clientSecret };
  }

  /**
   * Rotate all secrets in an organization
   * Called monthly or per compliance requirement
   * Returns rotation status for each secret
   */
  async rotateAllSecrets(): Promise<
    Array<{
      secretName: string;
      status: 'success' | 'skipped' | 'error';
      message?: string;
      newVersionId?: string;
    }>
  > {
    const secrets = await this.listSecrets();
    const results = [];

    for (const secret of secrets) {
      try {
        const secretType = secret.tags['secret-type'] as SecretType;
        const service = secret.tags['service'];

        // Only rotate database passwords automatically
        // Other secrets (JWT, OAuth) require manual rotation
        if (secretType === 'database_password') {
          const { versionId } = await this.rotateSecret(secretType, service);
          results.push({
            secretName: secret.name,
            status: 'success',
            newVersionId: versionId,
          });
        } else {
          results.push({
            secretName: secret.name,
            status: 'skipped',
            message: 'Manual rotation required',
          });
        }
      } catch (error) {
        results.push({
          secretName: secret.name,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }
}

/**
 * Development helper - Generate test secrets without AWS
 * DO NOT USE IN PRODUCTION
 */
export class MockSecretsManager {
  private secrets: Map<string, string> = new Map();

  async getSecret(secretType: SecretType, service: string): Promise<string> {
    const key = `ledgr/dev/${secretType}/${service}`;
    if (!this.secrets.has(key)) {
      this.secrets.set(key, generateSecureToken(64));
    }
    return this.secrets.get(key)!;
  }

  async createSecret(secretType: SecretType, service: string, value: string): Promise<{ arn: string; versionId: string }> {
    const key = `ledgr/dev/${secretType}/${service}`;
    this.secrets.set(key, value);
    return {
      arn: `arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:${key}`,
      versionId: generateSecureToken(16),
    };
  }

  async generateAndStoreDataEncryptionKey(service: string): Promise<{
    plaintextDEK: Buffer;
    encryptedDEK: Buffer;
    keyId: string;
  }> {
    const dek = randomBytes(32);
    return {
      plaintextDEK: dek,
      encryptedDEK: dek, // In dev, not actually encrypted
      keyId: 'dev-key-id',
    };
  }
}
