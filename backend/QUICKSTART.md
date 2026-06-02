# Ledgr Multi-Agent Platform - Quick Start Guide

Get the system running in 5 minutes.

## Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL 13+ running locally
- Redis 6+ (optional, for caching)

## 1. Install Dependencies (30 seconds)

```bash
cd /Users/test/Documents/Claude/Projects/Ledgr/backend
npm install
```

## 2. Configure Environment (1 minute)

Copy the environment template:
```bash
cp .env .env.local
```

Edit `.env.local`:
```env
# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:password@localhost:5432/ledgr
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=ledgr

# Server
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:5000

# JWT (keep default for dev)
JWT_SECRET=dev-secret-key-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# Anthropic (get key from https://console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

## 3. Create PostgreSQL Database (2 minutes)

```bash
# Create database
createdb -U postgres ledgr

# Run migrations (creates tables)
npm run migrate
```

## 4. Start Development Server (1 minute)

```bash
npm run dev
```

You should see:
```
╔═══════════════════════════════════════════════════════╗
║   Ledgr Multi-Agent Platform Backend                 ║
║   Environment: development                           ║
║   Port: 3001                                          ║
║   WebSocket: ws://localhost:3001/ws/agents           ║
║   Health: http://localhost:3001/health               ║
╚═══════════════════════════════════════════════════════╝
```

## 5. Test the API (3 minutes)

### Health Check
```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-06-02T12:00:00.000Z",
  "environment": "development",
  "uptime": 5.123
}
```

### Create Your First Agent
```bash
# First, generate a token (for dev use: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdfaWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJ1c2VyX2lkIjoiMTExMTExMTEtMTExMS0xMTExLTExMTEtMTExMTExMTExMTExIn0.fake-signature"

# Create agent
curl -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Alex Chen",
    "email": "alex@ledgr.local",
    "phone": "+971501234567",
    "role": "reconciliation",
    "specialization": ["bank_reconciliation", "journal_entries"],
    "max_concurrent_tasks": 5
  }'
```

### List All Agents
```bash
curl http://localhost:3001/api/agents \
  -H "Authorization: Bearer $TOKEN"
```

### Route a Task Intelligently
```bash
curl -X POST http://localhost:3001/api/agents/route-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "entity_type": "invoice",
    "entity_id": "INV-001",
    "required_specialization": "bank_reconciliation",
    "priority": 3,
    "description": "Reconcile vendor invoice with bank statement"
  }'
```

## Verify Installation

```bash
# Check backend is running
curl -s http://localhost:3001/health | jq

# Check database connection
npm run typecheck

# Run tests
npm test
```

## Next Steps

1. **Connect Frontend Dashboard**: Open `/agents-enhanced.html` in browser
   - Should show real-time agent status
   - Will connect to WebSocket at ws://localhost:3001/ws/agents

2. **Explore API Documentation**: See `BACKEND_SETUP.md` for all endpoints

3. **Load Sample Data**: 
   ```bash
   npm run seed
   ```

4. **Monitor Performance**:
   ```bash
   # Get team performance metrics
   curl http://localhost:3001/api/agents/performance/team \
     -H "Authorization: Bearer $TOKEN"
   ```

## Troubleshooting

### "Database connection failed"
```bash
# Check PostgreSQL is running
psql -U postgres

# Create database if missing
createdb -U postgres ledgr

# Re-run migrations
npm run migrate
```

### "Cannot find module"
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### "WebSocket connection refused"
- Ensure backend is running on port 3001
- Check frontend is connecting to ws://localhost:3001/ws/agents
- Verify CORS_ORIGIN matches frontend origin in .env

### "JWT token invalid"
- Generate valid token with org_id: `00000000-0000-0000-0000-000000000000`
- Token format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{payload}.{signature}`
- Default JWT_SECRET in .env is `dev-secret-key-change-in-production`

## Key Files

- **Backend Server**: `/backend/src/server.ts`
- **API Routes**: `/backend/src/routes/agents.ts`
- **Business Logic**: `/backend/src/services/agentService.ts`
- **WebSocket**: `/backend/src/websocket/agentStatusBroadcaster.ts`
- **Frontend Dashboard**: `/agents-enhanced.html`
- **Database Schema**: `/backend/migrations/007_agents_system.sql`
- **Documentation**: `/backend/BACKEND_SETUP.md`

## Common Commands

```bash
# Development
npm run dev              # Start dev server with auto-reload
npm run typecheck       # Check TypeScript types
npm run lint            # Run ESLint

# Production
npm run build           # Compile TypeScript
npm start               # Start production server

# Database
npm run migrate         # Run SQL migrations
npm run seed            # Populate sample data

# Testing
npm test                # Run all tests
npm run test:coverage   # Run tests with coverage report
```

## Architecture Overview

```
HTTP Requests
     ↓
[Express Router]
     ↓
[Auth Middleware] ← JWT Token
     ↓
[Route Handler] ← Validation
     ↓
[Service Layer] → Business Logic
     ↓
[Database] ← PostgreSQL
[Cache] ← Redis (optional)

WebSocket
     ↓
[WebSocket Server]
     ↓
[Agent Status Broadcaster]
     ↓
[Real-time Updates to Clients]
```

## What's Next?

Phase 1 is complete! Ready for:

1. **Phase 2**: Integrate QuickBooks, Xero, Plaid, Stripe APIs
2. **Phase 3**: Build accounting engine (GL, AP, AR, Reconciliation)
3. **Phase 4**: Add tax compliance and audit trails
4. **Phase 5**: Financial reporting (P&L, Balance Sheet, Cash Flow)

---

**Questions?** See `BACKEND_SETUP.md` for comprehensive documentation.
