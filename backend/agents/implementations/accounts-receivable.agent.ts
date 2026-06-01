import { FinancialAgent } from '../agent-framework';
import { Task, Action, ActionType } from '../agent-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Accounts Receivable Agent
 * Handles invoice creation, collections management, credit control, and FTA e-invoicing
 */
export class AccountsReceivableAgent extends FinancialAgent {
  constructor(orgId: string, database?: any, auditLog?: any, complianceEngine?: any) {
    const config = {
      model: 'claude-opus-4-1',
      temperature: 0.2,
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
    super('accounts_receivable', orgId, config, database || {}, auditLog || {}, complianceEngine || {});
  }

  protected async getRequiredInputFields(): Promise<string[]> {
    return [
      'customerId',
      'invoiceAmount',
      'description',
      'dueDate',
      'lineItems',
      'glAccount',
      'currencyCode',
      'taxExempt',
    ];
  }

  protected async generateActions(task: Task): Promise<Action[]> {
    const actions: Action[] = [];

    const {
      customerId = 'C001',
      invoiceAmount = 0,
      description = 'Invoice',
      dueDate = new Date().toISOString(),
      lineItems = [],
      glAccount = '4000',
      currencyCode = 'AED',
      taxExempt = false,
    } = task.input_data || {};

    // Action 1: Create invoice
    actions.push({
      id: uuidv4(),
      task_id: task.id,
      type: 'create_invoice' as ActionType,
      resource_type: 'invoice',
      changes: {
        customerId,
        amount: invoiceAmount,
        description,
        dueDate,
        lineItems,
        glAccount,
        currencyCode,
        taxExempt,
      },
      status: 'pending_approval',
      created_at: new Date(),
    });

    // Action 2: Create journal entry
    actions.push({
      id: uuidv4(),
      task_id: task.id,
      type: 'create_journal_entry' as ActionType,
      resource_type: 'journal_entry',
      changes: {
        accountCode: glAccount,
        description: `AR Entry: ${description}`,
        debitAmount: invoiceAmount,
        creditAccount: '4000',
        currencyCode,
        customerId,
        referenceType: 'INVOICE',
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
      case 'customerId':
        return { valid: typeof value === 'string' && value.length > 0 };
      case 'invoiceAmount':
        return { valid: typeof value === 'number' && value > 0 };
      case 'dueDate':
        return { valid: !isNaN(Date.parse(value as string)) };
      case 'currencyCode':
        return { valid: typeof value === 'string' && value.length === 3 };
      default:
        return { valid: true };
    }
  }
}
