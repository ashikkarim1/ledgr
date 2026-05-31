# API Controllers Implementation Guide

This document provides a comprehensive overview of all implemented API controllers for the Ledgr platform.

## Controllers Overview

### 1. Auth Controller (`auth.controller.ts`)
Handles user authentication, token management, and two-factor authentication.

**Endpoints:**
- `POST /v1/auth/signup` - User registration
- `POST /v1/auth/login` - User login
- `POST /v1/auth/refresh` - Token refresh
- `POST /v1/auth/logout` - User logout
- `POST /v1/auth/2fa/setup` - Two-factor authentication setup

**Key Functions:**
- `signup(req, res)` - Creates new user and workspace
- `login(req, res)` - Authenticates user credentials
- `refresh(req, res)` - Refreshes expired access tokens
- `logout(req, res)` - Invalidates session
- `setupTwoFactor(req, res)` - Enables 2FA via authenticator or SMS

**Validation Rules:**
- Email must be valid format
- Password minimum 12 characters with uppercase, number, special character
- Workspace name 3-100 characters
- 2FA method must be 'authenticator' or 'sms'

---

### 2. Workspaces Controller (`workspaces.controller.ts`)
Manages workspace creation, configuration, and member management.

**Endpoints:**
- `POST /v1/workspaces` - Create new workspace
- `GET /v1/workspaces` - List user's workspaces
- `GET /v1/workspaces/:workspace_id` - Get workspace details
- `PATCH /v1/workspaces/:workspace_id` - Update workspace settings
- `POST /v1/workspaces/:workspace_id/members` - Invite member
- `GET /v1/workspaces/:workspace_id/members` - List workspace members

**Key Functions:**
- `createWorkspace(req, res)` - Creates new workspace with user as admin
- `listWorkspaces(req, res)` - Returns paginated workspace list
- `getWorkspace(req, res)` - Returns detailed workspace info with stats
- `updateWorkspace(req, res)` - Updates workspace settings (admin only)
- `inviteMember(req, res)` - Sends invitation or adds existing user
- `listMembers(req, res)` - Returns paginated member list

**Access Control:**
- All endpoints require authentication
- Admin-only endpoints: update, invite, manage members
- Workspace isolation enforced on all operations

**Workspace Limits by Plan:**
- Free: 1 workspace
- Professional: 5 workspaces
- Enterprise: Unlimited

---

### 3. Financial Data Controller (`financials.controller.ts`)
Handles financial dashboard, accounts, transactions, and reporting.

**Endpoints:**
- `GET /v1/financials/dashboard` - Dashboard summary
- `GET /v1/financials/accounts` - List accounts
- `GET /v1/financials/transactions` - List transactions
- `POST /v1/financials/transactions` - Create manual transaction
- `GET /v1/financials/reports/profit-loss` - P&L report

**Key Functions:**
- `getDashboard(req, res)` - Aggregates financial metrics
- `listAccounts(req, res)` - Returns accounts with balance
- `listTransactions(req, res)` - Returns filtered/sorted transactions
- `createTransaction(req, res)` - Records manual transaction (accountant+)
- `getProfitLossReport(req, res)` - Generates P&L for date range

**Filtering & Sorting:**
- Account type filtering (assets, liabilities, equity, income, expense)
- Currency filtering
- Date range filtering
- Amount range filtering
- Sort by: date, amount, category, account

**Transaction Types:**
- Invoices
- Payments
- Bank transfers
- Adjustments
- Manual entries

**Role-Based Access:**
- Viewer: Read-only access
- Accountant: Read + create/edit transactions
- Admin: Full access including deletion

---

### 4. Agents Controller (`agents.controller.ts`)
Manages AI agent lifecycle, execution, and monitoring.

**Endpoints:**
- `GET /v1/agents` - List available agents
- `GET /v1/agents/:agent_id` - Get agent details
- `POST /v1/agents/:agent_id/execute` - Execute agent
- `GET /v1/agents/:agent_id/executions` - Execution history
- `GET /v1/agents/:agent_id/executions/:execution_id` - Execution details

**Key Functions:**
- `listAgents(req, res)` - Lists agents with status filtering
- `getAgent(req, res)` - Returns agent config and recent executions
- `executeAgent(req, res)` - Queues agent for execution
- `getAgentHistory(req, res)` - Paginated execution history
- `getExecution(req, res)` - Returns execution details and results

