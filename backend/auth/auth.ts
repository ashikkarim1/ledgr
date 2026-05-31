/**
 * Ledgr Authentication Module
 * Production-grade authentication with JWT, password hashing, 2FA, and session management
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import {
  JWTPayload,
  TokenResponse,
  User,
  UserSession,
  LoginRequest,
  LoginResponse,
  AuthContext,
  TwoFactorSetup,
  TwoFactorChallenge,
  SecurityEvent,
  SecurityEventType,
  AuthError,
  RefreshTokenRequest
} from './types';

// ============================================================================
// Configuration & Secrets
// ============================================================================

interface AuthConfig {
  jwt_private_key: string;
  jwt_public_key: string;
  jwt_issuer: string;
  jwt_audience: string;
  access_token_expires_in: number; // seconds
  refresh_token_expires_in: number; // seconds
  session_expires_in: number; // seconds
  bcrypt_rounds: number;
  max_login_attempts: number;
  login_attempt_window: number; // seconds
  rate_limit_enabled: boolean;
  session_storage: 'memory' | 'redis' | 'database'; // In prod: use Redis or DB
}

const DEFAULT_CONFIG: AuthConfig = {
  jwt_private_key: process.env.JWT_PRIVATE_KEY || '',
  jwt_public_key: process.env.JWT_PUBLIC_KEY || '',
  jwt_issuer: process.env.JWT_ISSUER || 'https://api.ledgr.finance',
  jwt_audience: process.env.JWT_AUDIENCE || 'https://ledgr.finance',
  access_token_expires_in: 900, // 15 minutes
  refresh_token_expires_in: 2592000, // 30 days
  session_expires_in: 86400, // 24 hours
  bcrypt_rounds: 12,
  max_login_attempts: 5,
  login_attempt_window: 300, // 5 minutes
  rate_limit_enabled: true,
  session_storage: 'memory'
};

// ============================================================================
// In-Memory Storage (Replace with Redis/DB in production)
// ============================================================================

const sessionStore = new Map<string, UserSession>();
const revocationList = new Map<string, number>(); // JTI -> revocation time
const loginAttempts = new Map<string, { count: number; first_attempt: number }>();
const securityEvents: SecurityEvent[] = [];

// ============================================================================
// Password Hashing
// ============================================================================

export class PasswordManager {
  constructor(private bcrypt_rounds: number = 12) {}

  /**
   * Hash password with bcrypt
   * Output: bcrypt hash with salt rounds
   */
  async hash(password: string): Promise<string> {
    if (!password || password.length < 8) {
      throw new AuthError(
        'weak_password',
        'Password must be at least 8 characters',
        400
      );
    }
    return await bcrypt.hash(password, this.bcrypt_rounds);
  }

  /**
   * Verify password against hash
   */
  async verify(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Check password strength
   */
  checkStrength(password: string): {
    score: number; // 0-4
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;

    if (password.length >= 8) score++;
    else feedback.push('At least 8 characters');

    if (password.length >= 12) score++;
    else feedback.push('At least 12 characters for stronger security');

    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    else feedback.push('Include uppercase and lowercase letters');

    if (/\d/.test(password)) score++;
    else feedback.push('Include numbers');

    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;
    else feedback.push('Include special characters');

    return { score: Math.min(score, 4), feedback };
  }
}

// ============================================================================
// JWT Token Management
// ============================================================================

export class TokenManager {
  constructor(private config: AuthConfig) {}

  /**
   * Generate access token (JWT)
   */
  generateAccessToken(
    user: User,
    roles: string[],
    permissions: string[],
    entity_ids: string[] = [],
    expires_in?: number
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = expires_in || this.config.access_token_expires_in;

    const payload: JWTPayload = {
      iss: this.config.jwt_issuer,
      sub: `org:${user.org_id}:user:${user.id}`,
      aud: this.config.jwt_audience,
      iat: now,
      exp: now + expiresIn,
      jti: crypto.randomUUID(),
      org_id: user.org_id,
      user_id: user.id,
      email: user.email,
      roles,
      permissions,
      entity_ids,
      token_type: 'access'
    };

    return jwt.sign(payload, this.config.jwt_private_key, {
      algorithm: 'RS256',
      keyid: 'ledgr-key-1'
    });
  }

