/**
 * Base Integration Class
 * Abstract base class for all accounting and banking integrations
 * Provides common functionality for OAuth, token management, error handling, etc.
 */

import crypto from 'crypto';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import {
  OAuthToken,
  OAuthFlowState,
  IntegrationSetup,
  IntegrationError,
  SyncJob,
  SyncError,
  IIntegrationService,
  CompanyInfo,
  ChartOfAccount,
  Invoice,
  Bill,
  Transaction,
  BankAccount,
  BankTransaction,
} from "./integration-types.js";

// ============================================================================
// Encryption Utilities for Token Storage
// ============================================================================

export class TokenEncryption {
  private encryptionKey: Buffer;
  private algorithm = 'aes-256-gcm';

  constructor(encryptionKey?: string) {
    if (!encryptionKey && !process.env.TOKEN_ENCRYPTION_KEY) {
      throw new Error('TOKEN_ENCRYPTION_KEY not provided');
    }
    this.encryptionKey = Buffer.from(
      encryptionKey || process.env.TOKEN_ENCRYPTION_KEY!,
      'hex'
    );
  }

  encrypt(data: OAuthToken): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = (cipher as any).getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decrypt(encryptedData: string): OAuthToken {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(this.algorithm, this.encryptionKey, iv);
    (decipher as any).setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }
}

// ============================================================================
// Base Integration Class
// ============================================================================

export abstract class BaseIntegration implements IIntegrationService {
  protected setup: IntegrationSetup;
  protected tokens?: OAuthToken;
  protected errorLog: IntegrationError[] = [];
  protected tokenEncryption: TokenEncryption;
  protected logger: Logger;

  constructor(setup: IntegrationSetup, tokenEncryption?: TokenEncryption) {
    this.setup = setup;
    this.tokenEncryption = tokenEncryption || new TokenEncryption();
    this.logger = new Logger(`Integration:${setup.type}`);
  }

  // ========================================================================
  // OAuth & Authentication
  // ========================================================================

  /**
   * Generate authorization URL for OAuth flow
   */
  abstract getAuthorizationUrl(integrationId: string): Promise<string>;

  /**
   * Handle OAuth callback and exchange code for token
   */
  abstract handleOAuthCallback(
    integrationId: string,
    code: string,
    state: string
  ): Promise<OAuthToken>;

  /**
   * Test connection to external system
   */
  abstract testConnection(integrationId: string): Promise<boolean>;

  /**
   * Refresh OAuth tokens if expired
   */
  async refreshTokens(integrationId: string): Promise<OAuthToken> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const newTokens = await this.performTokenRefresh(this.tokens.refreshToken);
      this.tokens = newTokens;
      await this.saveTokens(integrationId, newTokens);

