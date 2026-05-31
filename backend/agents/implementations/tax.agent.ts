import { FinancialAgent } from '../agent-framework';
import { Task, Action, ActionType, AgentType, ComplianceCheckResult } from '../agent-types';

/**
 * Tax Agent
 * Handles corporate income tax, VAT management, withholding tax, and tax planning
 */
export class TaxAgent extends FinancialAgent {
  constructor(orgId: string) {
    super(orgId, AgentType.TAX, 'Claude Opus 4.1');
  }

  protected async getRequiredInputFields(): Promise<string[]> {
    return [
      'fiscalYear',
      'taxableIncome',
      'allowableDeductions',
      'vatOutput',
      'vatInput',
      'withholdingTaxAmount',
      'jurisdiction',
      'businessType',
    ];
  }

  protected async generateActions(task: Task): Promise<Action[]> {
    const actions: Action[] = [];

    const {
      fiscalYear,
      taxableIncome,
      allowableDeductions,
      vatOutput,
      vatInput,
      withholdingTaxAmount,
      jurisdiction,
      businessType,
    } = task.data;

    // Action 1: Calculate corporate income tax
    const taxableBase = taxableIncome - allowableDeductions;
    const corporateIncomeTax = taxableBase * 0.05; // UAE: 5% standard rate

    actions.push({
      id: `${task.id}-calculate-cit-1`,
      type: ActionType.VALIDATE_DATA,
      description: `Calculate corporate income tax for ${fiscalYear}`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        fiscalYear,
        taxableIncome,
        allowableDeductions,
        taxableBase,
        corporateIncomeTax,
        jurisdiction,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 2: Calculate VAT position
    const netVAT = vatOutput - vatInput;

    actions.push({
      id: `${task.id}-calculate-vat-2`,
      type: ActionType.VALIDATE_DATA,
      description: `Calculate VAT position`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        vatOutput,
        vatInput,
        netVAT,
        payableIfPositive: netVAT > 0,
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 3: Record tax liability
    actions.push({
      id: `${task.id}-record-liability-3`,
      type: ActionType.CREATE_ENTRY,
      description: `Record tax liabilities`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        citLiability: corporateIncomeTax,
        vatLiability: netVAT > 0 ? netVAT : 0,
        withholdingTaxReceivable: Math.max(0, -netVAT),
        totalTaxLiability: corporateIncomeTax + Math.max(0, netVAT),
      },
      requiresApproval: corporateIncomeTax > 50000,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 4: Prepare tax return
    actions.push({
      id: `${task.id}-prepare-return-4`,
      type: ActionType.RECORD_DATA,
      description: `Prepare tax return for submission`,
      status: 'pending',
      targetSystem: 'tax_authority',
      parameters: {
        fiscalYear,
        taxableIncome,
        allowableDeductions,
        corporateIncomeTax,
        vatOutput,
        vatInput,
        netVAT,
        jurisdiction,
        businessType,
      },
      requiresApproval: true,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    // Action 5: Schedule tax payment
    actions.push({
      id: `${task.id}-schedule-payment-5`,
      type: ActionType.SCHEDULE_PAYMENT,
      description: `Schedule tax payment`,
      status: 'pending',
      targetSystem: 'erp',
      parameters: {
        amount: corporateIncomeTax + Math.max(0, netVAT),
        dueDate: this.calculateTaxDueDate(fiscalYear),
        jurisdiction,
        paymentType: 'TAX_PAYMENT',
      },
      requiresApproval: false,
      createdAt: new Date(),
      executedAt: null,
      result: null,
    });

    return actions;
  }

  protected async checkCompliance(task: Task, actions: Action[]): Promise<ComplianceCheckResult> {
    const { taxableIncome, jurisdiction, businessType } = task.data;

    const issues: string[] = [];
    const warnings: string[] = [];

    // Jurisdiction validation
    const validJurisdictions = ['UAE', 'IFZA', 'RAK_FTZ'];
    if (!validJurisdictions.includes(jurisdiction)) {
      issues.push(`Invalid jurisdiction: ${jurisdiction}`);
    }

    // Tax rate validation (UAE: 5% standard)
    if (jurisdiction === 'UAE' && taxableIncome > 375000) {
      warnings.push(`Taxable income above standard threshold`);
    }

    // Business type validation
    const validBusinessTypes = ['TRADING', 'SERVICES', 'MANUFACTURING', 'HOLDING'];
    if (!validBusinessTypes.includes(businessType)) {
      issues.push(`Invalid business type: ${businessType}`);
    }

    return {
      isCompliant: issues.length === 0,
      issues,
      warnings,
      checkedAt: new Date(),
      checkType: 'JURISDICTION, TAX_RATE, BUSINESS_TYPE',
    };
  }

  private calculateTaxDueDate(fiscalYear: string): string {
    // UAE tax filing deadline: 4 months after fiscal year end
    const year = parseInt(fiscalYear);
    return `${year + 1}-04-30`;
  }
}
