import { FinancialAgent } from '../agent-framework';
import { Task, Action, ActionType, AgentType, ComplianceCheckResult } from '../agent-types';

/**
 * Reconciliation Agent
 * Handles bank reconciliation, GL reconciliation, variance investigation, and reporting
 */
export class ReconciliationAgent extends FinancialAgent {
  constructor(orgId: string) {
    super(orgId, AgentType.RECONCILIATION, 'Claude Opus 4.1');
  }

  protected async getRequiredInputFields(): Promise<string[]> {
    return [
      'bankStatementDate',
      'bankBalance',
      'glAccountCode',
      'glBalance',
      'transactionList',
      'bankName',
      'currencyCode',
    ];
  }

  protected async generateActions(task: Task): Promise<Action[]> {
    const actions: Action[] = [];

    const {
      bankStatementDate,
      bankBalance,
      glAccountCode,
      glBalance,
      transactionList,
      bankName,
      currencyCode,
    } = task.data;

    const variance = bankBalance - glBalance;

    // Action 1: Match transactions
    actions.push({
      id: `${task.id}-match-transactions-1`,
      type: ActionType.VALIDATE_DATA,
      description: `Match bank transactions with GL entries`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        bankStatementDate,
        transactionCount: transactionList?.length || 0,
        bankName,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 2: Identify outstanding items
    actions.push({
      id: `${task.id}-identify-outstanding-2`,
      type: ActionType.VALIDATE_DATA,
      description: `Identify outstanding checks and deposits`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        bankBalance,
        glBalance,
        variance,
        statementDate: bankStatementDate,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 3: Investigate variance (if > tolerance)
    if (Math.abs(variance) > 100) { // AED 100 tolerance
      actions.push({
        id: `${task.id}-investigate-variance-3`,
        type: ActionType.VALIDATE_DATA,
        description: `Investigate variance of ${variance}`,
        status: 'pending',
        targetSystem: 'erp',
        parameters: {
          variance,
          tolerance: 100,
          actionRequired: true,
        },
        requiresApproval: true, // Always requires approval for material variances
        createdAt: new Date(),
        executedAt: null,
        result: null,
      });
    }

    // Action 4: Post reconciling entries
    if (Math.abs(variance) > 0 && Math.abs(variance) <= 100) {
      actions.push({
        id: `${task.id}-post-entries-4`,
        type: ActionType.CREATE_ENTRY,
        description: `Post reconciling entries`,
        status: 'pending',
        targetSystem: 'erp',
        parameters: {
          glAccount: glAccountCode,
          amount: variance,
          description: 'Bank reconciliation adjustment',
          currencyCode,
          statementDate: bankStatementDate,
        },
        requiresApproval: false,
        createdAt: new Date(),
        executedAt: null,
        result: null,
      });
    }

    // Action 5: Generate reconciliation report
    actions.push({
      id: `${task.id}-generate-report-5`,
      type: ActionType.RECORD_DATA,
      description: `Generate bank reconciliation report`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        statementDate: bankStatementDate,
        bankName,
        bankBalance,
        glBalance,
        variance,
        status: Math.abs(variance) === 0 ? 'RECONCILED' : 'PENDING_APPROVAL',
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    return actions;
  }

  protected async checkCompliance(task: Task, actions: Action[]): Promise<ComplianceCheckResult> {
    const { bankBalance, glBalance, currencyCode } = task.data;

    const issues: string[] = [];
    const warnings: string[] = [];

    const variance = bankBalance - glBalance;

    // Tolerance check
    if (Math.abs(variance) > 1000) {
      issues.push(`Variance of ${variance} exceeds acceptable tolerance`);
    }

    if (Math.abs(variance) > 100 && Math.abs(variance) <= 1000) {
      warnings.push(`Material variance of ${variance} requires investigation`);
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
      checkType: 'VARIANCE_TOLERANCE, CURRENCY',
    };
  }
}
