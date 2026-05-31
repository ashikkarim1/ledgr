import { FinancialAgent } from '../agent-framework';
import { Task, Action, ActionType, AgentType, ComplianceCheckResult } from '../agent-types';

/**
 * General Ledger Agent
 * Handles journal entry posting, account maintenance, financial statements, and period close
 */
export class GeneralLedgerAgent extends FinancialAgent {
  constructor(orgId: string) {
    super(orgId, AgentType.GENERAL_LEDGER, 'Claude Opus 4.1');
  }

  protected async getRequiredInputFields(): Promise<string[]> {
    return [
      'journalEntries',
      'fiscalPeriod',
      'postingDate',
      'description',
      'currencyCode',
      'departmentCode',
      'costCenter',
    ];
  }

  protected async generateActions(task: Task): Promise<Action[]> {
    const actions: Action[] = [];

    const {
      journalEntries,
      fiscalPeriod,
      postingDate,
      description,
      currencyCode,
      departmentCode,
      costCenter,
    } = task.data;

    // Validate entries balance
    let totalDebits = 0;
    let totalCredits = 0;
    (journalEntries || []).forEach((entry: any) => {
      if (entry.debitAmount) totalDebits += entry.debitAmount;
      if (entry.creditAmount) totalCredits += entry.creditAmount;
    });

    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    // Action 1: Validate journal entries
    actions.push({
      id: `${task.id}-validate-entries-1`,
      type: ActionType.VALIDATE_DATA,
      description: `Validate journal entries for ${fiscalPeriod}`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        entryCount: journalEntries?.length || 0,
        totalDebits,
        totalCredits,
        isBalanced,
        currencyCode,
      },
      requiresApproval: !isBalanced,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 2: Post journal entries
    if (isBalanced) {
      actions.push({
        id: `${task.id}-post-entries-2`,
        type: ActionType.CREATE_ENTRY,
        description: `Post journal entries to GL`,
        status: 'pending',
        targetSystem: 'erp',
        parameters: {
          fiscalPeriod,
          postingDate,
          description,
          totalAmount: totalDebits,
          departmentCode,
          costCenter,
          currencyCode,
        },
        requiresApproval: totalDebits > 50000, // AED threshold
        createdAt: new Date(),
        executedAt: null,
        result: null,
      });
    }

    // Action 3: Update GL balances
    actions.push({
      id: `${task.id}-update-balances-3`,
      type: ActionType.RECORD_DATA,
      description: `Update GL account balances`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        fiscalPeriod,
        totalAmount: totalDebits,
        affectedAccounts: journalEntries?.length || 0,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 4: Generate trial balance
    actions.push({
      id: `${task.id}-trial-balance-4`,
      type: ActionType.RECORD_DATA,
      description: `Generate trial balance`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        fiscalPeriod,
        postingDate,
        balanced: isBalanced,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 5: Period close procedures (if requested)
    if (this.isPeriodCloseRequested(task.data)) {
      actions.push({
        id: `${task.id}-period-close-5`,
        type: ActionType.RECORD_DATA,
        description: `Execute period close procedures`,
        status: 'pending',
        targetSystem: 'erp',
        parameters: {
          fiscalPeriod,
          accruals: true,
          reversal: true,
          closeStatus: 'IN_PROGRESS',
        },
        requiresApproval: true,
        createdAt: new Date(),
        executedAt: null,
        result: null,
      });
    }

    // Action 6: Generate financial statements
    actions.push({
      id: `${task.id}-financial-statements-6`,
      type: ActionType.RECORD_DATA,
      description: `Generate financial statements`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        fiscalPeriod,
        statements: ['INCOME_STATEMENT', 'BALANCE_SHEET', 'CASH_FLOW'],
        currencyCode,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    return actions;
  }

  protected async checkCompliance(task: Task, actions: Action[]): Promise<ComplianceCheckResult> {
    const { journalEntries, fiscalPeriod, currencyCode } = task.data;

    const issues: string[] = [];
    const warnings: string[] = [];

    // Verify entries balance
    let totalDebits = 0;
    let totalCredits = 0;
    (journalEntries || []).forEach((entry: any) => {
      if (entry.debitAmount) totalDebits += entry.debitAmount;
      if (entry.creditAmount) totalCredits += entry.creditAmount;
    });

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      issues.push(`Journal entries do not balance (difference: ${totalDebits - totalCredits})`);
    }

    // Fiscal period validation
    const periodRegex = /^\d{4}-\d{2}$/;
    if (!periodRegex.test(fiscalPeriod)) {
      issues.push(`Invalid fiscal period format: ${fiscalPeriod}`);
    }

    // Currency validation
    if (currencyCode && !['AED', 'USD', 'EUR', 'GBP'].includes(currencyCode)) {
      issues.push(`Unsupported currency: ${currencyCode}`);
    }

    // Check for duplicate entries
    const entryIds = new Set();
    (journalEntries || []).forEach((entry: any) => {
      if (entryIds.has(entry.id)) {
        warnings.push(`Duplicate journal entry detected: ${entry.id}`);
      }
      entryIds.add(entry.id);
    });

    return {
      isCompliant: issues.length === 0,
      issues,
      warnings,
      checkedAt: new Date(),
      checkType: 'BALANCE, PERIOD, CURRENCY, DUPLICATES',
    };
  }

  private isPeriodCloseRequested(data: any): boolean {
    return data.closePeriod === true || data.periodClose === true;
  }
}
