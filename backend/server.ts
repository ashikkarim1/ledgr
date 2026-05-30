/**
 * Ledgr REST API Server
 * Express.js setup with middleware and routes
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import morgan from "morgan";

// Middleware
import { authMiddleware, optionalAuthMiddleware, requireRole, workspaceIsolation } from "./middleware/auth-middleware";
import { errorHandler, asyncHandler } from "./middleware/error-handler";
import { rateLimiter, requestLogger, startRateLimitCleanup } from "./middleware/rate-limiter";

// Controllers
import * as authController from "./controllers/auth.controller";

// Routes
import { createIntegrationRoutes, createWebhookRoutes } from "./routes/integrations";

// Integration Manager
import { IntegrationManager } from "./integrations/integration-factory";
import { PersistentIntegrationManager } from "./integrations/integration-manager";

// Database
import { Pool } from "pg";

// Types
import { ApiResponse, HealthCheckResponse } from "./response-types";

/**
 * Initialize Express Application
 */
export function createApp(
  integrationManager?: IntegrationManager | PersistentIntegrationManager,
  dbPool?: Pool
): express.Application {
  const app = express();

  // Initialize integration manager if not provided
  let manager: IntegrationManager | PersistentIntegrationManager;
  if (integrationManager) {
    manager = integrationManager;
  } else if (dbPool) {
    manager = new PersistentIntegrationManager(dbPool);
  } else {
    manager = new IntegrationManager();
  }

  /**
   * ==========================================
   * GLOBAL MIDDLEWARE
   * ==========================================
   */

  // Security
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  }));

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // Logging
  app.use(morgan("combined"));
  app.use(requestLogger);

  // Request ID
  app.use((req, res, next) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.headers["x-request-id"] = requestId;
    res.set("X-Request-ID", requestId);
    next();
  });

  // Rate limiting
  app.use(rateLimiter);

  // Basic rate limiter for public endpoints
  const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later.",
  });

  /**
   * ==========================================
   * AUTHENTICATION ROUTES
   * ==========================================
   */

  app.post("/v1/auth/signup", publicLimiter, authController.signup);
  app.post("/v1/auth/login", publicLimiter, authController.login);
  app.post("/v1/auth/refresh", publicLimiter, authController.refresh);
  app.post("/v1/auth/logout", authMiddleware, authController.logout);
  app.post("/v1/auth/2fa/setup", authMiddleware, authController.setupTwoFactor);

  /**
   * ==========================================
   * WORKSPACE ROUTES
   * ==========================================
   */

  // Create workspace
  app.post(
    "/v1/workspaces",
    authMiddleware,
    requireRole("admin"),
    asyncHandler(async (req: Request, res: Response) => {
      // TODO: Implement controller
      res.status(201).json({
        success: true,
        data: { workspace_id: "ws_123", name: req.body.name },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers["x-request-id"],
          version: "v1",
        },
        errors: null,
      });
    })
  );

  // List workspaces
  app.get(
    "/v1/workspaces",
    authMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      // TODO: Implement controller
      res.json({
        success: true,
        data: [],
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers["x-request-id"],
          version: "v1",
          pagination: {
            total: 0,
            limit: 50,
            offset: 0,
            has_more: false,
          },
        },
        errors: null,
      });
    })
  );

  // Get workspace
  app.get(
    "/v1/workspaces/:workspace_id",
    authMiddleware,
    workspaceIsolation,
    asyncHandler(async (req: Request, res: Response) => {
      // TODO: Implement controller
      res.json({
        success: true,
        data: {
          workspace_id: req.params.workspace_id,
          name: "Workspace Name",
          industry: "retail",
          members: [],
          created_at: new Date().toISOString(),
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers["x-request-id"],
          version: "v1",
        },
        errors: null,
      });
    })
  );

  /**
   * ==========================================
   * FINANCIAL DATA ROUTES
   * ==========================================
   */

  // Get dashboard
  app.get(
    "/v1/financials/dashboard",
    authMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      // TODO: Implement controller
      res.json({
        success: true,
        data: {
          period: "2026-05",
          summary: {
            total_revenue: 0,
            total_expenses: 0,
            net_profit: 0,
            vat_liability: 0,
            currency: "AED",
          },
          accounts: {
            assets: 0,
            liabilities: 0,
            equity: 0,
          },
          transactions_count: 0,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers["x-request-id"],
          version: "v1",
        },
        errors: null,
      });
    })
  );

  // Get accounts
  app.get(
    "/v1/financials/accounts",
    authMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      // TODO: Implement controller
      res.json({
        success: true,
        data: [],
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers["x-request-id"],
          version: "v1",
        },
        errors: null,
      });
    })
  );

  // Get transactions
  app.get(
    "/v1/financials/transactions",
    authMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      // TODO: Implement controller
      res.json({
        success: true,
        data: [],
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers["x-request-id"],
          version: "v1",
          pagination: {
            total: 0,
            limit: 50,
            offset: 0,
            has_more: false,
          },
        },
        errors: null,
      });
    })
  );

  /**
   * ==========================================
   * AGENT ROUTES
   * ==========================================
   */

  // List agents
  app.get(
    "/v1/agents",
    authMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      // TODO: Implement controller
      res.json({
        success: true,
        data: [],
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers["x-request-id"],
          version: "v1",
        },
        errors: null,
      });
    })
  );

  /**
   * ==========================================
   * HELP CENTRE ROUTES
   * ==========================================
   */

  // Search articles
  app.get(
    "/v1/help/articles",
    optionalAuthMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      // TODO: Implement controller
      res.json({
        success: true,
        data: [],
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers["x-request-id"],
          version: "v1",
        },
        errors: null,
      });
    })
  );

  /**
   * ==========================================
   * INTEGRATION ROUTES
   * ==========================================
   */

  // Mount integration management routes
  app.use("/v1/integrations", authMiddleware, createIntegrationRoutes(manager));

  // Mount webhook routes (no auth required for webhooks with signature verification)
  app.use("/v1/webhooks", createWebhookRoutes(manager));

  /**
   * ==========================================
   * BILLING ROUTES
   * ==========================================
   */

  // Get subscription
  app.get(
    "/v1/billing/subscription",
    authMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      // TODO: Implement controller
      res.json({
        success: true,
        data: {
          subscription_id: "sub_123",
          workspace_id: (req as any).workspace_id,
          plan: "professional",
          status: "active",
          amount: 2500,
          currency: "AED",
          billing_cycle: "monthly",
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers["x-request-id"],
          version: "v1",
        },
        errors: null,
      });
    })
  );

  /**
   * ==========================================
   * COMPLIANCE & AUDIT ROUTES
   * ==========================================
   */

  // Get audit logs
  app.get(
    "/v1/audit/logs",
    authMiddleware,
    requireRole("admin"),
    asyncHandler(async (req: Request, res: Response) => {
      // TODO: Implement controller
      res.json({
        success: true,
        data: [],
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers["x-request-id"],
          version: "v1",
        },
        errors: null,
      });
    })
  );

  /**
   * ==========================================
   * HEALTH & STATUS ROUTES
   * ==========================================
   */

  // Health check
  app.get("/v1/health", (req: Request, res: Response) => {
    const response: ApiResponse<HealthCheckResponse> = {
      success: true,
      data: {
        status: "healthy",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        services: {
          api: "operational",
          database: "operational",
          cache: "operational",
          ai_engine: "operational",
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        request_id: req.headers["x-request-id"] as string,
        version: "v1",
      },
      errors: null,
    };

    res.json(response);
  });

  /**
   * ==========================================
   * 404 AND ERROR HANDLING
   * ==========================================
   */

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      data: null,
      meta: {
        timestamp: new Date().toISOString(),
        request_id: req.headers["x-request-id"] as string,
        version: "v1",
      },
      errors: [
        {
          code: "NOT_FOUND",
          message: `Endpoint ${req.method} ${req.path} not found`,
          status: 404,
        },
      ],
    });
  });

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Start Server
 */
export function startServer(
  port: number = 3000,
  integrationManager?: IntegrationManager | PersistentIntegrationManager,
  dbPool?: Pool
): void {
  const app = createApp(integrationManager, dbPool);

  // Start rate limit cleanup
  startRateLimitCleanup(60);

  const server = app.listen(port, () => {
    console.log(`Ledgr API Server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`Health check: http://localhost:${port}/v1/health`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully");
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    console.log("SIGINT received, shutting down gracefully");
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });
}

// Start server if running directly
if (require.main === module) {
  const port = parseInt(process.env.PORT || "3000", 10);
  startServer(port);
}
