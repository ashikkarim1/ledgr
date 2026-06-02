/**
 * Agent Implementations Index
 * Exports all agent type implementations for easy importing
 */

export { AccountsPayableAgent } from "./accounts-payable.agent.js";
export { AccountsReceivableAgent } from "./accounts-receivable.agent.js";
export { ReconciliationAgent } from "./reconciliation.agent.js";
export { TaxAgent } from "./tax.agent.js";
export { PayrollAgent } from "./payroll.agent.js";
export { GeneralLedgerAgent } from "./general-ledger.agent.js";

// Agent mapping for factory pattern
import { AccountsPayableAgent } from "./accounts-payable.agent.js";
import { AccountsReceivableAgent } from "./accounts-receivable.agent.js";
import { ReconciliationAgent } from "./reconciliation.agent.js";
import { TaxAgent } from "./tax.agent.js";
import { PayrollAgent } from "./payroll.agent.js";
import { GeneralLedgerAgent } from "./general-ledger.agent.js";
import { AgentType } from "../agent-types.js";
import { FinancialAgent } from "../agent-framework.js";

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
