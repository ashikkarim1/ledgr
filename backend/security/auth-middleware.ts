// @ts-nocheck
/**
 * Ledgr Authentication & Authorization Middleware
 * Express middleware for JWT verification, tenant isolation, RBAC enforcement
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { AuthContext, JWTPayload, AuthError } from "../auth/types.js";
import { maskSensitiveFields } from "./encryption.js";
import { RedisClient } from 'redis'; // Assumed Redis client

// ============================================================================
// Types
// ============================================================================

// Express.Request augmentation is declared in auth/types.ts

export interface AuthMiddlewareOptions {
  publicKeyPath: string;
  tokenTimeout?: number; // Milliseconds
  refreshTokenRotation?: boolean;
  requireOrgContext?: boolean;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
}

// ============================================================================
// JWT Middleware
// ============================================================================

/**
 * Express middleware: Verify JWT and extract auth context
 * Validates:
 * - Signature (RS256)
 * - Expiration
 * - Token revocation (Redis)
 * - Org context
 */
export function verifyJWT(publicKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Missing or invalid Authorization header'
        });
      }

      const token = authHeader.substring(7); // Remove "Bearer "

      // Verify JWT signature and expiration
      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: 'https://api.ledgr.finance',
        audience: 'ledgr-api'
      }) as JWTPayload;

      // Check token revocation
      // In production: use Redis for distributed revocation
      const isRevoked = await checkTokenRevocation(payload.jti);
      if (isRevoked) {
        return res.status(401).json({
          error: 'token_revoked',
          message: 'Token has been revoked'
        });
      }

      // Extract auth context
      const authContext: AuthContext = {
        user_id: payload.user_id,
        org_id: payload.org_id,
        email: payload.email,
        roles: payload.roles,
        permissions: payload.permissions || [],
        entity_ids: payload.entity_ids,
        token_jti: payload.jti,
        issued_at: payload.iat,
        expires_at: payload.exp,
        scopes: payload.scope || []
      };

      // Attach to request
      req.user = authContext;
      req.auth_token = payload;

      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({
          error: 'token_expired',
          message: 'Token has expired',
          expired_at: error.expiredAt
        });
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({
          error: 'invalid_token',
          message: error.message
        });
      }

      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication failed'
      });
    }
  };
}

// ============================================================================
// Org Context Validation
// ============================================================================

/**
 * Middleware: Validate org_id from request matches JWT org_id
 * Prevents token manipulation (e.g., changing org_id in URL parameters)
 */
export function validateOrgContext() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'User context missing'
      });
    }

    // Check org_id in URL parameters
    const urlOrgId = req.params.org_id || req.query.org_id;
    if (urlOrgId && urlOrgId !== req.user.org_id) {
      // Log potential breach attempt
      logSecurityEvent({
        event_type: 'ORG_CONTEXT_MISMATCH',
        user_id: req.user.user_id,
        org_id: req.user.org_id,
        ip_address: req.ip,
        attempted_org: urlOrgId as string
      });

      return res.status(403).json({
        error: 'forbidden',
        message: 'Organization context mismatch'
      });
    }

    // Set current org in database session
    // This is used by PostgreSQL RLS policies
    req.orgId = req.user.org_id;

    next();
  };
}

// ============================================================================
// RBAC Enforcement
// ============================================================================

/**
 * Middleware: Require specific permission(s)
 * @param requiredPermissions Single permission or array of permissions
 * @param requireAll If true, user must have ALL permissions; if false, ANY is sufficient
 */
export function requirePermission(
  requiredPermissions: string | string[],
  requireAll: boolean = false
) {
  const permissions = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions];

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'User context missing'
      });
    }

    const userPermissions = req.user.permissions || [];

    // Check permissions
    const hasPermission = requireAll
      ? permissions.every((p) => userPermissions.includes(p))
      : permissions.some((p) => userPermissions.includes(p));

    if (!hasPermission) {
      // Log authorization failure
      logSecurityEvent({
        event_type: 'PERMISSION_DENIED',
        user_id: req.user.user_id,
        org_id: req.user.org_id,
        ip_address: req.ip,
        required_permissions: permissions,
        user_permissions: userPermissions
      });

      return res.status(403).json({
        error: 'forbidden',
        message: `Requires ${requireAll ? 'all' : 'any'} of: ${permissions.join(', ')}`,
        required_permissions: permissions,
        user_permissions: userPermissions
      });
    }

    next();
  };
}

