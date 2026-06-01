/**
 * Trial Upgrade Controller
 * Handles trial to paid plan upgrades
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, ApiErrorHandler } from '../middleware/error-handler';
import { ApiResponse, HttpStatus } from '../response-types';
import {
  getTrialInfo,
  getSubscriptionByWorkspace,
  getDbPool,
} from '../lib/db-helpers';

interface UpgradeRequest {
  plan: 'professional' | 'enterprise';
  billing_interval: 'monthly' | 'annual';
  payment_method_id?: string;
}

interface UpgradeResponse {
  subscription_id: string;
  workspace_id: string;
  plan: string;
  status: string;
  billing_interval: string;
  amount_per_cycle: number;
  currency: string;
  current_period_start: string;
  current_period_end: string;
  next_billing_date: string;
  message: string;
}

/**
 * Upgrade trial subscription to paid plan
 * POST /v1/billing/subscription/upgrade
 */
export const upgradeTrialSubscription = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { plan, billing_interval } = req.body as UpgradeRequest;
    const workspace_id = (req as any).workspace_id || (req as any).user?.workspace_id;
    const user_id = (req as any).user?.user_id;

    if (!workspace_id || !user_id) {
      throw new ApiErrorHandler(
        HttpStatus.BAD_REQUEST,
        'INVALID_REQUEST',
        'Missing workspace or user context'
      );
    }

    if (!plan || !billing_interval) {
      throw new ApiErrorHandler(
        HttpStatus.BAD_REQUEST,
        'INVALID_REQUEST',
        'Missing required fields: plan, billing_interval'
      );
    }

    if (!['professional', 'enterprise'].includes(plan)) {
      throw new ApiErrorHandler(
        HttpStatus.BAD_REQUEST,
        'INVALID_PLAN',
        'Plan must be "professional" or "enterprise"'
      );
    }

    if (!['monthly', 'annual'].includes(billing_interval)) {
      throw new ApiErrorHandler(
        HttpStatus.BAD_REQUEST,
        'INVALID_INTERVAL',
        'Billing interval must be "monthly" or "annual"'
      );
    }

    const pool = getDbPool();

    // Get current trial info
    const trialInfo = await getTrialInfo(workspace_id);

    if (!trialInfo || trialInfo.plan !== 'free_trial') {
      throw new ApiErrorHandler(
        HttpStatus.BAD_REQUEST,
        'NOT_ON_TRIAL',
        'Workspace is not on a trial plan'
      );
    }

    // Get current subscription
    const currentSubscription = await getSubscriptionByWorkspace(workspace_id);

    if (!currentSubscription) {
      throw new ApiErrorHandler(
        HttpStatus.NOT_FOUND,
        'SUBSCRIPTION_NOT_FOUND',
        'Current subscription not found'
      );
    }

    // Validate user is still on trial before allowing upgrade
    if (!currentSubscription.trial_end_date) {
      throw new ApiErrorHandler(
        HttpStatus.BAD_REQUEST,
        'NOT_ON_TRIAL',
        'Workspace is not on an active trial'
      );
    }

    const trialEndDate = new Date(currentSubscription.trial_end_date);
    if (trialEndDate <= new Date()) {
      throw new ApiErrorHandler(
        HttpStatus.BAD_REQUEST,
        'TRIAL_EXPIRED',
        'Trial period has expired'
      );
    }

    // Calculate pricing based on plan and interval
    const pricing = calculateUpgradePricing(plan, billing_interval);

    // Start upgrade transaction
    const now = new Date();
    const subscriptionId = uuidv4();

    try {
      // Calculate period end based on interval
      const periodEnd = new Date(now);
      if (billing_interval === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      const result = await pool.query(
        `
          UPDATE subscriptions
          SET
            plan = $1,
            amount_per_cycle = $2,
            current_period_start = $3,
            current_period_end = $4,
            trial_end_date = NULL,
            status = 'active',
            updated_at = NOW()
          WHERE organization_id = $5 AND id = $6
          RETURNING id, organization_id, plan, status, trial_end_date,
                    amount_per_cycle, currency, current_period_start, current_period_end
        `,
        [
          plan,
          pricing.amount,
          now.toISOString().split('T')[0],
          periodEnd.toISOString().split('T')[0],
          workspace_id,
          currentSubscription.id,
        ]
      );

      if (result.rows.length === 0) {
        throw new ApiErrorHandler(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'UPDATE_FAILED',
          'Failed to update subscription'
        );
      }

      const updatedSubscription = result.rows[0];

      // Log trial transition
      await pool.query(
        `
          INSERT INTO trial_transitions (
            organization_id, from_status, to_status,
            reason, metadata, created_at
          )
          VALUES ($1, 'active', 'upgraded', $2, $3, NOW())
        `,
        [
          workspace_id,
          'Upgraded to paid plan',
          JSON.stringify({
            plan,
            billing_interval,
            upgrade_date: now.toISOString(),
            amount_per_cycle: pricing.amount,
          }),
        ]
      );

      // Remove trial usage limits
      await pool.query(
        `
          DELETE FROM trial_usage
          WHERE organization_id = $1
        `,
        [workspace_id]
      );

      // Update user trial status
      await pool.query(
        `
          UPDATE users
          SET
            trial_status = 'upgraded',
            updated_at = NOW()
          WHERE organization_id = $1
        `,
        [workspace_id]
      );

      // Build response
      const response: ApiResponse<UpgradeResponse> = {
        success: true,
        data: {
          subscription_id: updatedSubscription.id,
          workspace_id: updatedSubscription.organization_id,
          plan: updatedSubscription.plan,
          status: updatedSubscription.status,
          billing_interval: billing_interval,
          amount_per_cycle: parseFloat(updatedSubscription.amount_per_cycle),
          currency: updatedSubscription.currency || 'AED',
          current_period_start: updatedSubscription.current_period_start,
          current_period_end: updatedSubscription.current_period_end,
          next_billing_date: updatedSubscription.current_period_end,
          message: `Successfully upgraded to ${plan} plan (${billing_interval})`,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers['x-request-id'] as string,
          version: 'v1',
        },
        errors: null,
      };

      res.status(200).json(response);

      // TODO: Send confirmation email
      console.log(`[Trial Upgrade] Upgraded workspace ${workspace_id} to ${plan} plan`);
    } catch (error) {
      if (error instanceof ApiErrorHandler) {
        throw error;
      }
      console.error('[Trial Upgrade] Upgrade failed:', error);
      throw new ApiErrorHandler(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'UPGRADE_FAILED',
        'Failed to process subscription upgrade'
      );
    }
  }
);

/**
 * Calculate pricing for upgrade based on plan and billing interval
 */
function calculateUpgradePricing(
  plan: 'professional' | 'enterprise',
  interval: 'monthly' | 'annual'
): { amount: number } {
  const basePricing: Record<string, Record<string, number>> = {
    professional: {
      monthly: 4999, // AED 49.99/month
      annual: 49990, // AED 499.90/year (~17% discount)
    },
    enterprise: {
      monthly: 14999, // AED 149.99/month
      annual: 149990, // AED 1,499.90/year (~17% discount)
    },
  };

  return {
    amount: basePricing[plan][interval] || 0,
  };
}
