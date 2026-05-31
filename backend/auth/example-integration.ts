/**
 * Example Integration: Complete Authentication Setup
 * Shows how to wire up all components in a real Express app
 * 
 * This is a reference implementation. Adapt to your database and needs.
 */

import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Imports
// ============================================================================

import { AuthenticationService } from './auth';
import { AuthorizationService } from './permissions';
import {
  authenticate,
  requirePermission,
  requireRole,
  validateOrgContext,
  rateLimit,
  securityHeaders,
  authErrorHandler,
  configureAuthMiddleware,
  generateCSRFToken,
  verifyCsrfToken
} from './middleware';
import {
  User,
  LoginRequest,
  RegistrationRequest,
  AuthError,
  RefreshTokenRequest
} from './types';

// ============================================================================
// Mock Database (replace with your actual DB)
// ============================================================================

interface MockDatabase {
  users: Map<string, User>;
  userRoles: Array<{
    id: string;
    user_id: string;
    org_id: string;
    role_id: string;
    assigned_by: string;
    assigned_at: Date;
  }>;
  roles: Map<string, { id: string; slug: string; permissions: string[] }>;
  sessions: Map<string, any>;
}

const db: MockDatabase = {
  users: new Map(),
  userRoles: [],
  roles: new Map([
    ['client_admin_id', { id: 'client_admin_id', slug: 'client_admin', permissions: [] }],
    ['accountant_id', { id: 'accountant_id', slug: 'accountant', permissions: [] }],
    ['viewer_id', { id: 'viewer_id', slug: 'viewer', permissions: [] }]
  ]),
  sessions: new Map()
};

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(securityHeaders());

// ============================================================================
// Initialize Authentication Services
// ============================================================================

const authService = new AuthenticationService({
  jwt_private_key: process.env.JWT_PRIVATE_KEY || 'dev-key',
  jwt_public_key: process.env.JWT_PUBLIC_KEY || 'dev-key',
  access_token_expires_in: 900, // 15 minutes
  refresh_token_expires_in: 2592000, // 30 days
  session_expires_in: 86400, // 24 hours
  bcrypt_rounds: 10, // Reduced for faster testing
  max_login_attempts: 5,
  login_attempt_window: 300
});

const authzService = new AuthorizationService();

// Configure middleware with services
configureAuthMiddleware({
  authService,
  authzService,
  skip_paths: [
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/refresh',
    '/health',
    '/csrf-token'
  ],
  require_org_context: true
});

// ============================================================================
// Health Check
// ============================================================================

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// CSRF Token Endpoint
// ============================================================================

app.get('/csrf-token', (req: Request, res: Response) => {
  try {
    const token = generateCSRFToken(req, res);
    res.json({ csrf_token: token });
  } catch (error) {
    res.status(500).json({ error: 'csrf_generation_failed' });
  }
});

// ============================================================================
// Authentication Routes
// ============================================================================

/**
 * Register new user
 * POST /api/auth/register
 */
app.post('/api/auth/register',
  rateLimit(5, 3600), // 5 registrations per hour per IP
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, display_name, org_id, invite_token }: RegistrationRequest = req.body;

      // Validate inputs
      if (!email || !password || !display_name || !org_id) {
        return res.status(400).json({
          error: 'missing_fields',
          message: 'email, password, display_name, org_id required'
        });
      }

      // Validate email format
      if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return res.status(400).json({
          error: 'invalid_email',
          message: 'Invalid email format'
        });
      }

      // Check password strength
      const strength = authService.passwordManager.checkStrength(password);
      if (strength.score < 2) {
        return res.status(400).json({
          error: 'weak_password',
          message: 'Password too weak',
          feedback: strength.feedback
        });
      }

      // Check if user exists
      const existingUser = Array.from(db.users.values()).find(u => u.email === email);
      if (existingUser) {
        return res.status(409).json({
          error: 'user_exists',
          message: 'Email already registered'
        });
      }

      // Hash password
      const password_hash = await authService.passwordManager.hash(password);

      // Create user
      const user: User = {
        id: uuidv4(),
        org_id,
        email,
        password_hash,
        display_name,
        is_active: true,
        is_email_verified: false,
        two_factor_enabled: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      db.users.set(user.id, user);

      // Assign default role (VIEWER)
      db.userRoles.push({
        id: uuidv4(),
        user_id: user.id,
        org_id,
        role_id: 'viewer_id',
        assigned_by: 'system',
        assigned_at: new Date()
      });

      // Log security event
      authService.securityLogger.logEvent({
        user_id: user.id,
        org_id,
        event_type: 'login_success' as any, // Replace with proper enum
        ip_address: req.ip || '',
        user_agent: req.get('user-agent') || '',
        severity: 'info',
        description: 'User registered'
      });

      res.status(201).json({
        message: 'Registration successful',
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name
        }
      });
    } catch (error: any) {
      next(error);
    }
  }
);

