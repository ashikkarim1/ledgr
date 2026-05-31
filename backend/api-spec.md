# Ledgr REST API Specification v1.0

## Overview

Ledgr is a RESTful API for autonomous accounting operations. The API provides endpoints for:
- User authentication and workspace management
- Financial data ingestion and ledger management
- AI agent orchestration and configuration
- Help center and support workflows
- Billing and subscription management
- Third-party integrations (QuickBooks, Xero, etc.)
- Compliance and audit trails

**API Base URL**: `https://api.ledgr.io/v1`  
**Current Version**: `v1`  
**Authentication**: JWT (Bearer token)

---

## 1. Standard Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": {
    // Response body - varies by endpoint
  },
  "meta": {
    "timestamp": "2026-05-31T10:30:00Z",
    "request_id": "req_abc123def456",
    "version": "v1"
  },
  "errors": null
}
```

### Error Response Format

```json
{
  "success": false,
  "data": null,
  "meta": {
    "timestamp": "2026-05-31T10:30:00Z",
    "request_id": "req_abc123def456",
    "version": "v1"
  },
  "errors": [
    {
      "code": "INVALID_REQUEST",
      "message": "Email is required",
      "field": "email",
      "status": 400
    }
  ]
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request succeeded |
| 201 | Created - Resource successfully created |
| 204 | No Content - Success with no response body |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid authentication |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation failed |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## 2. Authentication Endpoints

### POST /auth/signup

Register a new user/workspace.

**Request**:
```json
{
  "email": "founder@company.ae",
  "password": "SecurePass123!",
  "full_name": "Ahmed Mohammed",
  "workspace_name": "Al Noor Trading LLC",
  "country": "AE"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "user_id": "usr_123abc",
    "workspace_id": "ws_456def",
    "email": "founder@company.ae",
    "full_name": "Ahmed Mohammed",
    "access_token": "eyJhbGc...",
    "refresh_token": "ref_...",
    "token_expires_in": 3600
  }
}
```

**Validation Rules**:
- Email: valid format, unique across platform
- Password: min 12 chars, uppercase, number, special char
- Full name: 2-100 chars
- Workspace name: 3-100 chars

---

### POST /auth/login

Authenticate user and issue JWT.

**Request**:
```json
{
  "email": "founder@company.ae",
  "password": "SecurePass123!"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "user_id": "usr_123abc",
    "workspace_id": "ws_456def",
    "access_token": "eyJhbGc...",
    "refresh_token": "ref_...",
    "token_expires_in": 3600,
    "role": "admin"
  }
}
```

---

### POST /auth/refresh

Refresh expired access token using refresh token.

**Request**:
```json
{
  "refresh_token": "ref_..."
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGc...",
    "refresh_token": "ref_...",
    "token_expires_in": 3600
  }
}
```

---

### POST /auth/logout

Invalidate current session and refresh token.

**Headers**: `Authorization: Bearer {access_token}`

**Response (204)**: No content

---

### POST /auth/2fa/setup

Enable two-factor authentication.

**Request**:
```json
{
  "method": "authenticator" // or "sms"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "qr_code_url": "otpauth://totp/...",
    "backup_codes": ["XXXX-XXXX", ...],
    "secret": "JBSWY3DPEBLW64TMMQ======"
  }
}
```

---

## 3. Workspace Endpoints

### POST /workspaces

Create a new workspace.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "name": "Al Noor Trading LLC",
  "industry": "retail",
  "vat_registration_number": "100123456789012",
  "tax_id": "123456789",
  "fiscal_year_end": "12-31"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "workspace_id": "ws_456def",
    "name": "Al Noor Trading LLC",
    "industry": "retail",
    "created_at": "2026-05-31T10:30:00Z",
    "created_by": "usr_123abc"
  }
}
```

---

### GET /workspaces

List all workspaces for authenticated user.

**Headers**: `Authorization: Bearer {access_token}`

**Query Params**:
- `limit` (default: 50, max: 500)
- `offset` (default: 0)

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "workspace_id": "ws_456def",
      "name": "Al Noor Trading LLC",
      "industry": "retail",
      "members_count": 3,
      "created_at": "2026-05-31T10:30:00Z"
    }
  ],
  "meta": {
    "timestamp": "2026-05-31T10:30:00Z",
    "request_id": "req_...",
    "pagination": {
      "total": 1,
      "limit": 50,
      "offset": 0
    }
  }
}
```

