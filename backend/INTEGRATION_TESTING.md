# Integration Layer Testing Guide

## Overview

This guide covers testing the OAuth 2.0 integrations (QuickBooks, Xero, FreshBooks) and Plaid banking integration within the Ledgr backend.

## Prerequisites

### Environment Setup

```bash
# Required environment variables for testing
export DATABASE_URL="postgresql://user:password@localhost:5432/ledgr_test"
export JWT_SIGNING_KEY="your-private-key-path"
export JWT_PUBLIC_KEY="your-public-key-path"
export ENCRYPTION_KEY="$(openssl rand -hex 32)"

# OAuth Credentials (get from respective developer portals)
export QUICKBOOKS_CLIENT_ID="your-qb-client-id"
export QUICKBOOKS_CLIENT_SECRET="your-qb-secret"
export QUICKBOOKS_REDIRECT_URI="http://localhost:3000/v1/integrations/callback"

export XERO_CLIENT_ID="your-xero-client-id"
export XERO_CLIENT_SECRET="your-xero-secret"
export XERO_REDIRECT_URI="http://localhost:3000/v1/integrations/callback"

export FRESHBOOKS_CLIENT_ID="your-fb-client-id"
export FRESHBOOKS_CLIENT_SECRET="your-fb-secret"
export FRESHBOOKS_REDIRECT_URI="http://localhost:3000/v1/integrations/callback"

export PLAID_CLIENT_ID="your-plaid-client-id"
export PLAID_SECRET="your-plaid-secret"
export PLAID_ENV="sandbox" # or "development" or "production"
export PLAID_WEBHOOK_SECRET="your-plaid-webhook-secret"
```

### Database Setup

```bash
# Create test database
createdb ledgr_test

# Run migrations
psql ledgr_test < backend/schemas/core-schema.sql
psql ledgr_test < backend/migrations/001_organizations.sql
psql ledgr_test < backend/migrations/002_onboarding_schema.sql
psql ledgr_test < backend/migrations/003_integration_tables.sql
```

## Testing OAuth Flow

### 1. QuickBooks Integration Test

```bash
# Start test server
npm run dev

# In another terminal, test OAuth flow
# Step 1: Get authorization URL
curl -X POST http://localhost:3000/v1/integrations/connect/quickbooks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-test-token" \
  -d '{
    "baseCurrency": "AED",
    "timezone": "Asia/Dubai"
  }'

# Expected response:
# {
#   "authUrl": "https://appcenter.intuit.com/connect/oauth2?...",
#   "integrationId": "int_xxx",
#   "expiresIn": 600,
#   "type": "quickbooks"
# }

# Step 2: Visit authUrl in browser and authorize
# Step 3: Callback will redirect to /v1/integrations/callback?code=xxx&state=yyy

# Step 4: Test connection
curl http://localhost:3000/v1/integrations/int_xxx/status \
  -H "Authorization: Bearer your-test-token"

# Expected response shows connection status and sync settings
```

### 2. Test Token Encryption/Decryption

```typescript
// In test file
import { TokenEncryption } from '../lib/integration-persistence';

const encryption = new TokenEncryption();
const token = 'my-super-secret-access-token-12345';

const { encrypted, iv, authTag } = encryption.encrypt(token);
console.log('Encrypted:', encrypted.toString('hex'));
console.log('IV:', iv.toString('hex'));
console.log('Auth Tag:', authTag.toString('hex'));

const decrypted = encryption.decrypt(encrypted, iv, authTag);
console.log('Decrypted:', decrypted);
assert.equal(decrypted, token, 'Token should decrypt correctly');
```

### 3. Test Sync Job Persistence

```bash
# Trigger a manual sync
curl -X POST http://localhost:3000/v1/integrations/int_xxx/sync \
  -H "Authorization: Bearer your-test-token" \
  -d '{"initiator": "user"}'

# Expected response:
# {
#   "jobId": "job_xxx",
#   "integrationId": "int_xxx",
#   "status": "pending",
#   "initiatedAt": "2026-05-31T10:00:00Z",
#   "message": "Sync job created and queued"
# }

# Check sync job status
curl http://localhost:3000/v1/integrations/int_xxx/sync/job_xxx \
  -H "Authorization: Bearer your-test-token"

# Expected response shows:
# - status: pending, running, completed, partial, or failed
# - metrics: accounts/invoices/bills/transactions synced
# - errors: array of sync errors
# - startedAt, completedAt timestamps
```