**Agent Types:**
- Invoice Processing Agent
- Expense Categorization Agent
- Bank Reconciliation Agent
- Financial Reporting Agent
- Tax Compliance Agent

**Execution Status:**
- Queued
- Running
- Completed
- Failed
- Paused

---

### 5. Help Centre Controller (`help.controller.ts`)
Provides support articles, ticket management, and live support.

**Endpoints:**
- `GET /v1/help/articles` - Search articles (RAG-enabled)
- `GET /v1/help/articles/:article_id` - Get article
- `POST /v1/help/tickets` - Create support ticket
- `GET /v1/help/tickets` - List user tickets
- `GET /v1/help/tickets/:ticket_id` - Get ticket details
- `POST /v1/help/tickets/:ticket_id/messages` - Add message

**Key Functions:**
- `searchArticles(req, res)` - Semantic search with RAG
- `getArticle(req, res)` - Returns article with tracked views
- `createTicket(req, res)` - Creates support ticket
- `listTickets(req, res)` - User's ticket history
- `getTicket(req, res)` - Returns ticket with message thread
- `addTicketMessage(req, res)` - Adds message to ticket

**Ticket Priority Levels:**
- Low
- Medium
- High
- Urgent

**Search Categories:**
- Billing
- Technical
- Account
- General
- Integration

---

### 6. Billing Controller (`billing.controller.ts`)
Handles subscriptions, invoices, and payment methods.

**Endpoints:**
- `GET /v1/billing/subscription` - Get subscription
- `POST /v1/billing/subscription/upgrade` - Upgrade plan
- `GET /v1/billing/invoices` - List invoices
- `GET /v1/billing/payment-methods` - List payment methods
- `POST /v1/billing/payment-methods` - Add payment method

**Key Functions:**
- `getSubscription(req, res)` - Returns current subscription details
- `upgradeSubscription(req, res)` - Upgrades plan (admin only)
- `listInvoices(req, res)` - Paginated invoice list
- `listPaymentMethods(req, res)` - User's payment methods
- `addPaymentMethod(req, res)` - Adds new card (via Stripe token)

**Subscription Plans:**
- Free: $0/month - Basic features, limited API calls
- Professional: $99/month - Full features, 50K API calls
- Enterprise: Custom - Unlimited features, dedicated support

**Billing Cycles:**
- Monthly
- Annual (10% discount)

**Admin-Only Endpoints:**
- All subscription and payment management endpoints

---

### 7. Integrations Controller (`integrations.controller.ts`)
Manages third-party integrations with accounting, banking, and payment platforms.

**Endpoints:**
- `GET /v1/integrations` - List available integrations
- `POST /v1/integrations/:integration_type/connect` - Initiate OAuth
- `POST /v1/integrations/:integration_type/callback` - OAuth callback
- `GET /v1/integrations/:integration_type/status` - Integration status
- `DELETE /v1/integrations/:integration_type` - Disconnect

**Key Functions:**
- `listAvailableIntegrations(req, res)` - Lists all available integrations
- `initiateConnection(req, res)` - Starts OAuth flow
- `handleCallback(req, res)` - Processes OAuth callback
- `getIntegrationStatus(req, res)` - Checks integration health
- `disconnectIntegration(req, res)` - Revokes integration

**Supported Integrations:**
- QuickBooks Online
- Xero
- Stripe
- Banking APIs (VAU Bank, FIB, DIB, etc.)
- PayPal
- Wise (TransferWise)

**OAuth Flow:**
1. Client initiates connection
2. Server generates state token
3. User redirected to provider
4. Provider redirects back with auth code
5. Server exchanges code for tokens
6. Integration saved and sync begins

---

### 8. Audit Controller (`audit.controller.ts`)
Provides audit logging, compliance reporting, and activity tracking.

**Endpoints:**
- `GET /v1/audit/logs` - Get audit logs
- `GET /v1/audit/compliance-report` - Compliance report
- `GET /v1/audit/user-activity/:user_id` - User activity
- `POST /v1/audit/export-logs` - Export logs

**Key Functions:**
- `getAuditLogs(req, res)` - Paginated audit log query
- `getComplianceReport(req, res)` - Generates compliance report
- `getUserActivity(req, res)` - User activity summary
- `exportAuditLogs(req, res)` - Exports logs as CSV/JSON