/**
 * Login user
 * POST /api/auth/login
 */
app.post('/api/auth/login',
  rateLimit(10, 300), // 10 attempts per 5 minutes
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, remember_me, totp_code }: LoginRequest = req.body;

      if (!email || !password) {
        return res.status(400).json({
          error: 'missing_credentials',
          message: 'email and password required'
        });
      }

      // Find user
      const user = Array.from(db.users.values()).find(u => u.email === email);
      if (!user) {
        return res.status(401).json({
          error: 'invalid_credentials',
          message: 'Invalid email or password'
        });
      }

      // Get user's roles
      const userRoles = db.userRoles.filter(ur => ur.user_id === user.id);
      const roles = userRoles.map(ur => {
        const role = db.roles.get(ur.role_id);
        return role?.slug || 'viewer';
      });

      // Get permissions
      const permissions = authzService.rbac.getUserPermissions(roles);

      // Attempt login
      const loginResponse = await authService.login(
        user,
        { email, password, remember_me, totp_code },
        req.ip || '',
        req.get('user-agent') || '',
        roles,
        permissions
      );

      // Update last_login
      user.last_login = new Date();
      db.users.set(user.id, user);

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

      return res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          roles
        },
        access_token: loginResponse.access_token,
        refresh_token: loginResponse.refresh_token,
        expires_in: 900
      });
    } catch (error: any) {
      if (error instanceof AuthError) {
        if (error.code === 'two_factor_required') {
          return res.status(403).json({
            error: error.code,
            message: error.message,
            challenge: error.metadata?.challenge
          });
        }
        return res.status(error.status_code).json({
          error: error.code,
          message: error.message
        });
      }
      next(error);
    }
  }
);

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
app.post('/api/auth/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refresh_token }: RefreshTokenRequest = req.body;

      if (!refresh_token) {
        return res.status(400).json({
          error: 'missing_token',
          message: 'refresh_token required'
        });
      }

      // Verify refresh token
      const decoded = authService.tokenManager.verifyToken(refresh_token, true);

      // Find user
      const user = db.users.get(decoded.user_id);
      if (!user) {
        return res.status(401).json({
          error: 'user_not_found',
          message: 'User not found'
        });
      }

      // Get updated roles/permissions
      const userRoles = db.userRoles.filter(ur => ur.user_id === user.id);
      const roles = userRoles.map(ur => {
        const role = db.roles.get(ur.role_id);
        return role?.slug || 'viewer';
      });
      const permissions = authzService.rbac.getUserPermissions(roles);

      // Generate new tokens
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
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });

      return res.json(response);
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.status_code).json({
          error: error.code,
          message: error.message
        });
      }
      next(error);
    }
  }
);

/**
 * Logout user
 * POST /api/auth/logout
 */
app.post('/api/auth/logout',
  authenticate(),
  (req: Request, res: Response) => {
    const user = req.user!;

    authService.logout(
      user.user_id,
      user.token_jti,
      req.ip || '',
      req.get('user-agent') || '',
      req.body.logout_everywhere || false
    );

    // Clear cookies
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    res.json({ message: 'Logged out successfully' });
  }
);

/**
 * Get current user info
 * GET /api/auth/me
 */
