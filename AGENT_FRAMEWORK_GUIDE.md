# Ledgr Agent Framework Guide

**Status**: Production-ready foundation (Phase 1 implementation)  
**Last Updated**: May 31, 2026  
**Version**: 1.0.0

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Agent Types & Capabilities](#agent-types--capabilities)
3. [Building New Agents](#building-new-agents)
4. [Task Execution Pipeline](#task-execution-pipeline)
5. [Configuration & Customization](#configuration--customization)
6. [Monitoring & Performance](#monitoring--performance)
7. [Integration Guide](#integration-guide)
8. [Security & Compliance](#security--compliance)

---

## Architecture Overview

### System Design

The Ledgr Agent Framework is built on a **modular, human-in-the-loop** architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Task Submission (API/Scheduler)              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│            Task Execution Engine (TaskExecutionEngine)          │
│  - Queue management (by priority)                               │
│  - Scheduling (recurring/on-demand)                             │
│  - Parallel execution (up to 10 concurrent)                     │
│  - Rollback & recovery                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│            Agent Execution (FinancialAgent)                     │
│  - Input validation                                             │
│  - Action generation (non-destructive)                          │
│  - Compliance checking                                          │
│  - Approval rule evaluation                                     │
│  - Audit logging                                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
    ┌───────────────────┐   ┌──────────────────┐
    │  Auto-Approved    │   │  Requires Human  │
    │  (Low Risk)       │   │  Review          │
    │  Execute Actions  │   │  Escalate        │
    └───────────────────┘   └──────────────────┘
                │                     │
                └──────────┬──────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Approval Workflow & Execution                      │
│  - Human reviews & approves/rejects actions                     │
│  - On approval: execute (create records)                        │
│  - On rejection: rollback + feedback                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│            Monitoring & Learning (AgentMonitor)                │
│  - Real-time health checks                                      │
│  - Performance metrics tracking                                 │
│  - Alert generation                                             │
│  - Accuracy feedback loop                                       │
│  - Prompt tuning based on feedback                              │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `agent-types.ts` | Type definitions | `/backend/agents/` |
| `agent-framework.ts` | Base `FinancialAgent` class | `/backend/agents/` |
| `task-engine.ts` | Task queuing & execution | `/backend/agents/` |
| `agent-monitor.ts` | Monitoring & alerting | `/backend/agents/` |
| `agent-prompt-library.ts` | Domain-specific prompts | `/backend/agents/` |
| `agent-config.ts` | Client configuration | `/backend/agents/` |
| `agents/ap-agent.ts` | Accounts Payable (extend base) | `/backend/agents/` |
| `agents/ar-agent.ts` | Accounts Receivable (extend base) | `/backend/agents/` |
| `agents/reconciliation-agent.ts` | Reconciliation (extend base) | `/backend/agents/` |
| etc. | Other agent implementations | `/backend/agents/` |

---

## Agent Types & Capabilities

### 1. Accounts Payable (AP) Agent

**Role**: Process invoices, schedule payments, manage vendor accounts

**Capabilities**:
- Extract invoice data from PDFs/images
- Validate against POs and receipts (3-way match)
- Calculate & validate VAT
- Detect duplicate invoices
- Schedule payments with vendor terms
- Assign GL accounts & cost centers
- Flag compliance issues

**Example Output**:
```json
{
  "invoices_processed": 15,
  "payments_scheduled": 12,
  "discrepancies_found": [
    { "invoice_id": "INV-001", "issue": "Amount mismatch with PO", "severity": "high" }
  ],
  "escalations": [
    { "invoice_id": "INV-005", "reason": "Exceeds AED 50K threshold", "amount": 75000 }
  ],
  "actions": [
    { "type": "create_payment", "resource_type": "payment" },
    { "type": "flag_for_review", "reason": "New vendor requires verification" }
  ]
}
```

**Approval Thresholds** (configurable):
- Payments > AED 50,000 require approval
- New vendors require verification
- 3-way match failures require resolution

---

### 2. Accounts Receivable (AR) Agent

**Role**: Create invoices, track collections, manage credit

**Capabilities**:
- Create invoices from sales orders
- Calculate VAT (5% UAE rate)
- Generate FTA-compliant e-invoices (UAE requirement)
- Track invoice aging & DSO
- Send payment reminders
- Create credit memos
- Monitor credit limits
- Flag high-risk customers

**Example Output**:
```json
{
  "invoices_created": 8,
  "total_revenue_recognized": 150000,
  "reminders_sent": 12,
  "fta_compliant": true,
  "aging_summary": {
    "current": 320000,
    "30_days": 45000,
    "60_days": 12000,
    "90_plus": 5000
  },
  "credit_alerts": [
    { "customer_id": "CUST-007", "reason": "Exceeds credit limit by AED 20K" }
  ]
}
```

---

### 3. Reconciliation Agent

**Role**: Reconcile bank statements with GL, investigate variances

**Capabilities**:
- Match bank transactions to GL entries
- Calculate outstanding checks/deposits
- Investigate variances > AED 1,000
- Create reconciliation certificates
- Flag anomalies & potential fraud
- Reconcile subledgers to GL control accounts

**Escalation Triggers**:
- Variances > AED 5,000
- Recurring unexplained items
- Potential fraud indicators

---

### 4. Tax Agent

**Role**: Track tax obligations, estimate taxes, prepare filings

**Capabilities**:
- Calculate corporate income tax (5% UAE rate)
- Manage VAT obligations (5% standard, 0% zero-rated)
- Track withholding tax (5%)
- Monitor filing deadlines
- Identify deductions
- Prepare quarterly estimates
- Generate tax reports

---

### 5. Payroll Agent

**Role**: Process payroll, manage withholding, administer benefits

**Capabilities**:
- Calculate gross pay & deductions
- Apply income tax withholding
- Manage health insurance & pension
- Generate pay slips
- Ensure labor law compliance
- File payroll taxes
- Track benefit administration

---

### 6. General Ledger (GL) Agent

**Role**: Post journal entries, maintain chart of accounts, prepare financials

**Capabilities**:
- Post journal entries with audit trail
- Create & maintain GL accounts
- Generate trial balance
- Create financial statements (P&L, balance sheet)
- Execute month-end close
- Reconcile subledgers to GL
- Create consolidation entries

**Escalation Triggers**:
- Journal entries > AED 50,000 require approval
- Account creation requires approval

---

## Building New Agents

### Step 1: Create Agent Class

```typescript
// backend/agents/agents/custom-agent.ts
import { FinancialAgent, Task, Action } from '../agent-framework';
import { AgentType } from '../agent-types';

export class CustomAgent extends FinancialAgent {
  constructor(orgId: string, config: AgentConfig, database: any, auditLog: any, complianceEngine: any) {
    super('custom_agent_type', orgId, config, database, auditLog, complianceEngine);
  }

  // Implement abstract methods

  async generateActions(task: Task): Promise<Action[]> {
    // 1. Parse input data
    const { field1, field2 } = task.input_data;

    // 2. Apply business logic
    const result = await this.processLogic(field1, field2);

    // 3. Generate actions (non-destructive)
    return [{
      id: uuidv4(),
      task_id: task.id,
      type: 'create_invoice', // or other ActionType
      resource_type: 'invoice',
      changes: result,
      status: 'pending_approval',
      created_at: new Date(),
    }];
  }

  protected async getRequiredInputFields(): Promise<string[]> {
    return ['field1', 'field2', 'field3'];
  }

  protected async validateField(fieldName: string, value: any): Promise<{ valid: boolean; error?: string }> {
    // Validate each input field
    if (fieldName === 'field1') {
      return { valid: typeof value === 'string' && value.length > 0 };
    }
    return { valid: true };
  }

  private async processLogic(field1: string, field2: string): Promise<any> {
    // Business logic here
    return { /* output data */ };
  }
}
```

### Step 2: Register Prompt

```typescript
// In agent-prompt-library.ts
export const CUSTOM_AGENT_PROMPT: AgentPrompt = {
  agent_type: 'custom_agent_type',
  system_prompt: `You are the Custom Agent for Ledgr...`,
  capabilities: ['capability1', 'capability2'],
  constraints: ['constraint1', 'constraint2'],
  output_format: `JSON with: ...`,
  examples: [
    {
      input: 'Example input',
      output: 'Example output'
    }
  ]
};

// Add to PROMPT_LIBRARY
PROMPT_LIBRARY['custom_agent_type'] = CUSTOM_AGENT_PROMPT;
```

### Step 3: Update Agent Factory

```typescript
// In agent-framework.ts, DefaultAgentFactory.loadAgentClass()
case 'custom_agent_type':
  const { CustomAgent } = await import('./agents/custom-agent');
  return CustomAgent;
```

### Step 4: Configure for Client

```typescript
// Usage
const configManager = new AgentConfigManager(database);
await configManager.setAgentEnabled('org-123', 'custom_agent_type', true);
```

---

## Task Execution Pipeline

### 1. Submit Task

```typescript
const engine = new TaskExecutionEngine(database);

const task: Task = {
  id: uuidv4(),
  org_id: 'org-123',
  agent_id: 'agent-ap-001',
  agent_type: 'accounts_payable',
  title: 'Process invoices for May 2024',
  description: 'Batch process 20 vendor invoices',
  input_data: {
    invoices: [/* invoice data */],
    batch_date: '2024-05-31'
  },
  status: 'pending',
  priority: 'high',
  created_at: new Date(),
  retry_count: 0,
  tags: ['batch_processing', 'may_2024']
};

const submitted = await engine.submitTask(task);
```

### 2. Queue & Execute

```typescript
// Start execution loop
engine.startExecutionLoop(5000); // Process every 5 seconds

// The engine will:
// 1. Pick highest priority task from queue
// 2. Get assigned agent
// 3. Call agent.executeTask()
// 4. Process results
// 5. Continue with next task
```

### 3. Agent Processing

Inside `FinancialAgent.executeTask()`:

1. **Validate Input**: Check all required fields present & valid
2. **Generate Actions**: Produce journal entries, invoices, etc. (non-destructive)
3. **Compliance Check**: VAT, tax, FTA e-invoicing, data residency
4. **Approval Decision**: Does this task need human review?
5. **Queue or Execute**: Low-risk → execute; high-risk → escalate
6. **Record Metrics**: Track cost, tokens, execution time
7. **Audit Log**: Log all actions for compliance

### 4. Human Review (if needed)

```typescript
// Admin/accountant reviews & approves
const approved = await engine.approveTask(
  taskId,
  'user-456', // Approver user ID
  'Looks good, invoice matches PO' // Optional feedback
);

// OR reject
const rejected = await engine.rejectTask(
  taskId,
  'user-456',
  'Invoice amount does not match PO'
);
```

### 5. Action Execution

On approval, actions execute:

```typescript
// For each approved action:
// - Create invoice/payment/journal entry in database
// - Update GL accounts
// - Send notifications (emails, etc.)
// - Record execution timestamp
```

### 6. Rollback (if needed)

```typescript
// Undo all executed actions
const rolled = await engine.rollbackTask(taskId);

// This will:
// - Delete created records
// - Reverse GL postings
// - Record rollback in audit trail
```

---

## Configuration & Customization

### Per-Client Configuration

```typescript
const configManager = new AgentConfigManager(database);
const config = await configManager.getClientConfig('org-123');

// config has:
// - enabled_agents: AgentType[]
// - approval_thresholds: ApprovalThresholds
// - escalation_rules: ClientEscalationRule[]
// - integration_settings: IntegrationSettings
// - cost_limits: { monthly_budget_usd, daily_budget_usd }
```

### Updating Approval Thresholds

```typescript
// Change payment approval threshold to AED 100K
await configManager.updateApprovalThreshold(
  'org-123',
  'accounts_payable',
  100000
);
```

### Enabling Integrations

```typescript
// Enable QuickBooks
await configManager.configureIntegration('org-123', 'quickbooks', {
  realm_id: '1234567890',
  access_token: 'oauth_token_here',
  enabled: true
});

// Enable Xero
await configManager.configureIntegration('org-123', 'xero', {
  tenant_id: 'xero_tenant_id',
  access_token: 'oauth_token_here',
  enabled: true
});
```

### Adding Escalation Rules

```typescript
await configManager.addEscalationRule('org-123', {
  id: 'rule-ap-high-error-rate',
  condition: 'error_rate > 0.2',
  action: 'pause_agent',
  contacts: ['finance@company.com'],
  response_time_sla_hours: 4
});
```

### Agent Tuning for A/B Testing

```typescript
// Switch to newer Claude model
await configManager.tuneAgent('org-123', 'accounts_payable', {
  model: 'claude-opus-4-2',
  temperature: 0.15 // More deterministic
});
```

### Cost Limits

```typescript
// Set monthly/daily budgets
await configManager.setCostLimits(
  'org-123',
  10000, // Monthly USD
  500    // Daily USD
);
```

### Configuration Presets

```typescript
// Use startup preset (minimal agents, low thresholds)
const startupConfig = AgentConfigManager.getPresets()['startup'];

// Use enterprise preset (all agents, high thresholds)
const enterpriseConfig = AgentConfigManager.getPresets()['enterprise'];
```

---

## Monitoring & Performance

### Health Checks

```typescript
const monitor = new AgentMonitor(database);

// Start continuous monitoring
monitor.startMonitoring(30000); // Every 30 seconds

// Manually check agent health
const health = await monitor.checkAgentHealth(agent);
// Returns: overall_health, error_rate, uptime_percentage, queued_tasks, etc.
```

### Performance Metrics

```typescript
// Get metrics for all agents
const metrics = await monitor.calculateMetrics('agent-ap-001');
// Returns: total_tasks, successful_tasks, accuracy_rate, cost_usd, etc.

// Get 7-day accuracy trend
const accuracy7day = await monitor.calculateAccuracy('agent-ap-001', 7);
```

### Alerts & Anomalies

```typescript
// Get active alerts for organization
const alerts = await monitor.getActiveAlerts('org-123');

// Detect anomalies in agent behavior
const anomalies = await monitor.detectAnomalies('agent-ap-001');
// Returns: list of detected anomalies

// Resolve alert
await monitor.resolveAlert('alert-id-123');
```

### Cost Tracking

```typescript
// Get cost breakdown by agent
const costs = await monitor.getCostBreakdown('org-123', new Date());
// Returns: agent_costs, total_usd, tokens_used, billable_tasks

// Check against cost limits
if (costs.total_usd > clientConfig.cost_limits.monthly_budget_usd) {
  // Alert finance team, consider pausing agents
}
```

### Dashboard Data

```typescript
// Get all data for admin dashboard
const dashboard = await monitor.getDashboardData('org-123');
// Returns: agents[], tasks, alerts, costs

// Get detailed performance report for single agent
const report = await monitor.getAgentPerformanceReport('agent-ap-001');
// Returns: health_status, metrics, recent_tasks, anomalies, trends
```

---

## Integration Guide

### QuickBooks Integration

```typescript
// When agent creates invoice/payment, sync to QB
const qbIntegration = new QuickBooksSync(config.integration_settings.quickbooks);

if (action.type === 'create_invoice') {
  const qbInvoice = await qbIntegration.createInvoice({
    customer_id: action.changes.customer_id,
    line_items: action.changes.line_items,
    due_date: action.changes.due_date,
    total: action.changes.total
  });
}

if (action.type === 'create_payment') {
  const qbPayment = await qbIntegration.createPayment({
    vendor_id: action.changes.vendor_id,
    amount: action.changes.amount,
    payment_method: 'ACH'
  });
}
```

### Xero Integration

Similar pattern for Xero:

```typescript
const xeroIntegration = new XeroSync(config.integration_settings.xero);
// Create invoices/payments in Xero
```

### Bank Integration (Plaid)

```typescript
// Reconciliation agent uses bank data
const bankIntegration = new PlaidSync(bankConfig);
const transactions = await bankIntegration.getTransactions(
  accountId,
  startDate,
  endDate
);
```

---

## Security & Compliance

### Data Isolation

```typescript
// CRITICAL: Every agent is scoped to one org_id
// Database queries automatically filter by org_id

// In database layer:
const userTasks = await db.query(
  'SELECT * FROM tasks WHERE org_id = $1', 
  [req.user.org_id] // MUST always include org_id
);

// Never return tasks from other orgs
```

### Audit Trail

```typescript
// Every agent action is logged
const auditLog: AgentAuditLog = {
  id: uuidv4(),
  org_id: task.org_id,
  agent_id: agent.id,
  task_id: task.id,
  action: 'create_payment',
  timestamp: new Date(),
  changes_before: {},
  changes_after: { payment details },
  reason: 'Payment approved'
};

await database.saveAuditLog(auditLog);
```

### Approval Workflow

```typescript
// All write actions require approval
if (action.status === 'pending_approval') {
  // Wait for human to review & approve
  // Only then execute
  // Log who approved it
}
```

### Compliance Checks

```typescript
// Built-in compliance validation
await agent.checkCompliance(task, actions);
// Checks: VAT calculations, tax implications, FTA e-invoicing, data residency
```

### Cost Controls

```typescript
// Monitor usage & enforce limits
if (cost.total_usd > limits.monthly_budget_usd) {
  // Pause agents, alert admins
  await configManager.setAgentEnabled(orgId, agentType, false);
}
```

---

## API Endpoints (To Build)

### Task Management

```
POST /api/tasks
  - Submit new task

GET /api/tasks/:taskId
  - Get task details & status

PUT /api/tasks/:taskId/approve
  - Approve task output

PUT /api/tasks/:taskId/reject
  - Reject task output

POST /api/tasks/:taskId/rollback
  - Rollback executed actions

GET /api/tasks?agent_id=...&status=...
  - List tasks with filters
```

### Agent Management

```
GET /api/agents
  - List all agents for org

GET /api/agents/:agentId/health
  - Get health status

GET /api/agents/:agentId/metrics
  - Get performance metrics

GET /api/agents/:agentId/feedback
  - Record human feedback

PUT /api/agents/:agentId/config
  - Update agent configuration

POST /api/agents/:agentId/pause
  - Pause agent (pause_agent escalation action)
```

### Monitoring & Reporting

```
GET /api/monitoring/dashboard
  - Dashboard data (all agents, alerts, tasks)

GET /api/monitoring/alerts
  - Get active alerts

GET /api/monitoring/costs
  - Cost breakdown & usage

GET /api/monitoring/reports/:agentId
  - Performance report for agent
```

---

## Testing Agents

### Unit Test Example

```typescript
describe('AccountsPayableAgent', () => {
  let agent: AccountsPayableAgent;
  let mockDb: any;

  beforeEach(() => {
    mockDb = createMockDatabase();
    agent = new AccountsPayableAgent('org-123', DEFAULT_AGENT_CONFIG, mockDb, null, null);
  });

  it('should detect duplicate invoices', async () => {
    const task: Task = {
      // ...
      input_data: {
        invoice_number: 'INV-001',
        vendor_id: 'V-123',
        amount: 10000,
        // ...
      }
    };

    const actions = await agent.generateActions(task);
    
    // Should flag duplicate
    const flagAction = actions.find(a => a.type === 'flag_for_review');
    expect(flagAction?.metadata.reason).toContain('duplicate');
  });

  it('should validate VAT correctly', async () => {
    const task: Task = {
      // ...with VAT amount
    };

    const actions = await agent.generateActions(task);
    
    // VAT should be 5% of subtotal in UAE
    const vatAction = actions.find(a => a.changes.vat);
    expect(vatAction.changes.vat).toBe(expectedVAT);
  });
});
```

---

## Deployment Checklist

- [ ] All agents implemented and tested
- [ ] Database tables created (tasks, actions, agents, audit logs, alerts)
- [ ] API endpoints built & tested
- [ ] Integrations configured (QB, Xero, banks)
- [ ] Compliance checks validated (VAT, tax, FTA e-invoicing)
- [ ] Monitoring & alerting operational
- [ ] Approval workflow tested with humans
- [ ] Rollback procedures tested
- [ ] Cost limits implemented & tested
- [ ] Audit trail comprehensive
- [ ] Data isolation verified
- [ ] Load testing (concurrent tasks)
- [ ] Failure recovery tested
- [ ] Documentation complete

---

## Troubleshooting

### Agent Offline / Not Processing Tasks

1. Check health status: `monitor.getHealthStatus(agentId)`
2. Review recent errors: `agent.error` field
3. Check if escalation rule paused it
4. Manually restart: `configManager.setAgentEnabled(orgId, agentType, true)`

### High Error Rate

1. Get accuracy metrics: `monitor.calculateAccuracy(agentId)`
2. Review feedback from recent tasks
3. Check for data anomalies: `monitor.detectAnomalies(agentId)`
4. Consider tuning: `configManager.tuneAgent(orgId, agentType, { temperature: 0.15 })`

### Tasks Stuck in Escalation Queue

1. Check for unresolved alerts
2. Review escalation rules - may be misconfigured
3. Manually approve/reject outstanding tasks
4. Check email delivery for notifications

### Cost Overruns

1. Get cost breakdown: `monitor.getCostBreakdown(orgId, period)`
2. Identify which agents consuming most
3. Reduce frequency or approval thresholds
4. Consider pausing less critical agents

---

## Support & Contributions

For issues, feature requests, or contributions:
- File issues in project backlog
- Contact: engineering@ledgr.io
- Contributing: See CONTRIBUTING.md

---

**Version 1.0.0 - Production Ready**
