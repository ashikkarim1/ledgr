/**
 * Express Middleware for Authentication & Authorization
 * Validates JWT, enforces permissions, logs security events
 */

import { Request, Response, NextFunction } from 'express';
import { AuthContext, AuthError, SecurityEventType } from "./types.js";
import { AuthenticationService } from "./auth.js";
import { AuthorizationService } from "./permissions.js";

// ============================================================================
// Middleware Configuration
// ============================================================================

interface MiddlewareConfig {
  authService: AuthenticationService;
  authzService: AuthorizationService;
  skip_paths?: string[]; // Paths that don't require auth
  require_org_context?: boolean;
}

let globalConfig: MiddlewareConfig;

export function configureAuthMiddleware(config: MiddlewareConfig): void {
  globalConfig = config;
}

// ============================================================================
// Helper: Extract Token
// ============================================================================

function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookies (for browser-based access)
  if (req.cookies?.access_token) {
    return req.cookies.access_token;
  }

  // Check query parameter (fallback for non-browser clients)
  if (req.query.token) {
    return req.query.token as string;
  }

  return null;
}

// ============================================================================
// Middleware: Authenticate Request
// ============================================================================

/**
 * Verify JWT and populate req.user with auth context
 * Should be used on all protected routes
 */
export function authenticate() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!globalConfig) {
      return res.status(500).json({
        error: 'middleware_not_configured',
        message: 'Auth middleware not configured'
      });
    }

    // Check if path should skip auth
    if (globalConfig.skip_paths?.some(path => req.path === path)) {
      return next();
    }

    try {
      const token = extractToken(req);

      if (!token) {
        throw new AuthError(
          'missing_token',
          'Authorization token required',
          401
        );
      }

      // Verify token
      const payload = globalConfig.authService.tokenManager.verifyToken(token);

      // Require org context
      if (globalConfig.require_org_context && !payload.org_id) {
        throw new AuthError(
          'missing_org_context',
          'Organization context required',
          401
        );
      }

      // Populate req.user
      req.user = {
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

      req.auth_token = payload;

      next();
    } catch (error: any) {
      const auth_error = error instanceof AuthError ? error : new AuthError(
        'authentication_failed',
        'Failed to authenticate request',
        401
      );

      // Log security event
      if (globalConfig.authService) {
        globalConfig.authService.securityLogger.logEvent({
          event_type: SecurityEventType.LOGIN_FAILURE,
          ip_address: req.ip || '',
          user_agent: req.get('user-agent') || '',
          severity: 'warning',
          description: `Auth failed: ${auth_error.code}`
        });
      }

      return res.status(auth_error.status_code).json({
        error: auth_error.code,
        message: auth_error.message,
        ...(auth_error.metadata && { details: auth_error.metadata })
      });
    }
  };
}

// ============================================================================
// Middleware: Require Authentication (Explicit)
// ============================================================================

export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }
    next();
  };
}

// ============================================================================
// Middleware: Require Permission
// ============================================================================

export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    if (!globalConfig?.authzService) {
      return res.status(500).json({
        error: 'middleware_not_configured',
        message: 'Authorization service not configured'
      });
    }

    const authorized = globalConfig.authzService.authorize(
      req.user,
      permissions
    );

    if (!authorized) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Requires one of: ${permissions.join(', ')}`,
        required_permissions: permissions,
        user_roles: req.user.roles
      });
    }

    next();
  };
}

// ============================================================================
// Middleware: Require Role
// ============================================================================

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    const hasRole = roles.some(role => req.user!.roles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Requires one of roles: ${roles.join(', ')}`,
        required_roles: roles,
        user_roles: req.user.roles
      });
    }

    next();
  };
}

// ============================================================================
// Middleware: Validate Organization Context
// ============================================================================

