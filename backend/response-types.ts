/**
 * Standard response types for Ledgr REST API
 * All API responses follow this format
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  meta: ApiMetadata;
  errors: ApiError[] | null;
}

export interface ApiMetadata {
  timestamp: string; // ISO 8601
  request_id: string; // Unique request identifier
  version: string; // API version (e.g., "v1")
  pagination?: PaginationMeta;
  rate_limit?: RateLimitMeta;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset?: number;
  page?: number;
  cursor?: string;
  next_offset?: number;
  has_more: boolean;
}

export interface RateLimitMeta {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  reset_in_seconds: number;
}

export interface ApiError {
  code: string; // Error code (e.g., "INVALID_REQUEST")
  message: string; // Human-readable message
  field?: string; // Field name if applicable
  status: number; // HTTP status code
  timestamp?: string; // ISO 8601
}

/**
 * Authentication Response Types
 */

export interface SignupRequest {
  email: string;
  password: string;
  full_name: string;
  workspace_name: string;
  country: string;
}

export interface SignupResponse {
  user_id: string;
  workspace_id: string;
  email: string;
  full_name: string;
  access_token: string;
  refresh_token: string;
  token_expires_in: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user_id: string;
  workspace_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_in: number;
  role: UserRole;
  trial?: {
    status: string;
    plan: string;
    days_remaining: number;
    trial_started_at?: string;
    trial_ends_at?: string;
  } | null;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  token_expires_in: number;
}

export interface TwoFactorSetupResponse {
  qr_code_url: string;
  backup_codes: string[];
  secret: string;
}

/**
 * JWT Payload
 */

export interface JWTPayload {
  user_id: string;
  workspace_id: string;
  email: string;
  role: UserRole;
  scope: string[]; // Permissions
  trial_status?: string; // Trial status (active, expired, upgraded, etc.)
  exp: number; // Expiration time (Unix)
  iat: number; // Issued at (Unix)
  sub: string; // Subject (user_id)
  iss: string; // Issuer
  aud: string[]; // Audience
}

/**
 * User & Workspace Types
 */

export type UserRole = "admin" | "accountant" | "viewer";

export interface User {
  user_id: string;
  workspace_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  mfa_enabled: boolean;
  last_login?: string; // ISO 8601
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  workspace_id: string;
  name: string;
  industry: string;
  country?: string;
  currency?: string;
  vat_registration_number?: string;
  tax_id?: string;
  fiscal_year_end?: string; // MM-DD
  fiscal_year_start?: string; // MM-DD
  members_count?: number;
  created_at: string;
  created_by: string;
  role?: string;
  // Trial-related fields
  plan?: 'free_trial' | 'free' | 'professional' | 'enterprise';
  trial_status?: 'active' | 'expired' | 'upgraded' | 'cancelled';
  trial_start_date?: string; // ISO 8601
  trial_end_date?: string; // ISO 8601
  trial_days_remaining?: number;
}

export interface WorkspaceDetails extends Workspace {
  members?: WorkspaceMember[];
  subscription_id?: string;
  plan?: "free_trial" | "free" | "professional" | "enterprise";
  trial_usage?: {
    documents_used: number;
    documents_limit: number;
    agent_executions_used: number;
    agent_executions_limit: number;
    users_added: number;
    users_limit: number;
  };
  stats?: {
    transactions_count: number;
    agents_count: number;
    documents_count: number;
    team_members_count: number;
  };
}

export interface WorkspaceMember {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  joined_at: string;
  invited_by?: string;
}

export interface InvitationResponse {
  invitation_id: string;
  email: string;
  role: UserRole;
  status: "pending" | "accepted" | "declined";
  expires_at: string;
}

/**
 * Financial Data Types
 */

export interface FinancialImportRequest {
  type: "bank_statement" | "invoice" | "receipt";
  date_from: string; // YYYY-MM-DD
  date_to: string;
  // File uploaded as multipart
}

export interface FinancialImportResponse {
  import_id: string;
  file_name: string;
  type: string;
  status: "processing" | "completed" | "failed";
  created_at: string;
  processing_percentage: number;
}

export interface FinancialDashboard {
  period: string; // YYYY-MM
  summary: {
    total_revenue: number;
    total_expenses: number;
    net_profit: number;
    vat_liability: number;
    currency: string;
  };
  accounts: {
    assets: number;
    liabilities: number;
    equity: number;
  };
  transactions_count: number;
  last_reconciled?: string;
}

export interface ChartOfAccountsItem {
  account_id: string;
  code: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  is_active: boolean;
}

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export interface Transaction {
  transaction_id: string;
  date: string; // YYYY-MM-DD
  description: string;
  account_from: string; // Account ID
  account_to: string;
  amount: number;
  currency: string;
  status: "draft" | "posted" | "reconciled";
  reference?: string; // Invoice/Check number
  tags: string[];
  created_at: string;
}

export interface ReconcileRequest {
  workspace_id: string;
  transaction_ids: string[];
  reconciled_date: string;
  notes?: string;
}

export interface ReconcileResponse {
  reconciled_count: number;
  reconciled_at: string;
}

/**
 * Agent Types
 */

