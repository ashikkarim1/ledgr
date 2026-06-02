/**
 * Workspaces Controller
 * Handles workspace creation, retrieval, update, and member management
 */

import { Request, Response } from "express";
import { ApiErrors, asyncHandler } from "../middleware/error-handler.js";
import {
  ApiResponse,
  Workspace,
  WorkspaceDetails,
  WorkspaceMember,
} from "../response-types.js";
import { checkTrialUserLimit, getTrialInfo } from "../lib/db-helpers.js";

/**
 * POST /v1/workspaces
 * Create a new workspace
 */
export const createWorkspace = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, industry, country, currency, fiscal_year_start } = req.body;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  // Validation
  if (!name || name.length < 3 || name.length > 100) {
    throw ApiErrors.validation("name", "Workspace name must be 3-100 characters");
  }

  if (!industry) {
    throw ApiErrors.validation("industry", "Industry is required");
  }

  // Check workspace limit for user's plan
  const workspaceCount = await getUserWorkspaceCount(user.user_id);
  const planLimits = {
    free: 1,
    professional: 5,
    enterprise: Infinity,
  };

  const userPlan = await getUserPlan(user.user_id);
  if (workspaceCount >= planLimits[userPlan]) {
    throw ApiErrors.conflict("Workspace limit reached for your plan");
  }

  const workspace_id = generateId("ws");

  // Create workspace
  await insertWorkspace({
    workspace_id,
    name,
    industry,
    country,
    currency: currency || "AED",
    fiscal_year_start: fiscal_year_start || "01-01",
    created_by: user.user_id,
    created_at: new Date(),
  });

  // Add user as admin
  await addWorkspaceMember(workspace_id, user.user_id, "admin");

  const response: ApiResponse<Workspace> = {
    success: true,
    data: {
      workspace_id,
      name,
      industry,
      country,
      currency: currency || "AED",
      created_at: new Date().toISOString(),
      created_by: user.user_id,
      role: "admin",
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
 * GET /v1/workspaces
 * List all workspaces for authenticated user
 */
export const listWorkspaces = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const offset = (page - 1) * limit;

  // Get user's workspaces
  const { workspaces, total } = await getUserWorkspaces(user.user_id, limit, offset);

  const response: ApiResponse<Workspace[]> = {
    success: true,
    data: workspaces,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
      pagination: {
        page,
        limit,
        total,
        has_more: offset + limit < total,
      },
    },
    errors: null,
  };

  res.json(response);
});

/**
 * GET /v1/workspaces/:workspace_id
 * Get workspace details
 */
