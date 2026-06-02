import { FinancialAgent } from "../agent-framework.js";
import { Task, Action, ActionType } from "../agent-types.js";
import { v4 as uuidv4 } from 'uuid';

/**
 * Tax Agent
 * Manages tax compliance, calculates tax obligations, and prepares tax filings
 */
export class TaxAgent extends FinancialAgent {
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
    super('tax', orgId, config, database || {}, auditLog || {}, complianceEngine || {});
  }

  protected async getRequiredInputFields(): Promise<string[]> {
    return [
      'taxYear',
      'taxableIncome',
      'expenses',
      'deductions',
      'jurisdiction',
    ];
  }

  protected async generateActions(task: Task): Promise<Action[]> {
    const actions: Action[] = [];

    const {
      taxYear = '2024',
      taxableIncome = 0,
      expenses = {},
      deductions = {},
      jurisdiction = 'AE',
    } = task.input_data || {};

    // Action 1: File tax return
    actions.push({
      id: uuidv4(),
      task_id: task.id,
      type: 'file_tax_return' as ActionType,
      resource_type: 'tax_filing',
      changes: {
        taxYear,
        taxableIncome,
        expenses,
        deductions,
        jurisdiction,
        status: 'draft',
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
      case 'taxYear':
        return { valid: /^\d{4}$/.test(value as string) };
      case 'taxableIncome':
        return { valid: typeof value === 'number' && value >= 0 };
      case 'jurisdiction':
        return { valid: typeof value === 'string' && value.length === 2 };
      default:
        return { valid: true };
    }
  }
}
