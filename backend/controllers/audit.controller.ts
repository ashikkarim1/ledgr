/**
 * Audit & Compliance Controller
 * Handles audit logs, compliance reports, and activity tracking
 */

import { Request, Response } from "express";
import { ApiErrors, asyncHandler } from "../middleware/error-handler.js";
import {
  ApiResponse,
  AuditLog,
  ComplianceReport,
} from "../response-types.js";

/**
 * GET /v1/audit/logs
 * Get audit logs for workspace
 */
export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const {
    workspace_id,
    action,
    user_id,
    resource_type,
    start_date,
    end_date,
    sort_by,
    sort_order,
  } = req.query;

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

  // Verify user is workspace admin
  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id as string);
  if (userRole !== "admin") {
    throw ApiErrors.forbidden("Only workspace admins can view audit logs");
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = (page - 1) * limit;

  // Build filters
  const filters: any = {};
  if (action) filters.action = action;
  if (user_id) filters.user_id = user_id;
  if (resource_type) filters.resource_type = resource_type;
  if (start_date) {
    try {
      filters.start_date = new Date(start_date as string);
    } catch {
      throw ApiErrors.validation("start_date", "Invalid date format");
    }
  }
  if (end_date) {
    try {
      filters.end_date = new Date(end_date as string);
    } catch {
      throw ApiErrors.validation("end_date", "Invalid date format");
    }
  }

  const sortOptions = {
    sortBy: (sort_by as string) || "timestamp",
    sortOrder: ((sort_order as string) || "desc") as "asc" | "desc",
  };

  const { logs, total } = await getWorkspaceAuditLogs(
    workspace_id as string,
    filters,
    sortOptions,
    limit,
    offset
  );

  const response: ApiResponse<AuditLog[]> = {
    success: true,
    data: logs,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
    errors: null,
  };

  res.json(response);
});

/**
 * GET /v1/audit/compliance-report
 * Generate compliance report
 */
export const getComplianceReport = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id, report_type, start_date, end_date } = req.query;

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

  // Verify user is workspace admin
  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id as string);
  if (userRole !== "admin") {
    throw ApiErrors.forbidden("Only workspace admins can generate compliance reports");
  }

  // Validate report type
  const validReportTypes = [
    "data-access",
    "security-events",
    "activity-summary",
    "user-actions",
    "financial-changes",
  ];

  const reportType = (report_type as string) || "activity-summary";
  if (!validReportTypes.includes(reportType)) {
    throw ApiErrors.validation("report_type", `Invalid report type. Must be one of: ${validReportTypes.join(", ")}`);
  }

  const startDate = start_date ? new Date(start_date as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
  const endDate = end_date ? new Date(end_date as string) : new Date();

  // Generate report
  const report = await generateComplianceReport(
    workspace_id as string,
    reportType,
    startDate,
    endDate
  );

  const response: ApiResponse<ComplianceReport> = {
    success: true,
    data: report,
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
 * GET /v1/audit/user-activity/:user_id
 * Get activity summary for a specific user
 */
export const getUserActivity = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { user_id } = req.params;
  const { workspace_id, days } = req.query;

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

  // Verify user is workspace admin
  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id as string);
  if (userRole !== "admin") {
    throw ApiErrors.forbidden("Only workspace admins can view user activity");
  }

  const lookbackDays = parseInt(days as string) || 30;
  const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Get user activity
  const activity = await getUserActivitySummary(
    workspace_id as string,
    user_id,
    startDate
  );

  const response: ApiResponse<any> = {
    success: true,
    data: activity,
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
 * POST /v1/audit/export-logs
 * Export audit logs as CSV or JSON
 */
export const exportAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id, format, start_date, end_date } = req.body;

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
    throw ApiErrors.forbidden("Only workspace admins can export logs");
  }

  // Validate format
  if (!["csv", "json"].includes(format || "json")) {
    throw ApiErrors.validation("format", "Format must be csv or json");
  }

  const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const endDate = end_date ? new Date(end_date) : new Date();

  // Get logs
  const { logs } = await getWorkspaceAuditLogs(
    workspace_id,
    { start_date: startDate, end_date: endDate },
    { sortBy: "timestamp", sortOrder: "asc" },
    10000,
    0
  );

  // Generate file
  const fileContent = format === "csv" ? convertLogsToCSV(logs) : JSON.stringify(logs, null, 2);
  const fileName = `audit-logs-${new Date().toISOString().split("T")[0]}.${format}`;

  // TODO: Upload to cloud storage or return as download

  const response: ApiResponse<any> = {
    success: true,
    data: {
      file_name: fileName,
      format,
      record_count: logs.length,
      download_url: `https://storage.ledgr.ai/${workspace_id}/${fileName}`,
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
 * ==========================================
 * HELPER FUNCTIONS
 * ==========================================
 */

function convertLogsToCSV(logs: AuditLog[]): string {
  if (logs.length === 0) return "";

  const headers = Object.keys(logs[0]).join(",");
  const rows = logs.map((log: any) =>
    Object.values(log)
      .map((val) => {
        if (typeof val === "string" && val.includes(",")) {
          return `"${val}"`;
        }
        return val;
      })
      .join(",")
  );

  return [headers, ...rows].join("\n");
}

/**
 * ==========================================
 * DATABASE FUNCTIONS (STUBS)
 * ==========================================
 */

async function userHasWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
  // TODO: Check workspace_members table
  return false;
}

async function getUserWorkspaceRole(userId: string, workspaceId: string): Promise<string | null> {
  // TODO: Query database
  return null;
}

async function getWorkspaceAuditLogs(
  workspaceId: string,
  filters: any,
  sortOptions: any,
  limit: number,
  offset: number
): Promise<{ logs: AuditLog[]; total: number }> {
  // TODO: Query database
  return { logs: [], total: 0 };
}

async function generateComplianceReport(
  workspaceId: string,
  reportType: string,
  startDate: Date,
  endDate: Date
): Promise<ComplianceReport | null> {
  // TODO: Generate report from audit logs
  return null;
}

async function getUserActivitySummary(
  workspaceId: string,
  userId: string,
  startDate: Date
): Promise<any> {
  // TODO: Get user activity from audit logs
  return {};
}
