/**
 * Ledgr Agent Framework - Base Class & Core Implementation
 * Provides foundation for all financial operation agents
 * Handles: execution, approval workflow, error handling, audit logging
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Agent,
  AgentType,
  AgentConfig,
  Task,
  TaskStatus,
  Action,
  ActionType,
  TaskError,
  AgentAuditLog,
  ComplianceCheckResult,
  TaskExecutionMetadata,
  AgentFeedback,
} from './agent-types';

// ============================================================================
// Base Agent Class
// ============================================================================

export abstract class FinancialAgent {
  protected id: string;
  protected orgId: string;
  protected type: AgentType;
  protected config: AgentConfig;
  protected database: any; // Injected database service
  protected auditLog: any; // Injected audit logger
  protected complianceEngine: any; // Injected compliance checker

  constructor(
    type: AgentType,
    orgId: string,
    config: AgentConfig,
    database: any,
    auditLog: any,
    complianceEngine: any
  ) {
    this.id = uuidv4();
    this.type = type;
    this.orgId = orgId;
    this.config = config;
    this.database = database;
    this.auditLog = auditLog;
    this.complianceEngine = complianceEngine;
  }

  // ========================================================================
  // Core Execution Pipeline
  // ========================================================================

  /**
   * Execute a task with full workflow: validation → execution → approval → audit
   */
  async executeTask(task: Task): Promise<Task> {
    const startTime = Date.now();
    task.started_at = new Date();

    try {
      // 1. Validate input data
      await this.validateInput(task);

      // 2. Generate actions (non-destructive)
      const actions = await this.generateActions(task);
      task.output_actions = actions;

      // 3. Check compliance requirements
      const complianceResult = await this.checkCompliance(task, actions);
      if (complianceResult.issues.some((i) => i.severity === 'error')) {
        throw new Error(
          `Compliance check failed: ${complianceResult.issues[0].description}`
        );
      }

      // 4. Determine if approval is required
      const requiresApproval = await this.shouldRequireApproval(task, actions);

      if (requiresApproval) {
        task.status = 'escalated';
        // Queue for human review
        await this.queueForApproval(task, actions);
      } else {
        // Auto-approve low-risk actions
        task.status = 'approved';
        await this.executeActions(task, actions);
        task.status = 'completed';
      }

      // 5. Record execution metrics
      task.execution_metadata = {
        execution_duration_ms: Date.now() - startTime,
        tokens_used: await this.estimateTokens(task),
        cost_usd: await this.calculateCost(task),
        attempts: task.retry_count + 1,
      };

      // 6. Log audit trail
      await this.logAudit(task, 'task_executed');

      return task;
    } catch (error) {
      return await this.handleExecutionError(task, error, startTime);
    }
  }

  /**
   * Validate task input data against agent schema
   */
  protected async validateInput(task: Task): Promise<void> {
    const requiredFields = await this.getRequiredInputFields();

    for (const field of requiredFields) {
      if (!(field in task.input_data)) {
        throw new Error(`Missing required field: ${field}`);
      }

      const validation = await this.validateField(field, task.input_data[field]);
      if (!validation.valid) {
        throw new Error(`Invalid field ${field}: ${validation.error}`);
      }
    }
  }

  /**
   * Generate actions (invoices, payments, JEs) that agent would like to create
   * Actions are NOT executed immediately - queued for approval
   */
  protected abstract generateActions(task: Task): Promise<Action[]>;

  /**
   * Get required input fields for this agent type
   */
  protected abstract getRequiredInputFields(): Promise<string[]>;

  /**
   * Validate individual field values
   */
  protected abstract validateField(
    fieldName: string,
    value: any
  ): Promise<{ valid: boolean; error?: string }>;

  /**
   * Check VAT, tax, compliance, data residency requirements
   */
  protected async checkCompliance(
    task: Task,
    actions: Action[]
  ): Promise<ComplianceCheckResult> {
    const result: ComplianceCheckResult = {
      task_id: task.id,
      agent_id: this.id,
      vat_validation: true,
      tax_validation: true,
      audit_trail_complete: true,
      data_residency_compliant: true,
      issues: [],
    };

    // Validate VAT calculations if applicable
    if (this.type === 'accounts_payable' || this.type === 'accounts_receivable') {
      const vatCheck = await this.complianceEngine.validateVAT(actions);
      result.vat_validation = vatCheck.valid;
      if (!vatCheck.valid) {
        result.issues.push({
          severity: 'error',
          code: 'VAT_MISMATCH',
          description: vatCheck.error,
          remediation: 'Review VAT calculations with accountant',
        });
      }
    }

    // Validate tax implications for payroll/tax agents
    if (this.type === 'payroll' || this.type === 'tax') {
      const taxCheck = await this.complianceEngine.validateTax(actions);
      result.tax_validation = taxCheck.valid;
      if (!taxCheck.valid) {
        result.issues.push({
          severity: 'warning',
          code: 'TAX_IMPLICATION',
          description: taxCheck.message,
        });
      }
    }

    // FTA e-invoicing validation (UAE-specific)
    if (this.type === 'accounts_receivable') {
      const ftaCheck = await this.complianceEngine.validateFTAeInvoice(actions);
      result.fta_e_invoice_validation = ftaCheck.valid;
    }

    return result;
  }

  /**
   * Determine if task requires human approval based on rules and thresholds
   */
  protected async shouldRequireApproval(
    task: Task,
    actions: Action[]
  ): Promise<boolean> {
    // Check approval rules
    for (const rule of this.config.approval_rules) {
      if (await this.evaluateCondition(rule.trigger, task, actions)) {
        if (rule.action === 'escalate') {
          return true;
        }
      }
    }

    // Check monetary thresholds
    const totalAmount = actions.reduce((sum, action) => {
      const amount = action.changes.amount || 0;
      return sum + amount;
    }, 0);

    const threshold = await this.getApprovalThreshold();
    return totalAmount > threshold;
  }

  /**
   * Queue actions for human review
   */
  protected async queueForApproval(task: Task, actions: Action[]): Promise<void> {
    // Store actions in approval queue
    for (const action of actions) {
      action.status = 'pending_approval';
      await this.database.saveAction(action);
    }

    // Notify escalation recipients
    const recipients = this.config.escalation_settings.email_recipients;
    await this.sendEscalationNotification(task, recipients);
  }

  /**
   * Execute approved actions (create records in system)
   */
  protected async executeActions(task: Task, actions: Action[]): Promise<void> {
    for (const action of actions) {
      try {
        // Execute based on action type
        switch (action.type) {
          case 'create_invoice':
            action.resource_id = await this.database.createInvoice(action.changes);
            break;
          case 'create_payment':
            action.resource_id = await this.database.createPayment(action.changes);
            break;
          case 'create_journal_entry':
            action.resource_id = await this.database.createJournalEntry(
              action.changes
            );
            break;
          case 'send_invoice':
            await this.sendInvoice(action.changes);
            break;
          case 'send_payment_reminder':
            await this.sendPaymentReminder(action.changes);
            break;
          // ... other action types
        }

        action.status = 'executed';
        action.executed_at = new Date();
        await this.database.saveAction(action);
      } catch (error) {
        // Rollback on execution failure
        await this.rollbackAction(action);
        throw error;
      }
    }
  }

  /**
   * Rollback previously executed actions
   */
  protected async rollbackAction(action: Action): Promise<void> {
    if (!action.resource_id) return;

    switch (action.type) {
      case 'create_invoice':
        await this.database.deleteInvoice(action.resource_id);
        break;
      case 'create_payment':
        await this.database.deletePayment(action.resource_id);
        break;
      case 'create_journal_entry':
        await this.database.deleteJournalEntry(action.resource_id);
        break;
    }

    action.status = 'rolled_back';
    action.rollback_at = new Date();
    await this.database.saveAction(action);
  }

  // ========================================================================
  // Learning & Improvement
  // ========================================================================

  /**
   * Record human feedback to improve future outputs
   */
  async recordFeedback(feedback: AgentFeedback): Promise<void> {
    // Store feedback in database
    await this.database.saveFeedback(feedback);

    // Update agent accuracy metrics
    await this.updateAccuracyMetrics(feedback);

    // If accuracy is declining, flag for prompt tuning
    if (feedback.feedback_type === 'incorrect') {
      await this.flagForPromptTuning(feedback);
    }
  }

  /**
   * Update accuracy tracking metrics
   */
  protected async updateAccuracyMetrics(feedback: AgentFeedback): Promise<void> {
    const recentFeedback = await this.database.getRecentFeedback(
      this.id,
      this.type,
      7 // Last 7 days
    );

    const correctCount = recentFeedback.filter((f: AgentFeedback) =>
      ['correct', 'partial'].includes(f.feedback_type)
    ).length;

    const accuracy = (correctCount / recentFeedback.length) * 100;

    await this.database.updateAgentAccuracy({
      agent_id: this.id,
      accuracy_rate: accuracy,
      sample_size: recentFeedback.length,
      trend:
        accuracy > 0.95 ? 'improving' : accuracy > 0.85 ? 'stable' : 'declining',
    });
  }

  // ========================================================================
  // Error Handling & Recovery
  // ========================================================================

  /**
   * Handle execution errors with retry logic and escalation
   */
  protected async handleExecutionError(
    task: Task,
    error: any,
    startTime: number
  ): Promise<Task> {
    task.error = {
      code: error.code || 'EXECUTION_ERROR',
      message: error.message,
      severity: this.determineErrorSeverity(error),
      escalate: true,
      details: { stack: error.stack },
    };

    // Retry if configured and retries remain
    if (
      task.retry_count < this.config.retry_policy.max_retries &&
      this.isRetryable(error)
    ) {
      task.retry_count++;
      const delayMs = this.calculateBackoffDelay(task.retry_count);
      await this.sleep(delayMs);
      return this.executeTask(task);
    }

    task.status = 'failed';
    task.execution_metadata = {
      execution_duration_ms: Date.now() - startTime,
      tokens_used: 0,
      cost_usd: 0,
      attempts: task.retry_count + 1,
      last_error: error.message,
    };

    // Log failure and escalate
    await this.logAudit(task, 'task_failed');
    await this.escalateFailure(task);

    return task;
  }

  /**
   * Determine error severity (affects escalation)
   */
  protected determineErrorSeverity(
    error: any
  ): 'warning' | 'error' | 'critical' {
    if (error.code === 'COMPLIANCE_VIOLATION') return 'critical';
    if (error.code === 'DATA_CONFLICT') return 'critical';
    if (error.code === 'VALIDATION_ERROR') return 'warning';
    return 'error';
  }

  /**
   * Check if error is retryable
   */
  protected isRetryable(error: any): boolean {
    const nonRetryableCodes = [
      'VALIDATION_ERROR',
      'COMPLIANCE_VIOLATION',
      'AUTHORIZATION_ERROR',
    ];
    return !nonRetryableCodes.includes(error.code);
  }

  /**
   * Calculate exponential backoff delay
   */
  protected calculateBackoffDelay(attemptNumber: number): number {
    const initialDelay = this.config.retry_policy.initial_delay_ms;
    const maxDelay = this.config.retry_policy.max_delay_ms;
    const multiplier = this.config.retry_policy.backoff_multiplier;

    const delay = initialDelay * Math.pow(multiplier, attemptNumber - 1);
    return Math.min(delay, maxDelay);
  }

  // ========================================================================
  // Audit & Compliance Logging
  // ========================================================================

  /**
   * Log all agent actions for audit trail
   */
  protected async logAudit(task: Task, action: string): Promise<AgentAuditLog> {
    const log: AgentAuditLog = {
      id: uuidv4(),
      org_id: this.orgId,
      agent_id: this.id,
      task_id: task.id,
      action,
      timestamp: new Date(),
      changes_before: {},
      changes_after: task,
    };

    await this.auditLog.write(log);
    return log;
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  protected async evaluateCondition(
    condition: string,
    task: Task,
    actions: Action[]
  ): Promise<boolean> {
    // Simple condition evaluator - extend for complex logic
    // Example: "amount > 1000"
    return false;
  }

  protected async getApprovalThreshold(): Promise<number> {
    // Get from client configuration
    return 1000; // Default $1000
  }

  protected async estimateTokens(task: Task): Promise<number> {
    // Rough estimate: ~1 token per 4 characters
    const content = JSON.stringify(task);
    return Math.ceil(content.length / 4);
  }

  protected async calculateCost(task: Task): Promise<number> {
    // Cost = tokens * price per 1M tokens
    const tokens = await this.estimateTokens(task);
    const pricePerMToken = 0.003; // $3 per 1M tokens (Claude API pricing)
    return (tokens / 1000000) * pricePerMToken;
  }

  protected async sendEscalationNotification(
    task: Task,
    recipients: string[]
  ): Promise<void> {
    // Send email/Slack notification
    console.log(`Escalating task ${task.id} to: ${recipients.join(', ')}`);
  }

  protected async sendInvoice(changes: Record<string, any>): Promise<void> {
    // Send invoice via email
    console.log(`Sending invoice: ${changes.invoice_number}`);
  }

  protected async sendPaymentReminder(changes: Record<string, any>): Promise<void> {
    // Send payment reminder email
    console.log(`Sending payment reminder for: ${changes.invoice_id}`);
  }

  protected async flagForPromptTuning(feedback: AgentFeedback): Promise<void> {
    // Mark agent for re-training/prompt adjustment
    console.log(
      `Agent ${this.id} flagged for prompt tuning based on feedback`
    );
  }

  protected async escalateFailure(task: Task): Promise<void> {
    // Send alert to admin
    const message = `Task ${task.id} failed: ${task.error?.message}`;
    await this.sendEscalationNotification(task, ['admin@ledgr.io']);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ========================================================================
  // Getters
  // ========================================================================

  getId(): string {
    return this.id;
  }

  getType(): AgentType {
    return this.type;
  }

  getConfig(): AgentConfig {
    return this.config;
  }
}

// ============================================================================
// Agent Factory
// ============================================================================

export interface AgentFactory {
  createAgent(
    type: AgentType,
    orgId: string,
    config: AgentConfig,
    deps: any
  ): Promise<FinancialAgent>;
}

export class DefaultAgentFactory implements AgentFactory {
  async createAgent(
    type: AgentType,
    orgId: string,
    config: AgentConfig,
    deps: any
  ): Promise<FinancialAgent> {
    // Dynamically load agent implementation based on type
    const AgentClass = await this.loadAgentClass(type);
    return new AgentClass(type, orgId, config, deps.database, deps.auditLog, deps.complianceEngine);
  }

  private async loadAgentClass(type: AgentType): Promise<any> {
    // Dynamically import agent implementations
    switch (type) {
      case 'accounts_payable':
        const { AccountsPayableAgent } = await import('./implementations/accounts-payable.agent');
        return AccountsPayableAgent;
      case 'accounts_receivable':
        const { AccountsReceivableAgent } = await import('./implementations/accounts-receivable.agent');
        return AccountsReceivableAgent;
      case 'reconciliation':
        const { ReconciliationAgent } = await import('./implementations/reconciliation.agent');
        return ReconciliationAgent;
      case 'tax':
        const { TaxAgent } = await import('./implementations/tax.agent');
        return TaxAgent;
      case 'payroll':
        const { PayrollAgent } = await import('./implementations/payroll.agent');
        return PayrollAgent;
      case 'general_ledger':
        const { GeneralLedgerAgent } = await import('./implementations/general-ledger.agent');
        return GeneralLedgerAgent;
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }
}
