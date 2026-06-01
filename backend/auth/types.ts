/**
 * Ledgr Authentication & Authorization Types
 * Complete TypeScript type definitions for auth module
 */

// ============================================================================
// JWT & Token Types
// ============================================================================

export interface JWTPayload {
  // Standard JWT claims
  iss: string; // Issuer
  sub: string; // Subject (org:orgId:user:userId)
  aud: string; // Audience
  exp: number; // Expiration time
  iat: number; // Issued at
  jti: string; // JWT ID (unique token identifier)
  
  // Ledgr-specific claims
  org_id: string;
  user_id: string;
  email: string;
  roles: string[]; // Array of role identifiers
  entity_ids?: string[]; // Array of entity IDs user can access
  permissions?: string[]; // Flattened list of permissions
  scope?: string[]; // OAuth 2.0 scopes
  token_type: 'access' | 'refresh'; // Token type
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: 'Bearer';
  expires_in: number; // Seconds
  scope?: string;
  error?: string;
}

export interface TokenMetadata {
  jti: string;
  issued_at: number;
  expires_at: number;
  last_refreshed?: number;
  ip_address?: string;
  user_agent?: string;
}

// ============================================================================
// User & Authentication Types
// ============================================================================

export interface User {
  id: string;
  org_id: string;
  email: string;
  password_hash: string; // bcrypt hash
  display_name: string;
  avatar_url?: string;
  is_active: boolean;
  is_email_verified: boolean;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
  settings?: UserSettings;
  two_factor_enabled: boolean;
  two_factor_secret?: string; // TOTP secret (encrypted)
  // Trial-related fields
  trial_started_at?: Date;
  trial_ends_at?: Date;
  trial_status?: 'active' | 'expired' | 'upgraded' | 'cancelled';
}

export interface UserSettings {
  language: string;
  timezone: string;
  notifications_enabled: boolean;
  two_factor_method?: 'totp' | 'sms' | 'email';
}

export interface UserSession {
  id: string;
  user_id: string;
  org_id: string;
  token_jti: string; // Reference to JWT JTI
  refresh_token_jti?: string;
  ip_address: string;
  user_agent: string;
  created_at: Date;
  expires_at: Date;
  last_activity: Date;
  is_active: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  remember_me?: boolean; // Extends session
  totp_code?: string; // 2FA code
}

export interface LoginResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  requires_2fa?: boolean; // If true, need to verify TOTP
}

export interface RegistrationRequest {
  email: string;
  password: string;
  display_name: string;
  org_id: string;
  invite_token?: string; // For invited users
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

// ============================================================================
// Role & Permission Types
// ============================================================================

export type RoleType =
  | 'client_admin'
  | 'accountant'
  | 'cfo'
  | 'agent_manager'
  | 'support_escalation'
  | 'viewer';

export interface Role {
  id: string;
  org_id: string;
  name: string; // Human-readable name
  slug: RoleType; // Unique identifier
  description: string;
  permissions: string[]; // Array of permission strings
  is_built_in: boolean; // True for system roles
  created_at: Date;
  updated_at: Date;
}

export interface Permission {
  id: string;
  name: string;
  slug: string; // e.g., 'read:financials', 'manage:agents'
  description: string;
  category: PermissionCategory;
  scope?: string[]; // e.g., ['team', 'organization']
}

export enum PermissionCategory {
  USER_MANAGEMENT = 'user_management',
  TEAM_MANAGEMENT = 'team_management',
  FINANCIALS = 'financials',
  AGENTS = 'agents',
  INTEGRATIONS = 'integrations',
  BILLING = 'billing',
  ADMIN = 'admin'
}

export interface UserRole {
  id: string;
  user_id: string;
  org_id: string;
  role_id: string;
  assigned_at: Date;
  assigned_by: string; // User ID of admin who assigned
  expires_at?: Date; // Optional role expiration
}

// ============================================================================
// Authorization Context
// ============================================================================

export interface AuthContext {
  user_id: string;
  org_id: string;
  email: string;
  roles: string[]; // Array of role slugs
  permissions: string[]; // Flattened permissions from all roles
  entity_ids?: string[]; // Entities user can access
  token_jti: string;
  issued_at: number;
  expires_at: number;
  scopes: string[];
}

export interface AuthorizationCheckOptions {
  require_all?: boolean; // Require ALL permissions (default: ANY)
  require_role?: string; // Require specific role
  require_scope?: string[]; // Require specific OAuth scopes
  org_context?: boolean; // Validate org_id matches
}

// ============================================================================
// 2FA Types
// ============================================================================

export interface TwoFactorSetup {
  secret: string; // Base32-encoded TOTP secret
  qr_code: string; // QR code data URL
  backup_codes: string[]; // One-time recovery codes
}

export interface VerifyTwoFactorRequest {
  user_id: string;
  code: string; // 6-digit TOTP code
}

export interface TwoFactorChallenge {
  session_token: string; // Temporary token to complete login
  expires_in: number;
  methods: ('totp' | 'sms' | 'email')[];
}

// ============================================================================
// OAuth Types
// ============================================================================

export interface OAuthProvider {
  id: string; // 'google', 'microsoft', etc.
  name: string;
  client_id: string;
  client_secret: string;
  is_enabled: boolean;
  scope: string[];
}

export interface OAuthCallback {
  provider: string;
  code: string;
  state: string;
  redirect_uri: string;
}

export interface OAuthUserInfo {
  provider_id: string;
  provider: string;
  email: string;
  display_name: string;
  picture_url?: string;
}

// ============================================================================
// Rate Limiting & Security
// ============================================================================

export interface RateLimitOptions {
  max_attempts: number;
  window_seconds: number;
  backoff_multiplier?: number; // Exponential backoff
}

export interface LoginAttempt {
  user_email: string;
  ip_address: string;
  timestamp: Date;
  success: boolean;
  reason?: string; // 'invalid_password', 'user_not_found', etc.
}

export interface SecurityEvent {
  id: string;
  user_id?: string;
  org_id?: string;
  event_type: SecurityEventType;
  ip_address: string;
  user_agent: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

export enum SecurityEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  TOKEN_REFRESH = 'token_refresh',
  PERMISSION_DENIED = 'permission_denied',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  LOGOUT = 'logout',
  SESSION_EXPIRED = 'session_expired',
  IP_CHANGE = 'ip_change',
  PASSWORD_CHANGE = 'password_change',
  TWO_FACTOR_ENABLED = 'two_factor_enabled'
}

// ============================================================================
// Error Types
// ============================================================================

export class AuthError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status_code: number = 401,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthErrorResponse {
  error: string; // Error code
  message: string;
  status_code: number;
  details?: Record<string, any>;
  timestamp: string;
}

// ============================================================================
// Request Context (Express middleware)
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      user?: AuthContext;
      auth_token?: JWTPayload;
      session_id?: string;
    }
  }
}

// ============================================================================
// Permission Scope Types
// ============================================================================

export interface PermissionScope {
  category: PermissionCategory;
  resources: string[]; // e.g., ['team', 'organization', 'document']
  actions: string[]; // e.g., ['read', 'write', 'delete']
}

export interface EntityAccessControl {
  entity_type: string; // 'team', 'project', 'document'
  entity_id: string;
  access_level: 'view' | 'edit' | 'admin' | 'owner';
  granted_by: string; // User ID of grantor
  granted_at: Date;
  expires_at?: Date;
}
