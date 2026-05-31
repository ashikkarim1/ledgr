# Authentication Quick Start Guide

Fast setup guide for Ledgr authentication system.

## Installation

```bash
npm install jsonwebtoken bcrypt speakeasy qrcode
npm install --save-dev @types/jsonwebtoken @types/bcrypt @types/express
```

## 30-Second Setup

```typescript
import express from 'express';
import { AuthenticationService } from './auth/auth';
import { AuthorizationService } from './auth/permissions';
import {
  authenticate,
  requirePermission,
  requireRole,
  configureAuthMiddleware
} from './auth/middleware';

const app = express();

// 1. Initialize services
const authService = new AuthenticationService();
const authzService = new AuthorizationService();

// 2. Configure middleware
configureAuthMiddleware({
  authService,
  authzService,
  skip_paths: ['/api/auth/login', '/api/auth/register']
});

// 3. Use middleware
app.use(authenticate());

// 4. Protect routes
app.get('/api/data',
  requirePermission('financials:read'),
  (req, res) => res.json({ user: req.user })
);

app.listen(3000);
```

## Common Operations

### Login User

```typescript
const user = await db.users.findOne({ email: 'user@example.com' });
const roles = await db.userRoles.find({ user_id: user.id });

const response = await authService.login(
  user,
  { email: 'user@example.com', password: 'password123' },
  req.ip,
  req.get('user-agent'),
  roles.map(r => r.role_id),
  permissions
);

res.json(response);
```

### Check Permission

```typescript
// In middleware or controller
if (!req.user) throw new Error('Not authenticated');

const hasPermission = authzService.authorize(
  req.user,
  'financials:approve'
);

if (!hasPermission) {
  throw new AuthError('forbidden', 'Permission denied', 403);
}
```

### Assign Role to User

```typescript
await db.userRoles.create({
  user_id: userId,
  org_id: orgId,
  role_id: roleId,
  assigned_by: adminUserId
});
```

### Refresh Token

```typescript
const newTokens = authService.refreshAccessToken(
  refreshToken,
  roles,
  permissions,
  user
);

res.json(newTokens);
```

### Logout

```typescript
authService.logout(
  user.id,
  tokenJti,
  req.ip,
  req.get('user-agent'),
  logoutEverywhere
);
```

## API Endpoints Template

```typescript
// POST /api/auth/register
// POST /api/auth/login
// POST /api/auth/verify-2fa
// POST /api/auth/refresh
// POST /api/auth/logout
// GET  /api/auth/me

// GET  /api/users (requireRole: client_admin)
// POST /api/users (requirePermission: user:create)
// PUT  /api/users/:id (requirePermission: user:update)
// DELETE /api/users/:id (requirePermission: user:delete)

// GET  /api/admin/audit-logs (requireRole: client_admin)
// GET  /api/admin/sessions/:user_id (requireRole: client_admin)
```

## Error Responses

```typescript
// Unauthenticated
401: { error: 'unauthorized', message: 'Auth required' }

// Unauthorized
403: { error: 'forbidden', message: 'Permission denied' }

// Invalid token
401: { error: 'invalid_token', message: 'Token is invalid' }

// Rate limited
429: { error: 'rate_limit_exceeded', message: '...' }

// 2FA required
403: { error: 'two_factor_required', challenge: {...} }
```

## Built-in Roles Quick Reference

| Role | Use Case | Key Permissions |
|------|----------|-----------------|
| **CLIENT_ADMIN** | Organization admin | All permissions |
| **ACCOUNTANT** | Finance staff | Financial data management |
| **CFO** | Finance leadership | Read-only strategic view |
| **AGENT_MANAGER** | Operations | Deploy and manage agents |
| **SUPPORT_ESCALATION** | Customer support | Read-only support context |
| **VIEWER** | Auditors/Consultants | Read-only access |

## Environment Setup

```bash
# Generate JWT keys
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem

# Set environment variables
export JWT_PRIVATE_KEY="$(cat jwt-private.pem)"
export JWT_PUBLIC_KEY="$(cat jwt-public.pem)"
export JWT_ISSUER="https://api.ledgr.finance"
export BCRYPT_ROUNDS=12
```

## Middleware Chaining

