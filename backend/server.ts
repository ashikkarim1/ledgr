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
import { authMiddleware, optionalAuthMiddleware, requireRole, workspaceIsolation } from "./middleware/auth-middleware.js";
import { errorHandler, asyncHandler } from "./middleware/error-handler.js";
import { rateLimiter, requestLogger, startRateLimitCleanup } from "./middleware/rate-limiter.js";
import {
  checkDocumentLimit,
  checkExecutionLimit,
  checkUserLimit,
  checkTrialExpired,
} from "./middleware/trial-limits.js";

// Controllers
import * as authController from "./controllers/auth.controller.js";
import * as workspacesController from "./controllers/workspaces.controller.js";
import * as financialsController from "./controllers/financials.controller.js";
import * as agentsController from "./controllers/agents.controller.js";
import * as helpController from "./controllers/help.controller.js";
import * as billingController from "./controllers/billing.controller.js";
import * as integrationsController from "./controllers/integrations.controller.js";
import * as auditController from "./controllers/audit.controller.js";
import * as wafeqController from "./controllers/wafeq.controller.js";
import * as trialUpgradeController from "./controllers/trial-upgrade.controller.js";

// Routes
import { createIntegrationRoutes, createWebhookRoutes } from "./routes/integrations.js";
import { createDocumentsRoutes } from "./routes/documents.js";
import { createInterestRoutes } from "./routes/interest.js";

// Integration Manager
import { IntegrationManager } from "./integrations/integration-factory.js";
import { PersistentIntegrationManager } from "./integrations/integration-manager.js";

// Jobs
import { startTrialExpiryJob } from "./jobs/trial-expiry.js";

// Database
import { Pool } from "pg";
import { setDbPool } from "./lib/db-helpers.js";

// Types
import { ApiResponse, HealthCheckResponse } from "./response-types.js";

/**
 * Initialize Express Application
 */
