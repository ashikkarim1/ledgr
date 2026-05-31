# Ledgr Authentication & Authorization Implementation

Complete production-grade authentication and authorization system for Ledgr.

## Overview

This system provides:
- **JWT-based authentication** with access + refresh tokens
- **Session management** with automatic expiry and revocation
- **Two-factor authentication** (TOTP + backup codes)
- **Role-Based Access Control (RBAC)** with 6 built-in roles
- **Fine-grained permissions** with entity-level ACL
- **Security features**: rate limiting, CSRF protection, security event logging
- **OAuth 2.0 preparation** for Google & Microsoft integration

## Architecture

```
Authentication Flow:
┌─────────────────┐
│   Login Form    │
└────────┬────────┘
         │ email + password
         ▼
    ┌────────────────────┐
    │ PasswordManager    │ (bcrypt verification)
    └────────┬───────────┘
             │
         ┌───┴───────────┐
         │               │
      Success         Failure
         │               │
         ▼               ▼
    2FA Check      ┌──────────┐
         │         │  401     │
    ┌────┴────┐    │ Reject  │
    │          │    └──────────┘
  Required  None
    │          │
    ▼          ▼
  TOTP    SessionManager
  Code         │
    │          ▼
    └─────────┬────────┐
              │        │
              ▼        ▼
         ┌───────────────────┐
         │  TokenManager     │ (JWT generation)
         │                   │
         │ • Access token    │
         │ • Refresh token   │
         └─────────┬─────────┘
                   │
                   ▼
            ┌─────────────────┐
            │   JWT Response  │
            │ (tokens + user) │
            └─────────────────┘

Authorization Flow:
┌──────────────┐
│ API Request  │
└──────┬───────┘
       │ Bearer token
       ▼
  ┌──────────────────┐
  │ verify JWT       │ (RS256, audience check)
  └──────┬───────────┘
         │
         ▼
    ┌─────────────┐
    │ Check Roles │
    └──────┬──────┘
           │
           ▼
    ┌──────────────────┐
    │ Check Permissions│ (RBAC + entity ACL)
    └──────┬───────────┘
           │
       ┌───┴────┐
       │         │
    Allow    Deny
       │         │
       ▼         ▼
   ┌────┐   ┌─────┐
   │200 │   │403  │
   └────┘   └─────┘
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(255),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_email_verified BOOLEAN DEFAULT false,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret TEXT, -- Encrypted TOTP secret
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, email),
  INDEX(org_id),
  INDEX(email)
);
```

### User Roles Table
```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMP, -- Optional: role expiration
  INDEX(user_id),
  INDEX(org_id),
  INDEX(role_id)
);
```

### Roles Table
```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY,
  org_id UUID,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  permissions TEXT[] DEFAULT '{}', -- Array of permission slugs
  is_built_in BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, slug),
  INDEX(org_id)
);
```

### Sessions Table
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id),
  token_jti VARCHAR(255) NOT NULL,
  refresh_token_jti VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  INDEX(user_id),
  INDEX(org_id),
  INDEX(expires_at),
  INDEX(token_jti)
);
```

### Security Events Table
```sql
CREATE TABLE security_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES organizations(id),
  event_type VARCHAR(100) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  severity VARCHAR(20), -- 'info', 'warning', 'critical'
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX(user_id),
  INDEX(org_id),
  INDEX(event_type),
  INDEX(created_at),
  INDEX(severity)
);
```

## Built-in Roles

### CLIENT_ADMIN
- **Description**: Full workspace access and team management
- **Permissions**: 
  - All user management (read, create, update, delete)
  - Team settings, role assignment
  - Financial data (read, write, approve)
  - Agent deployment and configuration
  - Integration management
  - Billing management
  - Audit logs and security settings

### ACCOUNTANT
- **Description**: Financial management and reporting
- **Permissions**:
  - Read financial data
  - Create/edit financial entries
  - Approve transactions
  - Export reports
  - Read audit logs
- **Restrictions**: No billing, no full agent control

### CFO
- **Description**: Strategic financial view
- **Permissions**:
  - Read financial data and reports
  - Export reports
  - Monitor agents
  - View billing info
  - Read audit logs
- **Restrictions**: No agent management, no user editing

### AGENT_MANAGER
- **Description**: Deploy and configure agents
- **Permissions**:
  - Read agents
  - Deploy agents
  - Configure agent settings
  - Monitor agent performance
  - Connect integrations
- **Restrictions**: No financial access

### SUPPORT_ESCALATION
- **Description**: Handle help tickets and customer support
- **Permissions**:
  - Read-only access to financial context
  - View agents
  - Read audit logs
- **Restrictions**: Minimal permissions, no modifications

### VIEWER
- **Description**: Read-only access for auditors and consultants
- **Permissions**:
  - Read-only: users, team, financials, reports, agents
  - Read audit logs
- **Restrictions**: No modifications, minimal scope

## Usage

### 1. Initialize Authentication Service

```typescript
import { AuthenticationService } from './auth/auth';
import { AuthorizationService } from './auth/permissions';
import { configureAuthMiddleware } from './auth/middleware';

