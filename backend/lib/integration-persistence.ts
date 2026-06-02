/**
 * Integration Persistence Layer
 * Bridges integration manager with PostgreSQL database
 * Handles encrypted token storage and sync job persistence
 */

import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { OAuthToken, SyncJob, SyncError } from "../integrations/integration-types.js";

/**
 * AES-256-GCM Encryption/Decryption
 */
export class TokenEncryption {
  private encryptionKey: Buffer;

  constructor(keyHex?: string) {
    if (keyHex) {
      this.encryptionKey = Buffer.from(keyHex, 'hex');
    } else {
      // Use key from environment or generate new one
      const envKey = process.env.ENCRYPTION_KEY;
      if (!envKey) {
        throw new Error('ENCRYPTION_KEY environment variable required for token encryption');
      }
      this.encryptionKey = Buffer.from(envKey, 'hex');
    }

    // Validate key is 32 bytes (256 bits)
    if (this.encryptionKey.length !== 32) {
      throw new Error('Encryption key must be 256 bits (32 bytes)');
    }
  }

  /**
   * Encrypt token with AES-256-GCM
   * Returns: { encryptedToken, iv, authTag }
   */
  encrypt(token: string): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
    const iv = crypto.randomBytes(16); // 128-bit IV
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return { encrypted, iv, authTag };
  }

  /**
   * Decrypt token with AES-256-GCM
   */
  decrypt(encrypted: Buffer, iv: Buffer, authTag: Buffer): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  }
}

/**
 * Integration Persistence Service
 * Stores and retrieves integration data from PostgreSQL
 */
export class IntegrationPersistence {
  private pool: Pool;
  private encryption: TokenEncryption;

  constructor(pool: Pool, encryption?: TokenEncryption) {
    this.pool = pool;
    this.encryption = encryption || new TokenEncryption();
  }