  /**
   * Generate refresh token (JWT)
   */
  generateRefreshToken(user: User): string {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.config.refresh_token_expires_in;

    const payload: JWTPayload = {
      iss: this.config.jwt_issuer,
      sub: `org:${user.org_id}:user:${user.id}`,
      aud: this.config.jwt_audience,
      iat: now,
      exp: now + expiresIn,
      jti: crypto.randomUUID(),
      org_id: user.org_id,
      user_id: user.id,
      email: user.email,
      roles: [],
      token_type: 'refresh'
    };

    return jwt.sign(payload, this.config.jwt_private_key, {
      algorithm: 'RS256'
    });
  }

  /**
   * Verify and decode JWT
   */
  verifyToken(token: string, allowRefresh: boolean = false): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.config.jwt_public_key, {
        algorithms: ['RS256'],
        audience: this.config.jwt_audience
      }) as JWTPayload;

      // Check if revoked
      if (revocationList.has(decoded.jti)) {
        throw new AuthError('token_revoked', 'Token has been revoked', 401);
      }

      // Check token type
      if (!allowRefresh && decoded.token_type === 'refresh') {
        throw new AuthError(
          'invalid_token_type',
          'Refresh token cannot be used for API access',
          401
        );
      }

      return decoded;
    } catch (error: any) {
      if (error instanceof AuthError) throw error;

      if (error.name === 'TokenExpiredError') {
        throw new AuthError(
          'token_expired',
          'Token has expired',
          401,
          { expired_at: error.expiredAt }
        );
      }

      if (error.name === 'JsonWebTokenError') {
        throw new AuthError('invalid_token', 'Invalid or tampered token', 401);
      }

      throw new AuthError(
        'token_verification_failed',
        'Failed to verify token',
        401
      );
    }
  }

  /**
   * Revoke token by JTI
   */
  revokeToken(jti: string, ttl: number = 2592000): void {
    revocationList.set(jti, Date.now() + ttl * 1000);
  }

  /**
   * Decode token without verification (use only for logging)
   */
  decodeWithoutVerification(token: string): Partial<JWTPayload> | null {
    try {
      return jwt.decode(token) as Partial<JWTPayload>;
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Session Management
// ============================================================================

export class SessionManager {
  constructor(private config: AuthConfig) {}

  /**
   * Create new session
   */
  createSession(
    user: User,
    ip_address: string,
    user_agent: string,
    remember_me: boolean = false
  ): UserSession {
    const expires_in = remember_me ? 30 * 24 * 60 * 60 : this.config.session_expires_in;
    const expires_at = new Date(Date.now() + expires_in * 1000);

    const session: UserSession = {
      id: crypto.randomUUID(),
      user_id: user.id,
      org_id: user.org_id,
      token_jti: crypto.randomUUID(),
      ip_address,
      user_agent,
      created_at: new Date(),
      expires_at,
      last_activity: new Date(),
      is_active: true
    };

    sessionStore.set(session.id, session);
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(session_id: string): UserSession | null {
    const session = sessionStore.get(session_id);
    if (!session) return null;

    // Check expiration
    if (new Date() > session.expires_at) {
      sessionStore.delete(session_id);
      return null;
    }

    return session;
  }

  /**
   * Update session activity
   */
  updateActivity(session_id: string): void {
    const session = sessionStore.get(session_id);
    if (session) {
      session.last_activity = new Date();
    }
  }

  /**
   * Invalidate session
   */
  invalidateSession(session_id: string): void {
    sessionStore.delete(session_id);
  }

  /**
   * Invalidate all user sessions (logout everywhere)
   */
  invalidateAllUserSessions(user_id: string): void {
    sessionStore.forEach((session, id) => {
      if (session.user_id === user_id) {
        sessionStore.delete(id);
      }
    });
  }

  /**
   * Get all active sessions for user
   */
  getUserSessions(user_id: string): UserSession[] {
    const sessions: UserSession[] = [];
    sessionStore.forEach(session => {
      if (session.user_id === user_id && session.is_active) {
        sessions.push(session);
      }
    });
    return sessions;
  }
}

// ============================================================================
// Two-Factor Authentication (TOTP)
// ============================================================================

export class TwoFactorManager {
  /**
   * Generate TOTP secret and QR code
   */
  async setupTOTP(user: User): Promise<TwoFactorSetup> {
    const secret = speakeasy.generateSecret({
      name: `Ledgr (${user.email})`,
      issuer: 'Ledgr',
      length: 32
    });

    const qr_code = await qrcode.toDataURL(secret.otpauth_url || '');

    // Generate 10 backup codes
    const backup_codes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    return {
      secret: secret.base32,
      qr_code,
      backup_codes
    };
  }

  /**
   * Verify TOTP code
   */
  verifyTOTP(secret: string, code: string, window: number = 2): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window
    });
  }

  /**
   * Verify backup code
   */
  verifyBackupCode(code: string, backup_codes: string[]): boolean {
    return backup_codes.includes(code.toUpperCase());
  }

  /**
   * Remove backup code after use
   */
  removeBackupCode(code: string, backup_codes: string[]): string[] {
    return backup_codes.filter(bc => bc !== code.toUpperCase());
  }
}