// Create service instances
const authService = new AuthenticationService({
  jwt_private_key: process.env.JWT_PRIVATE_KEY,
  jwt_public_key: process.env.JWT_PUBLIC_KEY,
  access_token_expires_in: 900, // 15 minutes
  refresh_token_expires_in: 2592000 // 30 days
});

const authzService = new AuthorizationService();

// Configure middleware
configureAuthMiddleware({
  authService,
  authzService,
  skip_paths: ['/api/auth/login', '/api/auth/register', '/health'],
  require_org_context: true
});
```

### 2. User Registration

```typescript
import express from 'express';
import { RegistrationRequest } from './auth/types';

const app = express();

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const req_body: RegistrationRequest = req.body;

    // Validate email format
    if (!req_body.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'invalid_email' });
    }

    // Check password strength
    const strength = authService.passwordManager.checkStrength(req_body.password);
    if (strength.score < 2) {
      return res.status(400).json({
        error: 'weak_password',
        feedback: strength.feedback
      });
    }

    // Hash password
    const password_hash = await authService.passwordManager.hash(req_body.password);

    // Create user in database
    const user = await db.users.create({
      email: req_body.email,
      password_hash,
      display_name: req_body.display_name,
      org_id: req_body.org_id,
      is_active: true
    });

    // Assign default role
    await db.userRoles.create({
      user_id: user.id,
      org_id: user.org_id,
      role_id: defaultRoleId // e.g., VIEWER
    });

    res.status(201).json({
      message: 'Registration successful',
      user: { id: user.id, email: user.email }
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(400).json({ error: 'registration_failed' });
  }
});
```

### 3. User Login

```typescript
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password, remember_me, totp_code } = req.body;
    
    // Get user from database
    const user = await db.users.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    // Get user's roles
    const userRoles = await db.userRoles.find({ 
      user_id: user.id,
      org_id: user.org_id 
    });
    
    // Get all permissions for roles
    const roles = userRoles.map(ur => ur.role_id);
    const permissions = authzService.rbac.getUserPermissions(
      roles.map(r => db.roleIdToSlug[r])
    );

    // Attempt login
    const loginResponse = await authService.login(
      user,
      { email, password, remember_me, totp_code },
      req.ip || '',
      req.get('user-agent') || '',
      roles,
      permissions
    );

    // Set secure cookies
    res.cookie('access_token', loginResponse.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refresh_token', loginResponse.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    return res.json(loginResponse);
  } catch (error: any) {
    if (error instanceof AuthError) {
      // Handle 2FA requirement
      if (error.code === 'two_factor_required') {
        return res.status(403).json({
          error: error.code,
          challenge: error.metadata?.challenge
        });
      }
      return res.status(error.status_code).json({
        error: error.code,
        message: error.message
      });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'login_failed' });
  }
});
```

### 4. Verify 2FA Code

```typescript
app.post('/api/auth/verify-2fa', async (req: Request, res: Response) => {
  try {
    const { user_id, code } = req.body;
    
    const user = await db.users.findOne({ id: user_id });
    if (!user || !user.two_factor_secret) {
      return res.status(400).json({ error: 'no_2fa_setup' });
    }

    // Verify TOTP code
    const valid = authService.twoFactorManager.verifyTOTP(
      user.two_factor_secret,
      code
    );

    if (!valid) {
      return res.status(401).json({ error: 'invalid_code' });
    }

    // Generate tokens
    const userRoles = await db.userRoles.find({ user_id: user.id });
    const roles = userRoles.map(ur => ur.role_id);
    const permissions = authzService.rbac.getUserPermissions(
      roles.map(r => db.roleIdToSlug[r])
    );

    const accessToken = authService.tokenManager.generateAccessToken(
      user,
      roles,
      permissions
    );
    const refreshToken = authService.tokenManager.generateRefreshToken(user);

    return res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900
    });
  } catch (error: any) {
    res.status(500).json({ error: 'verification_failed' });
  }
});
```

### 5. Protected Routes

```typescript
import { 
  authenticate, 
  requirePermission, 
  requireRole,
  validateOrgContext 
} from './auth/middleware';

