# Ledgr REST API - Implementation Guide

## Quick Start

This guide covers implementing the Ledgr REST API using the provided specification and type definitions.

## Project Structure

```
backend/
├── api-spec.md                 # Complete OpenAPI specification
├── response-types.ts           # TypeScript types and interfaces
├── endpoints.ts                # Endpoint registry and definitions
├── server.ts                   # Express.js server setup
├── middleware/
│   ├── error-handler.ts        # Global error handling
│   ├── auth-middleware.ts      # JWT authentication & RBAC
│   └── rate-limiter.ts         # Rate limiting & request logging
├── controllers/
│   ├── auth.controller.ts      # Authentication endpoints
│   ├── workspaces.controller.ts # Workspace management
│   ├── financials.controller.ts # Financial data operations
│   ├── agents.controller.ts     # AI agent operations
│   ├── help.controller.ts       # Help centre operations
│   ├── billing.controller.ts    # Billing & subscription
│   ├── integrations.controller.ts # Third-party integrations
│   └── audit.controller.ts      # Compliance & audit trails
├── services/
│   ├── auth.service.ts         # Authentication business logic
│   ├── workspace.service.ts    # Workspace operations
│   ├── financial.service.ts    # Financial calculations
│   ├── agent.service.ts        # Agent orchestration
│   └── integration.service.ts  # Integration management
├── models/
│   ├── user.model.ts           # User data model
│   ├── workspace.model.ts      # Workspace data model
│   ├── transaction.model.ts    # Transaction data model
│   └── agent.model.ts          # Agent data model
├── database/
│   ├── config.ts               # Database configuration
│   ├── migrations/             # Schema migrations
│   └── seeds/                  # Sample data
├── utils/
│   ├── validators.ts           # Input validation
│   ├── formatters.ts           # Response formatting
│   ├── crypto.ts               # Encryption utilities
│   └── email.ts                # Email sending
└── tests/
    ├── unit/                   # Unit tests
    ├── integration/            # Integration tests
    └── fixtures/               # Test data
```

## Installation

### 1. Install Dependencies

```bash
npm install express cors helmet compression morgan jsonwebtoken bcryptjs
npm install -D @types/express @types/node typescript ts-node

# Optional: For production database support
npm install pg sequelize # PostgreSQL
# OR
npm install mongodb mongoose # MongoDB

# Optional: For Redis caching
npm install redis

# Optional: For email
npm install nodemailer

# Optional: For 2FA
npm install speakeasy qrcode
```

### 2. Environment Variables

Create `.env` file:

```env
# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ledgr
DB_POOL_SIZE=20

# Authentication
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-change-in-production
JWT_EXPIRATION=1h
JWT_REFRESH_EXPIRATION=7d

# CORS
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Integrations
QUICKBOOKS_CLIENT_ID=your-client-id
QUICKBOOKS_CLIENT_SECRET=your-client-secret
XERO_CLIENT_ID=your-client-id
XERO_CLIENT_SECRET=your-client-secret

# AI Integration
OPENAI_API_KEY=your-api-key
```

## Architecture Overview

### Request Flow

```
Request
  ↓
Request ID + Logging Middleware
  ↓
Rate Limiting
  ↓
Authentication (if required)
  ↓
Authorization (RBAC)
  ↓
Workspace Isolation
  ↓
Route Handler (Controller)
  ↓
Service Layer (Business Logic)
  ↓
Data Layer (Database)
  ↓
Response Formatting
  ↓
Response
```

### Response Format

All responses follow a consistent format:

```typescript
{
  "success": boolean,
  "data": T | null,
  "meta": {
    "timestamp": "2026-05-31T10:30:00Z",
    "request_id": "req_123...",
    "version": "v1"
  },
  "errors": ApiError[] | null
}
```

## Implementation Checklist

### Phase 1: Foundation (Week 1-2)

- [ ] Database schema setup (PostgreSQL or MongoDB)
- [ ] User authentication (signup, login, refresh)
- [ ] JWT token generation and validation
- [ ] Role-based access control (RBAC)
- [ ] Error handling middleware
- [ ] Rate limiting middleware
- [ ] Request logging
- [ ] Health check endpoint

### Phase 2: Core Features (Week 3-4)

- [ ] Workspace management
- [ ] User invitation and management
- [ ] Financial data import
- [ ] Transaction ledger
- [ ] Chart of accounts
- [ ] Basic dashboard
- [ ] Audit logging

### Phase 3: Advanced Features (Week 5-6)

- [ ] AI agent deployment and management
- [ ] Agent task assignment
- [ ] Help centre with AI responses
- [ ] Subscription and billing
- [ ] Third-party integrations (OAuth)
- [ ] Compliance calculations (VAT, taxes)

