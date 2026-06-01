import { FinancialAgent } from '../agent-framework';
import { Task, Action, ActionType, AgentType, ComplianceCheckResult } from '../agent-types';

/**
 * General Ledger Agent
 * Handles journal entry posting, account maintenance, and period close
 */
export class GeneralLedgerAgent extends FinancialAgent {
  constructor(orgId: string, database?: any, auditLog?: any, complianceEngine?: any) {
    const config = {
      model: 'claude-opus-4.1',
      temperature: 0.3,
      max_tokens: 4096,
      top_p: 0.95,
      enabled_integrations: ['quickbooks', 'xero', 'sap'],
      approval_rules: [
        {
          name: 'large_journal_entry',
          trigger: 'amount > 100000',
          action: 'escalate' as const,
          approver_role: 'financial_controller',
        },
      ],
      escalation_settings: {
        enabled: true,
        escalate_on_errors: true,
        escalate_on_conflicts: true,
        escalate_on_anomalies: true,
        email_recipients: ['finance-team@ledgr.io'],
        response_time_hours: 24,
      },
      retry_policy: {
        max_retries: 3,
        initial_delay_ms: 1000,
        max_delay_ms: 10000,
        backoff_multiplier: 2,
      },
    };

    super('general_ledger' as AgentType, orgId, config, database, auditLog, complianceEngine);
  }

  protected async getRequiredInputFields(): Promise<string[]> {
    return ['journalEntries', 'fiscalPeriod', 'postingDate', 'currencyCode'];
  }

  protected async validateField(fieldName: string, value: any): Promise<{ valid: boolean; error?: string }> {
    switch (fieldName) {
      case 'journalEntries':
        if (!Array.isArray(value) || value.length === 0) {
          return { valid: false, error: 'journalEntries must be a non-empty array' };
        }
        return { valid: true };
      case 'fiscalPeriod':
        if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) {
          return { valid: false, error: 'fiscalPeriod must be in YYYY-MM format' };
        }
        return { valid: true };
      case 'postingDate':
        if (typeof value !== 'string' || isNaN(Date.parse(value))) {
          return { valid: false, error: 'postingDate must be a valid ISO 8601 date string' };
        }
        return { valid: true };
      case 'currencyCode':
        if (typeof value !== 'string' || !['AED', 'USD', 'EUR', 'GBP'].includes(value)) {
          return { valid: false, error: 'currencyCode must be one of: AED, USD, EUR, GBP' };
        }
        return { valid: true };
      default:
        return { valid: false, error: `Unknown field: ${fieldName}` };
    }
  }

  protected async generateActions(task: Task): Promise<Action[]> {
    const { journalEntries = [], fiscalPeriod = '', postingDate = '', currencyCode = 'AED' } = task.input_data || {};

    const actions: Action[] = [];

    // Calculate totals
    let totalDebits = 0;
    let totalCredits = 0;
    (journalEntries || []).forEach((entry: any) => {
      if (entry.debitAmount) totalDebits += entry.debitAmount;
      if (entry.creditAmount) totalCredits += entry.creditAmount;
    });

    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    // Action 1: Create journal entry
    actions.push({
      id: `${task.id}-create-je-1`,
      task_id: task.id,
      type: 'create_journal_entry' as ActionType,
      resource_type: 'journal_entry',
      changes: {
        fiscalPeriod,
        postingDate,
        journalEntries,
        totalDebits,
        totalCredits,
        isBalanced,
        currencyCode,
      },
      status: 'pending_approval',
      created_at: new Date(),
    });

    // Action 2: Update GL accounts
    if (isBalanced) {
      actions.push({
        id: `${task.id}-update-gl-2`,
        task_id: task.id,
        type: 'update_gl_account' as ActionType,
        resource_type: 'gl_account',
        changes: {
          affectedAccounts: journalEntries?.length || 0,
          totalAmount: totalDebits,
          fiscalPeriod,
        },
        status: 'pending_approval',
        created_at: new Date(),
      });
    }

    return actions;
  }

  protected async checkCompliance(task: Task, actions: Action[]): Promise<ComplianceCheckResult> {
    const { journalEntries = [], fiscalPeriod = '', currencyCode = 'AED' } = task.input_data || {};
    const issues: any[] = [];

    // Verify entries balance
    let totalDebits = 0;
    let totalCredits = 0;
    (journalEntries || []).forEach((entry: any) => {
      if (entry.debitAmount) totalDebits += entry.debitAmount;
      if (entry.creditAmount) totalCredits += entry.creditAmount;
    });

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      issues.push({
        severity: 'error',
        code: 'UNBALANCED_ENTRIES',
        description: `Journal entries do not balance (difference: ${totalDebits - totalCredits})`,
      });
    }

    // Fiscal period validation
    const periodRegex = /^\d{4}-\d{2}$/;
    if (!periodRegex.test(fiscalPeriod)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_PERIOD',
        description: `Invalid fiscal period format: ${fiscalPeriod}`,
      });
    }

    // Currency validation
    if (currencyCode && !['AED', 'USD', 'EUR', 'GBP'].includes(currencyCode)) {
      issues.push({
        severity: 'error',
        code: 'UNSUPPORTED_CURRENCY',
        description: `Unsupported currency: ${currencyCode}`,
      });
    }

    return {
      task_id: task.id,
      agent_id: task.agent_id,
      vat_validation: true,
      tax_validation: true,
      audit_trail_complete: true,
      data_residency_compliant: true,
      issues,
    };
  }
}
