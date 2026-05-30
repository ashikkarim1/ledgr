// Role-Based Access Control (RBAC) Matrix
// Day 4-5 implementation: 8 roles with granular permissions
// Used in middleware to enforce authorization

// ============================================================================
// Role Definitions with Permissions
// ============================================================================

const ROLES = {
  // Office Manager: Org admin, user management, dashboard view
  office_manager: {
    name: 'Office Manager',
    description: 'Manages organization settings, users, and dashboard',
    permissions: [
      'read:org',
      'write:org',
      'read:users',
      'write:users',
      'write:user_roles',
      'read:dashboard',
      'write:dashboard_settings',
      'read:audit_log'
    ],
    can_approve: true,
    can_file_returns: false
  },

  // Finance Controller: GL, journal entries, financial reports
  finance_controller: {
    name: 'Finance Controller',
    description: 'Manages GL entries, approves journal postings, views financial reports',
    permissions: [
      'read:org',
      'read:gl',
      'write:gl',
      'write:gl_entries',
      'read:journal_entries',
      'approve:journal_entries',
      'read:reports',
      'read:balance_sheet',
      'read:income_statement',
      'read:cash_flow',
      'read:accounts',
      'write:accounts',
      'read:audit_log'
    ],
    can_approve: true,
    can_file_returns: false
  },

  // VAT Specialist: VAT compliance, returns, filings
  vat_specialist: {
    name: 'VAT Specialist',
    description: 'Manages VAT compliance, prepares VAT returns, submits to FTA',
    permissions: [
      'read:org',
      'read:vat',
      'write:vat',
      'read:vat_journal',
      'write:vat_journal',
      'read:vat_returns',
      'write:vat_returns',
      'file:vat_return',
      'read:vat_invoices',
      'read:vat_reports',
      'read:audit_log'
    ],
    can_approve: false,
    can_file_returns: true
  },

  // Tax Specialist: Corporate tax, tax planning, returns
  tax_specialist: {
    name: 'Tax Specialist',
    description: 'Manages corporate tax, prepares tax returns, tax planning',
    permissions: [
      'read:org',
      'read:tax',
      'write:tax',
      'read:tax_summary',
      'write:tax_summary',
      'read:tax_returns',
      'write:tax_returns',
      'file:tax_return',
      'read:tax_deductions',
      'read:tax_reports',
      'read:audit_log'
    ],
    can_approve: false,
    can_file_returns: true
  },

  // CFO: Full read/write access, strategic reporting
  cfo: {
    name: 'Chief Financial Officer',
    description: 'Full access to all financial systems and strategic reporting',
    permissions: [
      '*' // Wildcard: all permissions
    ],
    can_approve: true,
    can_file_returns: true
  },

  // Audit Manager: Read-only audit logs, compliance review
  audit_manager: {
    name: 'Audit Manager',
    description: 'Reviews audit logs and compliance records',
    permissions: [
      'read:org',
      'read:audit_log',
      'read:reports',
      'read:gl',
      'read:vat',
      'read:tax',
      'read:users'
    ],
    can_approve: false,
    can_file_returns: false
  },

  // Payroll Officer: Payroll processing, employee records, WPS filings
  payroll_officer: {
    name: 'Payroll Officer',
    description: 'Processes payroll, manages employee records, files with MOHRE',
    permissions: [
      'read:org',
      'read:payroll',
      'write:payroll',
      'read:payroll_journal',
      'write:payroll_journal',
      'read:employees',
      'write:employees',
      'read:payroll_reports',
      'write:payroll_runs',
      'file:payroll',
      'read:audit_log'
    ],
    can_approve: false,
    can_file_returns: true
  },

  // Regulatory Officer: Compliance monitoring, regulatory filings, data governance
  regulatory_officer: {
    name: 'Regulatory Officer',
    description: 'Monitors compliance, manages regulatory filings, oversees data governance',
    permissions: [
      'read:org',
      'read:compliance',
      'write:compliance',
      'read:audit_log',
      'read:regulatory_filings',
      'write:regulatory_filings',
      'read:data_retention_policy',
      'write:data_retention_policy',
      'read:reports'
    ],
    can_approve: false,
    can_file_returns: false
  }
};