## Testing Webhook Integration

### Plaid Webhook Test

```bash
# Using ngrok to expose local server to internet
ngrok http 3000

# Update PLAID_WEBHOOK_URL in Plaid dashboard to:
# https://your-ngrok-url.ngrok.io/v1/webhooks/plaid

# Simulate Plaid webhook using cURL
WEBHOOK_SECRET="your-plaid-webhook-secret"
TIMESTAMP=$(date +%s)
BODY='{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE","item_id":"item_xxx"}'
SIGNATURE=$(echo -n "${TIMESTAMP}${BODY}" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')

curl -X POST http://localhost:3000/v1/webhooks/plaid \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: $SIGNATURE" \
  -H "x-webhook-timestamp: $TIMESTAMP" \
  -d "$BODY"

# Expected response: { "success": true }
```

## Database Verification Queries

```sql
-- Check stored OAuth tokens (encrypted)
SELECT 
  id, 
  integration_id, 
  token_type,
  expires_at,
  created_at
FROM oauth_tokens 
WHERE organization_id = '...'
LIMIT 5;

-- Check sync jobs
SELECT 
  id, 
  integration_id,
  job_type, 
  status,
  accounts_synced,
  invoices_synced,
  started_at,
  completed_at
FROM sync_jobs
WHERE organization_id = '...'
ORDER BY created_at DESC
LIMIT 10;

-- Check sync errors
SELECT 
  error_code,
  error_message,
  entity_type,
  entity_id,
  created_at
FROM sync_errors
WHERE sync_job_id = '...'
ORDER BY created_at DESC;

-- Check webhook events
SELECT 
  event_type,
  processed,
  created_at
FROM webhook_events
WHERE integration_id = '...'
ORDER BY created_at DESC
LIMIT 10;

-- Check integration audit log
SELECT 
  action,
  performed_by,
  description,
  created_at
FROM integration_audit_log
WHERE integration_id = '...'
ORDER BY created_at DESC;
```

## Test Cases

### Unit Tests

```typescript
// tests/integration-factory.test.ts
describe('IntegrationManager', () => {
  it('should create QuickBooks integration', async () => {
    const manager = new IntegrationManager();
    const integration = manager.createIntegration('quickbooks', 'org_xxx');
    expect(integration).toBeDefined();
    expect(integration.type).toBe('quickbooks');
  });

  it('should list integrations by org', async () => {
    const manager = new IntegrationManager();
    manager.createIntegration('quickbooks', 'org_xxx');
    manager.createIntegration('xero', 'org_xxx');
    const integrations = manager.listIntegrations('org_xxx');
    expect(integrations).toHaveLength(2);
  });

  it('should delete integration', async () => {
    const manager = new IntegrationManager();
    const integration = manager.createIntegration('quickbooks', 'org_xxx');
    manager.deleteIntegration(integration.id);
    const found = manager.getIntegration(integration.id);
    expect(found).toBeUndefined();
  });
});

// tests/token-encryption.test.ts
describe('TokenEncryption', () => {
  it('should encrypt and decrypt tokens', () => {
    const encryption = new TokenEncryption();
    const originalToken = 'test-access-token-12345';
    
    const { encrypted, iv, authTag } = encryption.encrypt(originalToken);
    const decrypted = encryption.decrypt(encrypted, iv, authTag);
    
    expect(decrypted).toBe(originalToken);
  });

  it('should fail to decrypt with wrong auth tag', () => {
    const encryption = new TokenEncryption();
    const { encrypted, iv } = encryption.encrypt('token');
    const wrongAuthTag = Buffer.from('0'.repeat(32), 'hex');
    
    expect(() => {
      encryption.decrypt(encrypted, iv, wrongAuthTag);
    }).toThrow();
  });
});
```

### Integration Tests

```typescript
// tests/integration-oauth-flow.test.ts
describe('OAuth Flow', () => {
  let request: supertest.SuperTest<supertest.Test>;
  let manager: PersistentIntegrationManager;

  beforeAll(async () => {
    const dbPool = new Pool({ connectionString: process.env.DATABASE_URL });
    manager = new PersistentIntegrationManager(dbPool);
    const app = createApp(manager, dbPool);
    request = supertest(app);
  });

  it('should generate authorization URL', async () => {
    const response = await request
      .post('/v1/integrations/connect/quickbooks')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ baseCurrency: 'AED' });

    expect(response.status).toBe(200);
    expect(response.body.authUrl).toBeDefined();
    expect(response.body.integrationId).toBeDefined();
  });

  it('should handle OAuth callback', async () => {
    // This requires actual OAuth provider credentials for full test
    // Simplified version shown here
    const integration = manager.createIntegration('quickbooks', 'org_xxx');
    
    // Would need real code and state from OAuth provider
    // const response = await request
    //   .get('/v1/integrations/callback')
    //   .query({ code: 'real-code', state: 'real-state' });
  });
});
```

