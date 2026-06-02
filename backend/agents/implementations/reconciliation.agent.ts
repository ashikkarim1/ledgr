import { FinancialAgent } from "../agent-framework.js";
import { Task, Action, ActionType } from "../agent-types.js";
import { v4 as uuidv4 } from 'uuid';

/**
 * Reconciliation Agent
 * Matches transactions between different accounts and systems
 */
export class ReconciliationAgent extends FinancialAgent {
  constructor(orgId: string, database?: any, auditLog?: any, complianceEngine?: any) {
    const config = {
      model: 'claude-opus-4-1',
      temperature: 0.1,
      max_tokens: 2048,
      top_p: 0.9,
      enabled_integrations: [],
      approval_rules: [],
      escalation_settings: {
        enabled: true,
        escalate_on_errors: true,
        escalate_on_conflicts: true,
        escalate_on_anomalies: true,
        email_recipients: [],
        response_time_hours: 24,
      },
      retry_policy: {
        max_retries: 3,
        initial_delay_ms: 1000,
        max_delay_ms: 10000,
        backoff_multiplier: 2,
      },
    };
    super('reconciliation', orgId, config, database || {}, auditLog || {}, complianceEngine || {});
  }

  protected async getRequiredInputFields(): Promise<string[]> {
    return [
      'accountId',
      'statementDate',
      'statementBalance',
      'systemBalance',
      'transactions',
    ];
  }

  protected async generateActions(task: Task): Promise<Action[]> {
    const actions: Action[] = [];

    const {
      accountId = 'ACC-001',
      statementDate = new Date().toISOString(),
      statementBalance = 0,
      systemBalance = 0,
      transactions = [],
    } = task.input_data || {};

    // Action 1: Reconcile account
    actions.push({
      id: uuidv4(),
      task_id: task.id,
      type: 'reconcile_account' as ActionType,
      resource_type: 'reconciliation',
      changes: {
        accountId,
        statementDate,
        statementBalance,
        systemBalance,
        transactions,
        variance: statementBalance - systemBalance,
        status: 'pending_review',
      },
      status: 'pending_approval',
      created_at: new Date(),
    });

    return actions;
  }

  protected async validateField(
    fieldName: string,
    value: any
  ): Promise<{ valid: boolean; error?: string }> {
    switch (fieldName) {
      case 'accountId':
        return { valid: typeof value === 'string' && value.length > 0 };
      case 'statementBalance':
        return { valid: typeof value === 'number' };
      case 'systemBalance':
        return { valid: typeof value === 'number' };
      case 'transactions':
        return { valid: Array.isArray(value) };
      default:
        return { valid: true };
    }
  }
}
