/**
 * Rate Limiting & Request Logging Middleware
 * Implements rate limiting by user and IP
 * Tracks API usage and performance metrics
 */

import { Request, Response, NextFunction } from "express";
import { ApiErrors } from "./error-handler";

/**
 * Rate limit configuration by subscription plan
 */
const RATE_LIMITS = {
  free: {
    requests_per_minute: 10,
    requests_per_hour: 300,
    requests_per_day: 5000,
  },
  professional: {
    requests_per_minute: 60,
    requests_per_hour: 2000,
    requests_per_day: 50000,
  },
  enterprise: {
    requests_per_minute: 300,
    requests_per_hour: 10000,
    requests_per_day: 500000,
  },
  unlimited: {
    requests_per_minute: 10000,
    requests_per_hour: 1000000,
    requests_per_day: 100000000,
  },
};

/**
 * In-memory rate limit store
 * In production, use Redis for distributed rate limiting
 */
const rateLimitStore = new Map<
  string,
  {
    minute: { count: number; reset: number };
    hour: { count: number; reset: number };
    day: { count: number; reset: number };
  }
>();

/**
 * Rate Limiter Middleware
 * Tracks requests per user or IP and enforces limits
 */
export function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Get rate limit key (user_id or IP)
    const key = (req as any).user?.user_id || req.ip || "unknown";

    // Get user's plan (default to free)
    const plan = (req as any).user?.plan || "free";
    const limits = RATE_LIMITS[plan as keyof typeof RATE_LIMITS] ||
      RATE_LIMITS.free;

    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);
    if (!entry) {
      entry = {
        minute: { count: 0, reset: Date.now() + 60000 },
        hour: { count: 0, reset: Date.now() + 3600000 },
        day: { count: 0, reset: Date.now() + 86400000 },
      };
      rateLimitStore.set(key, entry);
    }

    // Reset counters if window has passed
    const now = Date.now();
    if (now > entry.minute.reset) {
      entry.minute = { count: 0, reset: now + 60000 };
    }
    if (now > entry.hour.reset) {
      entry.hour = { count: 0, reset: now + 3600000 };
    }
    if (now > entry.day.reset) {
      entry.day = { count: 0, reset: now + 86400000 };
    }

    // Check rate limits
    if (entry.minute.count >= limits.requests_per_minute) {
      const resetTime = Math.ceil((entry.minute.reset - now) / 1000);
      res.set("Retry-After", String(resetTime));
      throw ApiErrors.rateLimitExceeded(resetTime);
    }

    if (entry.hour.count >= limits.requests_per_hour) {
      const resetTime = Math.ceil((entry.hour.reset - now) / 1000);
      res.set("Retry-After", String(resetTime));
      throw ApiErrors.rateLimitExceeded(resetTime);
    }

    if (entry.day.count >= limits.requests_per_day) {
      const resetTime = Math.ceil((entry.day.reset - now) / 1000);
      res.set("Retry-After", String(resetTime));
      throw ApiErrors.rateLimitExceeded(resetTime);
    }

    // Increment counters
    entry.minute.count++;
    entry.hour.count++;
    entry.day.count++;

    // Set rate limit headers
    res.set("X-RateLimit-Limit", String(limits.requests_per_minute));
    res.set(
      "X-RateLimit-Remaining",
      String(Math.max(0, limits.requests_per_minute - entry.minute.count))
    );
    res.set(
      "X-RateLimit-Reset",
      String(Math.ceil(entry.minute.reset / 1000))
    );

    // Store rate limit info on request for logging
    (req as any).rateLimitInfo = {
      key,
      plan,
      remaining: limits.requests_per_minute - entry.minute.count,
      reset: entry.minute.reset,
    };

    next();
  } catch (err) {
    throw err;
  }
}

/**
 * Request logging middleware
 * Logs all API requests with timing and response info
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const startTime = Date.now();
  const requestId = (req.headers["x-request-id"] ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`) as string;

  // Attach request ID to request
  req.headers["x-request-id"] = requestId;

  // Capture original response.json
  const originalJson = res.json;

  res.json = function (body: any) {
    const duration = Date.now() - startTime;

    // Log request
    logRequest({
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userId: (req as any).user?.user_id,
      workspaceId: (req as any).workspace_id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      rateLimitRemaining: (req as any).rateLimitInfo?.remaining,
    });

    // Call original response.json
    return originalJson.call(this, body);
  };

  next();
}

/**
 * Log request details
 */
function logRequest(context: {
  requestId: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  userId?: string;
  workspaceId?: string;
  ipAddress?: string;
  userAgent?: string;
  rateLimitRemaining?: number;
}) {
  const logLevel =
    context.status >= 500 ? "error" :
    context.status >= 400 ? "warn" :
    "info";

  const log = {
    timestamp: new Date().toISOString(),
    level: logLevel,
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    status: context.status,
    duration_ms: context.duration,
    userId: context.userId,
    workspaceId: context.workspaceId,
    ipAddress: context.ipAddress,
    rateLimitRemaining: context.rateLimitRemaining,
  };

  if (logLevel === "error") {
    console.error("API REQUEST:", log);
  } else if (logLevel === "warn") {
    console.warn("API REQUEST:", log);
  } else {
    console.log("API REQUEST:", log);
  }

  // TODO: Send to centralized logging service (DataDog, CloudWatch, etc.)
}

/**
 * Clean up expired rate limit entries
 * Run periodically to prevent memory leaks
 */
export function cleanupRateLimits() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of rateLimitStore.entries()) {
    // Remove if all windows are expired and no recent activity
    if (
      now > entry.minute.reset &&
      now > entry.hour.reset &&
      now > entry.day.reset &&
      entry.minute.count === 0
    ) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`Rate limit cleanup: removed ${cleaned} expired entries`);
  }
}

/**
 * Start periodic cleanup
 * Call once on application startup
 */
export function startRateLimitCleanup(intervalMinutes = 60) {
  setInterval(() => {
    cleanupRateLimits();
  }, intervalMinutes * 60 * 1000);

  console.log(`Rate limit cleanup scheduled every ${intervalMinutes} minutes`);
}

/**
 * Get current rate limit status for a user
 */
export function getRateLimitStatus(userId: string) {
  const entry = rateLimitStore.get(userId);

  if (!entry) {
    return null;
  }

  return {
    minute: {
      used: entry.minute.count,
      reset_at: entry.minute.reset,
    },
    hour: {
      used: entry.hour.count,
      reset_at: entry.hour.reset,
    },
    day: {
      used: entry.day.count,
      reset_at: entry.day.reset,
    },
  };
}