// ============================================================================
// Rate Limiting
// ============================================================================

export class RateLimiter {
  constructor(
    private max_attempts: number = 5,
    private window_seconds: number = 300
  ) {}

  /**
   * Record login attempt
   */
  recordAttempt(identifier: string): void {
    const now = Date.now();
    const existing = loginAttempts.get(identifier);

    if (!existing || now - existing.first_attempt > this.window_seconds * 1000) {
      loginAttempts.set(identifier, { count: 1, first_attempt: now });
    } else {
      existing.count++;
    }
  }

  /**
   * Check if identifier is rate limited
   */
  isRateLimited(identifier: string): boolean {
    const attempt = loginAttempts.get(identifier);
    if (!attempt) return false;

    const now = Date.now();
    const elapsed = now - attempt.first_attempt;

    if (elapsed > this.window_seconds * 1000) {
      loginAttempts.delete(identifier);
      return false;
    }

    return attempt.count >= this.max_attempts;
  }

  /**
   * Get remaining attempts
   */
  getRemainingAttempts(identifier: string): number {
    const attempt = loginAttempts.get(identifier);
    if (!attempt) return this.max_attempts;

    const now = Date.now();
    if (now - attempt.first_attempt > this.window_seconds * 1000) {
      loginAttempts.delete(identifier);
      return this.max_attempts;
    }

    return Math.max(0, this.max_attempts - attempt.count);
  }

  /**
   * Clear attempts for identifier
   */
  clearAttempts(identifier: string): void {
    loginAttempts.delete(identifier);
  }
}

// ============================================================================
// Security Event Logging
// ============================================================================

export class SecurityLogger {
  /**
   * Log security event
   */
  logEvent(event: Omit<SecurityEvent, 'id' | 'created_at'>): SecurityEvent {
    const securityEvent: SecurityEvent = {
      ...event,
      id: crypto.randomUUID(),
      created_at: new Date()
    };

    securityEvents.push(securityEvent);

    // In production: send to SIEM, log aggregation service
    if (event.severity === 'critical') {
      console.error('[CRITICAL]', securityEvent);
    }

    return securityEvent;
  }

  /**
   * Get events for user
   */
  getUserEvents(user_id: string, limit: number = 100): SecurityEvent[] {
    return securityEvents
      .filter(e => e.user_id === user_id)
      .slice(-limit);
  }

  /**
   * Get events for organization
   */
  getOrgEvents(org_id: string, limit: number = 100): SecurityEvent[] {
    return securityEvents
      .filter(e => e.org_id === org_id)
      .slice(-limit);
  }
}

// ============================================================================
// Main Authentication Service
// ============================================================================

export class AuthenticationService {
  passwordManager: PasswordManager;
  tokenManager: TokenManager;
  sessionManager: SessionManager;
  twoFactorManager: TwoFactorManager;
  rateLimiter: RateLimiter;
  securityLogger: SecurityLogger;

  constructor(config: Partial<AuthConfig> = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    this.passwordManager = new PasswordManager(finalConfig.bcrypt_rounds);
    this.tokenManager = new TokenManager(finalConfig);
    this.sessionManager = new SessionManager(finalConfig);
    this.twoFactorManager = new TwoFactorManager();
    this.rateLimiter = new RateLimiter(
      finalConfig.max_login_attempts,
      finalConfig.login_attempt_window
    );
    this.securityLogger = new SecurityLogger();
  }

