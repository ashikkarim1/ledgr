import { FinancialAgent } from '../agent-framework';
import { Task, Action, ActionType } from '../agent-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Payroll Agent
 * Processes payroll runs, calculates taxes, deductions, and generates payment instructions
 */
export class PayrollAgent extends FinancialAgent {
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
    super('payroll', orgId, config, database || {}, auditLog || {}, complianceEngine || {});
  }

  protected async getRequiredInputFields(): Promise<string[]> {
    return [
      'payrollPeriod',
      'employees',
      'baseSalary',
      'deductions',
      'taxRate',
      'paymentMethod',
    ];
  }

  protected async generateActions(task: Task): Promise<Action[]> {
    const actions: Action[] = [];

    const {
      payrollPeriod = '2024-01',
      employees = [],
      baseSalary = 0,
      deductions = {},
      taxRate = 0.05,
      paymentMethod = 'bank_transfer',
    } = task.input_data || {};

    // Action 1: Process payroll
    actions.push({
      id: uuidv4(),
      task_id: task.id,
      type: 'process_payroll' as ActionType,
      resource_type: 'payroll_run',
      changes: {
        payrollPeriod,
        employees,
        baseSalary,
        deductions,
        taxRate,
        paymentMethod,
        status: 'pending',
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
      case 'payrollPeriod':
        return { valid: /^\d{4}-\d{2}$/.test(value as string) };
      case 'baseSalary':
        return { valid: typeof value === 'number' && value >= 0 };
      case 'taxRate':
        return { valid: typeof value === 'number' && value >= 0 && value <= 1 };
      case 'employees':
        return { valid: Array.isArray(value) };
      default:
        return { valid: true };
    }
  }
}
