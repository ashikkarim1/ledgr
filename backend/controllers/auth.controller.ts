/**
 * Authentication Controller
 * Handles signup, login, token refresh, and 2FA setup
 */

import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { generateToken, generateRefreshToken, verifyRefreshToken } from "../middleware/auth-middleware";
import { ApiErrors, asyncHandler } from "../middleware/error-handler";
import {
  ApiResponse,
  SignupResponse,
  LoginResponse,
  RefreshResponse,
  TwoFactorSetupResponse,
} from "../response-types";

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

  // Create user
  await createUser({
    user_id,
    workspace_id,
    email,
    password_hash,
    full_name,
    role: "admin", // First user is admin
  });

  // Create workspace
  await createWorkspace({
    workspace_id,
    name: workspace_name,
    industry: "general",
    country,
    created_by: user_id,
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
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
 * DATABASE FUNCTIONS (STUBS)
 * ==========================================
 * Replace with actual database calls
 */

async function findUserByEmail(email: string) {
  // TODO: Query database
  return null;
}

async function createUser(data: any) {
  // TODO: Insert into users table
}

async function createWorkspace(data: any) {
  // TODO: Insert into organizations table
}

async function updateUserLastLogin(userId: string) {
  // TODO: Update users.last_login
}

async function getUserById(userId: string) {
  // TODO: Query database
  return null;
}

async function enableTwoFactor(userId: string, secret: string, backupCodes: string[]) {
  // TODO: Update users table with 2FA settings
}

async function getUserPhone(userId: string) {
  // TODO: Query database
  return null;
}

async function sendTwoFactorSMS(phone: string) {
  // TODO: Send SMS via Twilio or similar
}