// ============================================================================
// Permission Checking Functions
// ============================================================================

/**
 * Check if a role has a specific permission
 * @param {string} role - Role name (e.g., 'finance_controller')
 * @param {string} permission - Permission to check (e.g., 'read:gl')
 * @returns {boolean} True if role has permission
 */
function hasPermission(role, permission) {
  if (!ROLES[role]) {
    return false;
  }

  const rolePermissions = ROLES[role].permissions;

  // Check for wildcard (CFO)
  if (rolePermissions.includes('*')) {
    return true;
  }

  return rolePermissions.includes(permission);
}

/**
 * Check if role can approve transactions/entries
 * @param {string} role
 * @returns {boolean}
 */
function canApprove(role) {
  return ROLES[role] && ROLES[role].can_approve === true;
}

/**
 * Check if role can file tax/regulatory returns
 * @param {string} role
 * @returns {boolean}
 */
function canFileReturns(role) {
  return ROLES[role] && ROLES[role].can_file_returns === true;
}

/**
 * Get all permissions for a role
 * @param {string} role
 * @returns {string[]} Array of permissions
 */
function getPermissions(role) {
  if (!ROLES[role]) {
    return [];
  }

  // Resolve wildcard for CFO
  if (ROLES[role].permissions.includes('*')) {
    return getAllPermissions();
  }

  return ROLES[role].permissions;
}

/**
 * Get all possible permissions in the system
 * @returns {string[]}
 */
function getAllPermissions() {
  const allPerms = new Set();
  Object.values(ROLES).forEach(role => {
    if (!role.permissions.includes('*')) {
      role.permissions.forEach(p => allPerms.add(p));
    }
  });
  return Array.from(allPerms);
}

// ============================================================================
// RBAC Middleware for Express
// ============================================================================

/**
 * Express middleware: Check if user has required permission
 * @param {string|string[]} requiredPermissions - Single permission or array
 * @returns {Function} Express middleware
 */
function checkPermission(requiredPermissions) {
  const perms = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'User context missing'
      });
    }

    // Check if any of user's roles has the required permission
    const userHasPermission = req.user.roles.some(role => {
      return perms.some(permission => hasPermission(role, permission));
    });

    if (!userHasPermission) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Requires one of: ${perms.join(', ')}`,
        required_permissions: perms,
        user_roles: req.user.roles
      });
    }

    next();
  };
}

/**
 * Express middleware: Check if user can approve
 */
function checkCanApprove() {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'User context missing'
      });
    }

    const userCanApprove = req.user.roles.some(role => canApprove(role));

    if (!userCanApprove) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Approval rights required'
      });
    }

    next();
  };
}

/**
 * Express middleware: Check if user can file returns
 */
function checkCanFileReturns() {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'User context missing'
      });
    }

    const userCanFile = req.user.roles.some(role => canFileReturns(role));

    if (!userCanFile) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Filing rights required'
      });
    }

    next();
  };
}

// ============================================================================
// Permission Matrix for Reference
// ============================================================================

function getPermissionMatrix() {
  const matrix = {};

  Object.entries(ROLES).forEach(([roleKey, role]) => {
    matrix[roleKey] = {
      name: role.name,
      description: role.description,
      permissions: getPermissions(roleKey),
      can_approve: role.can_approve,
      can_file_returns: role.can_file_returns
    };
  });

  return matrix;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  ROLES,
  hasPermission,
  canApprove,
  canFileReturns,
  getPermissions,
  getAllPermissions,
  checkPermission,
  checkCanApprove,
  checkCanFileReturns,
  getPermissionMatrix
};
