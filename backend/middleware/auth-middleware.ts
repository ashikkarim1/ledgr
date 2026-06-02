/**
 * Authentication & Authorization Middleware
 * Handles JWT validation, role-based access control, workspace isolation
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWTPayload, UserRole } from "../response-types.js";
import { ApiErrors } from "./error-handler.js";

/**
 * JWT Authentication Middleware
 * Validates access token and extracts user claims
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = extractToken(req);

    if (!token) {
      throw ApiErrors.unauthorized(
        "Missing authentication token. Use Bearer token in Authorization header."
      );
    }

    const payload = verifyToken(token);
    (req as any).user = payload;

    // Extract workspace ID from token or header
    req.workspace_id = req.headers["x-workspace-id"] as string ||
      payload.workspace_id;

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiErrors.unauthorized("Token expired. Please refresh.");
    } else if (err instanceof jwt.JsonWebTokenError) {
      throw ApiErrors.unauthorized("Invalid token");
    }
    throw err;
  }
}

/**
 * Optional Authentication
 * Attempts to authenticate but doesn't fail if token is missing
 */
export function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = extractToken(req);

    if (token) {
      const payload = verifyToken(token);
      (req as any).user = payload;
      req.workspace_id = req.headers["x-workspace-id"] as string ||
        payload.workspace_id;
    }

    next();
  } catch (err) {
    // Silently continue without authentication
    next();
  }
}

/**
 * Role-Based Access Control Middleware
 * Restricts endpoint access to specific user roles
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw ApiErrors.unauthorized("Authentication required");
    }

    if (!roles.includes((req.user as any).role)) {
      throw ApiErrors.forbidden(
        `This action requires one of the following roles: ${roles.join(", ")}`
      );
    }

    next();
  };
}

/**
 * Workspace Isolation Middleware
 * Ensures user can only access their own workspace
 */
export function workspaceIsolation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  const workspaceIdParam = req.params.workspace_id ||
    req.query.workspace_id ||
    req.body?.workspace_id;

  if (workspaceIdParam && workspaceIdParam !== (req.user as any).workspace_id) {
    // Allow if user is admin (can have multiple workspaces)
    if ((req.user as any).role !== "admin") {
      throw ApiErrors.forbidden("You do not have access to this workspace");
    }
  }

  next();
}

/**
 * Permission Scoping Middleware
 * Checks if user has specific permission scope
 */
export function requireScope(...scopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw ApiErrors.unauthorized("Authentication required");
    }

    const hasScope = scopes.some((scope) => (req.user as any).scope.includes(scope));

    if (!hasScope) {
      throw ApiErrors.forbidden(
        `This action requires one of the following permissions: ${scopes.join(", ")}`
      );
    }

    next();
  };
}

/**
 * Extract JWT from request
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1];
}

/**
 * Verify JWT signature and expiration
 */
function verifyToken(token: string): JWTPayload {
  const secret = process.env.JWT_SECRET || "dev-secret-change-in-production";

  try {
    return jwt.verify(token, secret) as JWTPayload;
  } catch (err) {
    throw err;
  }
}

/**
 * Generate JWT token
 */
export function generateToken(
  user_id: string,
  workspace_id: string,
  email: string,
  role: UserRole,
  scope: string[] = [],
  expiresIn = "1h"
): string {
  const secret = process.env.JWT_SECRET || "dev-secret-change-in-production";

  const payload: JWTPayload = {
    user_id,
    workspace_id,
    email,
    role,
    scope,
    exp: Math.floor(Date.now() / 1000) + (expiresIn === "1h" ? 3600 : 604800), // 1h or 7d
    iat: Math.floor(Date.now() / 1000),
    sub: user_id,
    iss: "ledgr-api",
    aud: ["ledgr-app"],
  };

  return jwt.sign(payload, secret);
}

/**
 * Generate refresh token (longer expiration)
 */
export function generateRefreshToken(
  user_id: string,
  workspace_id: string
): string {
  const secret = process.env.JWT_REFRESH_SECRET ||
    "dev-refresh-secret-change-in-production";

  const payload = {
    user_id,
    workspace_id,
    type: "refresh",
    exp: Math.floor(Date.now() / 1000) + 604800, // 7 days
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, secret);
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): {
  user_id: string;
  workspace_id: string;
} {
  const secret = process.env.JWT_REFRESH_SECRET ||
    "dev-refresh-secret-change-in-production";

  try {
    const decoded = jwt.verify(token, secret) as any;
    return {
      user_id: decoded.user_id,
      workspace_id: decoded.workspace_id,
    };
  } catch (err) {
    throw ApiErrors.unauthorized("Invalid refresh token");
  }
}
