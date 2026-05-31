/**
 * Controllers Index
 * Centralized export of all API controllers
 */

// Auth controller
export {
  signup,
  login,
  refresh,
  logout,
  setupTwoFactor,
} from "./auth.controller";

// Workspaces controller
export {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  inviteMember,
  listMembers,
} from "./workspaces.controller";

// Financial data controller
export {
  getDashboard,
  listAccounts,
  listTransactions,
  createTransaction,
  getProfitLossReport,
} from "./financials.controller";

// Agents controller
export {
  listAgents,
  getAgent,
  executeAgent,
  getAgentHistory,
  getExecution,
} from "./agents.controller";

// Help centre controller
export {
  searchArticles,
  getArticle,
  createTicket,
  listTickets,
  getTicket,
  addTicketMessage,
} from "./help.controller";

// Billing controller
export {
  getSubscription,
  upgradeSubscription,
  listInvoices,
  listPaymentMethods,
  addPaymentMethod,
} from "./billing.controller";

// Integrations controller
export {
  listAvailableIntegrations,
  initiateConnection,
  handleCallback,
  getIntegrationStatus,
  disconnectIntegration,
} from "./integrations.controller";

// Audit controller
export {
  getAuditLogs,
  getComplianceReport,
  getUserActivity,
  exportAuditLogs,
} from "./audit.controller";
