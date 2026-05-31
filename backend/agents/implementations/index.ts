/**
 * Agent Implementations Index
 * Exports all agent type implementations for easy importing
 */

export { AccountsPayableAgent } from './accounts-payable.agent';
export { AccountsReceivableAgent } from './accounts-receivable.agent';
export { ReconciliationAgent } from './reconciliation.agent';
export { TaxAgent } from './tax.agent';
export { PayrollAgent } from './payroll.agent';
export { GeneralLedgerAgent } from './general-ledger.agent';

// Agent mapping for factory pattern
import { AccountsPayableAgent } from './accounts-payable.agent';
import { AccountsReceivableAgent } from './accounts-receivable.agent';
import { ReconciliationAgent } from './reconciliation.agent';
import { TaxAgent } from './tax.agent';
import { PayrollAgent } from './payroll.agent';
import { GeneralLedgerAgent } from './general-ledger.agent';
import { AgentType, FinancialAgent as IFinancialAgent } from '../agent-types';

export const AGENT_IMPLEMENTATIONS: Record<AgentType, typeof IFinancialAgent> = {
  [AgentType.ACCOUNTS_PAYABLE]: AccountsPayableAgent as any,
  [AgentType.ACCOUNTS_RECEIVABLE]: AccountsReceivableAgent as any,
  [AgentType.RECONCILIATION]: ReconciliationAgent as any,
  [AgentType.TAX]: TaxAgent as any,
  [AgentType.PAYROLL]: PayrollAgent as any,
  [AgentType.GENERAL_LEDGER]: GeneralLedgerAgent as any,
};

/**
 * Factory function to instantiate agents by type
 * @param agentType The type of agent to create
 * @param orgId The organization ID for isolation
 * @returns An instance of the requested agent type
 */
export function createAgent(agentType: AgentType, orgId: string): IFinancialAgent {
  const AgentClass = AGENT_IMPLEMENTATIONS[agentType];
  if (!AgentClass) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }
  return new AgentClass(orgId);
}
