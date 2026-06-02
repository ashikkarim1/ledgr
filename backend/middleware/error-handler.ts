/**
 * Global Error Handler Middleware
 * Standardizes all error responses across the API
 */

import { Request, Response, NextFunction } from "express";
import { ApiResponse, ApiError, ErrorCodes, HttpStatus } from "../response-types.js";

export class ApiErrorHandler extends Error {
  constructor(
    public status: number,
    public code: string,
    public message: string,
    public field?: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "ApiErrorHandler";
  }
}

/**
 * Error handler middleware
 * Should be mounted last in Express middleware chain
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestIdHeader = req.headers["x-request-id"];
  const requestId = typeof requestIdHeader === "string" ? requestIdHeader : generateRequestId();
  const timestamp = new Date().toISOString();

  let status = 500;
  let code: string = ErrorCodes.INTERNAL_ERROR;
  let message = "An unexpected error occurred";
  let errors: ApiError[] = [];

  // Handle known API errors
  if (err instanceof ApiErrorHandler) {
    status = err.status;
    code = err.code;
    message = err.message;
    errors = [{ code, message, field: err.field, status }];
  }
  // Handle validation errors
  else if (err.name === "ValidationError") {
    status = HttpStatus.UNPROCESSABLE_ENTITY;
    code = ErrorCodes.VALIDATION_ERROR;
    errors = err.errors || [{ code, message: err.message, status }];
  }
  // Handle JWT errors
  else if (err.name === "JsonWebTokenError") {
    status = HttpStatus.UNAUTHORIZED;
    code = ErrorCodes.UNAUTHORIZED;
    message = "Invalid or expired token";
    errors = [{ code, message, status }];
  }
  // Handle rate limit errors
  else if (err.code === "RATE_LIMIT_EXCEEDED") {
    status = HttpStatus.TOO_MANY_REQUESTS;
    code = ErrorCodes.RATE_LIMIT_EXCEEDED;
    message = "Too many requests. Please try again later.";
    errors = [{ code, message, status }];
  }
  // Handle database errors
  else if (err.code === "ER_DUP_ENTRY") {
    status = HttpStatus.CONFLICT;
    code = ErrorCodes.CONFLICT;
    message = "Resource already exists";
    errors = [{ code, message, status }];
  }
  // Handle generic errors
  else {
    console.error("Unhandled error:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
      requestId,
    });
  }

  // Log error
  logError({
    requestId,
    status,
    code,
    message,
    method: req.method,
    path: req.path,
    userId: (req as any).user?.user_id,
    workspaceId: (req as any).workspace_id,
  });

  // Build response
  const response: ApiResponse = {
    success: false,
    data: null,
    meta: {
      timestamp,
      request_id: requestId,
      version: "v1",
    },
    errors: errors.map((e) => ({
      ...e,
      timestamp,
    })),
  };

  res.status(status).json(response);
}

/**
 * Async error wrapper for route handlers
 * Catches errors and passes them to error handler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error builder
 */
export function createValidationError(
  field: string,
  message: string
): ApiError {
  return {
    code: ErrorCodes.VALIDATION_ERROR,
    message,
    field,
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  };
}

/**
 * Common error builders
 */
export class ApiErrors {
  static unauthorized(message = "Unauthorized"): ApiErrorHandler {
    return new ApiErrorHandler(
      HttpStatus.UNAUTHORIZED,
      ErrorCodes.UNAUTHORIZED,
      message
    );
  }

  static forbidden(message = "Forbidden"): ApiErrorHandler {
    return new ApiErrorHandler(
      HttpStatus.FORBIDDEN,
      ErrorCodes.FORBIDDEN,
      message
    );
  }

  static notFound(resource: string): ApiErrorHandler {
    return new ApiErrorHandler(
      HttpStatus.NOT_FOUND,
      ErrorCodes.NOT_FOUND,
      `${resource} not found`
    );
  }

  static conflict(message: string): ApiErrorHandler {
    return new ApiErrorHandler(
      HttpStatus.CONFLICT,
      ErrorCodes.CONFLICT,
      message
    );
  }

  static invalidRequest(message: string, field?: string): ApiErrorHandler {
    return new ApiErrorHandler(
      HttpStatus.BAD_REQUEST,
      ErrorCodes.INVALID_REQUEST,
      message,
      field
    );
  }

  static validation(field: string, message: string): ApiErrorHandler {
    return new ApiErrorHandler(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCodes.VALIDATION_ERROR,
      message,
      field
    );
  }

  static rateLimitExceeded(
    retryAfter?: number
  ): ApiErrorHandler {
    const err = new ApiErrorHandler(
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      "Too many requests. Please try again later."
    );
    if (retryAfter) {
      (err as any).retryAfter = retryAfter;
    }
    return err;
  }

  static internal(message = "Internal server error"): ApiErrorHandler {
    return new ApiErrorHandler(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCodes.INTERNAL_ERROR,
      message
    );
  }

  static serviceUnavailable(): ApiErrorHandler {
    return new ApiErrorHandler(
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCodes.SERVICE_UNAVAILABLE,
      "Service temporarily unavailable"
    );
  }
}

/**
 * Error logging
 */
function logError(context: {
  requestId: string;
  status: number;
  code: string;
  message: string;
  method: string;
  path: string;
  userId?: string;
  workspaceId?: string;
}) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    level: "error",
    ...context,
  };

  // Log to appropriate service based on severity
  if (context.status >= 500) {
    console.error("CRITICAL ERROR:", errorLog);
    // TODO: Send to error tracking service (Sentry, etc.)
  } else {
    console.warn("API ERROR:", errorLog);
  }
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
