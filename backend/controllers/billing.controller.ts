// @ts-nocheck
/**
 * Billing & Payments Controller
 * Handles subscriptions, invoices, and payment processing
 */

import { Request, Response } from "express";
import { ApiErrors, asyncHandler } from "../middleware/error-handler.js";
import {
  ApiResponse,
  Subscription,
  Invoice,
  PaymentMethod,
} from "../response-types.js";

/**
 * GET /v1/billing/subscription
 * Get workspace subscription details
 */
export const getSubscription = asyncHandler(async (req: Request, res: Response) => {
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

  // Verify user is workspace admin or trial user
  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id as string);
  // Allow trial users and admins to view billing
  if (userRole && userRole !== "admin" && user.trial_plan === null) {
    throw ApiErrors.forbidden("Only workspace admins can view billing");
  }

  const subscription = await fetchSubscription(workspace_id as string);
  if (!subscription) {
    throw ApiErrors.notFound("Subscription not found");
  }

  const response: ApiResponse<Subscription> = {
    success: true,
    data: subscription,
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
 * POST /v1/billing/subscription/upgrade
 * Upgrade workspace subscription plan
 */
export const upgradeSubscription = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id, plan_id, billing_cycle } = req.body;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id || !plan_id) {
    throw ApiErrors.invalidRequest("workspace_id and plan_id are required");
  }

  // Verify access and role
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id);
  if (userRole !== "admin") {
    throw ApiErrors.forbidden("Only workspace admins can upgrade");
  }

  // Validate plan
  const plan = await fetchPlan(plan_id);
  if (!plan) {
    throw ApiErrors.notFound("Plan not found");
  }

  // Get current subscription
  const currentSubscription = await fetchSubscription(workspace_id);
  if (!currentSubscription) {
    throw ApiErrors.notFound("Current subscription not found");
  }

  // Check if downgrading (not allowed mid-cycle in many SaaS)
  if (plan.price < currentSubscription.price) {
    throw ApiErrors.conflict("Downgrades are only available at renewal");
  }

  // Create upgrade
  const subscription_id = generateId("sub");
  const stripe_subscription_id = generateId("si");

  // TODO: Call Stripe API to create subscription
  const stripeResult = await upgradeStripeSubscription(
    currentSubscription.stripe_customer_id,
    plan.stripe_price_id,
    billing_cycle || "monthly"
  );

  // Update subscription in database
  await updateSubscription(workspace_id, {
    subscription_id,
    plan_id,
    stripe_subscription_id: stripeResult.id,
    billing_cycle: billing_cycle || "monthly",
    status: "active",
    current_period_start: new Date(),
    current_period_end: calculateNextBillingDate(billing_cycle || "monthly"),
    updated_at: new Date(),
  });

  const updatedSubscription = await fetchSubscription(workspace_id);

  const response: ApiResponse<Subscription> = {
    success: true,
    data: updatedSubscription,
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
 * GET /v1/billing/invoices
 * List invoices for workspace
 */
export const listInvoices = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id, status } = req.query;

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
    throw ApiErrors.forbidden("Only workspace admins can view invoices");
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const offset = (page - 1) * limit;

  const filters: any = {};
  if (status) filters.status = status;

  const { invoices, total } = await getWorkspaceInvoices(
    workspace_id as string,
    filters,
    limit,
    offset
  );

  const response: ApiResponse<Invoice[]> = {
    success: true,
    data: invoices,
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
 * GET /v1/billing/payment-methods
 * List payment methods for workspace
 */
export const listPaymentMethods = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
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

  // Verify user is workspace admin
  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id as string);
  if (userRole !== "admin") {
    throw ApiErrors.forbidden("Only workspace admins can view payment methods");
  }

  const paymentMethods = await getWorkspacePaymentMethods(workspace_id as string);

  const response: ApiResponse<PaymentMethod[]> = {
    success: true,
    data: paymentMethods,
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
 * POST /v1/billing/payment-methods
 * Add new payment method
 */
export const addPaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id, card_token, set_as_default } = req.body;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id || !card_token) {
    throw ApiErrors.invalidRequest("workspace_id and card_token are required");
  }

  // Verify access
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  // Verify user is workspace admin
  const userRole = await getUserWorkspaceRole(user.user_id, workspace_id);
  if (userRole !== "admin") {
    throw ApiErrors.forbidden("Only workspace admins can add payment methods");
  }

  // Get subscription for Stripe customer ID
  const subscription = await fetchSubscription(workspace_id);
  if (!subscription) {
    throw ApiErrors.notFound("Subscription not found");
  }

  // TODO: Call Stripe API to add payment method
  const stripePaymentMethod = await createStripePaymentMethod(
    subscription.stripe_customer_id,
    card_token,
    set_as_default || false
  );

  // Save payment method
  const payment_method_id = generateId("pm");
  await insertPaymentMethod({
    payment_method_id,
    workspace_id,
    stripe_payment_method_id: stripePaymentMethod.id,
    card_last_four: stripePaymentMethod.card.last4,
    card_brand: stripePaymentMethod.card.brand,
    is_default: set_as_default || false,
    created_at: new Date(),
  });

  const response: ApiResponse<PaymentMethod> = {
    success: true,
    data: {
      payment_method_id,
      card_last_four: stripePaymentMethod.card.last4,
      card_brand: stripePaymentMethod.card.brand,
      is_default: set_as_default || false,
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
 * ==========================================
 * HELPER FUNCTIONS
 * ==========================================
 */

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculateNextBillingDate(billingCycle: string): Date {
  const date = new Date();
  if (billingCycle === "monthly") {
    date.setMonth(date.getMonth() + 1);
  } else if (billingCycle === "annual") {
    date.setFullYear(date.getFullYear() + 1);
  }
  return date;
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

async function getUserWorkspaceRole(userId: string, workspaceId: string): Promise<string | null> {
  try {
    const { getDbPool } = await import("../lib/db-helpers");
    const pool = getDbPool();

    // Query user roles in workspace
    const query = `
      SELECT r.name
      FROM user_roles ur
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1 AND ur.organization_id = $2
      LIMIT 1
    `;

    const result = await pool.query(query, [userId, workspaceId]);
    if (result.rows.length === 0) {
      // Check users table for admin role flag
      const userQuery = `
        SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      `;
      const userResult = await pool.query(userQuery, [userId, workspaceId]);
      return userResult.rows.length > 0 ? "member" : null;
    }
    return result.rows[0]?.name || "member";
  } catch (error) {
    console.error(`[getUserWorkspaceRole] Error getting role for user ${userId} on workspace ${workspaceId}:`, error);
    return null;
  }
}

async function fetchSubscription(workspaceId: string): Promise<Subscription | null> {
  const { getSubscriptionByWorkspace } = await import("../lib/db-helpers");
  const subscription = await getSubscriptionByWorkspace(workspaceId);
  
  if (!subscription) {
    return null;
  }

  return {
    subscription_id: subscription.id,
    workspace_id: subscription.organization_id,
    plan: subscription.plan,
    status: subscription.status,
    trial_end_date: subscription.trial_end_date?.toISOString(),
    current_period_start: subscription.current_period_start?.toISOString(),
    current_period_end: subscription.current_period_end?.toISOString(),
    amount_per_cycle: subscription.amount_per_cycle || 0,
    currency: subscription.currency || 'AED',
    billing_interval: 'monthly',
    created_at: subscription.created_at?.toISOString(),
    updated_at: subscription.updated_at?.toISOString(),
  };
}

async function fetchPlan(planId: string) {
  // TODO: Query database
  return null;
}

async function upgradeStripeSubscription(
  stripeCustomerId: string,
  stripePriceId: string,
  billingCycle: string
): Promise<any> {
  // TODO: Call Stripe API
  return { id: generateId("si") };
}

async function updateSubscription(workspaceId: string, data: any): Promise<void> {
  // TODO: Update subscriptions table
}

async function getWorkspaceInvoices(
  workspaceId: string,
  filters: any,
  limit: number,
  offset: number
): Promise<{ invoices: Invoice[]; total: number }> {
  // TODO: Query database
  return { invoices: [], total: 0 };
}

async function getWorkspacePaymentMethods(workspaceId: string): Promise<PaymentMethod[]> {
  // TODO: Query database
  return [];
}

async function createStripePaymentMethod(
  stripeCustomerId: string,
  cardToken: string,
  isDefault: boolean
): Promise<any> {
  // TODO: Call Stripe API
  return {
    id: generateId("pm"),
    card: {
      last4: "4242",
      brand: "visa",
    },
  };
}

async function insertPaymentMethod(data: any): Promise<void> {
  // TODO: Insert into payment_methods table
}
