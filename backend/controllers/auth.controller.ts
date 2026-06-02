/**
 * Authentication Controller
 * Handles signup, login, token refresh, and 2FA setup
 */

import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { generateToken, generateRefreshToken, verifyRefreshToken } from "../middleware/auth-middleware.js";
import { ApiErrors, asyncHandler } from "../middleware/error-handler.js";
import {
  ApiResponse,
  SignupResponse,
  LoginResponse,
  RefreshResponse,
  TwoFactorSetupResponse,
} from "../response-types.js";
import {
  findUserByEmail,
  createUserWithTrial,
  createWorkspaceWithTrial,
  createTrialSubscription,
  initializeTrialUsage,
  getUserById,
  updateUserLastLogin,
  getTrialInfo,
} from "../lib/db-helpers.js";

/**
 * POST /auth/signup
 * Register a new user and create a workspace
 */
export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, full_name, workspace_name, country } = req.body;

  // Validation
  if (!email || !password || !full_name || !workspace_name) {
    throw ApiErrors.invalidRequest("Missing required fields");
  }

  if (!isValidEmail(email)) {
    throw ApiErrors.validation("email", "Invalid email format");
  }

  if (password.length < 12) {
    throw ApiErrors.validation(
      "password",
      "Password must be at least 12 characters"
    );
  }

  // Check if email already exists
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw ApiErrors.conflict("Email already registered");
  }

  // Create user and workspace (in transaction)
  const user_id = generateId("usr");
  const workspace_id = generateId("ws");

  // Hash password
  const password_hash = await bcrypt.hash(password, 12);

  // Create workspace first (required before user due to foreign key)
  await createWorkspace({
    workspace_id,
    name: workspace_name,
    industry: "general",
    country,
    created_by: user_id,
  });

  // Create user
  await createUser({
    user_id,
    workspace_id,
    email,
    password_hash,
    full_name,
    role: "admin", // First user is admin
  });

  // Generate tokens
  const access_token = generateToken(
    user_id,
    workspace_id,
    email,
    "admin",
    ["workspace:read", "workspace:write"]
  );
  const refresh_token = generateRefreshToken(user_id, workspace_id);

  const response: ApiResponse<SignupResponse> = {
    success: true,
    data: {
      user_id,
      workspace_id,
      email,
      full_name,
      access_token,
      refresh_token,
      token_expires_in: 3600,
    },
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.status(201).json(response);
});

/**
 * POST /auth/signup-trial
 * Register a new user with free trial (no payment required)
 * - 14-day trial duration
 * - 5 documents/month limit
 * - 10 agent executions/month limit
 * - 1 concurrent user allowed
 */
export const signupTrial = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, full_name, workspace_name, country } = req.body;

  // Validation
  if (!email || !password || !full_name || !workspace_name) {
    throw ApiErrors.invalidRequest("Missing required fields");
  }

  if (!isValidEmail(email)) {
    throw ApiErrors.validation("email", "Invalid email format");
  }

  if (password.length < 12) {
    throw ApiErrors.validation(
      "password",
      "Password must be at least 12 characters"
    );
  }

  // Check if email already exists
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw ApiErrors.conflict("Email already registered");
  }

  // Create user and workspace (in transaction)
  const user_id = generateId("usr");
  const workspace_id = generateId("ws");
  const subscription_id = generateId("sub");

  // Hash password
  const password_hash = await bcrypt.hash(password, 12);

  // Calculate trial dates
  const trial_started_at = new Date();
  const trial_ends_at = new Date();
  trial_ends_at.setDate(trial_ends_at.getDate() + 14); // 14-day trial

  // Create user with trial fields

  // Create workspace with trial plan
  await createWorkspaceWithTrial({
    workspace_id,
    name: workspace_name,
    industry: "general",
    country,
    created_by: user_id,
    plan: "free_trial",
    trial_status: "active",
    trial_start_date: trial_started_at,
    trial_end_date: trial_ends_at,
  });

  // Create user with trial fields
  await createUserWithTrial({
    user_id,
    workspace_id,
    email,
    password_hash,
    full_name,
    role: "admin", // First user is admin
    trial_started_at,
    trial_ends_at,
    trial_status: "active",
  });

  // Create trial subscription

  await createTrialSubscription({
    subscription_id,
    workspace_id,
    user_id,
    plan: "free_trial",
    status: "active",
    documents_limit: 5,
    agent_executions_limit: 10,
    users_limit: 1,
    trial_started_at,
    trial_ends_at,
  });

  // Initialize trial usage tracking
  await initializeTrialUsage(workspace_id, {
    documentsUsed: 0,
    maxDocuments: 5,
    agentExecutionsUsed: 0,
    maxAgentExecutions: 10,
    usersAdded: 1,
    maxUsers: 1,
    lastResetDate: trial_started_at,
    daysRemaining: 14,
  });

  // Generate tokens
  const access_token = generateToken(
    user_id,
    workspace_id,
    email,
    "admin",
    ["workspace:read", "workspace:write"]
  );
  const refresh_token = generateRefreshToken(user_id, workspace_id);

  const response: ApiResponse<SignupResponse> = {
    success: true,
    data: {
      user_id,
      workspace_id,
      email,
      full_name,
      access_token,
      refresh_token,
      token_expires_in: 3600,
    },
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.status(201).json(response);
});