---

### GET /workspaces/:workspace_id

Get workspace details.

**Headers**: `Authorization: Bearer {access_token}`

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "workspace_id": "ws_456def",
    "name": "Al Noor Trading LLC",
    "industry": "retail",
    "vat_registration_number": "100123456789012",
    "tax_id": "123456789",
    "fiscal_year_end": "12-31",
    "members": [
      {
        "user_id": "usr_123abc",
        "email": "founder@company.ae",
        "full_name": "Ahmed Mohammed",
        "role": "admin",
        "joined_at": "2026-05-31T10:30:00Z"
      }
    ],
    "created_at": "2026-05-31T10:30:00Z"
  }
}
```

---

### PUT /workspaces/:workspace_id

Update workspace settings.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "name": "Al Noor Trading LLC (Updated)",
  "industry": "retail",
  "fiscal_year_end": "03-31"
}
```

**Response (200)**: Updated workspace object

---

### POST /workspaces/:workspace_id/invite

Invite team member to workspace.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "email": "accountant@company.ae",
  "role": "accountant" // admin, accountant, viewer
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "invitation_id": "inv_789ghi",
    "email": "accountant@company.ae",
    "role": "accountant",
    "status": "pending",
    "expires_at": "2026-06-30T10:30:00Z"
  }
}
```

---

### DELETE /workspaces/:workspace_id/members/:user_id

Remove member from workspace.

**Headers**: `Authorization: Bearer {access_token}`

**Response (204)**: No content

---

## 4. Financial Data Endpoints

### POST /financials/import

Upload and import financial data (bank statements, invoices, receipts).

**Headers**: 
- `Authorization: Bearer {access_token}`
- `Content-Type: multipart/form-data`

**Request**:
```
file: <binary file> (PDF, CSV, XLSX)
type: bank_statement | invoice | receipt
date_from: 2026-01-01
date_to: 2026-12-31
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "import_id": "imp_101112",
    "file_name": "bank_statement_jan_2026.pdf",
    "type": "bank_statement",
    "status": "processing",
    "created_at": "2026-05-31T10:30:00Z",
    "processing_percentage": 0
  }
}
```

---

### GET /financials/dashboard

Get financial summary dashboard.

**Headers**: `Authorization: Bearer {access_token}`

**Query Params**:
- `workspace_id`: Required
- `period`: month | quarter | year (default: month)
- `date`: YYYY-MM (default: current month)

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "period": "2026-05",
    "summary": {
      "total_revenue": 500000,
      "total_expenses": 250000,
      "net_profit": 250000,
      "vat_liability": 30000,
      "currency": "AED"
    },
    "accounts": {
      "assets": 1000000,
      "liabilities": 200000,
      "equity": 800000
    },
    "transactions_count": 147,
    "last_reconciled": "2026-05-30T15:45:00Z"
  }
}
```

---

### GET /financials/accounts

Get chart of accounts.

**Headers**: `Authorization: Bearer {access_token}`

**Query Params**:
- `workspace_id`: Required
- `type`: asset | liability | equity | revenue | expense (optional)

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "account_id": "acc_001",
      "code": "1000",
      "name": "Cash",
      "type": "asset",
      "balance": 100000,
      "currency": "AED",
      "is_active": true
    }
  ]
}
```

---

### GET /financials/transactions

Get transaction ledger with filtering and sorting.

**Headers**: `Authorization: Bearer {access_token}`

**Query Params**:
- `workspace_id`: Required
- `limit`: 50 (max: 500)
- `cursor`: For pagination
- `filter[account_id]`: Filter by account
- `filter[date_from]`: Start date
- `filter[date_to]`: End date
- `filter[status]`: draft | posted | reconciled
- `sort`: -date | date | -amount | amount (default: -date)

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "transaction_id": "txn_001",
      "date": "2026-05-31",
      "description": "Invoice INV-001 - Sales",
      "account_from": "acc_001",
      "account_to": "acc_100",
      "amount": 10000,
      "currency": "AED",
      "status": "posted",
      "reference": "INV-001",
      "tags": ["sales", "invoice"],
      "created_at": "2026-05-31T10:30:00Z"
    }
  ],
  "meta": {
    "cursor": "txn_123",
    "has_more": true
  }
}
```

