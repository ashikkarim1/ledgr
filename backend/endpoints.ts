/**
 * Ledgr REST API Endpoint Definitions
 * All endpoints organized by domain with type signatures
 */

import {
  ApiResponse,
  UserRole,
  LoginRequest,
  LoginResponse,
  SignupRequest,
  SignupResponse,
  RefreshRequest,
  RefreshResponse,
  TwoFactorSetupResponse,
  Workspace,
  WorkspaceDetails,
  WorkspaceMember,
  InvitationResponse,
  FinancialImportRequest,
  FinancialImportResponse,
  FinancialDashboard,
  ChartOfAccountsItem,
  Transaction,
  ReconcileRequest,
  ReconcileResponse,
  Agent,
  AgentDeployRequest,
  AgentExecution,
  AgentTaskRequest,
  AgentTaskResponse,
  HelpMessageRequest,
  HelpMessageResponse,
  HelpMessage,
  HelpArticle,
  HelpFeedbackRequest,
  Subscription,
  UpgradeRequest,
  Invoice,
  UsageStats,
  IntegrationProvider,
  IntegrationConnectRequest,
  IntegrationConnectResponse,
  Integration,
  IntegrationSyncRequest,
  IntegrationSyncResponse,
  AuditLogEntry,
  HealthCheckResponse,
  ListQueryParams,
  FilterableQueryParams,
} from "./response-types.js";

/**
 * ==========================================
 * 1. AUTHENTICATION ENDPOINTS
 * ==========================================
 */

export namespace AuthEndpoints {
  /**
   * POST /v1/auth/signup
   * Register a new user and create a workspace
   */
  export interface SignupEndpoint {
    path: "/auth/signup";
    method: "POST";
    request: SignupRequest;
    response: ApiResponse<SignupResponse>;
    auth: false;
  }

  /**
   * POST /v1/auth/login
   * Authenticate user and issue JWT tokens
   */
  export interface LoginEndpoint {
    path: "/auth/login";
    method: "POST";
    request: LoginRequest;
    response: ApiResponse<LoginResponse>;
    auth: false;
  }

  /**
   * POST /v1/auth/refresh
   * Refresh expired access token
   */
  export interface RefreshEndpoint {
    path: "/auth/refresh";
    method: "POST";
    request: RefreshRequest;
    response: ApiResponse<RefreshResponse>;
    auth: false;
  }

  /**
   * POST /v1/auth/logout
   * Invalidate session and refresh token
   */
  export interface LogoutEndpoint {
    path: "/auth/logout";
    method: "POST";
    request: Record<string, never>;
    response: ApiResponse<null>;
    auth: true;
  }

  /**
   * POST /v1/auth/2fa/setup
   * Enable two-factor authentication
   */
  export interface TwoFactorSetupEndpoint {
    path: "/auth/2fa/setup";
    method: "POST";
    request: { method: "authenticator" | "sms" };
    response: ApiResponse<TwoFactorSetupResponse>;
    auth: true;
  }
}

/**
 * ==========================================
 * 2. WORKSPACE ENDPOINTS
 * ==========================================
 */

export namespace WorkspaceEndpoints {
  /**
   * POST /v1/workspaces
   * Create a new workspace (for admin users)
   */
  export interface CreateWorkspaceEndpoint {
    path: "/workspaces";
    method: "POST";
    request: {
      name: string;
      industry: string;
      vat_registration_number?: string;
      tax_id?: string;
      fiscal_year_end: string;
    };
    response: ApiResponse<Workspace>;
    auth: true;
    requiredRole: ["admin"];
  }

  /**
   * GET /v1/workspaces
   * List all workspaces for authenticated user
   */
  export interface ListWorkspacesEndpoint {
    path: "/workspaces";
    method: "GET";
    request: ListQueryParams;
    response: ApiResponse<Workspace[]>;
    auth: true;
  }

  /**
   * GET /v1/workspaces/:workspace_id
   * Get workspace details
   */
  export interface GetWorkspaceEndpoint {
    path: "/workspaces/:workspace_id";
    method: "GET";
    request: Record<string, never>;
    response: ApiResponse<WorkspaceDetails>;
    auth: true;
  }

  /**
   * PUT /v1/workspaces/:workspace_id
   * Update workspace settings
   */
  export interface UpdateWorkspaceEndpoint {
    path: "/workspaces/:workspace_id";
    method: "PUT";
    request: Partial<{
      name: string;
      industry: string;
      vat_registration_number: string;
      tax_id: string;
      fiscal_year_end: string;
    }>;
    response: ApiResponse<Workspace>;
    auth: true;
    requiredRole: ["admin"];
  }

