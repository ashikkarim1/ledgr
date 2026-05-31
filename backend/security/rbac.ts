import { Pool } from 'pg';

/**
 * RBAC Engine - Fine-grained role-based access control
 *
 * 8 Roles with specific responsibilities:
 * 1. office_manager - Manages users, workspace, basic GL entries
 * 2. finance_controller - GL posting, reconciliation, trial balance
 * 3. vat_specialist - VAT returns, registration, compliance
 * 4. tax_specialist - Tax planning, treaty benefits, filings
 * 5. cfo - High-value approvals, budget variance, forecasting
 * 6. audit_manager - Read-only audit access, compliance reports
 * 7. payroll_officer - Payroll processing, MOHRE compliance
 * 8. regulatory_officer - Central Bank, FTA, regulatory filings
 *
 * Permission Format: category:resource:action
 * Example: gl:journal_entry:post
 */

export enum PermissionCategory {
  GL = 'gl',
  VAT = 'vat',
  TAX = 'tax',
  PAYROLL = 'payroll',
  USERS = 'users',
  AUDIT = 'audit',
  SETTINGS = 'settings',
  REPORTS = 'reports',
  COMPLIANCE = 'compliance',
}

export enum ResourceType {
  JOURNAL_ENTRY = 'journal_entry',
  GL_ACCOUNT = 'gl_account',
  CHART_OF_ACCOUNTS = 'chart_of_accounts',
  RECONCILIATION = 'reconciliation',
  VAT_RETURN = 'vat_return',
  VAT_REGISTRATION = 'vat_registration',
  TAX_RETURN = 'tax_return',
  EMPLOYEE = 'employee',
  PAYROLL_RUN = 'payroll_run',
  USER = 'user',
  ROLE = 'role',
  PERMISSION = 'permission',
  AUDIT_LOG = 'audit_log',
  COMPLIANCE_REPORT = 'compliance_report',
  ORGANIZATION = 'organization',
}

export enum ActionType {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  POST = 'post',
  APPROVE = 'approve',
  REJECT = 'reject',
  FILE = 'file',
  EXPORT = 'export',
  VIEW_PII = 'view_pii', // Special permission for sensitive data
  ESCALATE = 'escalate', // Escalate to higher authority
}

/**
 * Permission definition with metadata
 */
export interface Permission {
  id: string;
  name: string;
  description: string;
  category: PermissionCategory;
  resource: ResourceType;
  action: ActionType;
  requiresApproval?: boolean; // Requires second-person approval
  requiresMFA?: boolean; // Requires 2FA verification
  requiresExplanation?: boolean; // Must provide business justification
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Role definition with assigned permissions
 */
export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  canDelegate?: string[]; // Can delegate to these roles
}

/**
 * User role assignment with temporal and conditional constraints
 */
export interface UserRoleAssignment {
  user_id: string;
  role_id: string;
  org_id: string;
  assigned_at: Date;
  assigned_by: string;
  expires_at?: Date; // Temporary assignment expiration
  reason?: string; // Why assigned (project_code, business_justification)
  requires_approval?: boolean; // Awaiting approval
  is_active: boolean;
}

/**
 * RBAC Engine - Manages permissions, role assignments, and access evaluation
 */
export class RBACEngine {
  constructor(private db: Pool) {}