---

### POST /financials/reconcile

Mark transactions as reconciled.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "workspace_id": "ws_456def",
  "transaction_ids": ["txn_001", "txn_002"],
  "reconciled_date": "2026-05-31",
  "notes": "Reconciled with bank statement"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "reconciled_count": 2,
    "reconciled_at": "2026-05-31T10:30:00Z"
  }
}
```

---

## 5. Agent Endpoints

### POST /agents

Deploy an AI agent to workspace.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "workspace_id": "ws_456def",
  "type": "vat_compliance | transaction_categorization | invoice_extraction",
  "name": "VAT Compliance Agent",
  "config": {
    "enabled": true,
    "frequency": "daily",
    "threshold": 10000
  }
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "agent_id": "ag_131415",
    "type": "vat_compliance",
    "name": "VAT Compliance Agent",
    "status": "active",
    "created_at": "2026-05-31T10:30:00Z",
    "last_run": null
  }
}
```

---

### GET /agents

List all agents for workspace.

**Headers**: `Authorization: Bearer {access_token}`

**Query Params**:
- `workspace_id`: Required
- `status`: active | inactive | error (optional)

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "agent_id": "ag_131415",
      "type": "vat_compliance",
      "name": "VAT Compliance Agent",
      "status": "active",
      "enabled": true,
      "last_run": "2026-05-30T15:45:00Z",
      "last_error": null,
      "created_at": "2026-05-31T10:30:00Z"
    }
  ]
}
```

---

### PUT /agents/:agent_id/config

Update agent configuration.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "enabled": false,
  "frequency": "weekly",
  "threshold": 50000
}
```

**Response (200)**: Updated agent object

---

### GET /agents/:agent_id/activity

Get agent execution logs and performance metrics.

**Headers**: `Authorization: Bearer {access_token}`

**Query Params**:
- `limit`: 50
- `offset`: 0
- `filter[status]`: success | failed | pending

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "execution_id": "exec_161718",
      "agent_id": "ag_131415",
      "status": "success",
      "started_at": "2026-05-30T15:00:00Z",
      "completed_at": "2026-05-30T15:05:30Z",
      "duration_ms": 330000,
      "items_processed": 47,
      "errors": [],
      "result_summary": {
        "vat_calculated": true,
        "amount": 30000
      }
    }
  ]
}
```

---

### POST /agents/:agent_id/task

Assign a specific task to an agent.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "task_type": "categorize_transactions",
  "parameters": {
    "date_from": "2026-05-01",
    "date_to": "2026-05-31",
    "account_id": "acc_001"
  },
  "priority": "high"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "task_id": "tsk_192021",
    "agent_id": "ag_131415",
    "status": "queued",
    "created_at": "2026-05-31T10:30:00Z"
  }
}
```

---

## 6. Help Centre Endpoints

### POST /help/messages

Send a message to help centre (human + AI review).

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "subject": "VAT filing deadline",
  "message": "What's the next deadline for VAT filing?",
  "category": "compliance | features | account | other"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "message_id": "msg_222324",
    "status": "received",
    "ai_response": "VAT filing deadlines in UAE are monthly on the 5th...",
    "needs_human_review": false,
    "created_at": "2026-05-31T10:30:00Z"
  }
}
```

---

### GET /help/messages

Get help chat history.

**Headers**: `Authorization: Bearer {access_token}`

**Query Params**:
- `limit`: 50
- `offset`: 0
- `status`: open | resolved | escalated

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "message_id": "msg_222324",
      "subject": "VAT filing deadline",
      "status": "resolved",
      "user_message": "What's the next deadline?",
      "ai_response": "VAT filing deadlines...",
      "human_review": false,
      "created_at": "2026-05-31T10:30:00Z",
      "resolved_at": "2026-05-31T11:00:00Z"
    }
  ]
}
```