  /**
   * Login user (primary authentication flow)
   * Returns tokens and session if successful
   */
  async login(
    user: User,
    request: LoginRequest,
    ip_address: string,
    user_agent: string,
    roles: string[],
    permissions: string[]
  ): Promise<LoginResponse> {
    const identifier = `${user.email}:${ip_address}`;

    // Check rate limiting
    if (this.rateLimiter.isRateLimited(identifier)) {
      this.securityLogger.logEvent({
        user_id: user.id,
        org_id: user.org_id,
        event_type: SecurityEventType.LOGIN_FAILURE,
        ip_address,
        user_agent,
        severity: 'warning',
        description: 'Login attempt rate limited'
      });

      throw new AuthError(
        'too_many_attempts',
        'Too many login attempts. Please try again later.',
        429,
        { retry_after: 300 }
      );
    }

    // Verify password
    const password_valid = await this.passwordManager.verify(
      request.password,
      user.password_hash
    );

    if (!password_valid) {
      this.rateLimiter.recordAttempt(identifier);
      this.securityLogger.logEvent({
        user_id: user.id,
        org_id: user.org_id,
        event_type: SecurityEventType.LOGIN_FAILURE,
        ip_address,
        user_agent,
        severity: 'warning',
        description: 'Invalid password'
      });

      throw new AuthError(
        'invalid_credentials',
        'Invalid email or password',
        401
      );
    }

    // Check 2FA if enabled
    if (user.two_factor_enabled) {
      if (!request.totp_code) {
        // Return challenge, not full login
        const challenge: TwoFactorChallenge = {
          session_token: crypto.randomUUID(),
          expires_in: 300,
          methods: ['totp', 'backup_code']
        };
        
        // Store session token temporarily for completion
        sessionStore.set(
          `2fa_${challenge.session_token}`,
          {
            id: challenge.session_token,
            user_id: user.id,
            org_id: user.org_id,
            token_jti: '',
            ip_address,
            user_agent,
            created_at: new Date(),
            expires_at: new Date(Date.now() + 300000),
            last_activity: new Date(),
            is_active: true
          }
        );

        throw new AuthError(
          'two_factor_required',
          '2FA verification required',
          403,
          { challenge }
        );
      }

      // Verify TOTP code
      const totp_valid = this.twoFactorManager.verifyTOTP(
        user.two_factor_secret || '',
        request.totp_code
      );

      if (!totp_valid) {
        this.rateLimiter.recordAttempt(identifier);
        throw new AuthError(
          'invalid_2fa_code',
          'Invalid 2FA code',
          401
        );
      }
    }

    // Create session
    const session = this.sessionManager.createSession(
      user,
      ip_address,
      user_agent,
      request.remember_me || false
    );

    // Generate tokens
    const access_token = this.tokenManager.generateAccessToken(
      user,
      roles,
      permissions
    );
    const refresh_token = this.tokenManager.generateRefreshToken(user);

    // Clear login attempts
    this.rateLimiter.clearAttempts(identifier);

    // Log successful login
    this.securityLogger.logEvent({
      user_id: user.id,
      org_id: user.org_id,
      event_type: SecurityEventType.LOGIN_SUCCESS,
      ip_address,
      user_agent,
      severity: 'info',
      description: `User logged in from ${ip_address}`
    });

    return {
      user: {
        ...user,
        password_hash: '' // Don't expose password hash
      },
      access_token,
      refresh_token,
      expires_in: 900
    };
  }

  /**
   * Logout user and invalidate sessions
   */
  logout(
    user_id: string,
    token_jti: string,
    ip_address: string,
    user_agent: string,
    logout_everywhere: boolean = false
  ): void {
    // Revoke token
    this.tokenManager.revokeToken(token_jti);

    // Invalidate sessions
    if (logout_everywhere) {
      this.sessionManager.invalidateAllUserSessions(user_id);
    }

    // Log logout
    this.securityLogger.logEvent({
      user_id,
      event_type: SecurityEventType.LOGOUT,
      ip_address,
      user_agent,
      severity: 'info',
      description: logout_everywhere ? 'Logged out from all devices' : 'Logged out'
    });
  }

  /**
   * Refresh access token
   */
  refreshAccessToken(
    refresh_token: string,
    roles: string[],
    permissions: string[],
    user: User
  ): TokenResponse {
    const decoded = this.tokenManager.verifyToken(refresh_token, true);

    if (decoded.token_type !== 'refresh') {
      throw new AuthError(
        'invalid_token_type',
        'Token is not a refresh token',
        401
      );
    }

    const new_access_token = this.tokenManager.generateAccessToken(
      user,
      roles,
      permissions
    );

    return {
      access_token: new_access_token,
      token_type: 'Bearer',
      expires_in: 900
    };
  }
}

export default AuthenticationService;
