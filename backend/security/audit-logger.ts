import { Pool, QueryResult } from 'pg';
import { createHash, createHmac } from 'crypto';
import { generateHash } from './encryption';

/**
 * Audit Event Types - Comprehensive logging for security and compliance
 * Used for SOC 2 Type II, GDPR audit trail, and incident forensics
 */
export enum AuditEventType {
  // Authentication events
  AUTH_LOGIN_SUCCESS = 'auth:login_success',
  AUTH_LOGIN_FAILURE = 'auth:login_failure',
  AUTH_LOGOUT = 'auth:logout',
  AUTH_2FA_ENABLED = 'auth:2fa_enabled',
  AUTH_2FA_DISABLED = 'auth:2fa_disabled',
  AUTH_PASSWORD_CHANGED = 'auth:password_changed',
  AUTH_PASSWORD_RESET = 'auth:password_reset',
  AUTH_SESSION_INVALIDATED = 'auth:session_invalidated',

  // Authorization events
  PERMISSION_GRANTED = 'authz:permission_granted',
  PERMISSION_REVOKED = 'authz:permission_revoked',
  ROLE_ASSIGNED = 'authz:role_assigned',
  ROLE_REMOVED = 'authz:role_removed',
  PERMISSION_DENIED = 'authz:permission_denied',

  // Data access events
  DATA_READ = 'data:read',
  DATA_CREATE = 'data:create',
  DATA_UPDATE = 'data:update',
  DATA_DELETE = 'data:delete',
  DATA_EXPORT = 'data:export',
  DATA_IMPORT = 'data:import',

  // Sensitive operations
  GL_ENTRY_POSTED = 'gl:entry_posted',
  VAT_RETURN_FILED = 'gl:vat_return_filed',
  TAX_RETURN_FILED = 'gl:tax_return_filed',
  PAYROLL_PROCESSED = 'payroll:processed',
  RECONCILIATION_COMPLETED = 'reconciliation:completed',

  // Compliance events
  RIGHT_TO_ACCESS_REQUESTED = 'compliance:right_to_access_requested',
  RIGHT_TO_DELETE_REQUESTED = 'compliance:right_to_delete_requested',
  DATA_RETENTION_POLICY_APPLIED = 'compliance:data_retention_applied',
  BREACH_NOTIFICATION_SENT = 'compliance:breach_notification_sent',

  // Security events
  SECURITY_INCIDENT_DETECTED = 'security:incident_detected',
  SUSPICIOUS_ACTIVITY = 'security:suspicious_activity',
  RATE_LIMIT_EXCEEDED = 'security:rate_limit_exceeded',
  IP_CHANGE_DETECTED = 'security:ip_change_detected',
  TOKEN_REVOKED = 'security:token_revoked',
  SECRETS_ROTATED = 'security:secrets_rotated',

  // Administrative events
  ADMIN_ACTION = 'admin:action',
  CONFIG_CHANGED = 'admin:config_changed',
  USER_CREATED = 'admin:user_created',
  USER_DEACTIVATED = 'admin:user_deactivated',
}

/**
 * Audit Log Entry - Immutable record with tamper-evident hash chain
 * Stored in INSERT-only RLS table for integrity
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  org_id: string;
  user_id: string;
  event_type: AuditEventType | string;
  entity_type: string;
  entity_id: string;
  before_state?: Record<string, any>;
  after_state?: Record<string, any>;
  ip_address: string;
  user_agent: string;
  status: 'success' | 'failure';
  error_message?: string;
  hash: string; // SHA-256 of (parent_hash || timestamp || user_id || entity_id || after_state)
  parent_hash: string; // Previous entry hash for chain integrity
  metadata?: Record<string, any>;
}

/**
 * Audit Logger - Manages immutable audit trails with cryptographic integrity
 * 
 * Design Principles:
 * 1. INSERT-ONLY: All records inserted once, never updated or deleted
 * 2. Tamper-Evident: Each record includes hash of previous record (chain)
 * 3. Query-Efficient: Indexed on org_id, user_id, event_type, timestamp
 * 4. Forensic-Ready: Includes IP, User-Agent, before/after state snapshots
 * 5. Compliance: Retains for 7+ years (configurable via retention policy)
 */
export class AuditLogger {
  constructor(
    private db: Pool,
    private hmacSecret: string // For signature verification of exported logs
  ) {}