  /**
   * Store OAuth token in database
   */
  async saveOAuthToken(
    organizationId: string,
    integrationId: string,
    token: OAuthToken
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Encrypt tokens
      const accessEncrypted = this.encryption.encrypt(token.accessToken);
      const refreshEncrypted = token.refreshToken ? this.encryption.encrypt(token.refreshToken) : null;

      const query = `
        INSERT INTO oauth_tokens (
          organization_id, integration_id,
          access_token_encrypted, refresh_token_encrypted, token_type,
          expires_at, issued_at, scope,
          iv, auth_tag, encryption_key_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (integration_id) DO UPDATE SET
          access_token_encrypted = $3,
          refresh_token_encrypted = $4,
          expires_at = $6,
          updated_at = now()
      `;

      await client.query(query, [
        organizationId,
        integrationId,
        accessEncrypted.encrypted,
        refreshEncrypted ? refreshEncrypted.encrypted : null,
        token.tokenType || 'Bearer',
        token.expiresAt ? new Date(token.expiresAt) : null,
        token.issuedAt ? new Date(token.issuedAt) : new Date(),
        token.scope,
        accessEncrypted.iv,
        accessEncrypted.authTag,
        process.env.JWT_KEY_ID || 'ledgr-signing-key-1'
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieve OAuth token from database
   */
  async getOAuthToken(integrationId: string): Promise<OAuthToken | null> {
    const query = `
      SELECT
        access_token_encrypted, refresh_token_encrypted, token_type,
        expires_at, issued_at, scope, iv, auth_tag
      FROM oauth_tokens
      WHERE integration_id = $1 AND revoked_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [integrationId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    try {
      const accessToken = this.encryption.decrypt(
        row.access_token_encrypted,
        row.iv,
        row.auth_tag
      );

      const refreshToken = row.refresh_token_encrypted
        ? this.encryption.decrypt(row.refresh_token_encrypted, row.iv, row.auth_tag)
        : undefined;

      return {
        accessToken,
        refreshToken,
        tokenType: row.token_type,
        expiresAt: row.expires_at,
        issuedAt: row.issued_at,
        scope: row.scope
      };
    } catch (error) {
      console.error('Failed to decrypt OAuth token:', error);
      throw new Error('Token decryption failed');
    }
  }

  /**
   * Save sync job to database
   */
  async saveSyncJob(
    organizationId: string,
    integrationId: string,
    job: SyncJob
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO sync_jobs (
          id, organization_id, integration_id,
          job_type, status, initiated_by,
          started_at, completed_at,
          accounts_synced, invoices_synced, bills_synced, transactions_synced,
          accounts_created, accounts_updated,
          invoices_created, invoices_updated,
          bills_created, bills_updated,
          transactions_created, transactions_updated,
          error_count, last_error_message,
          retry_count, next_retry_at,
          sync_start_date, sync_end_date,
          metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24,
          $25, $26, $27, $28, $29
        )
        ON CONFLICT (id) DO UPDATE SET
          status = $5,
          completed_at = $8,
          accounts_synced = $9,
          invoices_synced = $10,
          bills_synced = $11,
          transactions_synced = $12,
          error_count = $21,
          last_error_message = $22,
          retry_count = $23,
          next_retry_at = $24,
          updated_at = now()
      `;

      await client.query(query, [
        job.id,
        organizationId,
        integrationId,
        job.jobType || 'full_sync',
        job.status,
        job.initiatedBy || 'system',
        job.startedAt ? new Date(job.startedAt) : null,
        job.completedAt ? new Date(job.completedAt) : null,
        job.metrics?.accountsSynced || 0,
        job.metrics?.invoicesSynced || 0,
        job.metrics?.billsSynced || 0,
        job.metrics?.transactionsSynced || 0,
        job.metrics?.accountsCreated || 0,
        job.metrics?.accountsUpdated || 0,
        job.metrics?.invoicesCreated || 0,
        job.metrics?.invoicesUpdated || 0,
        job.metrics?.billsCreated || 0,
        job.metrics?.billsUpdated || 0,
        job.metrics?.transactionsCreated || 0,
        job.metrics?.transactionsUpdated || 0,
        job.errors?.length || 0,
        job.errors?.[0]?.message || null,
        job.retryCount || 0,
        job.nextRetryAt ? new Date(job.nextRetryAt) : null,
        null, null, // sync dates
        job.metadata ? JSON.stringify(job.metadata) : null,
        new Date(),
        new Date()
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Get sync job from database
   */
  async getSyncJob(jobId: string): Promise<SyncJob | null> {
    const query = `
      SELECT * FROM sync_jobs WHERE id = $1
    `;

    const result = await this.pool.query(query, [jobId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      integrationId: row.integration_id,
      jobType: row.job_type,
      status: row.status,
      initiatedBy: row.initiated_by,
      startedAt: row.started_at?.toISOString(),
      completedAt: row.completed_at?.toISOString(),
      metrics: {
        accountsSynced: row.accounts_synced,
        invoicesSynced: row.invoices_synced,
        billsSynced: row.bills_synced,
        transactionsSynced: row.transactions_synced,
        accountsCreated: row.accounts_created,
        accountsUpdated: row.accounts_updated,
        invoicesCreated: row.invoices_created,
        invoicesUpdated: row.invoices_updated,
        billsCreated: row.bills_created,
        billsUpdated: row.bills_updated,
        transactionsCreated: row.transactions_created,
        transactionsUpdated: row.transactions_updated,
        duplicatesDetected: row.duplicates_detected
      },
      errors: [],
      retryCount: row.retry_count,
      nextRetryAt: row.next_retry_at?.toISOString(),
      metadata: row.metadata
    };
  }

  /**
   * List recent sync jobs for integration
   */
  async listSyncJobs(
    integrationId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<SyncJob[]> {
    const query = `
      SELECT * FROM sync_jobs
      WHERE integration_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.pool.query(query, [integrationId, limit, offset]);

    return result.rows.map(row => ({
      id: row.id,
      integrationId: row.integration_id,
      jobType: row.job_type,
      status: row.status,
      initiatedBy: row.initiated_by,
      startedAt: row.started_at?.toISOString(),
      completedAt: row.completed_at?.toISOString(),
      metrics: {
        accountsSynced: row.accounts_synced,
        invoicesSynced: row.invoices_synced,
        billsSynced: row.bills_synced,
        transactionsSynced: row.transactions_synced,
        accountsCreated: row.accounts_created,
        accountsUpdated: row.accounts_updated,
        invoicesCreated: row.invoices_created,
        invoicesUpdated: row.invoices_updated,
        billsCreated: row.bills_created,
        billsUpdated: row.bills_updated,
        transactionsCreated: row.transactions_created,
        transactionsUpdated: row.transactions_updated,
        duplicatesDetected: row.duplicates_detected
      },
      errors: [],
      retryCount: row.retry_count,
      nextRetryAt: row.next_retry_at?.toISOString(),
      metadata: row.metadata
    }));
  }

  /**
   * Record sync error in database
   */
  async recordSyncError(
    organizationId: string,
    jobId: string,
    error: SyncError
  ): Promise<void> {
    const query = `
      INSERT INTO sync_errors (
        organization_id, sync_job_id,
        error_code, error_message, error_type,
        entity_type, entity_id,
        http_status_code, request_url, response_body
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    await this.pool.query(query, [
      organizationId,
      jobId,
      error.code,
      error.message,
      error.retryable ? 'retryable' : 'permanent',
      error.entityType || null,
      error.entityId || null,
      error.statusCode || null,
      error.requestUrl || null,
      error.responseBody ? JSON.stringify(error.responseBody) : null
    ]);
  }

  /**
   * Log webhook event
   */
  async logWebhookEvent(
    organizationId: string,
    integrationId: string,
    eventType: string,
    payload: any,
    signature: string,
    timestamp: Date
  ): Promise<string> {
    const query = `
      INSERT INTO webhook_events (
        organization_id, integration_id,
        event_type, signature, signature_timestamp,
        payload, processed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const result = await this.pool.query(query, [
      organizationId,
      integrationId,
      eventType,
      signature,
      timestamp,
      JSON.stringify(payload),
      false
    ]);

    return result.rows[0].id;
  }

  /**
   * Mark webhook as processed
   */
  async markWebhookProcessed(
    webhookId: string,
    syncJobId?: string,
    error?: string
  ): Promise<void> {
    const query = `
      UPDATE webhook_events
      SET
        processed = true,
        processed_at = now(),
        sync_job_id = $2,
        processing_error = $3
      WHERE id = $1
    `;

    await this.pool.query(query, [webhookId, syncJobId || null, error || null]);
  }

  /**
   * Log integration audit event
   */
  async logIntegrationAudit(
    organizationId: string,
    integrationId: string,
    action: string,
    details: {
      performedBy?: string;
      previousValues?: any;
      newValues?: any;
      description?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    const query = `
      INSERT INTO integration_audit_log (
        organization_id, integration_id,
        action, performed_by,
        previous_values, new_values,
        description, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.pool.query(query, [
      organizationId,
      integrationId,
      action,
      details.performedBy || 'system',
      details.previousValues ? JSON.stringify(details.previousValues) : null,
      details.newValues ? JSON.stringify(details.newValues) : null,
      details.description || null,
      details.ipAddress || null,
      details.userAgent || null
    ]);
  }
}

export default IntegrationPersistence;