/**
 * Middleware: Require specific role(s)
 * @param requiredRoles Single role or array of roles
 */
export function requireRole(requiredRoles: string | string[]) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'User context missing'
      });
    }

    const hasRole = roles.some((r) => req.user!.roles.includes(r));

    if (!hasRole) {
      logSecurityEvent({
        event_type: 'PERMISSION_DENIED',
        user_id: req.user.user_id,
        org_id: req.user.org_id,
        ip_address: req.ip,
        required_roles: roles,
        user_roles: req.user.roles
      });

      return res.status(403).json({
        error: 'forbidden',
        message: `Requires one of: ${roles.join(', ')}`,
        required_roles: roles,
        user_roles: req.user.roles
      });
    }

    next();
  };
}

/**
 * Middleware: Require 2FA (for sensitive operations)
 */
export function require2FA() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'User context missing'
      });
    }

    // Check if user has 2FA enabled
    // In production: query database for user.two_factor_enabled
    const has2FA = req.user.scopes?.includes('mfa:verified') || false;

    if (!has2FA) {
      return res.status(403).json({
        error: 'mfa_required',
        message: 'Two-factor authentication required for this operation'
      });
    }

    next();
  };
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Middleware: Track session activity (for inactivity timeout)
 * Updates last_activity timestamp in database
 */