```typescript
// Simple auth check
app.get('/api/profile',
  authenticate(),
  (req, res) => { ... }
);

// Auth + permission check
app.post('/api/approve',
  authenticate(),
  requirePermission('financials:approve'),
  (req, res) => { ... }
);

// Auth + role check
app.delete('/api/user/:id',
  authenticate(),
  requireRole('client_admin'),
  (req, res) => { ... }
);

// Auth + org validation
app.get('/api/orgs/:org_id/data',
  authenticate(),
  validateOrgContext(),
  (req, res) => { ... }
);

// Auth + rate limiting
app.post('/api/data',
  rateLimit(100, 60),
  authenticate(),
  (req, res) => { ... }
);
```

## Database Queries

```sql
-- Get user with roles
SELECT u.*, array_agg(r.slug) as roles
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
WHERE u.email = 'user@example.com'
GROUP BY u.id;

-- Get audit trail
SELECT * FROM security_events
WHERE org_id = $1
ORDER BY created_at DESC
LIMIT 100;

-- Get active sessions
SELECT * FROM sessions
WHERE user_id = $1 AND is_active = true
AND expires_at > NOW();

-- Revoke all user sessions
UPDATE sessions
SET is_active = false
WHERE user_id = $1;
```

## Testing

```typescript
import { AuthenticationService } from './auth';

describe('Authentication', () => {
  let auth: AuthenticationService;

  beforeEach(() => {
    auth = new AuthenticationService();
  });

  test('should hash password', async () => {
    const hash = await auth.passwordManager.hash('password123');
    const valid = await auth.passwordManager.verify('password123', hash);
    expect(valid).toBe(true);
  });

  test('should verify token', () => {
    const user = { id: '123', org_id: '456', email: 'test@example.com' };
    const token = auth.tokenManager.generateAccessToken(user, ['viewer'], []);
    const decoded = auth.tokenManager.verifyToken(token);
    expect(decoded.user_id).toBe('123');
  });

  test('should rate limit', () => {
    const limiter = auth.rateLimiter;
    for (let i = 0; i < 6; i++) {
      limiter.recordAttempt('test@example.com:127.0.0.1');
    }
    expect(limiter.isRateLimited('test@example.com:127.0.0.1')).toBe(true);
  });
});
```

## Checklist for Integration

- [ ] Install dependencies
- [ ] Generate JWT key pair
- [ ] Set environment variables
- [ ] Create database tables
- [ ] Initialize AuthenticationService
- [ ] Configure middleware
- [ ] Add authenticate() to protected routes
- [ ] Add requirePermission() / requireRole() checks
- [ ] Implement /login endpoint
- [ ] Implement /refresh endpoint
- [ ] Implement /logout endpoint
- [ ] Enable CSRF protection
- [ ] Enable rate limiting
- [ ] Configure security headers
- [ ] Test authentication flow
- [ ] Test authorization checks
- [ ] Enable 2FA (optional but recommended)
- [ ] Set up audit logging
- [ ] Configure IP whitelist (optional)

## Troubleshooting

### Issue: "Cannot find module" errors
```bash
# Solution: Install types
npm install --save-dev @types/jsonwebtoken @types/bcrypt
```

### Issue: JWT_PRIVATE_KEY is undefined
```bash
# Solution: Set environment variable
export JWT_PRIVATE_KEY="$(cat jwt-private.pem)"
# or
export JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

### Issue: "Invalid token" errors
- Verify JWT keys are correct
- Check token hasn't expired
- Verify issuer matches JWT_ISSUER env var

### Issue: "Permission denied" always
- Check user's roles in database
- Verify role has required permission
- Check BUILT_IN_ROLES[role] includes permission

### Issue: Rate limiting not working
- Verify rate limit middleware is before route handler
- Check IP is being captured correctly
- Clear in-memory rate limit store if using memory storage

## Next Steps

1. Read AUTH_IMPLEMENTATION.md for detailed docs
2. Review example routes in usage section
3. Set up database schema
4. Implement JWT key rotation (optional but recommended)
5. Set up OAuth providers (Google, Microsoft)
6. Enable advanced features (IP whitelist, geo-blocking)

---

For full documentation, see `AUTH_IMPLEMENTATION.md`
