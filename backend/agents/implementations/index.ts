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
import { AgentType } from '../agent-types';
import { FinancialAgent } from '../agent-framework';

export const AGENT_IMPLEMENTATIONS: Record<AgentType, new (orgId: string, database?: any, auditLog?: any, complianceEngine?: any) => FinancialAgent> = {
  'accounts_payable': AccountsPayableAgent,
  'accounts_receivable': AccountsReceivableAgent,
  'reconciliation': ReconciliationAgent,
  'tax': TaxAgent,
  'payroll': PayrollAgent,
  'general_ledger': GeneralLedgerAgent,
};

/**
 * Factory function to instantiate agents by type
 * @param agentType The type of agent to create
 * @param orgId The organization ID for isolation
 * @returns An instance of the requested agent type
 */
export function createAgent(agentType: AgentType, orgId: string): FinancialAgent {
  const AgentClass = AGENT_IMPLEMENTATIONS[agentType];
  if (!AgentClass) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }
  return new AgentClass(orgId);
}