export const getWorkspace = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id } = req.params;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  // Verify user has access to workspace
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  const workspace = await fetchWorkspaceDetails(workspace_id);
  if (!workspace) {
    throw ApiErrors.notFound("Workspace not found");
  }

  // Get member count
  const memberCount = await getWorkspaceMemberCount(workspace_id);

  // Get usage stats
  const stats = await getWorkspaceStats(workspace_id);

  const response: ApiResponse<WorkspaceDetails> = {
    success: true,
    data: {
      ...workspace,
      members_count: memberCount,
      stats,
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
 * PATCH /v1/workspaces/:workspace_id
 * Update workspace settings
 */
export const updateWorkspace = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id } = req.params;
  const { name, industry, currency, fiscal_year_start } = req.body;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  // Verify user is workspace admin
  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id);
  if (userRole !== "admin") {
    throw ApiErrors.forbidden("Only workspace admins can update settings");
  }

  // Get current workspace
  const workspace = await fetchWorkspaceDetails(workspace_id);
  if (!workspace) {
    throw ApiErrors.notFound("Workspace not found");
  }

  // Validate updates
  if (name && (name.length < 3 || name.length > 100)) {
    throw ApiErrors.validation("name", "Workspace name must be 3-100 characters");
  }

  // Update workspace
  await updateWorkspaceData(workspace_id, {
    name: name || workspace.name,
    industry: industry || workspace.industry,
    currency: currency || workspace.currency,
    fiscal_year_start: fiscal_year_start || workspace.fiscal_year_start,
    updated_at: new Date(),
  });

  const updated = await fetchWorkspaceDetails(workspace_id);

  const response: ApiResponse<Workspace> = {
    success: true,
    data: updated,
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
 * POST /v1/workspaces/:workspace_id/members
 * Invite a member to workspace
 */
export const inviteMember = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id } = req.params;
  const { email, role } = req.body;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!email || !role) {
    throw ApiErrors.invalidRequest("Email and role are required");
  }

  if (!["admin", "accountant", "viewer"].includes(role)) {
    throw ApiErrors.validation("role", "Invalid role");
  }

  // Check trial user limit BEFORE permission check
  const trialInfo = await getTrialInfo(workspace_id);
  if (trialInfo && trialInfo.plan === "free_trial") {
    const userLimitCheck = await checkTrialUserLimit(workspace_id);
    if (!userLimitCheck.allowed) {
      throw ApiErrors.conflict(
        `User limit exceeded (${userLimitCheck.current}/${userLimitCheck.limit} concurrent user for free trial)`
      );
    }
  }

  // Verify user is workspace admin (after trial check)
  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id);
  if (userRole !== "admin") {
    throw ApiErrors.forbidden("Only workspace admins can invite members");
  }

  // Check if user exists
  let targetUser = await findUserByEmail(email);

  // If user doesn't exist, create invitation
  if (!targetUser) {
    const invitation_id = generateId("inv");
    await createInvitation({
      invitation_id,
      workspace_id,
      email,
      role,
      invited_by: user.user_id,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // TODO: Send invitation email

    const response: ApiResponse<any> = {
      success: true,
      data: {
        invitation_id,
        email,
        role,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        request_id: req.headers["x-request-id"] as string,
        version: "v1",
      },
      errors: null,
    };

    return res.status(201).json(response);
  }

  // Add existing user to workspace
  const isAlreadyMember = await userIsMember(targetUser.user_id, workspace_id);
  if (isAlreadyMember) {
    throw ApiErrors.conflict("User is already a member of this workspace");
  }

  await addWorkspaceMember(workspace_id, targetUser.user_id, role);

  const response: ApiResponse<WorkspaceMember> = {
    success: true,
    data: {
      user_id: targetUser.user_id,
      email: targetUser.email,
      full_name: targetUser.full_name,
      role,
      joined_at: new Date().toISOString(),
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
 * GET /v1/workspaces/:workspace_id/members
 * List workspace members
 */
export const listMembers = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id } = req.params;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  // Verify user has access to workspace
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const offset = (page - 1) * limit;

  const { members, total } = await getWorkspaceMembers(workspace_id, limit, offset);

  const response: ApiResponse<WorkspaceMember[]> = {
    success: true,
    data: members,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
      pagination: {
        page,
        limit,
        total,
        has_more: offset + limit < total,
      },
    },
    errors: null,
  };

  res.json(response);
});

/**
 * ==========================================
 * HELPER FUNCTIONS
 * ==========================================
 */

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * ==========================================
 * DATABASE FUNCTIONS (STUBS)
 * ==========================================
 */

async function getUserWorkspaceCount(userId: string): Promise<number> {
  // TODO: Query database
  return 0;
}

async function getUserPlan(userId: string): Promise<"free" | "professional" | "enterprise"> {
  // TODO: Query database
  return "free";
}

async function insertWorkspace(data: any): Promise<void> {
  // TODO: Insert into workspaces table
}

async function addWorkspaceMember(workspaceId: string, userId: string, role: string): Promise<void> {
  // TODO: Insert into workspace_members table
}

async function getUserWorkspaces(
  userId: string,
  limit: number,
  offset: number
): Promise<{ workspaces: Workspace[]; total: number }> {
  // TODO: Query database
  return { workspaces: [], total: 0 };
}

async function userHasWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
  // TODO: Check workspace_members table
  return false;
}

async function fetchWorkspaceDetails(workspaceId: string): Promise<WorkspaceDetails | null> {
  // TODO: Query database
  return null;
}

async function getWorkspaceMemberCount(workspaceId: string): Promise<number> {
  // TODO: Query database
  return 0;
}

async function getWorkspaceStats(workspaceId: string): Promise<any> {
  // TODO: Calculate stats from database
  return {};
}

async function getUserWorkspaceRole(userId: string, workspaceId: string): Promise<string | null> {
  // TODO: Query database
  return null;
}

async function updateWorkspaceData(workspaceId: string, data: any): Promise<void> {
  // TODO: Update workspaces table
}

async function findUserByEmail(email: string) {
  // TODO: Query database
  return null;
}

async function createInvitation(data: any): Promise<void> {
  // TODO: Insert into invitations table
}

async function userIsMember(userId: string, workspaceId: string): Promise<boolean> {
  // TODO: Check workspace_members table
  return false;
}

async function getWorkspaceMembers(
  workspaceId: string,
  limit: number,
  offset: number
): Promise<{ members: WorkspaceMember[]; total: number }> {
  // TODO: Query database
  return { members: [], total: 0 };
}
