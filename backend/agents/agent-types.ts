/**
 * Ledgr Agent Framework Type Definitions
 * Complete TypeScript types for agent architecture, task execution, and monitoring
 */

// ============================================================================
// Core Agent Types
// ============================================================================

export type AgentType =
  | 'accounts_payable'
  | 'accounts_receivable'
  | 'reconciliation'
  | 'tax'
  | 'payroll'
  | 'general_ledger';

export interface Agent {
  id: string;
  org_id: string;
  type: AgentType;
  name: string;
  description: string;
  is_enabled: boolean;
  capabilities: AgentCapability[];
  configuration: AgentConfig;
  performance_metrics: AgentMetrics;
  created_at: Date;
  updated_at: Date;
  last_task_at?: Date;
}

export interface AgentCapability {
  name: string;
  description: string;
  scope: 'read' | 'write'; // Write agents create records, don't mutate existing data
  resources: string[]; // e.g., ['invoices', 'payments', 'journal_entries']
  requires_approval: boolean;
  escalation_threshold?: number; // Monetary amount or percentage
}

export interface AgentConfig {
  model: string; // Claude model version
  temperature: number; // 0.0 - 1.0
  max_tokens: number;
  top_p: number;
  system_prompt?: string; // Custom system prompt override
  enabled_integrations: string[]; // QB, Xero, SAP, etc.
  approval_rules: ApprovalRule[];
  escalation_settings: EscalationSettings;
  retry_policy: RetryPolicy;
}

export interface ApprovalRule {
  name: string;
  trigger: string; // Condition that triggers rule (e.g., "amount > 1000")
  action: 'approve' | 'escalate' | 'flag_for_review';
  approver_role: string; // Role that must approve
  auto_approve_after?: number; // Days to auto-approve if no response
}

export interface EscalationSettings {
  enabled: boolean;
  escalate_on_errors: boolean;
  escalate_on_conflicts: boolean;
  escalate_on_anomalies: boolean;
  email_recipients: string[];
  slack_channel?: string;
  response_time_hours: number;
}

export interface RetryPolicy {
  max_retries: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
}

export interface AgentMetrics {
  total_tasks: number;
  successful_tasks: number;
  failed_tasks: number;
  approval_rate: number; // % of tasks requiring approval
  accuracy_rate: number; // % of correct outputs
  avg_execution_time_seconds: number;
  cost_usd: number;
  last_7_day_accuracy: number;
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'escalated'
  | 'approved'
  | 'rejected';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  org_id: string;
  agent_id: string;
  agent_type: AgentType;
  title: string;
  description: string;
  input_data: Record<string, any>;
  expected_output?: string;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
  scheduled_for?: Date; // For scheduled tasks
  execution_metadata?: TaskExecutionMetadata;
  output_actions?: Action[];
  error?: TaskError;
  reviewed_by?: string; // User ID of reviewer
  reviewed_at?: Date;
  feedback?: string;
  retry_count: number;
  tags: string[];
}

export interface TaskExecutionMetadata {
  execution_duration_ms: number;
  tokens_used: number;
  cost_usd: number;
  attempts: number;
  last_error?: string;
}

export interface TaskError {
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  escalate: boolean;
  details?: Record<string, any>;
}

export type ActionType =
  | 'create_invoice'
  | 'create_payment'
  | 'create_journal_entry'
  | 'send_invoice'
  | 'send_payment_reminder'
  | 'create_expense_report'
  | 'update_gl_account'
  | 'reconcile_account'
  | 'file_tax_return'
  | 'process_payroll'
  | 'create_audit_log'
  | 'flag_for_review';

export interface Action {
  id: string;
  task_id: string;
  type: ActionType;
  resource_type: string; // 'invoice', 'payment', 'journal_entry', etc.
  resource_id?: string; // ID of created resource
  changes: Record<string, any>;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'rolled_back';
  created_at: Date;
  approved_at?: Date;
  approved_by?: string;
  executed_at?: Date;
  rollback_at?: Date;
}

// ============================================================================
// Agent Scheduling Types
// ============================================================================

export type ScheduleFrequency =
  | 'once'
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'on_demand';

export interface AgentSchedule {
  id: string;
  org_id: string;
  agent_id: string;
  frequency: ScheduleFrequency;
  cron_expression?: string; // For complex schedules
  next_run_at: Date;
  last_run_at?: Date;
  is_active: boolean;
  task_template: TaskTemplate;
}

export interface TaskTemplate {
  title_template: string;
  description_template: string;
  input_data_template: Record<string, any>;
  priority: TaskPriority;
  tags: string[];
}

// ============================================================================
// Learning & Feedback Types
// ============================================================================

export interface AgentFeedback {
  id: string;
  org_id: string;
  agent_id: string;
  task_id: string;
  feedback_type: 'correct' | 'incorrect' | 'partial' | 'needs_revision';
  corrections: Record<string, any>; // Human-provided corrections
  correction_reason?: string;
  confidence_score?: number; // How confident feedback giver is
  created_by: string; // User ID
  created_at: Date;
}