  /**
   * POST /v1/workspaces/:workspace_id/invite
   * Invite team member to workspace
   */
  export interface InviteMemberEndpoint {
    path: "/workspaces/:workspace_id/invite";
    method: "POST";
    request: {
      email: string;
      role: UserRole;
    };
    response: ApiResponse<InvitationResponse>;
    auth: true;
    requiredRole: ["admin"];
  }

  /**
   * DELETE /v1/workspaces/:workspace_id/members/:user_id
   * Remove member from workspace
   */
  export interface RemoveMemberEndpoint {
    path: "/workspaces/:workspace_id/members/:user_id";
    method: "DELETE";
    request: Record<string, never>;
    response: ApiResponse<null>;
    auth: true;
    requiredRole: ["admin"];
  }
}

/**
 * ==========================================
 * 3. FINANCIAL DATA ENDPOINTS
 * ==========================================
 */

export namespace FinancialEndpoints {
  /**
   * POST /v1/financials/import
   * Upload and import financial data
   */
  export interface ImportFinancialsEndpoint {
    path: "/financials/import";
    method: "POST";
    request: FinancialImportRequest & { file: File };
    response: ApiResponse<FinancialImportResponse>;
    auth: true;
    contentType: "multipart/form-data";
  }

  /**
   * GET /v1/financials/dashboard
   * Get financial summary dashboard
   */
  export interface GetDashboardEndpoint {
    path: "/financials/dashboard";
    method: "GET";
    request: {
      workspace_id: string;
      period?: "month" | "quarter" | "year";
      date?: string;
    };
    response: ApiResponse<FinancialDashboard>;
    auth: true;
  }

  /**
   * GET /v1/financials/accounts
   * Get chart of accounts
   */
  export interface GetAccountsEndpoint {
    path: "/financials/accounts";
    method: "GET";
    request: ListQueryParams & {
      workspace_id: string;
      type?: string;
    };
    response: ApiResponse<ChartOfAccountsItem[]>;
    auth: true;
  }

  /**
   * GET /v1/financials/transactions
   * Get transaction ledger with filtering and sorting
   */
  export interface GetTransactionsEndpoint {
    path: "/financials/transactions";
    method: "GET";
    request: FilterableQueryParams & { workspace_id: string };
    response: ApiResponse<Transaction[]>;
    auth: true;
  }

  /**
   * POST /v1/financials/reconcile
   * Mark transactions as reconciled
   */
  export interface ReconcileEndpoint {
    path: "/financials/reconcile";
    method: "POST";
    request: ReconcileRequest;
    response: ApiResponse<ReconcileResponse>;
    auth: true;
  }
}

/**
 * ==========================================
 * 4. AGENT ENDPOINTS
 * ==========================================
 */

export namespace AgentEndpoints {
  /**
   * POST /v1/agents
   * Deploy an AI agent to workspace
   */
  export interface DeployAgentEndpoint {
    path: "/agents";
    method: "POST";
    request: AgentDeployRequest;
    response: ApiResponse<Agent>;
    auth: true;
  }

  /**
   * GET /v1/agents
   * List all agents for workspace
   */
  export interface ListAgentsEndpoint {
    path: "/agents";
    method: "GET";
    request: ListQueryParams & {
      workspace_id: string;
      status?: "active" | "inactive" | "error";
    };
    response: ApiResponse<Agent[]>;
    auth: true;
  }

  /**
   * PUT /v1/agents/:agent_id/config
   * Update agent configuration
   */
  export interface UpdateAgentConfigEndpoint {
    path: "/agents/:agent_id/config";
    method: "PUT";
    request: Partial<{
      enabled: boolean;
      frequency: string;
      threshold: number;
    }>;
    response: ApiResponse<Agent>;
    auth: true;
  }

  /**
   * GET /v1/agents/:agent_id/activity
   * Get agent execution logs and performance
   */
  export interface GetAgentActivityEndpoint {
    path: "/agents/:agent_id/activity";
    method: "GET";
    request: ListQueryParams & {
      status?: "success" | "failed" | "pending";
    };
    response: ApiResponse<AgentExecution[]>;
    auth: true;
  }

  /**
   * POST /v1/agents/:agent_id/task
   * Assign a specific task to an agent
   */
  export interface AssignAgentTaskEndpoint {
    path: "/agents/:agent_id/task";
    method: "POST";
    request: AgentTaskRequest;
    response: ApiResponse<AgentTaskResponse>;
    auth: true;
  }
}

