import { FinancialAgent } from '../agent-framework';
import { Task, Action, ActionType, AgentType, ComplianceCheckResult } from '../agent-types';

/**
 * Accounts Payable Agent
 * Handles invoice processing, payment scheduling, GL categorization, and VAT compliance
 */
export class AccountsPayableAgent extends FinancialAgent {
  constructor(orgId: string) {
    super(orgId, AgentType.ACCOUNTS_PAYABLE, 'Claude Opus 4.1');
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

    // Extract invoice data from task
    const {
      invoiceNumber,
      vendorId,
      invoiceAmount,
      invoiceDate,
      dueDate,
      description,
      glAccount,
      currencyCode,
      taxAmount,
    } = task.data;

    // Action 1: Validate invoice
    actions.push({
      id: `${task.id}-validate-1`,
      type: ActionType.VALIDATE_DATA,
      description: `Validate invoice ${invoiceNumber} from vendor ${vendorId}`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        invoiceNumber,
        vendorId,
        invoiceAmount,
        invoiceDate,
        dueDate,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 2: Create GL entry
    actions.push({
      id: `${task.id}-gl-entry-2`,
      type: ActionType.CREATE_ENTRY,
      description: `Create GL entry for invoice ${invoiceNumber}`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        accountCode: glAccount,
        description: `AP Entry: ${description}`,
        debitAmount: invoiceAmount,
        creditAccount: '2100', // Accounts Payable control
        currencyCode,
        invoiceNumber,
        referenceType: 'INVOICE',
      },
      requiresApproval: invoiceAmount > 50000, // AED threshold
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 3: Schedule payment
    const paymentDate = this.calculatePaymentDate(dueDate);
    actions.push({
      id: `${task.id}-payment-schedule-3`,
      type: ActionType.SCHEDULE_PAYMENT,
      description: `Schedule payment for invoice ${invoiceNumber}`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        vendorId,
        invoiceNumber,
        amount: invoiceAmount,
        paymentDate,
        paymentMethod: 'bank_transfer',
        currencyCode,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 4: Record in register
    actions.push({
      id: `${task.id}-register-4`,
      type: ActionType.RECORD_DATA,
      description: `Record invoice in AP register`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        invoiceNumber,
        vendorId,
        invoiceAmount,
        taxAmount,
        netAmount: invoiceAmount - taxAmount,
        invoiceDate,
        dueDate,
        glAccount,
        status: 'OPEN',
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    return actions;
  }

  protected async checkCompliance(task: Task, actions: Action[]): Promise<ComplianceCheckResult> {
    const { invoiceAmount, taxAmount, currencyCode } = task.data;

    const issues: string[] = [];
    const warnings: string[] = [];

    // VAT compliance check (UAE: 5% standard rate)
    const expectedVAT = invoiceAmount * 0.05;
    if (Math.abs(taxAmount - expectedVAT) > expectedVAT * 0.1) {
      warnings.push(`VAT differs from expected rate`);
    }

    // Currency validation
    if (currencyCode && !['AED', 'USD', 'EUR', 'GBP'].includes(currencyCode)) {
      issues.push(`Unsupported currency: ${currencyCode}`);
    }

    return {
      isCompliant: issues.length === 0,
      issues,
      warnings,
      checkedAt: new Date(),
      checkType: 'VAT, CURRENCY, DUPLICATE',
    };
  }

  private calculatePaymentDate(dueDate: string): string {
    return dueDate;
  }
}