app.get('/api/auth/me',
  authenticate(),
  (req: Request, res: Response) => {
    const user = db.users.get(req.user!.user_id);
    if (!user) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      roles: req.user!.roles,
      org_id: user.org_id,
      two_factor_enabled: user.two_factor_enabled,
      last_login: user.last_login
    });
  }
);

// ============================================================================
// User Management Routes (Admin)
// ============================================================================

/**
 * List team users
 * GET /api/team/users
 */
app.get('/api/team/users',
  authenticate(),
  validateOrgContext(),
  requirePermission('user:read'),
  (req: Request, res: Response) => {
    const users = Array.from(db.users.values())
      .filter(u => u.org_id === req.user!.org_id)
      .map(u => ({
        id: u.id,
        email: u.email,
        display_name: u.display_name,
        is_active: u.is_active,
        last_login: u.last_login
      }));

    res.json(users);
  }
);

/**
 * Assign role to user
 * POST /api/admin/users/:user_id/roles
 */
app.post('/api/admin/users/:user_id/roles',
  authenticate(),
  requireRole('client_admin'),
  validateOrgContext(),
  verifyCsrfToken(),
  (req: Request, res: Response) => {
    try {
      const { user_id } = req.params;
      const { role_id } = req.body;

      if (!role_id) {
        return res.status(400).json({ error: 'role_id_required' });
      }

      // Verify user exists in same org
      const user = db.users.get(user_id);
      if (!user || user.org_id !== req.user!.org_id) {
        return res.status(404).json({ error: 'user_not_found' });
      }

      // Create role assignment
      db.userRoles.push({
        id: uuidv4(),
        user_id,
        org_id: req.user!.org_id,
        role_id,
        assigned_by: req.user!.user_id,
        assigned_at: new Date()
      });

      res.json({ message: 'Role assigned' });
    } catch (error: any) {
      res.status(400).json({ error: 'role_assignment_failed' });
    }
  }
);

// ============================================================================
// Protected Data Routes (Examples)
// ============================================================================

/**
 * Get dashboard (requires auth)
 * GET /api/dashboard
 */
app.get('/api/dashboard',
  authenticate(),
  (req: Request, res: Response) => {
    res.json({
      user_id: req.user!.user_id,
      org_id: req.user!.org_id,
      roles: req.user!.roles,
      permissions: req.user!.permissions
    });
  }
);

/**
 * Get financial data (requires permission)
 * GET /api/financials
 */
app.get('/api/financials',
  authenticate(),
  requirePermission('financials:read'),
  (req: Request, res: Response) => {
    res.json({
      data: [
        { id: 1, amount: 1000, date: '2025-05-31' }
      ]
    });
  }
);

/**
 * Approve transaction (requires specific permission)
 * POST /api/financials/approve
 */
app.post('/api/financials/approve',
  authenticate(),
  requirePermission('financials:approve'),
  (req: Request, res: Response) => {
    res.json({ status: 'approved', approved_by: req.user!.user_id });
  }
);

/**
 * Admin endpoint (requires role)
 * GET /api/admin/audit-logs
 */
app.get('/api/admin/audit-logs',
  authenticate(),
  requireRole('client_admin'),
  (req: Request, res: Response) => {
    const events = authService.securityLogger.getOrgEvents(
      req.user!.org_id,
      100
    );
    res.json(events);
  }
);

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found'
  });
});

// Error handler (should be last)
app.use(authErrorHandler());

// ============================================================================
// Start Server
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n✓ Ledgr Auth Server running on port ${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST   /api/auth/register`);
  console.log(`  POST   /api/auth/login`);
  console.log(`  POST   /api/auth/refresh`);
  console.log(`  POST   /api/auth/logout`);
  console.log(`  GET    /api/auth/me`);
  console.log(`  GET    /api/dashboard`);
  console.log(`  GET    /api/financials`);
  console.log(`  POST   /api/financials/approve`);
  console.log(`  GET    /api/admin/audit-logs`);
  console.log(`\nTest user:`);
  console.log(`  Email: test@example.com`);
  console.log(`  Password: TestPassword123!`);
});

// ============================================================================
// Exports
// ============================================================================

export { app, authService, authzService };
