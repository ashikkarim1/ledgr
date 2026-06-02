/**
 * Integrations Controller
 * Handles third-party integrations (QuickBooks, Xero, Banking APIs, etc.)
 */

import { Request, Response } from "express";
import { ApiErrors, asyncHandler } from "../middleware/error-handler.js";
import {
  ApiResponse,
  Integration,
  IntegrationConfig,
} from "../response-types.js";

/**
 * GET /v1/integrations
 * List available integrations
 */
export const listAvailableIntegrations = asyncHandler(async (req: Request, res: Response) => {
  // Get list of all available integrations
  const integrations = await getAvailableIntegrations();

  const response: ApiResponse<Integration[]> = {
    success: true,
    data: integrations,
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
 * POST /v1/integrations/:integration_type/connect
 * Initiate integration connection (OAuth flow)
 */
export const initiateConnection = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { integration_type } = req.params;
  const { workspace_id } = req.body;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id) {
    throw ApiErrors.invalidRequest("workspace_id is required");
  }

  // Verify access
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  // Verify user is workspace admin
  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id);
  if (userRole !== "admin") {
    throw ApiErrors.forbidden("Only workspace admins can connect integrations");
  }

  // Validate integration type
  const integration = await getIntegration(integration_type);
  if (!integration) {
    throw ApiErrors.notFound("Integration not found");
  }

  // Check if already connected
  const existing = await getWorkspaceIntegration(workspace_id, integration_type);
  if (existing && existing.status === "connected") {
    throw ApiErrors.conflict("Integration already connected");
  }

  // Generate OAuth state and store it
  const state = generateRandomString(32);
  const connection_id = generateId("conn");

  await storeConnectionState({
    connection_id,
    workspace_id,
    integration_type,
    state,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
  });

  // Get OAuth authorization URL
  const authUrl = getOAuthUrl(integration_type, state);

  const response: ApiResponse<any> = {
    success: true,
    data: {
      connection_id,
      auth_url: authUrl,
      expires_in: 900, // 15 minutes
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
 * POST /v1/integrations/:integration_type/callback
 * Handle OAuth callback
 */
export const handleCallback = asyncHandler(async (req: Request, res: Response) => {
  const { integration_type } = req.params;
  const { code, state } = req.query;

  if (!code || !state) {
    throw ApiErrors.invalidRequest("code and state are required");
  }

  // Verify state
  const connectionState = await getConnectionState(state as string);
  if (!connectionState) {
    throw ApiErrors.unauthorized("Invalid or expired state");
  }

  // Check if state is not expired
  if (new Date() > connectionState.expires_at) {
    await deleteConnectionState(state as string);
    throw ApiErrors.unauthorized("State expired");
  }

  // Exchange code for tokens
  const tokens = await exchangeOAuthCode(integration_type, code as string);

  // Create or update integration config
  const integration_id = generateId("int");
  const config: IntegrationConfig = {
    integration_id,
    workspace_id: connectionState.workspace_id,
    type: integration_type,
    status: "connected",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: tokens.expires_at,
    sync_enabled: true,
    last_synced_at: null,
    metadata: {
      account_name: tokens.account_name,
      account_id: tokens.account_id,
    },
    created_at: new Date(),
    updated_at: new Date(),
  };

  // Save integration
  await saveIntegration(config);

  // Clean up state
  await deleteConnectionState(state as string);

  // TODO: Trigger initial data sync

  const response: ApiResponse<Integration> = {
    success: true,
    data: {
      integration_id,
      type: integration_type,
      status: "connected",
      metadata: config.metadata,
      created_at: new Date().toISOString(),
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
 * GET /v1/integrations/:integration_type/status
 * Get integration status
 */
export const getIntegrationStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { integration_type } = req.params;
  const { workspace_id } = req.query;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id) {
    throw ApiErrors.invalidRequest("workspace_id is required");
  }

  // Verify access
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id as string);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  const integration = await getWorkspaceIntegration(workspace_id as string, integration_type);
  if (!integration) {
    throw ApiErrors.notFound("Integration not found");
  }

  // Check if tokens are expired and need refresh
  if (integration.token_expires_at && new Date() > integration.token_expires_at) {
    if (integration.refresh_token) {
      // Refresh tokens
      const newTokens = await refreshOAuthTokens(integration_type, integration.refresh_token);
      await updateIntegrationTokens(integration.integration_id, newTokens);
      integration.access_token = newTokens.access_token;
      integration.token_expires_at = newTokens.expires_at;
    }
  }

  const response: ApiResponse<Integration> = {
    success: true,
    data: integration,
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
 * DELETE /v1/integrations/:integration_type
 * Disconnect integration
 */
export const disconnectIntegration = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { integration_type } = req.params;
  const { workspace_id } = req.body;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id) {
    throw ApiErrors.invalidRequest("workspace_id is required");
  }

  // Verify access
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  // Verify user is workspace admin
  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id);
  if (userRole !== "admin") {
    throw ApiErrors.forbidden("Only workspace admins can disconnect integrations");
  }

  // Delete integration
  await deleteIntegration(workspace_id, integration_type);

  // TODO: Revoke OAuth tokens with provider

  res.status(204).send();
});

/**
 * ==========================================
 * HELPER FUNCTIONS
 * ==========================================
 */

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateRandomString(length: number): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

function getOAuthUrl(integrationType: string, state: string): string {
  // TODO: Generate OAuth URLs for each provider
  const baseUrls: any = {
    quickbooks: "https://quickbooks.intuit.com/oauth2",
    xero: "https://login.xero.com/oauth/authorize",
    stripe: "https://connect.stripe.com/oauth/authorize",
  };

  const baseUrl = baseUrls[integrationType] || "";
  const params = new URLSearchParams({
    state,
    client_id: process.env[`${integrationType.toUpperCase()}_CLIENT_ID`] || "",
    redirect_uri: `${process.env.API_URL}/v1/integrations/${integrationType}/callback`,
    response_type: "code",
    scope: getOAuthScopes(integrationType),
  });

  return `${baseUrl}?${params.toString()}`;
}

function getOAuthScopes(integrationType: string): string {
  const scopes: any = {
    quickbooks: "com.intuit.quickbooks.accounting",
    xero: "payroll offline_access",
    stripe: "read_write",
  };

  return scopes[integrationType] || "";
}

/**
 * ==========================================
 * DATABASE FUNCTIONS (STUBS)
 * ==========================================
 */

async function getAvailableIntegrations(): Promise<Integration[]> {
  // TODO: Query database
  return [];
}

async function userHasWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
  // TODO: Check workspace_members table
  return false;
}

async function getUserWorkspaceRole(userId: string, workspaceId: string): Promise<string | null> {
  // TODO: Query database
  return null;
}

async function getIntegration(integrationType: string): Promise<Integration | null> {
  // TODO: Query database
  return null;
}

async function getWorkspaceIntegration(
  workspaceId: string,
  integrationType: string
): Promise<Integration | null> {
  // TODO: Query database
  return null;
}

async function storeConnectionState(data: any): Promise<void> {
  // TODO: Store in cache or database
}

async function getConnectionState(state: string): Promise<any | null> {
  // TODO: Retrieve from cache or database
  return null;
}

async function deleteConnectionState(state: string): Promise<void> {
  // TODO: Delete from cache or database
}

async function exchangeOAuthCode(integrationType: string, code: string): Promise<any> {
  // TODO: Call OAuth provider API
  return {
    access_token: "token",
    refresh_token: "refresh",
    expires_at: new Date(),
    account_name: "Account",
    account_id: "acc_123",
  };
}

async function saveIntegration(config: IntegrationConfig): Promise<void> {
  // TODO: Save to integrations table
}

async function refreshOAuthTokens(integrationType: string, refreshToken: string): Promise<any> {
  // TODO: Call OAuth provider to refresh tokens
  return {
    access_token: "new_token",
    expires_at: new Date(),
  };
}

async function updateIntegrationTokens(integrationId: string, tokens: any): Promise<void> {
  // TODO: Update integrations table
}

async function deleteIntegration(workspaceId: string, integrationType: string): Promise<void> {
  // TODO: Delete from integrations table
}