export interface AgentAccuracy {
  agent_id: string;
  task_type: string; // e.g., 'reconciliation', 'invoice_creation'
  accuracy_rate: number; // 0-100
  sample_size: number;
  last_calculated_at: Date;
  trend: 'improving' | 'stable' | 'declining';
  suggestions?: string[];
}

// ============================================================================
// Monitoring & Alerting Types
// ============================================================================

export interface AgentAlert {
  id: string;
  org_id: string;
  agent_id: string;
  alert_type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata?: Record<string, any>;
  is_resolved: boolean;
  created_at: Date;
  resolved_at?: Date;
}

export enum AlertType {
  AGENT_OFFLINE = 'agent_offline',
  HIGH_ERROR_RATE = 'high_error_rate',
  ACCURACY_DECLINE = 'accuracy_decline',
  EXECUTION_TIMEOUT = 'execution_timeout',
  ESCALATION_QUEUE_FULL = 'escalation_queue_full',
  COST_THRESHOLD_EXCEEDED = 'cost_threshold_exceeded',
  ANOMALY_DETECTED = 'anomaly_detected',
  DATA_CONFLICT = 'data_conflict'
}

export interface AgentHealthStatus {
  agent_id: string;
  overall_health: 'healthy' | 'degraded' | 'unhealthy';
  error_rate: number;
  uptime_percentage: number;
  last_successful_task?: Date;
  last_failure?: TaskError;
  queued_tasks: number;
  avg_response_time_ms: number;
}

// ============================================================================
// Client Configuration Types
// ============================================================================

export interface ClientAgentConfig {
  org_id: string;
  enabled_agents: AgentType[];
  disabled_agents: AgentType[];
  agent_customizations: Record<AgentType, AgentConfig>;
  approval_thresholds: ApprovalThresholds;
  escalation_rules: ClientEscalationRule[];
  integration_settings: IntegrationSettings;
  cost_limits?: {
    monthly_budget_usd: number;
    daily_budget_usd: number;
  };
}

export interface ApprovalThresholds {
  accounts_payable: {
    payment_requires_approval: number;
    invoice_dispute_requires_approval: boolean;
  };
  accounts_receivable: {
    credit_memo_requires_approval: number;
    collection_letter_requires_approval: boolean;
  };
  payroll: {
    payroll_requires_approval: boolean;
    tax_adjustment_requires_approval: boolean;
  };
  general_ledger: {
    journal_entry_requires_approval: number;
    account_creation_requires_approval: boolean;
  };
}

export interface ClientEscalationRule {
  id: string;
  condition: string; // e.g., "error_rate > 0.05 OR accuracy_rate < 0.90"
  action: 'pause_agent' | 'alert_admin' | 'escalate_to_human' | 'reduce_confidence';
  contacts: string[]; // Email addresses or Slack IDs
  response_time_sla_hours: number;
}

export interface IntegrationSettings {
  quickbooks?: {
    realm_id: string;
    access_token: string;
    enabled: boolean;
  };
  xero?: {
    tenant_id: string;
    access_token: string;
    enabled: boolean;
  };
  sap?: {
    system_id: string;
    client: string;
    enabled: boolean;
  };
  stripe?: {
    api_key: string;
    enabled: boolean;
  };
  banks?: Array<{
    bank_id: string;
    connection_type: 'plaid' | 'api' | 'csv_import';
    enabled: boolean;
  }>;
}

// ============================================================================
// Audit & Compliance Types
// ============================================================================

export interface AgentAuditLog {
  id: string;
  org_id: string;
  agent_id: string;
  task_id: string;
  action: string;
  timestamp: Date;
  user_id?: string; // If human initiated
  changes_before: Record<string, any>;
  changes_after: Record<string, any>;
  reason?: string;
  ip_address?: string;
  user_agent?: string;
}

export interface ComplianceCheckResult {
  task_id: string;
  agent_id: string;
  vat_validation: boolean;
  tax_validation: boolean;
  fta_e_invoice_validation?: boolean;
  audit_trail_complete: boolean;
  data_residency_compliant: boolean;
  issues: ComplianceIssue[];
}

export interface ComplianceIssue {
  severity: 'info' | 'warning' | 'error';
  code: string;
  description: string;
  remediation?: string;
}

// ============================================================================
// Performance & Cost Tracking Types
// ============================================================================

export interface TaskExecutionStats {
  org_id: string;
  agent_id: string;
  period: 'day' | 'week' | 'month';
  total_tasks: number;
  successful_tasks: number;
  failed_tasks: number;
  avg_execution_time_ms: number;
  total_tokens_used: number;
  total_cost_usd: number;
  actions_created: number;
  actions_approved: number;
  actions_rejected: number;
}

export interface CostBreakdown {
  org_id: string;
  period: Date;
  agent_costs: Record<AgentType, number>;
  total_usd: number;
  tokens_used: number;
  billable_tasks: number;
}
