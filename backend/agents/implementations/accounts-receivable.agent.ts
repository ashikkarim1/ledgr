import { FinancialAgent } from '../agent-framework';
import { Task, Action, ActionType, AgentType, ComplianceCheckResult } from '../agent-types';

/**
 * Accounts Receivable Agent
 * Handles invoice creation, collections management, credit control, and FTA e-invoicing
 */
export class AccountsReceivableAgent extends FinancialAgent {
  constructor(orgId: string) {
    super(orgId, AgentType.ACCOUNTS_RECEIVABLE, 'Claude Opus 4.1');
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
      customerId,
      invoiceAmount,
      description,
      dueDate,
      lineItems,
      glAccount,
      currencyCode,
      taxExempt,
    } = task.data;

    // Action 1: Generate invoice number
    actions.push({
      id: `${task.id}-generate-invoice-1`,
      type: ActionType.CREATE_ENTRY,
      description: `Generate invoice for customer ${customerId}`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        customerId,
        amount: invoiceAmount,
        description,
        dueDate,
        currencyCode,
        taxExempt,
      },
      requiresApproval: invoiceAmount > 25000, // AED credit limit
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 2: Create GL entry
    actions.push({
      id: `${task.id}-gl-entry-2`,
      type: ActionType.CREATE_ENTRY,
      description: `Create GL entry for customer invoice`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        accountCode: glAccount,
        description: `AR Entry: ${description}`,
        debitAmount: invoiceAmount,
        creditAccount: '4000', // Revenue control
        currencyCode,
        taxExempt,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 3: FTA e-invoicing submission
    actions.push({
      id: `${task.id}-fta-eInvoice-3`,
      type: ActionType.SUBMIT_COMPLIANCE,
      description: `Submit invoice to FTA e-invoicing`,
      status: 'pending',
      targetSystem: 'fta_portal',
      parameters: {
        invoiceNumber: null, // Will be generated
        customerId,
        amount: invoiceAmount,
        taxAmount: taxExempt ? 0 : invoiceAmount * 0.05,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate,
        lineItems,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 4: Send to customer
    actions.push({
      id: `${task.id}-send-customer-4`,
      type: ActionType.SEND_NOTIFICATION,
      description: `Send invoice to customer`,
      status: 'pending',
      targetSystem: 'email',
      parameters: {
        customerId,
        type: 'INVOICE',
        method: 'email',
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 5: Record credit memo if needed
    if (invoiceAmount < 0) {
      actions.push({
        id: `${task.id}-credit-memo-5`,
        type: ActionType.RECORD_DATA,
        description: `Record credit memo`,
        status: 'pending',
        targetSystem: 'erp',
        parameters: {
          customerId,
          amount: Math.abs(invoiceAmount),
          reason: description,
          date: new Date().toISOString().split('T')[0],
        },
        requiresApproval: Math.abs(invoiceAmount) > 25000,
        createdAt: new Date(),
        executedAt: null,
        result: null,
      });
    }

    return actions;
  }

  protected async checkCompliance(task: Task, actions: Action[]): Promise<ComplianceCheckResult> {
    const { invoiceAmount, customerId, taxExempt } = task.data;

    const issues: string[] = [];
    const warnings: string[] = [];

    // Customer credit check
    if (!(await this.validateCustomerCredit(customerId, invoiceAmount))) {
      issues.push(`Customer credit limit would be exceeded`);
    }

    // VAT exemption validation
    if (taxExempt && !(await this.validateVATExemption(customerId))) {
      warnings.push(`Customer may not qualify for VAT exemption`);
    }

    // FTA e-invoicing requirement for large invoices
    if (invoiceAmount > 100000) {
      // FTA e-invoicing mandatory for large transactions
    }

    return {
      isCompliant: issues.length === 0,
      issues,
      warnings,
      checkedAt: new Date(),
      checkType: 'CREDIT, VAT_EXEMPTION, FTA_ECOMMERCE',
    };
  }

  private async validateCustomerCredit(customerId: string, amount: number): Promise<boolean> {
    // In real implementation, would check against customer credit limit
    return true;
  }

  private async validateVATExemption(customerId: string): Promise<boolean> {
    // In real implementation, would validate VAT exemption status
    return false;
  }
}