**Audited Events:**
- User login/logout
- Data access
- Data modification
- Role changes
- Integration changes
- Subscription changes
- Payment transactions

**Compliance Reports:**
- Data Access Report
- Security Events Report
- Activity Summary
- User Actions Report
- Financial Changes Report

**Export Formats:**
- JSON (default)
- CSV

**Admin-Only Access:**
- All audit endpoints require admin role

---

## Common Patterns

### Authentication Pattern
All endpoints follow this authentication pattern:

```typescript
const user = (req as any).user;
if (!user) {
  throw ApiErrors.unauthorized("Authentication required");
}
```

### Workspace Isolation Pattern
Workspace-scoped endpoints verify user has access:

```typescript
const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
if (!hasAccess) {
  throw ApiErrors.forbidden("No access to this workspace");
}
```

### Pagination Pattern
Endpoints that return lists implement pagination:

```typescript
const page = parseInt(req.query.page as string) || 1;
const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
const offset = (page - 1) * limit;

const { data, total } = await getData(filters, limit, offset);

const response: ApiResponse<T[]> = {
  success: true,
  data,
  meta: {
    timestamp: new Date().toISOString(),
    request_id: req.headers["x-request-id"] as string,
    version: "v1",
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  },
  errors: null,
};
```

### Error Handling Pattern
All controllers use the AsyncHandler and ApiErrors utility:

```typescript
export const endpoint = asyncHandler(async (req: Request, res: Response) => {
  // Validation
  if (!requiredField) {
    throw ApiErrors.invalidRequest("Field is required");
  }

  // Authorization
  if (!hasPermission) {
    throw ApiErrors.forbidden("No permission");
  }

  // Resource check
  const resource = await getResource(id);
  if (!resource) {
    throw ApiErrors.notFound("Resource not found");
  }

  // Business logic
  // ...

  // Response
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: { /* ... */ },
    errors: null,
  };

  res.json(response);
});
```

---

## Database Integration

All controllers include stub functions for database operations. Replace these with your actual database implementation:

```typescript
async function fetchUser(userId: string): Promise<User | null> {
  // Replace with actual database query
  // Example (Prisma):
  // return prisma.user.findUnique({ where: { id: userId } });
  
  // Example (Raw SQL):
  // const result = await db.query(
  //   'SELECT * FROM users WHERE id = $1',
  //   [userId]
  // );
  // return result.rows[0] || null;
  
  return null; // STUB
}
```

---

## Error Codes

Controllers use standardized error codes via ApiErrors:

| Code | HTTP | Description |
|------|------|-------------|
| INVALID_REQUEST | 400 | Missing or invalid parameters |
| UNAUTHORIZED | 401 | Missing or invalid authentication |
| FORBIDDEN | 403 | Authenticated but not authorized |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Business logic conflict |
| VALIDATION_ERROR | 422 | Field validation failed |
| RATE_LIMIT_EXCEEDED | 429 | Rate limit exceeded |
| INTERNAL_ERROR | 500 | Server error |

---

## Testing Controllers

Example test for auth controller:

```typescript
describe('Auth Controller', () => {
  describe('POST /v1/auth/signup', () => {
    it('should create user and workspace', async () => {
      const response = await request(app)
        .post('/v1/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          full_name: 'Test User',
          workspace_name: 'Test Workspace',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user_id).toBeDefined();
      expect(response.body.data.access_token).toBeDefined();
    });
  });
});
```

---

## Next Steps

1. **Database Schema**: Implement PostgreSQL schema based on SAMPLE_QUERIES.md
2. **Service Layer**: Create business logic layer to replace stub functions
3. **Database Queries**: Implement actual database queries using ORM (Prisma) or SQL
4. **Testing**: Write comprehensive unit and integration tests
5. **Integration**: Connect to external APIs (Stripe, Xero, QuickBooks, etc.)
6. **Deployment**: Deploy to production infrastructure

---

## References

- [API Specification](./api-spec.md)
- [Response Types](./response-types.ts)
- [Implementation Guide](./IMPLEMENTATION_GUIDE.md)
- [Architecture](./ARCHITECTURE.md)
- [Security Architecture](./SECURITY_ARCHITECTURE.md)