  /**
   * Log an audit event with automatic hash chain validation
   * Returns the audit log entry with computed hash
   */
  async logEvent(
    event: Omit<AuditLogEntry, 'id' | 'hash' | 'parent_hash'>
  ): Promise<AuditLogEntry> {
    try {
      // Get parent hash (previous entry in org)
      const parentHashResult = await this.db.query(
        `SELECT hash FROM audit_log 
         WHERE org_id = $1 
         ORDER BY timestamp DESC, id DESC 
         LIMIT 1`,
        [event.org_id]
      );

      const parentHash = parentHashResult.rows[0]?.hash || 'GENESIS';

      // Compute hash: SHA-256(parentHash || timestamp || user_id || entity_id || JSON(afterState))
      const hashInput = `${parentHash}|${event.timestamp.toISOString()}|${event.user_id}|${event.entity_id}|${JSON.stringify(
        event.after_state || {}
      )}`;
      const hash = generateHash(hashInput);

      // Insert into audit_log (RLS policy prevents UPDATE/DELETE)
      const insertResult = await this.db.query(
        `INSERT INTO audit_log (
          org_id, user_id, event_type, entity_type, entity_id,
          before_state, after_state, ip_address, user_agent, status,
          error_message, hash, parent_hash, timestamp, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id, timestamp, hash, parent_hash`,
        [
          event.org_id,
          event.user_id,
          event.event_type,
          event.entity_type,
          event.entity_id,
          event.before_state ? JSON.stringify(event.before_state) : null,
          event.after_state ? JSON.stringify(event.after_state) : null,
          event.ip_address,
          event.user_agent,
          event.status,
          event.error_message || null,
          hash,
          parentHash,
          event.timestamp,
          event.metadata ? JSON.stringify(event.metadata) : null,
        ]
      );

      const row = insertResult.rows[0];
      return {
        ...event,
        id: row.id,
        hash: row.hash,
        parent_hash: row.parent_hash,
        timestamp: row.timestamp,
      };
    } catch (error) {
      console.error('Audit log write error:', error);
      throw new Error(`Failed to write audit log: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Query audit logs with full filtering capabilities
   * Returns immutable snapshot of historical records
   */
  async queryEvents(
    orgId: string,
    filters?: {
      userId?: string;
      eventType?: string;
      entityType?: string;
      entityId?: string;
      startTime?: Date;
      endTime?: Date;
      status?: 'success' | 'failure';
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: AuditLogEntry[]; total: number }> {
    let query = `
      SELECT id, timestamp, org_id, user_id, event_type, entity_type, entity_id,
             before_state, after_state, ip_address, user_agent, status, error_message,
             hash, parent_hash, metadata
      FROM audit_log
      WHERE org_id = $1
    `;

    const params: any[] = [orgId];
    let paramIndex = 2;

    if (filters?.userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters?.eventType) {
      query += ` AND event_type = $${paramIndex}`;
      params.push(filters.eventType);
      paramIndex++;
    }

    if (filters?.entityType) {
      query += ` AND entity_type = $${paramIndex}`;
      params.push(filters.entityType);
      paramIndex++;
    }

    if (filters?.entityId) {
      query += ` AND entity_id = $${paramIndex}`;
      params.push(filters.entityId);
      paramIndex++;
    }

    if (filters?.startTime) {
      query += ` AND timestamp >= $${paramIndex}`;
      params.push(filters.startTime);
      paramIndex++;
    }

    if (filters?.endTime) {
      query += ` AND timestamp <= $${paramIndex}`;
      params.push(filters.endTime);
      paramIndex++;
    }

    if (filters?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    // Get total count
    const countResult = await this.db.query(`SELECT COUNT(*) as count FROM (${query}) as t`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    // Apply pagination
    query += ` ORDER BY timestamp DESC, id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(filters?.limit || 100, filters?.offset || 0);

    const result = await this.db.query(query, params);

    const events = result.rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      org_id: row.org_id,
      user_id: row.user_id,
      event_type: row.event_type,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      before_state: row.before_state ? JSON.parse(row.before_state) : undefined,
      after_state: row.after_state ? JSON.parse(row.after_state) : undefined,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      status: row.status,
      error_message: row.error_message,
      hash: row.hash,
      parent_hash: row.parent_hash,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));

    return { events, total };
  }