// Require authentication
app.get('/api/dashboard',
  authenticate(),
  (req: Request, res: Response) => {
    const user = req.user!;
    res.json({
      user_id: user.user_id,
      roles: user.roles,
      org_id: user.org_id
    });
  }
);

// Require specific permission
app.post('/api/financials/approve',
  authenticate(),
  requirePermission('financials:approve'),
  async (req: Request, res: Response) => {
    // User must have 'financials:approve' permission
    res.json({ status: 'approved' });
  }
);

// Require specific role
app.get('/api/admin/audit-logs',
  authenticate(),
  requireRole('client_admin'),
  async (req: Request, res: Response) => {
    const logs = await db.securityEvents.findAll({
      org_id: req.user!.org_id
    });
    res.json(logs);
  }
);

// Validate organization context
app.get('/api/orgs/:org_id/team',
  authenticate(),
  validateOrgContext(),
  async (req: Request, res: Response) => {
    const team = await db.users.findAll({
      org_id: req.user!.org_id
    });
    res.json(team);
  }
);
```

### 6. Token Refresh

```typescript
app.post('/api/auth/refresh', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'missing_refresh_token' });
    }

    // Verify refresh token
    const decoded = authService.tokenManager.verifyToken(refresh_token, true);
    
    const user = await db.users.findOne({ id: decoded.user_id });
    if (!user) {
      return res.status(401).json({ error: 'user_not_found' });
    }

    // Get updated roles/permissions
    const userRoles = await db.userRoles.find({ user_id: user.id });
    const roles = userRoles.map(ur => ur.role_id);
    const permissions = authzService.rbac.getUserPermissions(
      roles.map(r => db.roleIdToSlug[r])
    );

    const response = authService.refreshAccessToken(
      refresh_token,
      roles,
      permissions,
      user
    );

    // Update refresh token cookie
    res.cookie('refresh_token', response.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json(response);
  } catch (error: any) {
    res.status(401).json({ error: 'refresh_failed' });
  }
});
```

### 7. Logout

```typescript
app.post('/api/auth/logout',
  authenticate(),
  async (req: Request, res: Response) => {
    const user = req.user!;
    
    // Logout everywhere or just this session
    const logoutEverywhere = req.body.logout_everywhere || false;

    authService.logout(
      user.user_id,
      user.token_jti,
      req.ip || '',
      req.get('user-agent') || '',
      logoutEverywhere
    );

    // Clear cookies
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    res.json({ status: 'logged_out' });
  }
);
```

### 8. Assign Role to User

```typescript
app.post('/api/admin/users/:user_id/roles',
  authenticate(),
  requireRole('client_admin'),
  validateOrgContext(),
  async (req: Request, res: Response) => {
    try {
      const { role_id, expires_at } = req.body;
      const { user_id } = req.params;

      // Create role assignment
      await db.userRoles.create({
        user_id,
        org_id: req.user!.org_id,
        role_id,
        assigned_by: req.user!.user_id,
        expires_at: expires_at ? new Date(expires_at) : null
      });

      res.json({ status: 'role_assigned' });
    } catch (error: any) {
      res.status(400).json({ error: 'role_assignment_failed' });
    }
  }
);
```

## Security Best Practices

### 1. Token Management
```typescript
// Always validate token before using
const decoded = authService.tokenManager.verifyToken(token);

// Tokens expire and should be refreshed
// Access tokens: 15 minutes
// Refresh tokens: 30 days (in httpOnly cookies)

// Revoke tokens on logout
authService.tokenManager.revokeToken(jti);
```

### 2. Password Security
```typescript
// Always hash with bcrypt
const hash = await authService.passwordManager.hash(password);

// Check strength before accepting
const strength = authService.passwordManager.checkStrength(password);
if (strength.score < 2) throw new Error('Weak password');
```

### 3. Rate Limiting
```typescript
// Use rate limiting middleware on auth endpoints
app.post('/api/auth/login',
  rateLimit(5, 300), // 5 attempts per 5 minutes
  async (req, res) => {
    // ...
  }
);
```

### 4. CSRF Protection
```typescript
// Generate CSRF token for forms
app.get('/api/csrf-token', (req, res) => {
  const token = generateCSRFToken(req, res);
  res.json({ csrf_token: token });
});

// Verify CSRF on state-changing requests
app.post('/api/data',
  verifyCsrfToken(),
  async (req, res) => {
    // ...
  }
);
```

### 5. Security Headers
```typescript
// Apply security headers to all responses
app.use(securityHeaders());