      this.logger.info('Tokens refreshed successfully', { integrationId });
      return newTokens;
    } catch (error) {
      this.logger.error('Token refresh failed', { integrationId, error });
      this.recordError({
        code: 'TOKEN_REFRESH_ERROR',
        message: `Failed to refresh tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        context: { integrationId },
        severity: 'critical',
      });
      throw error;
    }
  }

  /**
   * Perform actual token refresh (implemented by subclasses)
   */
  protected abstract performTokenRefresh(refreshToken: string): Promise<OAuthToken>;

  /**
   * Check if token is expired and refresh if needed
   */
  protected async ensureValidToken(integrationId: string): Promise<OAuthToken> {
    if (!this.tokens) {
      throw new Error('No tokens available');
    }

    const expiryMargin = 5 * 60 * 1000; // 5 minutes
    if (Date.now() + expiryMargin > this.tokens.expiresAt) {
      return this.refreshTokens(integrationId);
    }

    return this.tokens;
  }

  /**
   * Save encrypted tokens to storage (database, etc)
   */
  protected async saveTokens(integrationId: string, tokens: OAuthToken): Promise<void> {
    // Implementation depends on your storage layer
    // This is a placeholder that would be implemented with actual database call
    const encrypted = this.tokenEncryption.encrypt(tokens);
    this.logger.debug('Tokens saved (encrypted)', { integrationId });
  }

  /**
   * Load encrypted tokens from storage
   */
  protected async loadTokens(integrationId: string): Promise<OAuthToken | null> {
    // Implementation depends on your storage layer
    // This is a placeholder that would be implemented with actual database call
    return null;
  }

  // ========================================================================
  // Data Sync Methods (Abstract)
  // ========================================================================

  abstract syncCompanyInfo(integrationId: string): Promise<CompanyInfo>;
  abstract syncAccounts(integrationId: string): Promise<ChartOfAccount[]>;
  abstract syncInvoices(integrationId: string, since?: number): Promise<Invoice[]>;
  abstract syncBills(integrationId: string, since?: number): Promise<Bill[]>;
  abstract syncTransactions(integrationId: string, since?: number): Promise<Transaction[]>;
  abstract pushTransaction(integrationId: string, transaction: Transaction): Promise<string>;
  abstract syncBankAccounts(integrationId: string): Promise<BankAccount[]>;
  abstract syncBankTransactions(integrationId: string, since?: number): Promise<BankTransaction[]>;

  // ========================================================================
  // Sync Status & Management
  // ========================================================================

  async getSyncStatus(integrationId: string): Promise<SyncJob | null> {
    // Implementation would query sync job database
    return null;
  }

  async triggerSync(integrationId: string, dataTypes: string[]): Promise<SyncJob> {
    const job: SyncJob = {
      id: crypto.randomUUID(),
      integrationId,
      orgId: this.setup.orgId,
      type: 'manual',
      dataTypes: dataTypes as any,
      status: 'pending',
      startedAt: Date.now(),
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      itemsFailed: 0,
      errors: [],
      warnings: [],
      retryCount: 0,
      initiatedBy: 'user',
    };

    this.logger.info('Sync job triggered', { integrationId, jobId: job.id });
    return job;
  }

  async disconnect(integrationId: string): Promise<void> {
    this.setup.isConnected = false;
    this.setup.connectionStatus = 'pending';
    this.tokens = undefined;

    this.logger.info('Integration disconnected', { integrationId });
  }

  // ========================================================================
  // Error Handling & Logging
  // ========================================================================

  protected recordError(error: IntegrationError): void {
    if (!this.errorLog) {
      this.errorLog = [];
    }

    this.errorLog.push(error);

    // Keep only last 100 errors
    if (this.errorLog.length > 100) {
      this.errorLog = this.errorLog.slice(-100);
    }

    const logLevel = error.severity === 'critical' ? 'error' : 'warn';
    this.logger[logLevel](error.message, {
      code: error.code,
      context: error.context,
    });
  }

  protected createSyncError(
    code: string,
    message: string,
    dataId?: string,
    retryable = true
  ): SyncError {
    return {
      code,
      message,
      dataId,
      timestamp: Date.now(),
      retryable,
    };
  }

  getErrors(): IntegrationError[] {
    return this.errorLog;
  }

  clearErrors(): void {
    this.errorLog = [];
  }

  // ========================================================================
  // Rate Limiting & Retry Logic
  // ========================================================================

  protected async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    initialDelayMs = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (i < maxRetries - 1) {
          const delayMs = initialDelayMs * Math.pow(2, i);
          this.logger.warn(`Retry attempt ${i + 1}/${maxRetries} after ${delayMs}ms`, {
            error: lastError.message,
          });
          await this.delay(delayMs);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async respectRateLimit(
    minIntervalMs: number = 100
  ): Promise<void> {
    // Implementation would track last request time and enforce rate limit
    await this.delay(minIntervalMs);
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  protected generateState(): string {
    return randomBytes(32).toString('hex');
  }

  protected generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  protected generateCodeChallenge(codeVerifier: string): string {
    return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  }

  protected async validateWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
    method: 'hmac-sha256' | 'rsa' = 'hmac-sha256'
  ): Promise<boolean> {
    if (method === 'hmac-sha256') {
      const computed = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      return computed === signature;
    }

    // RSA verification would use crypto.verify
    return false;
  }

  protected logAudit(action: string, details: Record<string, any>): void {
    this.logger.info(`[AUDIT] ${action}`, {
      orgId: this.setup.orgId,
      integrationId: this.setup.id,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  protected sanitizeData(data: any): any {
    // Remove sensitive fields before logging
    if (typeof data !== 'object') return data;

    const sanitized = JSON.parse(JSON.stringify(data));
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'accessToken'];

    const removeSensitive = (obj: any) => {
      if (Array.isArray(obj)) {
        obj.forEach(removeSensitive);
      } else if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach((key) => {
          if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
            obj[key] = '[REDACTED]';
          } else {
            removeSensitive(obj[key]);
          }
        });
      }
    };

    removeSensitive(sanitized);
    return sanitized;
  }
}

// ============================================================================
// Simple Logger (replace with Winston/Pino in production)
// ============================================================================

export class Logger {
  constructor(private context: string) {}

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  info(message: string, data?: Record<string, any>): void {
    console.log(`[${this.getTimestamp()}] [${this.context}] INFO: ${message}`, data || '');
  }

  warn(message: string, data?: Record<string, any>): void {
    console.warn(
      `[${this.getTimestamp()}] [${this.context}] WARN: ${message}`,
      data || ''
    );
  }

  error(message: string, data?: Record<string, any>): void {
    console.error(
      `[${this.getTimestamp()}] [${this.context}] ERROR: ${message}`,
      data || ''
    );
  }

  debug(message: string, data?: Record<string, any>): void {
    if (process.env.DEBUG === 'true' || process.env.LOG_LEVEL === 'debug') {
      console.log(
        `[${this.getTimestamp()}] [${this.context}] DEBUG: ${message}`,
        data || ''
      );
    }
  }
}

export default BaseIntegration;