  /**
   * Verify hash chain integrity for audit forensics
   * Returns integrity status and any broken links in the chain
   * 
   * Critical for:
   * - Post-incident forensics
   * - Compliance audits (SOC 2 Type II)
   * - Detecting tampering attempts
   */
  async verifyChainIntegrity(
    orgId: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<{
    valid: boolean;
    totalRecords: number;
    brokenLinks: Array<{ id: string; expectedHash: string; actualHash: string }>;
  }> {
    let query = `
      SELECT id, timestamp, hash, parent_hash, user_id, entity_id, after_state
      FROM audit_log
      WHERE org_id = $1
      ORDER BY timestamp ASC, id ASC
    `;

    const params: any[] = [orgId];
    let paramIndex = 2;

    if (startTime) {
      query = query.replace('ORDER BY', `AND timestamp >= $${paramIndex} ORDER BY`);
      params.splice(1, 0, startTime);
      paramIndex++;
    }

    if (endTime) {
      query = query.replace('ORDER BY', `AND timestamp <= $${paramIndex} ORDER BY`);
      params.push(endTime);
    }

    const result = await this.db.query(query, params);
    const records = result.rows;

    const brokenLinks: Array<{ id: string; expectedHash: string; actualHash: string }> = [];
    let previousHash = 'GENESIS';

    for (const record of records) {
      if (record.parent_hash !== previousHash) {
        brokenLinks.push({
          id: record.id,
          expectedHash: previousHash,
          actualHash: record.parent_hash,
        });
      }

      // Verify current record hash
      const hashInput = `${record.parent_hash}|${record.timestamp.toISOString()}|${record.user_id}|${record.entity_id}|${JSON.stringify(
        record.after_state || {}
      )}`;
      const expectedHash = generateHash(hashInput);

      if (expectedHash !== record.hash) {
        brokenLinks.push({
          id: record.id,
          expectedHash,
          actualHash: record.hash,
        });
      }

      previousHash = record.hash;
    }

    return {
      valid: brokenLinks.length === 0,
      totalRecords: records.length,
      brokenLinks,
    };
  }

  /**
   * Generate signed audit report for export (compliance, forensics)
   * Includes HMAC signature to prevent tampering of exported logs
   * 
   * Use cases:
   * - SOC 2 Type II auditor reports
   * - GDPR data subject access requests
   * - Incident forensics with external analysis
   */
  async generateSignedReport(
    orgId: string,
    startTime: Date,
    endTime: Date
  ): Promise<{
    report: {
      org_id: string;
      period: { start: Date; end: Date };
      events: AuditLogEntry[];
      integrity: { valid: boolean; totalRecords: number };
      generatedAt: Date;
    };
    signature: string; // HMAC-SHA256 of report JSON
  }> {
    const { events } = await this.queryEvents(orgId, {
      startTime,
      endTime,
      limit: 10000,
    });

    const integrity = await this.verifyChainIntegrity(orgId, startTime, endTime);

    const report = {
      org_id: orgId,
      period: { start: startTime, end: endTime },
      events,
      integrity: { valid: integrity.valid, totalRecords: integrity.totalRecords },
      generatedAt: new Date(),
    };

    const reportJSON = JSON.stringify(report, null, 2);
    const signature = createHmac('sha256', this.hmacSecret).update(reportJSON).digest('hex');

    return { report, signature };
  }

  /**
   * Retrieve activity summary for a user (security dashboard, investigations)
   */
  async getUserActivitySummary(
    orgId: string,
    userId: string,
    days: number = 30
  ): Promise<{
    userId: string;
    periodDays: number;
    totalEvents: number;
    eventsByType: Record<string, number>;
    failedAttempts: number;
    uniqueIPs: string[];
    lastActivityAt: Date | null;
  }> {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - days);

    const { events, total } = await this.queryEvents(orgId, {
      userId,
      startTime,
      limit: 10000,
    });

    const eventsByType: Record<string, number> = {};
    let failedAttempts = 0;
    const uniqueIPs = new Set<string>();
    let lastActivityAt: Date | null = null;

    for (const event of events) {
      eventsByType[event.event_type] = (eventsByType[event.event_type] || 0) + 1;
      if (event.status === 'failure') failedAttempts++;
      uniqueIPs.add(event.ip_address);
      if (!lastActivityAt || event.timestamp > lastActivityAt) {
        lastActivityAt = event.timestamp;
      }
    }

    return {
      userId,
      periodDays: days,
      totalEvents: total,
      eventsByType,
      failedAttempts,
      uniqueIPs: Array.from(uniqueIPs),
      lastActivityAt,
    };
  }

  /**
   * Track data deletion compliance (GDPR Article 17)
   * Creates immutable record of right-to-be-forgotten execution
   */
  async logDataDeletion(
    orgId: string,
    userId: string,
    subjectId: string, // User whose data is deleted
    deletedFields: string[],
    reason: 'user_request' | 'retention_policy' | 'account_deactivation',
    ipAddress: string,
    userAgent: string
  ): Promise<AuditLogEntry> {
    return this.logEvent({
      org_id: orgId,
      user_id: userId,
      event_type: AuditEventType.RIGHT_TO_DELETE_REQUESTED,
      entity_type: 'user',
      entity_id: subjectId,
      status: 'success',
      ip_address: ipAddress,
      user_agent: userAgent,
      after_state: {
        deletedFields,
        reason,
        deletedAt: new Date().toISOString(),
      },
      timestamp: new Date(),
    });
  }
}

/**
 * Express middleware for automatic audit logging
 * Captures request/response for all operations
 */
export function createAuditMiddleware(auditLogger: AuditLogger) {
  return async (req: any, res: any, next: any) => {
    const startTime = Date.now();

    // Capture response
    const originalJson = res.json;
    res.json = function (data: any) {
      const duration = Date.now() - startTime;

      // Determine success/failure from status code
      const status = res.statusCode < 400 ? 'success' : 'failure';

      // Log audit event for data mutations
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.auth?.org_id) {
        auditLogger
          .logEvent({
            org_id: req.auth.org_id,
            user_id: req.auth.user_id,
            event_type: `${req.method.toLowerCase()}:${req.baseUrl}`,
            entity_type: req.params.entityType || 'unknown',
            entity_id: req.params.entityId || req.body?.id || 'unknown',
            before_state: req.body?.before,
            after_state: data,
            ip_address: req.ip,
            user_agent: req.get('user-agent') || 'unknown',
            status,
            error_message: status === 'failure' ? data?.message : undefined,
            timestamp: new Date(),
            metadata: { duration, method: req.method, path: req.path },
          })
          .catch((err) => console.error('Audit middleware error:', err));
      }

      return originalJson.call(this, data);
    };

    next();
  };
}