## Database Schema Example (PostgreSQL)

See `backend/DATABASE_AND_ROLES.md` for full schema.

### Key Tables

```sql
-- Organizations/Workspaces
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  industry VARCHAR(50),
  tax_id VARCHAR(20),
  vat_registration_number VARCHAR(20),
  fiscal_year_end VARCHAR(5),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  full_name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user',
  mfa_enabled BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Transactions
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  date DATE NOT NULL,
  description TEXT,
  account_from VARCHAR(20) NOT NULL,
  account_to VARCHAR(20) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  reference VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);

-- Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  type VARCHAR(50) NOT NULL,
  name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active',
  config JSONB,
  last_run TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);

-- Audit Log
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50),
  resource_type VARCHAR(50),
  resource_id VARCHAR(50),
  changes JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
```

## Implementing Controllers

Each controller should follow this pattern:

```typescript
import { Request, Response } from "express";
import { asyncHandler, ApiErrors } from "../middleware/error-handler";
import { ApiResponse } from "../response-types";

export const getEndpoint = asyncHandler(async (req: Request, res: Response) => {
  // Validation
  if (!req.body.required_field) {
    throw ApiErrors.invalidRequest("required_field is required");
  }

  // Authorization check
  if ((req as any).user.role !== "admin") {
    throw ApiErrors.forbidden("Admin access required");
  }

  // Business logic
  const data = await someService.getData((req as any).user.workspace_id);

  // Response
  const response: ApiResponse = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.json(response);
});
```

## Testing

### Unit Tests

```bash
npm test -- --testPathPattern=unit
```

### Integration Tests

```bash
npm test -- --testPathPattern=integration
```

### Example Test

```typescript
describe("Auth Controller", () => {
  it("should signup a new user", async () => {
    const response = await request(app)
      .post("/v1/auth/signup")
      .send({
        email: "test@example.com",
        password: "SecurePass123!",
        full_name: "Test User",
        workspace_name: "Test Workspace",
        country: "AE",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.access_token).toBeDefined();
  });
});
```

## Deployment

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

## Security Considerations

1. **Password Hashing**: Use bcrypt with cost 12
2. **JWT Expiration**: Keep access tokens short (1 hour)
3. **Refresh Tokens**: Store in HTTP-only cookies (7 days)
4. **Rate Limiting**: Implement per-user and per-IP limits
5. **CORS**: Restrict to known domains
6. **HTTPS**: Always use HTTPS in production
7. **Input Validation**: Validate all inputs
8. **SQL Injection**: Use parameterized queries
9. **XSS Protection**: Set appropriate headers
10. **Data Encryption**: Encrypt sensitive fields at rest

## Monitoring & Logging

### Key Metrics

- Request count and latency
- Authentication success/failure rate
- Error rate by endpoint
- Database query performance
- Cache hit rate
- Rate limit violations

### Logging

```typescript
import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL,
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});
```

## Performance Optimization

1. **Database Indexing**: Add indexes on frequently queried fields
2. **Caching**: Use Redis for frequently accessed data
3. **Pagination**: Implement cursor-based pagination
4. **Query Optimization**: Use projections to limit fields
5. **Connection Pooling**: Configure database connection pool
6. **Compression**: Enable gzip compression
7. **Load Balancing**: Use reverse proxy (nginx)

## Future Enhancements

1. **GraphQL API**: Parallel GraphQL endpoint
2. **WebSocket**: Real-time notifications
3. **Webhooks**: Event-driven integrations
4. **API Keys**: Programmatic access
5. **OAuth Providers**: Google, Apple, Microsoft login
6. **Bulk Operations**: Batch imports/exports
7. **Advanced Filtering**: Complex query syntax
8. **Caching Strategy**: Multi-layer caching

## Support & Resources

- API Documentation: `api-spec.md`
- Type Definitions: `response-types.ts`
- Example Controllers: `controllers/auth.controller.ts`
- Middleware Examples: `middleware/`

## Troubleshooting

### JWT Token Expiration

```typescript
// Issue: Token expired error
// Solution: Refresh token using /v1/auth/refresh endpoint
```

### Rate Limit Exceeded

```typescript
// Issue: 429 Too Many Requests
// Solution: Wait for X-RateLimit-Reset seconds before retrying
```

### Database Connection

```typescript
// Issue: Connection refused
// Solution: Check DATABASE_URL and ensure database is running
```

## Contributing

When adding new endpoints:

1. Add type definitions in `response-types.ts`
2. Add endpoint definition in `endpoints.ts`
3. Implement controller in `controllers/`
4. Add middleware if needed (auth, validation, etc.)
5. Add route in `server.ts`
6. Add unit and integration tests
7. Update `api-spec.md`
8. Document in this guide