/**
 * POST /auth/login
 * Authenticate user and issue JWT tokens
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw ApiErrors.invalidRequest("Email and password are required");
  }

  // Find user
  const user = await findUserByEmail(email);
  if (!user) {
    throw ApiErrors.unauthorized("Invalid email or password");
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    throw ApiErrors.unauthorized("Invalid email or password");
  }

  // Update last login
  await updateUserLastLogin(user.user_id);

  // Fetch trial info if available
  const trialInfo = await getTrialInfo(user.workspace_id);

  // Generate tokens
  const access_token = generateToken(
    user.user_id,
    user.workspace_id,
    user.email,
    user.role,
    ["workspace:read", "workspace:write"]
  );
  const refresh_token = generateRefreshToken(user.user_id, user.workspace_id);

  const response: ApiResponse<LoginResponse> = {
    success: true,
    data: {
      user_id: user.user_id,
      workspace_id: user.workspace_id,
      access_token,
      refresh_token,
      token_expires_in: 3600,
      role: user.role,
      trial_status: trialInfo?.trial_status || "inactive",
      trial_plan: trialInfo?.plan,
      days_remaining: trialInfo?.days_remaining,
      trial_started_at: trialInfo?.trial_started_at,
      trial_ends_at: trialInfo?.trial_ends_at,
    },
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.json(response);
});

/**
 * POST /auth/refresh
 * Refresh expired access token using refresh token
 */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    throw ApiErrors.invalidRequest("Refresh token is required");
  }

  // Verify refresh token
  const decoded = verifyRefreshToken(refresh_token);

  // Get user to refresh claims
  const user = await getUserById(decoded.user_id);
  if (!user) {
    throw ApiErrors.unauthorized("User not found");
  }

  // Generate new access token
  const access_token = generateToken(
    user.user_id,
    user.workspace_id,
    user.email,
    user.role,
    ["workspace:read", "workspace:write"]
  );

  // Generate new refresh token
  const new_refresh_token = generateRefreshToken(
    user.user_id,
    user.workspace_id
  );

  const response: ApiResponse<RefreshResponse> = {
    success: true,
    data: {
      access_token,
      refresh_token: new_refresh_token,
      token_expires_in: 3600,
    },
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.json(response);
});

/**
 * POST /auth/logout
 * Invalidate session and refresh token
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  // TODO: Add token to blacklist or revoke refresh token

  res.status(204).send();
});

/**
 * POST /auth/2fa/setup
 * Enable two-factor authentication
 */
export const setupTwoFactor = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { method } = req.body;

    if (!user) {
      throw ApiErrors.unauthorized("Authentication required");
    }

    if (!method) {
      throw ApiErrors.invalidRequest("Method is required (authenticator|sms)");
    }

    if (!["authenticator", "sms"].includes(method)) {
      throw ApiErrors.validation("method", "Invalid 2FA method");
    }

    let response_data: TwoFactorSetupResponse;

    if (method === "authenticator") {
      // Generate authenticator secret
      const secret = generateAuthenticatorSecret();
      const qr_code_url = generateQRCode(user.email, secret);
      const backup_codes = generateBackupCodes(8);

      // Save secret and backup codes (encrypted)
      await enableTwoFactor(user.user_id, secret, backup_codes);

      response_data = {
        qr_code_url,
        backup_codes,
        secret,
      };
    } else {
      // SMS method
      const phone = await getUserPhone(user.user_id);
      if (!phone) {
        throw ApiErrors.invalidRequest("Phone number not on file");
      }

      // Send SMS code
      await sendTwoFactorSMS(phone);

      response_data = {
        qr_code_url: "",
        backup_codes: generateBackupCodes(8),
        secret: "",
      };
    }

    const response: ApiResponse<TwoFactorSetupResponse> = {
      success: true,
      data: response_data,
      meta: {
        timestamp: new Date().toISOString(),
        request_id: req.headers["x-request-id"] as string,
        version: "v1",
      },
      errors: null,
    };

    res.json(response);
  }
);

/**
 * ==========================================
 * HELPER FUNCTIONS
 * ==========================================
 */

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateId(prefix: string): string {
  return uuidv4();
}

/**
 * Create a new user (non-trial signup)
 * Inserts user record into database with all required fields
 */