export type AgentType =
  | "vat_compliance"
  | "transaction_categorization"
  | "invoice_extraction"
  | "expense_verification"
  | "report_generation";

export interface AgentConfig {
  enabled: boolean;
  frequency: "hourly" | "daily" | "weekly" | "manual";
  threshold?: number; // For triggering agent
  auto_categorize?: boolean;
}

export interface AgentDeployRequest {
  workspace_id: string;
  type: AgentType;
  name: string;
  config: AgentConfig;
}

export interface Agent {
  agent_id: string;
  type: AgentType;
  name: string;
  status: "active" | "inactive" | "error";
  enabled: boolean;
  config: AgentConfig;
  last_run?: string;
  last_error?: string;
  created_at: string;
}

export interface AgentExecution {
  execution_id: string;
  agent_id: string;
  status: "success" | "failed" | "pending";
  started_at: string;
  completed_at?: string;
  duration_ms: number;
  items_processed: number;
  errors: string[];
  result_summary: Record<string, any>;
}

export interface AgentTaskRequest {
  task_type: string;
  parameters: Record<string, any>;
  priority: "low" | "normal" | "high";
}

export interface AgentTaskResponse {
  task_id: string;
  agent_id: string;
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
}

/**
 * Help Centre Types
 */

export interface HelpMessageRequest {
  subject: string;
  message: string;
  category: "compliance" | "features" | "account" | "other";
}

export interface HelpMessageResponse {
  message_id: string;
  status: "received" | "in_review" | "resolved" | "escalated";
  ai_response?: string;
  needs_human_review: boolean;
  created_at: string;
}

export interface HelpMessage extends HelpMessageResponse {
  subject: string;
  user_message: string;
  human_response?: string;
  resolved_at?: string;
}

export interface HelpArticle {
  article_id: string;
  title: string;
  category: string;
  excerpt: string;
  url: string;
  updated_at: string;
}

export interface HelpFeedbackRequest {
  message_id: string;
  rating: number; // 1-5
  comment?: string;
}

/**
 * Billing Types
 */

export type SubscriptionPlan = "free" | "professional" | "enterprise";
export type BillingCycle = "monthly" | "annual";

export interface Subscription {
  subscription_id: string;
  workspace_id: string;
  plan: SubscriptionPlan;
  status: "active" | "paused" | "cancelled";
  current_period_start: string;
  current_period_end: string;
  amount: number;
  currency: string;
  billing_cycle: BillingCycle;
  next_billing_date: string;
  auto_renew: boolean;
}

export interface UpgradeRequest {
  plan: SubscriptionPlan;
  billing_cycle: BillingCycle;
}

export interface Invoice {
  invoice_id: string;
  subscription_id: string;
  amount: number;
  currency: string;
  status: "paid" | "unpaid" | "overdue";
  issued_date: string;
  due_date: string;
  paid_date?: string;
  pdf_url: string;
}

export interface UsageStats {
  period: string; // YYYY-MM
  workspace_id: string;
  plan: SubscriptionPlan;
  usage: {
    transactions_processed: number;
    transactions_limit: number;
    ai_agents_deployed: number;
    ai_agents_limit: number;
    team_members: number;
    team_members_limit: number;
    storage_gb: number;
    storage_limit_gb: number;
  };
  resets_at: string;
}

/**
 * Integration Types
 */

export type IntegrationProvider = "quickbooks" | "xero" | "stripe" | "plaid";

export interface IntegrationConnectRequest {
  provider: IntegrationProvider;
  workspace_id: string;
  redirect_uri: string;
}

export interface IntegrationConnectResponse {
  authorization_url: string;
  state: string;
  provider: IntegrationProvider;
  expires_in: number; // Seconds
}

export interface Integration {
  integration_id: string;
  provider: IntegrationProvider;
  status: "connected" | "connecting" | "error" | "disconnected";
  connected_at?: string;
  last_sync?: string;
  next_sync?: string;
  account_name: string;
}

export interface IntegrationSyncRequest {
  integration_id: string;
  sync_type: "full" | "incremental";
}

export interface IntegrationSyncResponse {
  sync_id: string;
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
}

/**
 * Audit Types
 */

export interface AuditLogEntry {
  audit_id: string;
  user_id: string;
  action: "login" | "create" | "update" | "delete" | "export";
  resource_type: string;
  resource_id: string;
  changes?: Record<string, { from: any; to: any }>;
  timestamp: string;
  ip_address?: string;
}

/**
 * Health Check Types
 */

export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  services: Record<string, "operational" | "degraded" | "offline">;
}

/**
 * Request Query Parameters
 */

export interface ListQueryParams {
  limit?: number; // Default: 50, Max: 500
  offset?: number; // Default: 0
  cursor?: string; // For cursor-based pagination
}

export interface FilterableQueryParams extends ListQueryParams {
  "filter[status]"?: string;
  "filter[date_from]"?: string;
  "filter[date_to]"?: string;
  "filter[account_id]"?: string;
  "filter[user_id]"?: string;
  sort?: string; // Format: "field" or "-field" for descending
}

/**
 * Error Response Helpers
 */

export const ErrorCodes = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