/**
 * ==========================================
 * 5. HELP CENTRE ENDPOINTS
 * ==========================================
 */

export namespace HelpEndpoints {
  /**
   * POST /v1/help/messages
   * Send a message to help centre
   */
  export interface SendMessageEndpoint {
    path: "/help/messages";
    method: "POST";
    request: HelpMessageRequest;
    response: ApiResponse<HelpMessageResponse>;
    auth: true;
  }

  /**
   * GET /v1/help/messages
   * Get help chat history
   */
  export interface GetMessagesEndpoint {
    path: "/help/messages";
    method: "GET";
    request: ListQueryParams & {
      status?: "open" | "resolved" | "escalated";
    };
    response: ApiResponse<HelpMessage[]>;
    auth: true;
  }

  /**
   * POST /v1/help/escalate
   * Escalate message to human support
   */
  export interface EscalateEndpoint {
    path: "/help/escalate";
    method: "POST";
    request: {
      message_id: string;
      reason: string;
    };
    response: ApiResponse<{ message_id: string; status: string; escalated_at: string }>;
    auth: true;
  }

  /**
   * GET /v1/help/articles
   * Search knowledge base
   */
  export interface SearchArticlesEndpoint {
    path: "/help/articles";
    method: "GET";
    request: {
      q?: string;
      category?: string;
      limit?: number;
    };
    response: ApiResponse<HelpArticle[]>;
    auth: false;
  }

  /**
   * POST /v1/help/feedback
   * Rate help response
   */
  export interface SendFeedbackEndpoint {
    path: "/help/feedback";
    method: "POST";
    request: HelpFeedbackRequest;
    response: ApiResponse<{ feedback_id: string; created_at: string }>;
    auth: true;
  }
}

/**
 * ==========================================
 * 6. BILLING ENDPOINTS
 * ==========================================
 */

export namespace BillingEndpoints {
  /**
   * GET /v1/billing/subscription
   * Get current subscription plan
   */
  export interface GetSubscriptionEndpoint {
    path: "/billing/subscription";
    method: "GET";
    request: { workspace_id: string };
    response: ApiResponse<Subscription>;
    auth: true;
  }

  /**
   * POST /v1/billing/upgrade
   * Upgrade subscription plan
   */
  export interface UpgradeSubscriptionEndpoint {
    path: "/billing/upgrade";
    method: "POST";
    request: UpgradeRequest & { workspace_id: string };
    response: ApiResponse<Subscription>;
    auth: true;
  }

  /**
   * GET /v1/billing/invoices
   * Get invoice history
   */
  export interface GetInvoicesEndpoint {
    path: "/billing/invoices";
    method: "GET";
    request: ListQueryParams & {
      workspace_id: string;
      status?: "paid" | "unpaid" | "overdue";
    };
    response: ApiResponse<Invoice[]>;
    auth: true;
  }

  /**
   * GET /v1/billing/usage
   * Get current usage statistics
   */
  export interface GetUsageEndpoint {
    path: "/billing/usage";
    method: "GET";
    request: { workspace_id: string };
    response: ApiResponse<UsageStats>;
    auth: true;
  }
}

/**
 * ==========================================
 * 7. INTEGRATION ENDPOINTS
 * ==========================================
 */

export namespace IntegrationEndpoints {
  /**
   * POST /v1/integrations/connect
   * Initiate OAuth flow for third-party integration
   */
  export interface InitiateConnectEndpoint {
    path: "/integrations/connect";
    method: "POST";
    request: IntegrationConnectRequest;
    response: ApiResponse<IntegrationConnectResponse>;
    auth: true;
  }

  /**
   * GET /v1/integrations/status
   * Get status of all connected integrations
   */
  export interface GetStatusEndpoint {
    path: "/integrations/status";
    method: "GET";
    request: { workspace_id: string };
    response: ApiResponse<Integration[]>;
    auth: true;
  }

  /**
   * POST /v1/integrations/sync
   * Trigger manual sync with integrated system
   */
  export interface TriggerSyncEndpoint {
    path: "/integrations/sync";
    method: "POST";
    request: IntegrationSyncRequest;
    response: ApiResponse<IntegrationSyncResponse>;
    auth: true;
  }
}

/**
 * ==========================================
 * 8. COMPLIANCE & AUDIT ENDPOINTS
 * ==========================================
 */

