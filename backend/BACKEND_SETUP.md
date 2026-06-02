# Ledgr Backend - Multi-Agent Management System

## Overview

This is the Express.js backend for the Ledgr Enterprise Accounting Platform Phase 1: Multi-Agent Management System. It provides:

- **REST API** for agent CRUD operations, task assignment, and performance tracking
- **WebSocket server** for real-time agent status updates and team metrics
- **Intelligent task routing** based on specialization and availability
- **Multi-tenancy support** with org_id isolation
- **JWT authentication** with token-based authorization
- **PostgreSQL database** for persistent storage
- **Redis caching** for performance optimization

## Architecture

```
src/
├── routes/
│   └── agents.ts                 # REST API endpoints
├── services/
│   └── agentService.ts           # Business logic layer
├── websocket/
│   └── agentStatusBroadcaster.ts # Real-time WebSocket broadcaster
├── middleware/
│   └── auth.ts                   # JWT authentication
├── validation/
│   └── agent-validation.ts       # Input validation
├── db/
│   └── index.ts                  # Database connection pooling
├── cache/
│   └── redis.ts                  # Redis caching client
├── server.ts                     # Express app setup
└── index.ts                      # Entry point
```

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **PostgreSQL** >= 13
- **Redis** >= 6.0 (optional, for caching)

## Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run migrate

# Seed demo data (optional)
npm run seed

# Build TypeScript
npm run build

# Start development server
npm run dev

# Start production server
npm start
```

## Environment Variables

Create a `.env` file in the backend directory:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ledgr
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=ledgr

# Server
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5000

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Stripe (optional)
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_PUBLISHABLE_KEY=pk_test_placeholder

# AWS (optional)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Anthropic
ANTHROPIC_API_KEY=sk-ant-placeholder
```

## API Endpoints

### Agents

#### Create Agent
```
POST /api/agents
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+971501234567",
  "role": "reconciliation",
  "specialization": ["bank_reconciliation", "journal_entries"],
  "max_concurrent_tasks": 5
}
```

#### List Agents
```
GET /api/agents?role=reconciliation&status=online&includePerformance=true
Authorization: Bearer <token>
```

#### Get Agent Detail
```
GET /api/agents/:id
Authorization: Bearer <token>
```

#### Update Agent Status
```
PATCH /api/agents/:id/status
Content-Type: application/json
Authorization: Bearer <token>

{
  "status": "busy",
  "availability_note": "In a meeting"
}
```

#### Create Task Assignment
```
POST /api/agents/:id/assignments
Content-Type: application/json
Authorization: Bearer <token>

{
  "entity_type": "invoice",
  "entity_id": "12345",
  "priority": 3,
  "description": "Process vendor invoice"
}
```

#### Update Assignment Status
```
PATCH /api/agents/assignments/:assignmentId
Content-Type: application/json
Authorization: Bearer <token>

{
  "status": "completed"
}
```

#### Route Task Intelligently
```
POST /api/agents/route-task
Content-Type: application/json
Authorization: Bearer <token>

{
  "entity_type": "invoice",
  "entity_id": "12345",
  "required_specialization": "invoice_processing",
  "priority": 3,
  "description": "Process vendor invoice for approval"
}
```

#### Get Agent Performance
```
GET /api/agents/:id/performance
Authorization: Bearer <token>
```

#### Get Team Performance
```
GET /api/agents/performance/team
Authorization: Bearer <token>
```

## WebSocket Connection

Connect to the WebSocket endpoint for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws/agents?org_id=<org_id>&user_id=<user_id>');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'agent_status_update') {
    console.log('Agent status updated:', message.agent);
  } else if (message.type === 'team_performance_update') {
    console.log('Team metrics updated:', message.metrics);
  }
};
```

## Database Migrations

The database schema is defined in `migrations/007_agents_system.sql`:

- **agents** - Agent profiles with status and performance metrics
- **agent_assignments** - Task assignments and tracking
- **agent_performance_metrics** - Historical performance data

Run migrations:
```bash
npm run migrate
```

## Testing

Run tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

## Development

Watch mode with auto-reload:
```bash
npm run dev
```

Type checking:
```bash
npm run typecheck
```

Linting:
```bash
npm run lint
```

## Production Deployment

1. Update `NODE_ENV=production` in `.env`
2. Build the project: `npm run build`
3. Start with: `npm start`
4. Use a process manager like PM2:
   ```bash
   pm2 start dist/index.js --name "ledgr-api"
   ```

## Multi-Tenancy

All API endpoints expect `org_id` to be extracted from JWT token. The token is validated via `authenticateToken` middleware which sets:

- `req.org_id` - Organization ID
- `req.user` - Authenticated user info

All database queries are filtered by `org_id` to ensure data isolation.

## Intelligent Task Routing

The `routeTaskIntelligently` method in `agentService.ts` uses a scoring algorithm:

```
Score = (performance_score × 0.6) + ((100 - utilization_percent) × 0.4)
```

This balances:
- **Performance** (60%) - Higher quality agents prioritized
- **Availability** (40%) - Less busy agents prioritized

Agents are filtered by:
1. Required specialization (if specified)
2. Current status (not offline)
3. Capacity (active tasks < max concurrent)

## Monitoring

Check server health:
```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-06-02T12:00:00.000Z",
  "environment": "development",
  "uptime": 3600.5
}
```

## Troubleshooting

### Database Connection Failed
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Verify database exists: `createdb ledgr`

### Redis Connection Failed
- Ensure Redis is running: `redis-server`
- Check `REDIS_HOST` and `REDIS_PORT` in `.env`

### WebSocket Connection Refused
- Ensure server is running on correct port
- Check `CORS_ORIGIN` is configured correctly
- Verify frontend and backend are on same or allowed origins

### JWT Token Errors
- Generate new token with correct `JWT_SECRET`
- Ensure `Authorization: Bearer <token>` header is set
- Check token expiration (24 hours)

## Security Considerations

- **JWT Secret**: Change `JWT_SECRET` in production
- **CORS**: Configure `CORS_ORIGIN` for production domain
- **Database Password**: Use strong password in production
- **Rate Limiting**: Consider adding rate limiting middleware
- **HTTPS**: Use HTTPS in production
- **Database Encryption**: Enable SSL connections to PostgreSQL

## License

ISC