## Performance Testing

### Load Test Sync Jobs

```bash
# Using Apache Bench to test concurrent sync requests
ab -n 100 -c 10 \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -X POST \
  "http://localhost:3000/v1/integrations/int_xxx/sync"

# Expected: All requests should queue and process with retry logic
```

### Database Connection Pool Monitoring

```typescript
// Monitor pool usage
pool.on('connect', () => console.log('New connection created'));
pool.on('remove', () => console.log('Connection removed'));

// Check pool stats
setInterval(() => {
  console.log(`Active connections: ${pool._activeConnectionCount}`);
  console.log(`Idle connections: ${pool._availableObjectQueue.length}`);
}, 5000);
```

## Debugging

### Enable Debug Logging

```typescript
// In integration-factory.ts, enable verbose logging
const DEBUG = process.env.DEBUG_INTEGRATIONS === 'true';

if (DEBUG) {
  console.log(`[INTEGRATION] Creating ${type} for org ${orgId}`);
  console.log(`[SYNC] Starting sync job ${job.id}`);
}
```

### Check Token in Database

```bash
# View encrypted token (raw bytes)
psql -d ledgr_test -c "
  SELECT 
    id,
    encode(access_token_encrypted, 'hex') as token_hex,
    encode(iv, 'hex') as iv_hex,
    encode(auth_tag, 'hex') as auth_tag_hex
  FROM oauth_tokens
  LIMIT 1;
"
```

### Monitor Sync Job Progress

```typescript
// In sync scheduler
scheduler.on('sync:start', (jobId, integration) => {
  console.log(`Sync started: ${jobId} on ${integration.type}`);
});

scheduler.on('sync:progress', (jobId, metrics) => {
  console.log(`Synced ${metrics.accountsSynced} accounts, ${metrics.invoicesSynced} invoices`);
});

scheduler.on('sync:complete', (jobId, finalMetrics) => {
  console.log(`Sync complete: ${JSON.stringify(finalMetrics)}`);
});
```

## Troubleshooting

### Token Expiration Issues

If tokens expire during sync:
1. Check `expires_at` in oauth_tokens table
2. Verify token refresh is working: `curl GET /v1/integrations/:id/status`
3. Check refresh token isn't null/corrupted in database
4. Verify ENCRYPTION_KEY hasn't rotated differently between instances

### Sync Job Hangs

If sync job stays in 'running' state:
1. Check database for deadlocks: `SELECT * FROM pg_stat_activity;`
2. Review sync job error log
3. Check rate limiting (429 responses from OAuth providers)
4. Verify webhook processing isn't blocking

### Webhook Signature Failures

If webhooks fail signature verification:
1. Verify PLAID_WEBHOOK_SECRET matches Plaid dashboard
2. Check timestamp isn't stale (within 5-10 minutes)
3. Ensure body isn't modified between receipt and verification
4. Verify HMAC-SHA256 is computed correctly: `timestamp + body`

## Production Checklist

- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] Encryption key securely stored in AWS Secrets Manager
- [ ] OAuth credentials for all integrations configured
- [ ] Webhook endpoints registered with providers
- [ ] Rate limiting configured (429 error handling)
- [ ] Retry logic tested with exponential backoff
- [ ] Database backup schedule established
- [ ] Monitoring/alerting for failed sync jobs
- [ ] Regular token rotation schedule (if provider requires)
- [ ] Audit logs retention policy (e.g., 90 days)
- [ ] Load testing completed (throughput, latency)
- [ ] Security scan for encrypted token storage

## References

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- [AES-GCM Specification](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [QuickBooks OAuth Docs](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2-0)
- [Xero OAuth Docs](https://developer.xero.com/documentation/guides/oauth2/oauth-overview/)
- [FreshBooks OAuth Docs](https://www.freshbooks.com/api/authentication)
- [Plaid Webhook Docs](https://plaid.com/docs/api/webhooks/)