  /**
   * Get all permissions in the system
   */
  async getAllPermissions(): Promise<Permission[]> {
    const result = await this.db.query(`
      SELECT id, name, description, category, resource, action, 
             requires_approval, requires_mfa, requires_explanation, risk_level
      FROM permissions
      ORDER BY category, resource, action
    `);

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      resource: row.resource,
      action: row.action,
      requiresApproval: row.requires_approval,
      requiresMFA: row.requires_mfa,
      requiresExplanation: row.requires_explanation,
      riskLevel: row.risk_level,
    }));
  }

  /**
   * Get a user's effective permissions (merged from all assigned roles)
   * Includes temporary escalations, delegations
   */
  async getUserPermissions(userId: string, orgId: string): Promise<Set<string>> {
    // Get user's active roles (including temporary assignments)
    const rolesResult = await this.db.query(
      `
      SELECT DISTINCT r.id
      FROM roles r
      JOIN user_role_assignments ura ON r.id = ura.role_id
      WHERE ura.user_id = $1 
        AND ura.org_id = $2
        AND ura.is_active = true
        AND (ura.expires_at IS NULL OR ura.expires_at > NOW())
    `,
      [userId, orgId]
    );

    const roleIds = rolesResult.rows.map((row) => row.id);

    if (roleIds.length === 0) {
      return new Set();
    }

    // Get permissions for these roles
    const placeholders = roleIds.map((_, i) => `$${i + 1}`).join(',');
    const permissionsResult = await this.db.query(
      `
      SELECT DISTINCT p.id, p.category, p.resource, p.action
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ANY($1::uuid[])
    `,
      [roleIds]
    );

    const permissions = new Set<string>();
    for (const row of permissionsResult.rows) {
      permissions.add(`${row.category}:${row.resource}:${row.action}`);
    }

    return permissions;
  }

  /**
   * Check if user has a specific permission
   * @param requireAll - If true, user must have ALL permissions (AND logic)
   *                    If false, user must have AT LEAST ONE permission (OR logic)
   */
  async hasPermission(
    userId: string,
    orgId: string,
    requiredPermissions: string | string[],
    requireAll: boolean = true
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, orgId);

    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

    if (requireAll) {
      // User must have ALL required permissions
      return permissions.every((p) => userPermissions.has(p));
    } else {
      // User must have AT LEAST ONE required permission
      return permissions.some((p) => userPermissions.has(p));
    }
  }

  /**
   * Check if user can perform a specific action on a resource
   * Verifies permission exists and user has it
   */
  async canPerform(
    userId: string,
    orgId: string,
    category: PermissionCategory,
    resource: ResourceType,
    action: ActionType
  ): Promise<{
    allowed: boolean;
    requiresApproval?: boolean;
    requiresMFA?: boolean;
    requiresExplanation?: boolean;
  }> {
    const permissionStr = `${category}:${resource}:${action}`;

    const allowed = await this.hasPermission(userId, orgId, permissionStr);

    if (!allowed) {
      return { allowed: false };
    }

    // Get permission metadata
    const permResult = await this.db.query(
      `
      SELECT requires_approval, requires_mfa, requires_explanation
      FROM permissions
      WHERE id = $1
    `,
      [permissionStr]
    );

    const permData = permResult.rows[0];

    return {
      allowed: true,
      requiresApproval: permData?.requires_approval,
      requiresMFA: permData?.requires_mfa,
      requiresExplanation: permData?.requires_explanation,
    };
  }

  /**
   * Assign a role to a user
   * Can be permanent or temporary (expires_at)
   * Optionally requires approval workflow
   */
  async assignRole(
    userId: string,
    roleId: string,
    orgId: string,
    assignedBy: string,
    options?: {
      expiresAt?: Date;
      reason?: string;
      requiresApproval?: boolean;
    }
  ): Promise<UserRoleAssignment> {
    const result = await this.db.query(
      `
      INSERT INTO user_role_assignments (
        user_id, role_id, org_id, assigned_at, assigned_by,
        expires_at, reason, requires_approval, is_active
      ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)
      RETURNING user_id, role_id, org_id, assigned_at, assigned_by, 
                expires_at, reason, requires_approval, is_active
    `,
      [
        userId,
        roleId,
        orgId,
        assignedBy,
        options?.expiresAt || null,
        options?.reason || null,
        options?.requiresApproval || false,
        !options?.requiresApproval, // is_active = true only if no approval required
      ]
    );

    const row = result.rows[0];

    return {
      user_id: row.user_id,
      role_id: row.role_id,
      org_id: row.org_id,
      assigned_at: row.assigned_at,
      assigned_by: row.assigned_by,
      expires_at: row.expires_at,
      reason: row.reason,
      requires_approval: row.requires_approval,
      is_active: row.is_active,
    };
  }

  /**
   * Revoke a role from a user
   * Creates immutable audit record
   */
  async revokeRole(
    userId: string,
    roleId: string,
    orgId: string,
    revokedBy: string,
    reason: string
  ): Promise<void> {
    await this.db.query(
      `
      UPDATE user_role_assignments
      SET is_active = false
      WHERE user_id = $1 AND role_id = $2 AND org_id = $3 AND is_active = true
    `,
      [userId, roleId, orgId]
    );

    // Log audit event
    await this.db.query(
      `
      INSERT INTO audit_log (
        org_id, user_id, event_type, entity_type, entity_id,
        after_state, ip_address, user_agent, status, timestamp, hash, parent_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11)
    `,
      [
        orgId,
        revokedBy,
        'authz:role_removed',
        'user',
        userId,
        JSON.stringify({ roleId, reason }),
        'internal',
        'rbac-engine',
        'success',
        'temp_hash',
        'temp_parent_hash',
      ]
    );
  }

  /**
   * Get user's assigned roles and permissions
   * Useful for dashboards, role management UI
   */
  async getUserRoles(userId: string, orgId: string): Promise<
    Array<{
      roleId: string;
      roleName: string;
      assignedAt: Date;
      expiresAt?: Date;
      isActive: boolean;
      permissions: string[];
    }>
  > {
    const result = await this.db.query(
      `
      SELECT r.id, r.name, ura.assigned_at, ura.expires_at, ura.is_active
      FROM roles r
      JOIN user_role_assignments ura ON r.id = ura.role_id
      WHERE ura.user_id = $1 AND ura.org_id = $2
      ORDER BY ura.assigned_at DESC
    `,
      [userId, orgId]
    );

    const roles = [];

    for (const row of result.rows) {
      // Get permissions for this role
      const permResult = await this.db.query(
        `
        SELECT CONCAT(p.category, ':', p.resource, ':', p.action) as permission
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = $1
      `,
        [row.id]
      );

      const permissions = permResult.rows.map((p) => p.permission);

      roles.push({
        roleId: row.id,
        roleName: row.name,
        assignedAt: row.assigned_at,
        expiresAt: row.expires_at,
        isActive: row.is_active,
        permissions,
      });
    }

    return roles;
  }

  /**
   * Temporary role escalation (with approval)
   * Used for time-limited elevated access
   * Example: CFO approval for large GL entries
   */
  async requestTemporaryEscalation(
    userId: string,
    targetRoleId: string,
    orgId: string,
    duration: number, // milliseconds
    justification: string
  ): Promise<{
    requestId: string;
    status: 'pending_approval' | 'approved' | 'denied';
    expiresAt: Date;
  }> {
    const expiresAt = new Date(Date.now() + duration);
    const requestId = `escalation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create approval request (stored in separate table for workflow)
    await this.db.query(
      `
      INSERT INTO escalation_requests (
        request_id, user_id, target_role_id, org_id, justification,
        requested_at, expires_at, status
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
    `,
      [requestId, userId, targetRoleId, orgId, justification, expiresAt, 'pending_approval']
    );

    return {
      requestId,
      status: 'pending_approval',
      expiresAt,
    };
  }

  /**
   * Approve an escalation request and assign temporary role
   */
  async approveEscalation(requestId: string, approvedBy: string): Promise<void> {
    const reqResult = await this.db.query(
      `
      SELECT user_id, target_role_id, org_id, expires_at
      FROM escalation_requests
      WHERE request_id = $1 AND status = 'pending_approval'
    `,
      [requestId]
    );

    if (reqResult.rows.length === 0) {
      throw new Error(`Escalation request ${requestId} not found or already processed`);
    }

    const req = reqResult.rows[0];

    // Assign temporary role
    await this.assignRole(req.user_id, req.target_role_id, req.org_id, approvedBy, {
      expiresAt: req.expires_at,
      reason: `Temporary escalation approved by ${approvedBy}`,
    });

    // Update request status
    await this.db.query(
      `
      UPDATE escalation_requests
      SET status = 'approved', approved_by = $1, approved_at = NOW()
      WHERE request_id = $2
    `,
      [approvedBy, requestId]
    );
  }

  /**
   * Get all role assignments for an organization
   * Used for governance, compliance audits
   */
  async getOrgRoleAssignments(orgId: string): Promise<
    Array<{
      userId: string;
      userName: string;
      roleId: string;
      roleName: string;
      assignedAt: Date;
      expiresAt?: Date;
      isActive: boolean;
      assignedBy: string;
    }>
  > {
    const result = await this.db.query(
      `
      SELECT ura.user_id, u.name as user_name, ura.role_id, r.name as role_name,
             ura.assigned_at, ura.expires_at, ura.is_active, ura.assigned_by
      FROM user_role_assignments ura
      JOIN users u ON ura.user_id = u.id
      JOIN roles r ON ura.role_id = r.id
      WHERE ura.org_id = $1
      ORDER BY ura.assigned_at DESC
    `,
      [orgId]
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      userName: row.user_name,
      roleId: row.role_id,
      roleName: row.role_name,
      assignedAt: row.assigned_at,
      expiresAt: row.expires_at,
      isActive: row.is_active,
      assignedBy: row.assigned_by,
    }));
  }

  /**
   * Check for privileged role assignments
   * Alerts on CFO, audit_manager, regulatory_officer roles (high-risk)
   */
  async getPrivilegedAssignments(orgId: string): Promise<
    Array<{
      userId: string;
      userName: string;
      roleId: string;
      roleName: string;
      riskLevel: 'critical' | 'high';
      assignedAt: Date;
      expiresAt?: Date;
    }>
  > {
    const privilegedRoles = ['cfo', 'audit_manager', 'regulatory_officer'];

    const result = await this.db.query(
      `
      SELECT ura.user_id, u.name as user_name, ura.role_id, r.name as role_name,
             ura.assigned_at, ura.expires_at
      FROM user_role_assignments ura
      JOIN users u ON ura.user_id = u.id
      JOIN roles r ON ura.role_id = r.id
      WHERE ura.org_id = $1 
        AND r.id = ANY($2::text[])
        AND ura.is_active = true
        AND (ura.expires_at IS NULL OR ura.expires_at > NOW())
    `,
      [orgId, privilegedRoles]
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      userName: row.user_name,
      roleId: row.role_id,
      roleName: row.role_name,
      riskLevel: row.role_name === 'cfo' ? 'critical' : 'high',
      assignedAt: row.assigned_at,
      expiresAt: row.expires_at,
    }));
  }
}

/**
 * Express middleware for RBAC enforcement
 */
export function createRBACMiddleware(rbacEngine: RBACEngine) {
  return async (req: any, res: any, next: any) => {
    if (!req.auth?.user_id || !req.auth?.org_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Attach RBAC engine to request for route handlers
    req.rbac = rbacEngine;
    next();
  };
}
