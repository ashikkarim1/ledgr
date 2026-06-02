/**
 * Fine-Grained Permission & Authorization System
 * RBAC with hierarchical permissions and scope validation
 */

import {
  RoleType,
  Role,
  Permission,
  PermissionCategory,
  AuthContext,
  AuthorizationCheckOptions,
  EntityAccessControl,
  AuthError
} from "./types.js";

// ============================================================================
// Permission Definitions (Hierarchical)
// ============================================================================

const PERMISSIONS: Record<string, Permission> = {
  // User Management
  'user:read': {
    id: 'user:read',
    name: 'Read Users',
    slug: 'user:read',
    description: 'View user list and profiles',
    category: PermissionCategory.USER_MANAGEMENT
  },
  'user:create': {
    id: 'user:create',
    name: 'Create Users',
    slug: 'user:create',
    description: 'Create new team members',
    category: PermissionCategory.USER_MANAGEMENT
  },
  'user:update': {
    id: 'user:update',
    name: 'Update Users',
    slug: 'user:update',
    description: 'Edit user information',
    category: PermissionCategory.USER_MANAGEMENT
  },
  'user:delete': {
    id: 'user:delete',
    name: 'Delete Users',
    slug: 'user:delete',
    description: 'Remove users from team',
    category: PermissionCategory.USER_MANAGEMENT
  },

  // Team Management
  'team:read': {
    id: 'team:read',
    name: 'Read Team',
    slug: 'team:read',
    description: 'View team information',
    category: PermissionCategory.TEAM_MANAGEMENT
  },
  'team:update': {
    id: 'team:update',
    name: 'Update Team',
    slug: 'team:update',
    description: 'Modify team settings',
    category: PermissionCategory.TEAM_MANAGEMENT
  },
  'role:assign': {
    id: 'role:assign',
    name: 'Assign Roles',
    slug: 'role:assign',
    description: 'Assign roles to team members',
    category: PermissionCategory.TEAM_MANAGEMENT
  },
  'role:manage': {
    id: 'role:manage',
    name: 'Manage Roles',
    slug: 'role:manage',
    description: 'Create and modify custom roles',
    category: PermissionCategory.TEAM_MANAGEMENT
  },

  // Financial Data Access
  'financials:read': {
    id: 'financials:read',
    name: 'Read Financial Data',
    slug: 'financials:read',
    description: 'View financial statements and data',
    category: PermissionCategory.FINANCIALS
  },
  'financials:write': {
    id: 'financials:write',
    name: 'Write Financial Data',
    slug: 'financials:write',
    description: 'Create and edit financial entries',
    category: PermissionCategory.FINANCIALS
  },
  'financials:approve': {
    id: 'financials:approve',
    name: 'Approve Financials',
    slug: 'financials:approve',
    description: 'Approve financial transactions',
    category: PermissionCategory.FINANCIALS
  },
  'reports:read': {
    id: 'reports:read',
    name: 'Read Reports',
    slug: 'reports:read',
    description: 'View financial reports',
    category: PermissionCategory.FINANCIALS
  },
  'reports:export': {
    id: 'reports:export',
    name: 'Export Reports',
    slug: 'reports:export',
    description: 'Export reports to PDF/Excel',
    category: PermissionCategory.FINANCIALS
  },

  // Agent Management
  'agents:read': {
    id: 'agents:read',
    name: 'Read Agents',
    slug: 'agents:read',
    description: 'View agent list and status',
    category: PermissionCategory.AGENTS
  },
  'agents:deploy': {
    id: 'agents:deploy',
    name: 'Deploy Agents',
    slug: 'agents:deploy',
    description: 'Deploy and activate agents',
    category: PermissionCategory.AGENTS
  },
  'agents:configure': {
    id: 'agents:configure',
    name: 'Configure Agents',
    slug: 'agents:configure',
    description: 'Modify agent settings and rules',
    category: PermissionCategory.AGENTS
  },
  'agents:monitor': {
    id: 'agents:monitor',
    name: 'Monitor Agents',
    slug: 'agents:monitor',
    description: 'View agent logs and analytics',
    category: PermissionCategory.AGENTS
  },

  // Integrations
  'integrations:read': {
    id: 'integrations:read',
    name: 'Read Integrations',
    slug: 'integrations:read',
    description: 'View connected integrations',
    category: PermissionCategory.INTEGRATIONS
  },
  'integrations:connect': {
    id: 'integrations:connect',
    name: 'Connect Integrations',
    slug: 'integrations:connect',
    description: 'Add new integrations',
    category: PermissionCategory.INTEGRATIONS
  },
  'integrations:disconnect': {
    id: 'integrations:disconnect',
    name: 'Disconnect Integrations',
    slug: 'integrations:disconnect',
    description: 'Remove integrations',
    category: PermissionCategory.INTEGRATIONS
  },

  // Billing & Admin
  'billing:read': {
    id: 'billing:read',
    name: 'Read Billing',
    slug: 'billing:read',
    description: 'View billing information',
    category: PermissionCategory.BILLING
  },
  'billing:manage': {
    id: 'billing:manage',
    name: 'Manage Billing',
    slug: 'billing:manage',
    description: 'Update subscription and payment methods',
    category: PermissionCategory.BILLING
  },
  'admin:audit': {
    id: 'admin:audit',
    name: 'Audit Logs',
    slug: 'admin:audit',
    description: 'View audit logs and compliance records',
    category: PermissionCategory.ADMIN
  },
  'admin:security': {
    id: 'admin:security',
    name: 'Security Settings',
    slug: 'admin:security',
    description: 'Manage security policies and IP whitelist',
    category: PermissionCategory.ADMIN
  }
};