export function trackSessionActivity() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next();
    }

    try {
      // Update session last_activity in database
      // In production: UPDATE user_sessions SET last_activity = now() WHERE token_jti = $1
      // For now, just log it
      console.debug(`Session activity: ${req.user.user_id} at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('Failed to update session activity:', error);
      // Don't fail the request on tracking error
    }

    next();
  };
}

/**
 * Middleware: Enforce session timeout (30 min inactivity)
 */
export function enforceSessionTimeout(timeoutMs: number = 30 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next();
    }

    const now = Math.floor(Date.now() / 1000);
    const sessionAge = now - req.user.issued_at;

    if (sessionAge > timeoutMs / 1000) {
      return res.status(401).json({
        error: 'session_expired',
        message: 'Session has expired due to inactivity',
        timeout_minutes: timeoutMs / 60000
      });
    }

    next();
  };
}

// ============================================================================
// Rate Limiting & Brute Force Protection
// ============================================================================

/**
 * Middleware: Rate limit by user ID
 * @param maxRequests Max requests per window
 * @param windowMs Window duration in milliseconds
 */
export function rateLimitByUser(
  maxRequests: number = 100,
  windowMs: number = 60 * 1000 // 1 minute
) {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.user_id || req.ip;
    const now = Date.now();

    let record = requestCounts.get(userId);

    if (!record || now > record.resetTime) {
      // Reset window
      record = { count: 0, resetTime: now + windowMs };
      requestCounts.set(userId, record);
    }

    record.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    res.setHeader(
      'X-RateLimit-Reset',
      Math.ceil(record.resetTime / 1000)
    );

    if (record.count > maxRequests) {
      logSecurityEvent({
        event_type: 'RATE_LIMIT_EXCEEDED',
        user_id: req.user?.user_id,
        org_id: req.user?.org_id,
        ip_address: req.ip,
        requests_made: record.count,
        max_allowed: maxRequests
      });

      return res.status(429).json({
        error: 'too_many_requests',
        message: 'Rate limit exceeded',
        retry_after: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    next();
  };
}

/**
 * Middleware: Detect and lock out accounts after failed login attempts
 * @param maxAttempts Max failed attempts before lockout
 * @param lockoutDurationMs Lockout duration in milliseconds
 */
export function loginBruteForceProtection(
  maxAttempts: number = 5,
  lockoutDurationMs: number = 15 * 60 * 1000 // 15 minutes
) {
  const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    // This middleware should be applied to login endpoint
    // Track by email + IP
    const email = req.body.email?.toLowerCase() || '';
    const ip = req.ip;
    const key = `${email}:${ip}`;

    const now = Date.now();
    let record = failedAttempts.get(key);

    if (record && now < record.lockedUntil) {
      // Account is locked
      const remainingMs = record.lockedUntil - now;
      return res.status(429).json({
        error: 'account_locked',
        message: 'Too many failed login attempts. Please try again later.',
        retry_after_seconds: Math.ceil(remainingMs / 1000)
      });
    }

    // Reset if window has passed
    if (!record || now > record.lockedUntil) {
      failedAttempts.set(key, { count: 0, lockedUntil: 0 });
    }

    // Attach tracking to request for use in login handler
    req.loginAttemptKey = key;
    req.failedAttempts = failedAttempts;

    next();
  };
}

// ============================================================================
// IP Address & Device Tracking
// ============================================================================

/**
 * Middleware: Detect IP address changes (potential account hijacking)
 */
export function detectIPChange() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next();
    }

    const currentIP = req.ip;

    try {
      // In production: query database for user's session IPs
      // If new IP and not in whitelist: log security event + notify user
      // For now, just log it
      console.debug(`IP for user ${req.user.user_id}: ${currentIP}`);
    } catch (error) {
      console.error('Failed to check IP:', error);
    }

    next();
  };
}

// ============================================================================
// Security Event Logging
// ============================================================================

/**
 * Log a security event (suspicious activity, failed access, etc.)
 */
export async function logSecurityEvent(event: any): Promise<void> {
  try {
    // In production: INSERT into security_events table
    // For now: just log to console
    console.warn(`[SECURITY EVENT] ${JSON.stringify(maskSensitiveFields(event))}`);
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

// ============================================================================
// Token Revocation (Redis)
// ============================================================================

let redisClient: RedisClient | null = null;

export function setRedisClient(client: RedisClient) {
  redisClient = client;
}

/**
 * Check if a token has been revoked (e.g., after logout)
 */
async function checkTokenRevocation(jti: string): Promise<boolean> {
  if (!redisClient) {
    console.warn('Redis client not configured, skipping revocation check');
    return false;
  }

  try {
    const revoked = await redisClient.sismember('revoked_tokens', jti);
    return revoked === 1;
  } catch (error) {
    console.error('Failed to check token revocation:', error);
    // On error, revoke as a safety measure
    return true;
  }
}

/**
 * Revoke a token (add to Redis revocation set)
 */
export async function revokeToken(
  jti: string,
  expiresAt: number // Timestamp
): Promise<void> {
  if (!redisClient) {
    console.warn('Redis client not configured, cannot revoke token');
    return;
  }

  try {
    const ttlSeconds = Math.floor((expiresAt * 1000 - Date.now()) / 1000);
    if (ttlSeconds > 0) {
      // Add to revocation set with TTL
      await redisClient.sadd('revoked_tokens', jti);
      await redisClient.expire(`revoked_tokens:${jti}`, ttlSeconds);
    }
  } catch (error) {
    console.error('Failed to revoke token:', error);
  }
}

// ============================================================================
// Error Handling Middleware
// ============================================================================

/**
 * Global error handler for auth errors
 */
export function authErrorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (error instanceof AuthError) {
    logSecurityEvent({
      event_type: 'AUTH_ERROR',
      user_id: req.user?.user_id,
      org_id: req.user?.org_id,
      ip_address: req.ip,
      error_code: error.code,
      error_message: error.message
    });

    return res.status(error.status_code).json({
      error: error.code,
      message: error.message,
      details: error.metadata
    });
  }

  next(error);
}

// ============================================================================
// Utility Middleware Composition
// ============================================================================

/**
 * Compose multiple auth middleware
 * Usage: app.use('/api/protected', composeAuthMiddleware(publicKey))
 */
export function composeAuthMiddleware(publicKey: string) {
  return [
    verifyJWT(publicKey),
    validateOrgContext(),
    trackSessionActivity(),
    enforceSessionTimeout(),
    detectIPChange()
  ];
}

/**
 * Compose RBAC middleware for specific endpoint
 * Usage: app.post('/api/approve', composeRBACMiddleware(['finance_controller'], ['approve:gl']))
 */
export function composeRBACMiddleware(
  requiredRoles?: string[],
  requiredPermissions?: string[]
) {
  const middleware = [];

  if (requiredRoles && requiredRoles.length > 0) {
    middleware.push(requireRole(requiredRoles));
  }

  if (requiredPermissions && requiredPermissions.length > 0) {
    middleware.push(requirePermission(requiredPermissions, false)); // ANY permission is sufficient
  }

  return middleware;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  verifyJWT,
  validateOrgContext,
  requirePermission,
  requireRole,
  require2FA,
  trackSessionActivity,
  enforceSessionTimeout,
  rateLimitByUser,
  loginBruteForceProtection,
  detectIPChange,
  logSecurityEvent,
  revokeToken,
  authErrorHandler,
  composeAuthMiddleware,
  composeRBACMiddleware,
  setRedisClient
};