---

### POST /help/escalate

Escalate message to human support.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "message_id": "msg_222324",
  "reason": "AI response insufficient"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "message_id": "msg_222324",
    "status": "escalated",
    "escalated_at": "2026-05-31T10:30:00Z",
    "support_agent_assigned": false
  }
}
```

---

### GET /help/articles

Search knowledge base.

**Query Params**:
- `q`: Search query
- `category`: compliance | features | setup | troubleshooting
- `limit`: 20

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "article_id": "art_252627",
      "title": "VAT Filing Guide for UAE Businesses",
      "category": "compliance",
      "excerpt": "Complete guide to filing VAT...",
      "url": "/help/vat-filing-guide",
      "updated_at": "2026-05-20T10:30:00Z"
    }
  ]
}
```

---

### POST /help/feedback

Rate help response.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "message_id": "msg_222324",
  "rating": 5,
  "comment": "Very helpful response!"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "feedback_id": "fbk_282930",
    "created_at": "2026-05-31T10:30:00Z"
  }
}
```

---

## 7. Billing Endpoints

### GET /billing/subscription

Get current subscription plan.

**Headers**: `Authorization: Bearer {access_token}`

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "subscription_id": "sub_313233",
    "workspace_id": "ws_456def",
    "plan": "professional",
    "status": "active",
    "current_period_start": "2026-05-01T00:00:00Z",
    "current_period_end": "2026-06-01T00:00:00Z",
    "amount": 2500,
    "currency": "AED",
    "billing_cycle": "monthly",
    "next_billing_date": "2026-06-01T00:00:00Z",
    "auto_renew": true
  }
}
```

---

### POST /billing/upgrade

Upgrade subscription plan.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "plan": "enterprise",
  "billing_cycle": "annual"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "subscription_id": "sub_313233",
    "plan": "enterprise",
    "status": "active",
    "amount": 30000,
    "billing_cycle": "annual",
    "effective_date": "2026-06-01T00:00:00Z"
  }
}
```

---

### GET /billing/invoices

Get invoice history.

**Headers**: `Authorization: Bearer {access_token}`

**Query Params**:
- `limit`: 50
- `offset`: 0
- `status`: paid | unpaid | overdue

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "invoice_id": "inv_343536",
      "subscription_id": "sub_313233",
      "amount": 2500,
      "currency": "AED",
      "status": "paid",
      "issued_date": "2026-05-01T00:00:00Z",
      "due_date": "2026-05-15T00:00:00Z",
      "paid_date": "2026-05-10T00:00:00Z",
      "pdf_url": "/invoices/inv_343536.pdf"
    }
  ]
}
```

---

### GET /billing/usage

Get current usage statistics.

**Headers**: `Authorization: Bearer {access_token}`

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "period": "2026-05",
    "workspace_id": "ws_456def",
    "plan": "professional",
    "usage": {
      "transactions_processed": 1000,
      "transactions_limit": 10000,
      "ai_agents_deployed": 3,
      "ai_agents_limit": 5,
      "team_members": 2,
      "team_members_limit": 5,
      "storage_gb": 2.5,
      "storage_limit_gb": 50
    },
    "resets_at": "2026-06-01T00:00:00Z"
  }
}
```

---

## 8. Integration Endpoints

### POST /integrations/connect

Initiate OAuth flow for third-party integration.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "provider": "quickbooks | xero | stripe | plaid",
  "workspace_id": "ws_456def",
  "redirect_uri": "https://app.ledgr.io/settings/integrations/callback"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "authorization_url": "https://quickbooks.oauth.provider.com/authorize?...",
    "state": "state_373839",
    "provider": "quickbooks",
    "expires_in": 600
  }
}
```

---

### GET /integrations/status

Get status of all connected integrations.

**Headers**: `Authorization: Bearer {access_token}`

