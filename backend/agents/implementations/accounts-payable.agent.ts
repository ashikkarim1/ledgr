import { FinancialAgent } from "../agent-framework.js";
import { Task, Action, ActionType, AgentType, ComplianceCheckResult } from "../agent-types.js";
import { v4 as uuidv4 } from 'uuid';

/**
 * Accounts Payable Agent
 * Handles invoice processing, payment scheduling, GL categorization, and VAT compliance
 */
export class AccountsPayableAgent extends FinancialAgent {
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
    super('accounts_payable', orgId, config, database || {}, auditLog || {}, complianceEngine || {});
  }

  protected async getRequiredInputFields(): Promise<string[]> {
    return [
      'invoiceNumber',
      'vendorId',
      'invoiceAmount',
      'invoiceDate',
      'dueDate',
      'description',
      'glAccount',
      'currencyCode',
      'taxAmount',
    ];
  }

  protected async generateActions(task: Task): Promise<Action[]> {
    const actions: Action[] = [];
    const {
      invoiceNumber = 'INV-001',
      vendorId = 'V001',
      invoiceAmount = 0,
      invoiceDate = new Date().toISOString(),
      dueDate = new Date().toISOString(),
      description = 'Invoice',
      glAccount = '5000',
      currencyCode = 'AED',
      taxAmount = 0,
    } = task.input_data || {};

    // Action 1: Create invoice
    actions.push({
      id: uuidv4(),
      task_id: task.id,
      type: 'create_invoice' as ActionType,
      resource_type: 'invoice',
      changes: {
        invoiceNumber,
        vendorId,
        amount: invoiceAmount,
        taxAmount,
        invoiceDate,
        dueDate,
        description,
        currencyCode,
        glAccount,
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
        description: `AP Entry: ${description}`,
        debitAmount: invoiceAmount,
        creditAccount: '2100',
        currencyCode,
        invoiceNumber,
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
      case 'invoiceNumber':
        return { valid: typeof value === 'string' && value.length > 0 };
      case 'invoiceAmount':
        return { valid: typeof value === 'number' && value > 0 };
      case 'vendorId':
        return { valid: typeof value === 'string' && value.length > 0 };
      case 'invoiceDate':
        return { valid: !isNaN(Date.parse(value as string)) };
      case 'dueDate':
        return { valid: !isNaN(Date.parse(value as string)) };
      case 'currencyCode':
        return { valid: typeof value === 'string' && value.length === 3 };
      case 'taxAmount':
        return { valid: typeof value === 'number' && value >= 0 };
      default:
        return { valid: true };
    }
  }

  private calculatePaymentDate(dueDate: string): Date {
    const date = new Date(dueDate);
    return new Date(date.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days after due date
  }
}