export function createApp(
  integrationManager?: IntegrationManager | PersistentIntegrationManager,
  dbPool?: Pool
): express.Application {
  const app = express();

  // Initialize database pool for db-helpers
  if (dbPool) {
    setDbPool(dbPool);
  }

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
  
  // CORS configuration - allow requests from frontend
  const allowedOrigins = [
    "http://localhost:5555",
    "http://localhost:8000",
    "http://localhost:3000",
    "http://localhost:5173",
  ];
  
  app.use(cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Allow all origins for now - dev mode
        callback(null, true);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
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
  app.post("/v1/auth/signup-trial", publicLimiter, authController.signupTrial);
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
    workspacesController.createWorkspace
  );

  // List workspaces
  app.get(
    "/v1/workspaces",
    authMiddleware,
    workspacesController.listWorkspaces
  );

  // Get workspace
  app.get(
    "/v1/workspaces/:workspace_id",
    authMiddleware,
    workspaceIsolation,
    workspacesController.getWorkspace
  );

  // Update workspace
  app.patch(
    "/v1/workspaces/:workspace_id",
    authMiddleware,
    workspaceIsolation,
    workspacesController.updateWorkspace
  );

  // Invite member
  app.post(
    "/v1/workspaces/:workspace_id/members",
    authMiddleware,
    workspaceIsolation,
    checkTrialExpired,
    checkUserLimit,
    workspacesController.inviteMember
  );

  // List members
  app.get(
    "/v1/workspaces/:workspace_id/members",
    authMiddleware,
    workspaceIsolation,
    workspacesController.listMembers
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
    financialsController.getDashboard
  );

  // Get accounts
  app.get(
    "/v1/financials/accounts",
    authMiddleware,
    financialsController.listAccounts
  );

  // Get transactions
  app.get(
    "/v1/financials/transactions",
    authMiddleware,
    financialsController.listTransactions
  );

  // Create transaction
  app.post(
    "/v1/financials/transactions",
    authMiddleware,
    financialsController.createTransaction
  );

  // Get P&L report
  app.get(
    "/v1/financials/reports/profit-loss",
    authMiddleware,
    financialsController.getProfitLossReport
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
    agentsController.listAgents
  );

  // Get agent
  app.get(
    "/v1/agents/:agent_id",
    authMiddleware,
    agentsController.getAgent
  );

  // Execute agent
  app.post(
    "/v1/agents/:agent_id/execute",
    authMiddleware,
    checkTrialExpired,
    checkExecutionLimit,
    agentsController.executeAgent
  );

  // Get execution history
  app.get(
    "/v1/agents/:agent_id/executions",
    authMiddleware,
    agentsController.getAgentHistory
  );

  // Get execution details
  app.get(
    "/v1/agents/:agent_id/executions/:execution_id",
    authMiddleware,
    agentsController.getExecution
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
    helpController.searchArticles
  );

  // Get article
  app.get(
    "/v1/help/articles/:article_id",
    optionalAuthMiddleware,
    helpController.getArticle
  );

  // Create support ticket
  app.post(
    "/v1/help/tickets",
    authMiddleware,
    helpController.createTicket
  );

  // List user tickets
  app.get(
    "/v1/help/tickets",
    authMiddleware,
    helpController.listTickets
  );

  // Get ticket
  app.get(
    "/v1/help/tickets/:ticket_id",
    authMiddleware,
    helpController.getTicket
  );

  // Add message to ticket
  app.post(
    "/v1/help/tickets/:ticket_id/messages",
    authMiddleware,
    helpController.addTicketMessage
  );

  /**
   * ==========================================
   * DOCUMENT & AI AGENT ROUTES
   * ==========================================
   */

  // Mount document processing routes
  app.use("/v1/documents", authMiddleware, checkTrialExpired, checkDocumentLimit, createDocumentsRoutes());

  /**
   * ==========================================
   * INTEREST FORM ROUTES (PUBLIC)
   * ==========================================
   */

  // Mount interest form routes (no auth required - public pricing page submissions)
  app.use("/api/interest", createInterestRoutes());

  /**
   * ==========================================
   * INTEGRATION ROUTES
   * ==========================================
   */

  // Mount integration management routes
  app.use("/v1/integrations", authMiddleware, createIntegrationRoutes(manager));


  // Wafeq Integration Routes (UAE accounting ERP)
  // File-based CSV import for GL accounts, customers, and transactions
  app.post('/v1/integrations/wafeq/import', authMiddleware, wafeqController.importGLAccounts);
  app.post('/v1/integrations/wafeq/import-customers', authMiddleware, wafeqController.importCustomers);
  app.get('/v1/integrations/wafeq/status', authMiddleware, wafeqController.getStatus);
  app.get('/v1/integrations/wafeq/export-template', authMiddleware, wafeqController.getGLTemplate);

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
    billingController.getSubscription
  );

  // Upgrade subscription
  app.post(
    "/v1/billing/subscription/upgrade",
    authMiddleware,
    trialUpgradeController.upgradeTrialSubscription
  );

  // List invoices
  app.get(
    "/v1/billing/invoices",
    authMiddleware,
    billingController.listInvoices
  );

  // List payment methods
  app.get(
    "/v1/billing/payment-methods",
    authMiddleware,
    billingController.listPaymentMethods
  );

  // Add payment method
  app.post(
    "/v1/billing/payment-methods",
    authMiddleware,
    billingController.addPaymentMethod
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
    auditController.getAuditLogs
  );

  // Get compliance report
  app.get(
    "/v1/audit/compliance",
    authMiddleware,
    requireRole("admin"),
    auditController.getComplianceReport
  );

  // Get user activity
  app.get(
    "/v1/audit/activity/:user_id",
    authMiddleware,
    requireRole("admin"),
    auditController.getUserActivity
  );

  // Export audit logs
  app.post(
    "/v1/audit/export",
    authMiddleware,
    requireRole("admin"),
    auditController.exportAuditLogs
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

  // Start trial expiry cron job
  if (dbPool) {
    startTrialExpiryJob(dbPool);
  }

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

// Start server if running directly (disabled - use startServer() elsewhere)
// if (require.main === module) {
//   const port = parseInt(process.env.PORT || "3000", 10);
//   startServer(port);
// }