// Sets:
// - X-Frame-Options: DENY (prevent clickjacking)
// - X-Content-Type-Options: nosniff
// - X-XSS-Protection: 1; mode=block
// - CSP headers
// - HSTS (HTTPS)
```

### 6. Session Management
```typescript
// Session expiry is automatic
// Sessions are stored in database (redis in production)
// Update last_activity on each request
sessionManager.updateActivity(sessionId);

// Logout everywhere
sessionManager.invalidateAllUserSessions(userId);
```

## Environment Variables

```bash
# JWT Configuration
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_ISSUER="https://api.ledgr.finance"
JWT_AUDIENCE="https://ledgr.finance"

# Security
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOGIN_ATTEMPT_WINDOW=300 # seconds

# Session
SESSION_STORE="redis" # or "memory" for dev
REDIS_URL="redis://localhost:6379"

# Cookies
SECURE_COOKIES=true
SAME_SITE_POLICY="strict"
```

## Adding New Roles

```typescript
// 1. Add role to BUILT_IN_ROLES in permissions.ts
const BUILT_IN_ROLES: Record<RoleType, string[]> = {
  new_role: [
    'user:read',
    'agents:read',
    // ... permissions
  ]
};

// 2. Add to RoleType enum
export type RoleType = 
  | 'client_admin'
  | 'accountant'
  | 'cfo'
  | 'agent_manager'
  | 'support_escalation'
  | 'viewer'
  | 'new_role'; // <-- Add here

// 3. Insert into database
await db.roles.create({
  org_id: null, // null = built-in
  name: 'New Role',
  slug: 'new_role',
  permissions: ['user:read', 'agents:read', ...],
  is_built_in: true
});
```

## OAuth 2.0 Preparation

The system is structured for OAuth integration:

```typescript
// Google OAuth flow
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Exchange code for tokens
  const tokens = await exchangeGoogleCode(code);
  
  // Get user info
  const userInfo = await getGoogleUserInfo(tokens.access_token);
  
  // Find or create user
  let user = await db.users.findOne({ email: userInfo.email });
  if (!user) {
    user = await db.users.create({
      email: userInfo.email,
      display_name: userInfo.name,
      avatar_url: userInfo.picture,
      org_id: determineOrg(),
      // ... other fields
    });
  }
  
  // Generate Ledgr tokens
  const ledgrTokens = await generateTokens(user);
  
  res.json(ledgrTokens);
});
```

## Monitoring & Auditing

```typescript
// View security events
app.get('/api/admin/security-events',
  authenticate(),
  requireRole('client_admin'),
  (req, res) => {
    const events = authService.securityLogger.getOrgEvents(
      req.user!.org_id,
      100
    );
    res.json(events);
  }
);

// View user sessions
app.get('/api/admin/user/:user_id/sessions',
  authenticate(),
  requireRole('client_admin'),
  (req, res) => {
    const sessions = authService.sessionManager.getUserSessions(
      req.params.user_id
    );
    res.json(sessions);
  }
);

// View login attempts
const rateLimitStatus = authService.rateLimiter.getRemainingAttempts(
  `${email}:${ip}`
);
```

## Troubleshooting

### "Token Expired" Error
- Access tokens expire after 15 minutes
- Use refresh token to get new access token
- Call `/api/auth/refresh` endpoint

### "Permission Denied" Error
- Check user's roles: `user.roles`
- Verify role has permission: `BUILT_IN_ROLES[role]`
- Check entity-level ACL: `authzService.checkEntityAccess()`

### "2FA Required" Error
- User has 2FA enabled
- Call `/api/auth/verify-2fa` with TOTP code
- Or use backup codes instead

### "Rate Limited" Error
- Too many login attempts from same IP/email
- Wait 5 minutes before retrying
- Check `rateLimiter.getRemainingAttempts()`

## Security Checklist

- [ ] JWT keys are stored securely (env variables or KMS)
- [ ] Passwords are hashed with bcrypt (12+ rounds)
- [ ] Sessions are stored in Redis/database (not memory in production)
- [ ] Rate limiting is enabled on auth endpoints
- [ ] CSRF protection is enabled
- [ ] Security headers are set
- [ ] HTTPS is enforced in production
- [ ] Refresh tokens are stored in httpOnly cookies
- [ ] Access tokens expire after 15 minutes
- [ ] Sessions are logged for audit trail
- [ ] 2FA is enabled for client admins
- [ ] IP whitelist is configured (optional)
- [ ] Audit logs are regularly reviewed
- [ ] Passwords meet complexity requirements

---

**Generated**: 2025-05-31  
**Version**: 1.0.0  
**Status**: Production-Ready