// ============================================================================
// Built-in Role Definitions (Ledgr-specific)
// ============================================================================

const BUILT_IN_ROLES: Record<RoleType, string[]> = {
  client_admin: [
    // Full workspace access
    'user:read', 'user:create', 'user:update', 'user:delete',
    'team:read', 'team:update', 'role:assign', 'role:manage',
    'financials:read', 'financials:write', 'financials:approve',
    'reports:read', 'reports:export',
    'agents:read', 'agents:deploy', 'agents:configure', 'agents:monitor',
    'integrations:read', 'integrations:connect', 'integrations:disconnect',
    'billing:read', 'billing:manage',
    'admin:audit', 'admin:security'
  ],

  accountant: [
    // Financial management
    'user:read', 'team:read',
    'financials:read', 'financials:write', 'financials:approve',
    'reports:read', 'reports:export',
    'agents:read', 'agents:monitor',
    'admin:audit'
    // No billing or full agent control
  ],

  cfo: [
    // Strategic view
    'user:read', 'team:read',
    'financials:read', 'reports:read', 'reports:export',
    'agents:read', 'agents:monitor',
    'billing:read',
    'admin:audit'
    // No agent management or user editing
  ],

  agent_manager: [
    // Agent deployment and configuration
    'user:read', 'team:read',
    'agents:read', 'agents:deploy', 'agents:configure', 'agents:monitor',
    'integrations:read', 'integrations:connect',
    'admin:audit'
    // No financial access
  ],

  support_escalation: [
    // Help desk / support
    'user:read', 'team:read',
    'financials:read',
    'reports:read',
    'agents:read',
    'admin:audit'
    // Read-only, can see context for support tickets
  ],

  viewer: [
    // Read-only access (auditors, consultants)
    'user:read', 'team:read',
    'financials:read', 'reports:read',
    'agents:read',
    'admin:audit'
    // Minimal permissions for external stakeholders
  ]
};

// ============================================================================
// Role-Based Access Control
// ============================================================================

export class RBACManager {
  /**
   * Get permissions for a role
   */
  getPermissionsForRole(role: RoleType): string[] {
    return BUILT_IN_ROLES[role] || [];
  }

  /**
   * Get all built-in roles
   */
  getBuiltInRoles(): Record<RoleType, { name: string; permissions: string[] }> {
    const roles: any = {};
    Object.entries(BUILT_IN_ROLES).forEach(([roleKey, permissions]) => {
      const role = roleKey as RoleType;
      const names: Record<RoleType, string> = {
        client_admin: 'Client Admin',
        accountant: 'Accountant',
        cfo: 'CFO',
        agent_manager: 'Agent Manager',
        support_escalation: 'Support Escalation',
        viewer: 'Viewer'
      };
      roles[role] = {
        name: names[role],
        permissions
      };
    });
    return roles;
  }

  /**
   * Check if user has permission
   * Requires ALL specified permissions (AND logic)
   */
  hasPermission(roles: string[], permission: string): boolean {
    return roles.some(role => {
      const permissions = this.getPermissionsForRole(role as RoleType);
      return permissions.includes(permission);
    });
  }

  /**
   * Check if user has any of multiple permissions
   * Returns true if user has ANY permission (OR logic)
   */
  hasAnyPermission(roles: string[], permissions: string[]): boolean {
    return permissions.some(permission => this.hasPermission(roles, permission));
  }

  /**
   * Check if user has all of multiple permissions
   * Returns true only if user has ALL permissions (AND logic)
   */
  hasAllPermissions(roles: string[], permissions: string[]): boolean {
    return permissions.every(permission => this.hasPermission(roles, permission));
  }