export namespace AuditEndpoints {
  /**
   * GET /v1/audit/logs
   * Get audit trail of all user actions
   */
  export interface GetAuditLogsEndpoint {
    path: "/audit/logs";
    method: "GET";
    request: FilterableQueryParams & { workspace_id: string };
    response: ApiResponse<AuditLogEntry[]>;
    auth: true;
    requiredRole: ["admin"];
  }
}

/**
 * ==========================================
 * 9. HEALTH & STATUS ENDPOINTS
 * ==========================================
 */

export namespace HealthEndpoints {
  /**
   * GET /v1/health
   * System health check (no authentication required)
   */
  export interface HealthCheckEndpoint {
    path: "/health";
    method: "GET";
    request: Record<string, never>;
    response: ApiResponse<HealthCheckResponse>;
    auth: false;
  }
}

/**
 * ==========================================
 * ENDPOINT REGISTRY
 * ==========================================
 */

export interface EndpointRegistry {
  // Auth
  "POST /auth/signup": AuthEndpoints.SignupEndpoint;
  "POST /auth/login": AuthEndpoints.LoginEndpoint;
  "POST /auth/refresh": AuthEndpoints.RefreshEndpoint;
  "POST /auth/logout": AuthEndpoints.LogoutEndpoint;
  "POST /auth/2fa/setup": AuthEndpoints.TwoFactorSetupEndpoint;

  // Workspaces
  "POST /workspaces": WorkspaceEndpoints.CreateWorkspaceEndpoint;
  "GET /workspaces": WorkspaceEndpoints.ListWorkspacesEndpoint;
  "GET /workspaces/:workspace_id": WorkspaceEndpoints.GetWorkspaceEndpoint;
  "PUT /workspaces/:workspace_id": WorkspaceEndpoints.UpdateWorkspaceEndpoint;
  "POST /workspaces/:workspace_id/invite": WorkspaceEndpoints.InviteMemberEndpoint;
  "DELETE /workspaces/:workspace_id/members/:user_id": WorkspaceEndpoints.RemoveMemberEndpoint;

  // Financial Data
  "POST /financials/import": FinancialEndpoints.ImportFinancialsEndpoint;
  "GET /financials/dashboard": FinancialEndpoints.GetDashboardEndpoint;
  "GET /financials/accounts": FinancialEndpoints.GetAccountsEndpoint;
  "GET /financials/transactions": FinancialEndpoints.GetTransactionsEndpoint;
  "POST /financials/reconcile": FinancialEndpoints.ReconcileEndpoint;

  // Agents
  "POST /agents": AgentEndpoints.DeployAgentEndpoint;
  "GET /agents": AgentEndpoints.ListAgentsEndpoint;
  "PUT /agents/:agent_id/config": AgentEndpoints.UpdateAgentConfigEndpoint;
  "GET /agents/:agent_id/activity": AgentEndpoints.GetAgentActivityEndpoint;
  "POST /agents/:agent_id/task": AgentEndpoints.AssignAgentTaskEndpoint;

  // Help Centre
  "POST /help/messages": HelpEndpoints.SendMessageEndpoint;
  "GET /help/messages": HelpEndpoints.GetMessagesEndpoint;
  "POST /help/escalate": HelpEndpoints.EscalateEndpoint;
  "GET /help/articles": HelpEndpoints.SearchArticlesEndpoint;
  "POST /help/feedback": HelpEndpoints.SendFeedbackEndpoint;

  // Billing
  "GET /billing/subscription": BillingEndpoints.GetSubscriptionEndpoint;
  "POST /billing/upgrade": BillingEndpoints.UpgradeSubscriptionEndpoint;
  "GET /billing/invoices": BillingEndpoints.GetInvoicesEndpoint;
  "GET /billing/usage": BillingEndpoints.GetUsageEndpoint;

  // Integrations
  "POST /integrations/connect": IntegrationEndpoints.InitiateConnectEndpoint;
  "GET /integrations/status": IntegrationEndpoints.GetStatusEndpoint;
  "POST /integrations/sync": IntegrationEndpoints.TriggerSyncEndpoint;

  // Audit
  "GET /audit/logs": AuditEndpoints.GetAuditLogsEndpoint;

  // Health
  "GET /health": HealthEndpoints.HealthCheckEndpoint;
}

/**
 * Helper function to get endpoint definition
 */
export function getEndpoint<K extends keyof EndpointRegistry>(
  key: K
): EndpointRegistry[K] {
  // This is a type-safe way to access endpoint definitions
  return {} as EndpointRegistry[K];
}
