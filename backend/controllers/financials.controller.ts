/**
 * Financial Data Controller
 * Handles dashboard data, accounts, transactions, and financial reporting
 */

import { Request, Response } from "express";
import { ApiErrors, asyncHandler } from "../middleware/error-handler";
import {
  ApiResponse,
  FinancialDashboard,
  ChartOfAccountsItem,
  Transaction,
} from "../response-types";

/**
 * GET /v1/financials/dashboard
 * Get financial dashboard summary
 */
export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const workspace_id = (req as any).workspace_id || req.query.workspace_id;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id) {
    throw ApiErrors.invalidRequest("Missing workspace or user context");
  }

  // Verify access
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id as string);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  // Get dashboard data
  const dashboard = await fetchDashboardData(workspace_id as string);
  if (!dashboard) {
    throw ApiErrors.notFound("Dashboard data not found");
  }

  const response: ApiResponse<FinancialDashboard> = {
    success: true,
    data: dashboard,
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
 * GET /v1/financials/accounts
 * List accounts in workspace
 */
export const listAccounts = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const workspace_id = (req as any).workspace_id || req.query.workspace_id;
  const { account_type, currency } = req.query;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id) {
    throw ApiErrors.invalidRequest("Missing workspace or user context");
  }

  // Verify access
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id as string);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
  const offset = (page - 1) * limit;

  const filters: any = {};
  if (account_type) filters.account_type = account_type;
  if (currency) filters.currency = currency;

  const { accounts, total } = await getWorkspaceAccounts(
    workspace_id as string,
    filters,
    limit,
    offset
  );

  const response: ApiResponse<ChartOfAccountsItem[]> = {
    success: true,
    data: accounts,
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
 * GET /v1/financials/transactions
 * List transactions with filtering and pagination
 */
export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const {
    workspace_id,
    account_id,
    category,
    start_date,
    end_date,
    min_amount,
    max_amount,
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

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = (page - 1) * limit;

  // Build filters
  const filters: any = {};
  if (account_id) filters.account_id = account_id;
  if (category) filters.category = category;
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
  if (min_amount) filters.min_amount = parseFloat(min_amount as string);
  if (max_amount) filters.max_amount = parseFloat(max_amount as string);

  const sortOptions = {
    sortBy: (sort_by as string) || "date",
    sortOrder: ((sort_order as string) || "desc") as "asc" | "desc",
  };

  const { transactions, total } = await getWorkspaceTransactions(
    workspace_id as string,
    filters,
    sortOptions,
    limit,
    offset
  );

  const response: ApiResponse<Transaction[]> = {
    success: true,
    data: transactions,
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
 * POST /v1/financials/transactions
 * Create a manual transaction
 */
export const createTransaction = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id } = req.query;
  const {
    account_id,
    description,
    amount,
    currency,
    date,
    category,
    notes,
  } = req.body;

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

  // Check user role
  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id as string);
  if (userRole === "viewer") {
    throw ApiErrors.forbidden("Viewers cannot create transactions");
  }

  // Validation
  if (!account_id || !description || !amount || !date) {
    throw ApiErrors.invalidRequest("account_id, description, amount, and date are required");
  }

  if (isNaN(parseFloat(amount))) {
    throw ApiErrors.validation("amount", "Amount must be a valid number");
  }

  const transaction_id = generateId("txn");

  // Create transaction
  await insertTransaction({
    transaction_id,
    workspace_id,
    account_id,
    description,
    amount: parseFloat(amount),
    currency: currency || "AED",
    date: new Date(date as string),
    category,
    notes,
    created_by: user.user_id,
    created_at: new Date(),
  });

  const response: ApiResponse<Transaction> = {
    success: true,
    data: {
      transaction_id,
      account_from: account_id,
      account_to: account_id, // TODO: Implement double-entry accounting with contra-account
      description,
      amount: parseFloat(amount),
      currency: currency || "AED",
      date: date as string,
      status: "draft",
      tags: category ? [category] : [],
      created_at: new Date().toISOString(),
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
 * GET /v1/financials/reports/profit-loss
 * Get P&L report
 */
export const getProfitLossReport = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id, start_date, end_date } = req.query;

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

  const startDate = start_date ? new Date(start_date as string) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const endDate = end_date ? new Date(end_date as string) : new Date();

  // Generate P&L report
  const report = await generateProfitLossReport(workspace_id as string, startDate, endDate);

  const response: ApiResponse<any> = {
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

async function userHasWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
  try {
    const { getDbPool } = await import("../lib/db-helpers");
    const pool = getDbPool();

    // Check if user belongs to workspace by checking their organization_id
    const query = `
      SELECT id
      FROM users
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1
    `;

    const result = await pool.query(query, [userId, workspaceId]);
    return result.rows.length > 0;
  } catch (error) {
    console.error(`[userHasWorkspaceAccess] Error checking access for user ${userId} on workspace ${workspaceId}:`, error);
    return false;
  }
}

async function fetchDashboardData(workspaceId: string): Promise<DashboardData | null> {
  // TODO: Query database
  return null;
}

async function getWorkspaceAccounts(
  workspaceId: string,
  filters: any,
  limit: number,
  offset: number
): Promise<{ accounts: Account[]; total: number }> {
  // TODO: Query database
  return { accounts: [], total: 0 };
}

async function getWorkspaceTransactions(
  workspaceId: string,
  filters: any,
  sortOptions: any,
  limit: number,
  offset: number
): Promise<{ transactions: Transaction[]; total: number }> {
  // TODO: Query database
  return { transactions: [], total: 0 };
}

async function getUserWorkspaceRole(userId: string, workspaceId: string): Promise<string | null> {
  // TODO: Query database
  return null;
}

async function insertTransaction(data: any): Promise<void> {
  // TODO: Insert into transactions table
}

async function generateProfitLossReport(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<any> {
  // TODO: Generate P&L report from transactions
  return {};
}