  /**
   * Get all permissions for user based on roles
   */
  getUserPermissions(roles: string[]): string[] {
    const permissions = new Set<string>();
    roles.forEach(role => {
      const rolePermissions = this.getPermissionsForRole(role as RoleType);
      rolePermissions.forEach(perm => permissions.add(perm));
    });
    return Array.from(permissions);
  }
}

// ============================================================================
// Authorization Service
// ============================================================================

export class AuthorizationService {
  private rbac = new RBACManager();
  private entityAcl = new Map<string, EntityAccessControl[]>(); // entity_id -> acl

  /**
   * Verify authorization with fine-grained checks
   */
  authorize(
    context: AuthContext,
    required_permission: string | string[],
    options: AuthorizationCheckOptions = {}
  ): boolean {
    const permissions = Array.isArray(required_permission)
      ? required_permission
      : [required_permission];

    // Require specific role
    if (options.require_role && !context.roles.includes(options.require_role)) {
      return false;
    }

    // Require OAuth scopes
    if (options.require_scope) {
      const hasAllScopes = options.require_scope.every(scope =>
        context.scopes.includes(scope)
      );
      if (!hasAllScopes) return false;
    }

    // Require organization context
    if (options.org_context && !context.org_id) {
      return false;
    }

    // Check permissions
    if (options.require_all) {
      return this.rbac.hasAllPermissions(context.roles, permissions);
    } else {
      return this.rbac.hasAnyPermission(context.roles, permissions);
    }
  }

  /**
   * Check entity-level access (fine-grained ACL)
   */
  checkEntityAccess(
    user_id: string,
    entity_id: string,
    required_level: 'view' | 'edit' | 'admin'
  ): boolean {
    const acls = this.entityAcl.get(entity_id) || [];
    const userAcl = acls.find(acl => {
      // Extract user_id from grantor if needed
      const grantor = acl.granted_by;
      return grantor === user_id;
    });

    if (!userAcl) return false;

    // Check access level hierarchy
    const levels: Record<string, number> = { view: 1, edit: 2, admin: 3, owner: 4 };
    return (levels[userAcl.access_level] || 0) >= (levels[required_level] || 0);
  }

  /**
   * Grant entity access
   */
  grantEntityAccess(
    user_id: string,
    entity_id: string,
    entity_type: string,
    access_level: 'view' | 'edit' | 'admin' | 'owner',
    granted_by: string,
    expires_at?: Date
  ): EntityAccessControl {
    const acl: EntityAccessControl = {
      entity_type,
      entity_id,
      access_level,
      granted_by,
      granted_at: new Date(),
      expires_at
    };

    const key = `${user_id}:${entity_id}`;
    if (!this.entityAcl.has(key)) {
      this.entityAcl.set(key, []);
    }
    this.entityAcl.get(key)?.push(acl);

    return acl;
  }

  /**
   * Revoke entity access
   */
  revokeEntityAccess(user_id: string, entity_id: string): void {
    const key = `${user_id}:${entity_id}`;
    this.entityAcl.delete(key);
  }

  /**
   * Get all entity access for user
   */
  getUserEntityAccess(user_id: string): EntityAccessControl[] {
    const access: EntityAccessControl[] = [];
    this.entityAcl.forEach((acls, key) => {
      if (key.startsWith(user_id)) {
        access.push(...acls);
      }
    });
    return access;
  }
}

// ============================================================================
// Permission Enforcement Utilities
// ============================================================================

export function enforcePermission(
  context: AuthContext | undefined,
  permission: string | string[],
  options?: AuthorizationCheckOptions
): void {
  if (!context) {
    throw new AuthError(
      'unauthorized',
      'Authentication context missing',
      401
    );
  }

  const authz = new AuthorizationService();
  const authorized = authz.authorize(context, permission, options);

  if (!authorized) {
    const required = Array.isArray(permission) ? permission : [permission];
    throw new AuthError(
      'forbidden',
      `Insufficient permissions. Required: ${required.join(', ')}`,
      403,
      {
        required_permissions: required,
        user_roles: context.roles,
        user_permissions: context.permissions
      }
    );
  }
}

export function enforceEntityAccess(
  context: AuthContext | undefined,
  entity_id: string,
  required_level: 'view' | 'edit' | 'admin',
  entity_type: string = 'resource'
): void {
  if (!context) {
    throw new AuthError(
      'unauthorized',
      'Authentication context missing',
      401
    );
  }

  const authz = new AuthorizationService();
  const hasAccess = authz.checkEntityAccess(context.user_id, entity_id, required_level);

  if (!hasAccess) {
    throw new AuthError(
      'forbidden',
      `No ${required_level} access to this ${entity_type}`,
      403,
      {
        entity_id,
        entity_type,
        required_level
      }
    );
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  PERMISSIONS,
  BUILT_IN_ROLES
};