export function validateOrgContext() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    // Check if org_id matches request parameter (if provided)
    const req_org_id = req.params.org_id || req.query.org_id;
    if (req_org_id && req.user.org_id !== req_org_id) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Access to this organization denied',
        user_org_id: req.user.org_id,
        requested_org_id: req_org_id
      });
    }

    next();
  };
}

// ============================================================================
// Middleware: Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  first_request: number;
  last_request: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function rateLimit(
  max_requests: number = 100,
  window_seconds: number = 60,
  key_fn?: (req: Request) => string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate rate limit key (IP + endpoint by default)
    const key = key_fn
      ? key_fn(req)
      : `${req.ip}:${req.method}:${req.path}`;

    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (entry) {
      const elapsed = now - entry.first_request;

      if (elapsed > window_seconds * 1000) {
        // Reset window
        rateLimitStore.set(key, {
          count: 1,
          first_request: now,
          last_request: now
        });
      } else {
        entry.count++;
        entry.last_request = now;

        if (entry.count > max_requests) {
          res.set('Retry-After', String(
            Math.ceil((window_seconds * 1000 - elapsed) / 1000)
          ));

          return res.status(429).json({
            error: 'rate_limit_exceeded',
            message: `Rate limit exceeded: ${max_requests} requests per ${window_seconds} seconds`,
            retry_after: Math.ceil((window_seconds * 1000 - elapsed) / 1000)
          });
        }
      }
    } else {
      rateLimitStore.set(key, {
        count: 1,
        first_request: now,
        last_request: now
      });
    }

    next();
  };
}

// ============================================================================
// Middleware: CSRF Protection
// ============================================================================

interface CSRFToken {
  token: string;
  generated_at: number;
}

const csrfTokenStore = new Map<string, CSRFToken>();

export function generateCSRFToken(req: Request, res: Response): string {
  const token = require('crypto').randomUUID();
  const session_id = req.sessionID || req.ip || '';

  csrfTokenStore.set(session_id, {
    token,
    generated_at: Date.now()
  });

  // Set HTTP-only cookie
  res.cookie('csrf-token', token, {
    httpOnly: false, // Can be read by JS for inclusion in request
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 1000 // 1 hour
  });

  return token;
}

export function verifyCsrfToken() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const session_id = req.sessionID || req.ip || '';
    const storedToken = csrfTokenStore.get(session_id);

    if (!storedToken) {
      return res.status(403).json({
        error: 'csrf_token_missing',
        message: 'CSRF token not found'
      });
    }

    // Check token expiry (1 hour)
    if (Date.now() - storedToken.generated_at > 60 * 60 * 1000) {
      return res.status(403).json({
        error: 'csrf_token_expired',
        message: 'CSRF token expired'
      });
    }

    // Check provided token from header or body
    const providedToken = 
      req.headers['x-csrf-token'] ||
      req.body?.csrf_token ||
      req.query?.csrf_token;

    if (!providedToken || providedToken !== storedToken.token) {
      return res.status(403).json({
        error: 'csrf_token_invalid',
        message: 'CSRF token validation failed'
      });
    }

    next();
  };
}

// ============================================================================
// Middleware: Security Headers
// ============================================================================

export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent content-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    );

    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // HSTS (for HTTPS)
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}

// ============================================================================
// Middleware: Error Handler (should be last)
// ============================================================================

export function authErrorHandler() {
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof AuthError) {
      return res.status(err.status_code).json({
        error: err.code,
        message: err.message,
        ...(err.metadata && { details: err.metadata })
      });
    }

    // Log unexpected errors
    console.error('Unhandled error:', err);

    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred'
    });
  };
}

// ============================================================================
// Middleware: Activity Logging
// ============================================================================

export function logActivity(authService: AuthenticationService) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user) {
      // Update session activity
      if (req.user && req.session_id) {
        authService.sessionManager.updateActivity(req.session_id);
      }

      // You could log to analytics/audit trail here
      // authService.securityLogger.logEvent({...})
    }

    next();
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  extractToken,
  AuthContext
};
