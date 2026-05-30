/**
 * Integration Manager with Database Persistence
 * Extends IntegrationManager to add database storage capabilities
 */

import { Pool } from 'pg';
import { IntegrationManager } from './integration-factory';
import { IntegrationPersistence } from '../lib/integration-persistence';
import { BaseIntegration, OAuthToken, SyncJob } from './integration-types';

/**
 * Enhanced Integration Manager with Database Persistence
 */
export class PersistentIntegrationManager extends IntegrationManager {
  private persistence: IntegrationPersistence;
  private orgContext?: string;

  constructor(dbPool?: Pool, persistence?: IntegrationPersistence) {
    super();

    if (dbPool) {
      this.persistence = persistence || new IntegrationPersistence(dbPool);
    } else {
      console.warn('Database pool not provided to PersistentIntegrationManager - tokens will not persist');
    }
  }

  /**
   * Set organization context for audit logging and RLS
   */
  setOrganizationContext(orgId: string): void {
    this.orgContext = orgId;
  }

  /**
   * Save OAuth token to database (called after successful OAuth flow)
   */
  async persistOAuthToken(
    integrationId: string,
    token: OAuthToken
  ): Promise<void> {
    if (!this.persistence || !this.orgContext) {
      console.warn('Cannot persist token: database or org context not set');
      return;
    }

    try {
      await this.persistence.saveOAuthToken(this.orgContext, integrationId, token);
    } catch (error) {
      console.error('Failed to persist OAuth token:', error);
      throw error;
    }
  }

  /**
   * Load OAuth token from database
   */
  async loadOAuthToken(integrationId: string): Promise<OAuthToken | null> {
    if (!this.persistence) {
      return null;
    }

    try {
      return await this.persistence.getOAuthToken(integrationId);
    } catch (error) {
      console.error('Failed to load OAuth token:', error);
      return null;
    }
  }

  /**
   * Save sync job to database
   */
  async persistSyncJob(integrationId: string, job: SyncJob): Promise<void> {
    if (!this.persistence || !this.orgContext) {
      return;
    }

    try {
      await this.persistence.saveSyncJob(this.orgContext, integrationId, job);
    } catch (error) {
      console.error('Failed to persist sync job:', error);
    }
  }

  /**
   * Retrieve sync job from database
   */
  async retrieveSyncJob(jobId: string): Promise<SyncJob | null> {
    if (!this.persistence) {
      return null;
    }

    try {
      return await this.persistence.getSyncJob(jobId);
    } catch (error) {
      console.error('Failed to retrieve sync job:', error);
      return null;
    }
  }

  /**
   * List sync job history for integration
   */
  async getSyncJobHistory(
    integrationId: string,
    limit: number = 10
  ): Promise<SyncJob[]> {
    if (!this.persistence) {
      return [];
    }

    try {
      return await this.persistence.listSyncJobs(integrationId, limit);
    } catch (error) {
      console.error('Failed to list sync jobs:', error);
      return [];
    }
  }

  /**
   * Record a sync error in the database for audit trail
   */
  async recordSyncError(
    jobId: string,
    error: any
  ): Promise<void> {
    if (!this.persistence || !this.orgContext) {
      return;
    }

    try {
      await this.persistence.recordSyncError(this.orgContext, jobId, {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || String(error),
        retryable: error.retryable !== false,
        statusCode: error.statusCode,
        requestUrl: error.requestUrl,
        responseBody: error.responseBody
      });
    } catch (error) {
      console.error('Failed to record sync error:', error);
    }
  }

  /**
   * Log webhook received
   */
  async logWebhook(
    integrationId: string,
    eventType: string,
    payload: any,
    signature: string,
    timestamp: Date
  ): Promise<string | null> {
    if (!this.persistence || !this.orgContext) {
      return null;
    }

    try {
      return await this.persistence.logWebhookEvent(
        this.orgContext,
        integrationId,
        eventType,
        payload,
        signature,
        timestamp
      );
    } catch (error) {
      console.error('Failed to log webhook:', error);
      return null;
    }
  }

  /**
   * Mark webhook as processed
   */
  async markWebhookProcessed(
    webhookId: string,
    syncJobId?: string,
    error?: string
  ): Promise<void> {
    if (!this.persistence) {
      return;
    }

    try {
      await this.persistence.markWebhookProcessed(webhookId, syncJobId, error);
    } catch (error) {
      console.error('Failed to mark webhook processed:', error);
    }
  }

  /**
   * Log integration audit event
   */
  async auditLog(
    integrationId: string,
    action: string,
    details?: any
  ): Promise<void> {
    if (!this.persistence || !this.orgContext) {
      return;
    }

    try {
      await this.persistence.logIntegrationAudit(
        this.orgContext,
        integrationId,
        action,
        details || {}
      );
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }
}

export default PersistentIntegrationManager;
