import { FinancialAgent } from '../agent-framework';
import { Task, Action, ActionType, AgentType, ComplianceCheckResult } from '../agent-types';

/**
 * Payroll Agent
 * Handles payroll processing, tax withholding, benefits administration, and labor law compliance
 */
export class PayrollAgent extends FinancialAgent {
  constructor(orgId: string) {
    super(orgId, AgentType.PAYROLL, 'Claude Opus 4.1');
  }

  protected async getRequiredInputFields(): Promise<string[]> {
    return [
      'payrollPeriod',
      'employeeCount',
      'totalGrossSalary',
      'taxableIncome',
      'withholding',
      'benefits',
      'deductions',
      'currencyCode',
    ];
  }

  protected async generateActions(task: Task): Promise<Action[]> {
    const actions: Action[] = [];

    const {
      payrollPeriod,
      employeeCount,
      totalGrossSalary,
      taxableIncome,
      withholding,
      benefits,
      deductions,
      currencyCode,
    } = task.data;

    // Action 1: Validate payroll data
    actions.push({
      id: `${task.id}-validate-payroll-1`,
      type: ActionType.VALIDATE_DATA,
      description: `Validate payroll for period ${payrollPeriod}`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        payrollPeriod,
        employeeCount,
        totalGrossSalary,
        taxableIncome,
        currencyCode,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 2: Calculate withholding tax
    actions.push({
      id: `${task.id}-calculate-withholding-2`,
      type: ActionType.VALIDATE_DATA,
      description: `Calculate employee withholding tax`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        taxableIncome,
        withholdingRate: 0.05, // UAE standard
        totalWithholding: taxableIncome * 0.05,
        currencyCode,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 3: Post payroll GL entries
    const netPayment = totalGrossSalary - withholding - deductions;

    actions.push({
      id: `${task.id}-post-payroll-3`,
      type: ActionType.CREATE_ENTRY,
      description: `Post payroll GL entries`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        payrollExpense: totalGrossSalary,
        wagePayableAccount: '2200',
        wagePayableAmount: netPayment,
        withholdingTaxPayable: withholding,
        benefitsPayable: benefits,
        currencyCode,
      },
      requiresApproval: totalGrossSalary > 100000, // Large payroll
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 4: Generate payslips
    actions.push({
      id: `${task.id}-generate-payslips-4`,
      type: ActionType.RECORD_DATA,
      description: `Generate employee payslips`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        payrollPeriod,
        employeeCount,
        payslipFormat: 'PDF',
        includeDeductions: true,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 5: Schedule wage payment
    actions.push({
      id: `${task.id}-schedule-payment-5`,
      type: ActionType.SCHEDULE_PAYMENT,
      description: `Schedule wage payment`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        amount: netPayment,
        paymentDate: this.calculatePaymentDate(payrollPeriod),
        paymentMethod: 'bank_transfer',
        currencyCode,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 6: File withholding tax
    actions.push({
      id: `${task.id}-file-withholding-6`,
      type: ActionType.SUBMIT_COMPLIANCE,
      description: `File withholding tax with authorities`,
      status: 'pending',
      targetSystem: 'tax_authority',
      parameters: {
        payrollPeriod,
        totalWithholding: taxableIncome * 0.05,
        employeeCount,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    return actions;
  }

  protected async checkCompliance(task: Task, actions: Action[]): Promise<ComplianceCheckResult> {
    const { totalGrossSalary, employeeCount, currencyCode } = task.data;

    const issues: string[] = [];
    const warnings: string[] = [];

    // Minimum wage check (UAE minimum)
    const minimumWagePerMonth = 2000; // AED
    const avgSalaryPerEmployee = totalGrossSalary / employeeCount;

    if (avgSalaryPerEmployee < minimumWagePerMonth) {
      issues.push(`Average salary below UAE minimum wage`);
    }

    // Currency validation
    if (currencyCode && !['AED', 'USD'].includes(currencyCode)) {
      warnings.push(`Non-standard payroll currency: ${currencyCode}`);
    }

    return {
      isCompliant: issues.length === 0,
      issues,
      warnings,
      checkedAt: new Date(),
      checkType: 'MINIMUM_WAGE, CURRENCY, LABOR_LAW',
    };
  }

  private calculatePaymentDate(payrollPeriod: string): string {
    // Schedule payment for last day of following month
    const [year, month] = payrollPeriod.split('-');
    const nextMonth = parseInt(month) + 1;
    const nextYear = nextMonth > 12 ? parseInt(year) + 1 : year;
    const adjustedMonth = nextMonth > 12 ? 1 : nextMonth;

    const lastDay = new Date(parseInt(nextYear), adjustedMonth, 0).getDate();
    return `${nextYear}-${String(adjustedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
}