**Query Params**:
- `workspace_id`: Required

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "integration_id": "int_404142",
      "provider": "quickbooks",
      "status": "connected",
      "connected_at": "2026-05-20T10:30:00Z",
      "last_sync": "2026-05-31T08:15:00Z",
      "next_sync": "2026-05-31T16:15:00Z",
      "account_name": "Al Noor Trading LLC"
    }
  ]
}
```

---

### POST /integrations/sync

Trigger manual sync with integrated system.

**Headers**: `Authorization: Bearer {access_token}`

**Request**:
```json
{
  "integration_id": "int_404142",
  "sync_type": "full | incremental"
}
```

**Response (202)**: Accepted (async operation)
```json
{
  "success": true,
  "data": {
    "sync_id": "sync_434445",
    "status": "queued",
    "created_at": "2026-05-31T10:30:00Z"
  }
}
```

---

## 9. Compliance & Audit Endpoints

### GET /audit/logs

Get audit trail of all user actions.

**Headers**: `Authorization: Bearer {access_token}` (admin only)

**Query Params**:
- `workspace_id`: Required
- `filter[user_id]`: Filter by user
- `filter[action]`: login | create | update | delete | export
- `filter[date_from]`: Start date
- `filter[date_to]`: End date
- `limit`: 100
- `offset`: 0

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "audit_id": "aud_464748",
      "user_id": "usr_123abc",
      "action": "update",
      "resource_type": "transaction",
      "resource_id": "txn_001",
      "changes": {
        "amount": {"from": 10000, "to": 10500},
        "status": {"from": "draft", "to": "posted"}
      },
      "timestamp": "2026-05-31T10:30:00Z",
      "ip_address": "192.168.1.1"
    }
  ]
}
```

---

## 10. Health & Status Endpoints

### GET /health

System health check (no authentication required).

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "timestamp": "2026-05-31T10:30:00Z",
    "services": {
      "api": "operational",
      "database": "operational",
      "cache": "operational",
      "ai_engine": "operational"
    }
  }
}
```

---

## 11. Rate Limiting & Quotas

All authenticated endpoints are subject to rate limits:

| Plan | Requests/Min | Requests/Hour | Requests/Day |
|------|--------------|---------------|--------------|
| Free | 10 | 300 | 5,000 |
| Professional | 60 | 2,000 | 50,000 |
| Enterprise | 300 | 10,000 | 500,000 |

**Rate Limit Headers**:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1685968200
```

When limit is exceeded: **429 Too Many Requests**

---

## 12. Pagination

### Offset-based (transactions)
```
GET /financials/transactions?limit=50&offset=100
```

Response includes:
```json
"meta": {
  "pagination": {
    "total": 1000,
    "limit": 50,
    "offset": 100,
    "next_offset": 150,
    "has_more": true
  }
}
```

### Cursor-based (for performance)
```
GET /financials/transactions?limit=50&cursor=txn_abc123
```

Response includes:
```json
"meta": {
  "cursor": "txn_def456",
  "has_more": true
}
```

---

## 13. Filtering & Sorting

### Filtering
```
GET /financials/transactions?filter[status]=posted&filter[date_from]=2026-05-01&filter[account_id]=acc_001
```

### Sorting
```
GET /financials/transactions?sort=-date,amount
```

Prefix with `-` for descending order.

---

## 14. Authentication Headers

All authenticated endpoints require:
```
Authorization: Bearer <access_token>
X-Workspace-ID: ws_456def (recommended for multi-workspace)
```

---

## 15. Error Codes

| Code | Status | Description |
|------|--------|-------------|
| INVALID_REQUEST | 400 | Missing or invalid fields |
| UNAUTHORIZED | 401 | Missing or invalid authentication |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource doesn't exist |
| CONFLICT | 409 | Resource already exists |
| VALIDATION_ERROR | 422 | Field validation failed |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

---

## 16. Versioning Strategy

- Current: `/v1/`
- Future: `/v2/`, `/v3/` (major breaking changes)
- Deprecated endpoints will have 12-month sunset window
- Clients must specify `Accept: application/vnd.ledgr.v1+json`

---

## 17. Future Considerations (GraphQL)

Future `/graphql` endpoint planned for:
- Complex nested queries
- Reduced over-fetching
- Real-time subscriptions via WebSockets

Currently designed to be GraphQL-compatible with:
- Standardized field naming
- Consistent type patterns
- Mutation/query separation