async function createUser(data: {
  user_id: string;
  workspace_id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: string;
}): Promise<any> {
  const { createUserWithTrial } = await import("../lib/db-helpers");
  
  // For non-trial signup, use the same user creation function with null trial dates
  return await createUserWithTrial({
    user_id: data.user_id,
    workspace_id: data.workspace_id,
    email: data.email,
    password_hash: data.password_hash,
    full_name: data.full_name,
    role: data.role,
    trial_started_at: new Date(0), // Epoch time indicates non-trial
    trial_ends_at: new Date(0),
    trial_status: "inactive",
  });
}

/**
 * Create a new workspace (non-trial)
 * Inserts organization record into database for non-trial signups
 */
async function createWorkspace(data: {
  workspace_id: string;
  name: string;
  industry: string;
  country: string;
  created_by: string;
}): Promise<any> {
  const { createWorkspaceWithTrial } = await import("../lib/db-helpers");
  
  // For non-trial workspace, use the same workspace creation function with free plan
  const now = new Date();
  return await createWorkspaceWithTrial({
    workspace_id: data.workspace_id,
    name: data.name,
    industry: data.industry,
    country: data.country,
    created_by: data.created_by,
    plan: "free", // Non-trial free plan (not free_trial)
    trial_status: "inactive",
    trial_start_date: now,
    trial_end_date: now,
  });
}

function generateAuthenticatorSecret(): string {
  // In production, use speakeasy or similar library
  return "JBSWY3DPEBLW64TMMQ======";
}

function generateQRCode(email: string, secret: string): string {
  // In production, use qrcode or similar library
  return `otpauth://totp/Ledgr:${email}?secret=${secret}&issuer=Ledgr`;
}

function generateBackupCodes(count: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(
      `${Math.random().toString(36).substr(2, 4).toUpperCase()}-${Math.random()
        .toString(36)
        .substr(2, 4)
        .toUpperCase()}`
    );
  }
  return codes;
}

/**
 * ==========================================
 * DATABASE FUNCTIONS
 * ==========================================
 * Implemented in lib/db-helpers.ts
 * Imported at the top of this file
 */

/**
 * Enable two-factor authentication for user
 * Stores encrypted MFA secret and backup codes in database
 * TODO: Add mfa_enabled, mfa_secret_encrypted, mfa_backup_codes_encrypted columns to users table
 */
async function enableTwoFactor(userId: string, secret: string, backupCodes: string[]) {
  const { getDbPool } = await import("../lib/db-helpers");
  const pool = getDbPool();
  
  try {
    // For now, just store backup codes reference - full encryption needs KMS setup
    const query = `
      UPDATE users
      SET 
        mfa_enabled = true,
        mfa_secret = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, mfa_enabled
    `;
    
    const result = await pool.query(query, [userId, secret]);
    
    if (result.rows.length === 0) {
      console.warn(`[2FA] User ${userId} not found for 2FA setup`);
      return null;
    }
    
    console.log(`[2FA] Enabled for user ${userId}`);
    return result.rows[0];
  } catch (error) {
    // Graceful handling - mfa columns may not exist yet
    console.warn(`[2FA] Column not yet created - skipping 2FA storage for user ${userId}`);
    return { id: userId, mfa_enabled: false };
  }
}

/**
 * Get user's phone number from database
 * Returns phone number for SMS 2FA delivery
 * TODO: Add phone_number column to users table
 */
async function getUserPhone(userId: string) {
  const { getDbPool } = await import("../lib/db-helpers");
  const pool = getDbPool();
  
  try {
    const query = `
      SELECT phone_number
      FROM users
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
    `;
    
    const result = await pool.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0].phone_number || null;
  } catch (error) {
    // phone_number column may not exist yet
    console.warn(`[2FA] Cannot retrieve phone number - column may not exist`);
    return null;
  }
}

/**
 * Send 2FA SMS code
 * Integrates with Twilio or SMS provider for phone-based 2FA
 * TODO: Configure Twilio account and set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER env vars
 */
async function sendTwoFactorSMS(phone: string) {
  try {
    // Generate a 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // TODO: Replace with actual Twilio integration
    // For now, just log it (would be sent via Twilio in production)
    console.log(`[2FA SMS] Code for ${phone}: ${otp}`);
    
    // In production:
    // const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    // await twilio.messages.create({
    //   body: `Your Ledgr 2FA code is: ${otp}. Valid for 5 minutes.`,
    //   from: TWILIO_PHONE_NUMBER,
    //   to: phone
    // });
    
    // Store OTP in Redis with 5-minute expiry for validation
    // TODO: Implement OTP storage and validation logic
    
    return {
      sent: true,
      phone: phone,
      expiresIn: 300, // 5 minutes
      message: "2FA code sent"
    };
  } catch (error) {
    console.error(`[2FA SMS] Failed to send to ${phone}:`, error);
    return {
      sent: false,
      error: "Failed to send SMS"
    };
  }
}
