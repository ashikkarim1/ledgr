// @ts-nocheck
/**
 * Billing API Endpoints
 * REST API routes for billing operations
 */

import { Router, Request, Response, NextFunction } from 'express';
import { BillingService } from "./billing.js";
import { StripeIntegration } from "./stripe-integration.js";
import {
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  UpgradeSubscriptionRequest,
  CancelSubscriptionRequest,
  BillingResponse,
} from "./billing-types.js";

export function createBillingRouter(
  billingService: BillingService,
  stripe: StripeIntegration
): Router {
  const router = Router();

  // =====================================================
  // SUBSCRIPTION ENDPOINTS
  // =====================================================

  /**
   * Create subscription
   * POST /billing/subscriptions
   */
  router.post('/subscriptions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request: CreateSubscriptionRequest = {
        workspaceId: req.body.workspaceId || req.user?.workspaceId,
        tier: req.body.tier,
        billingPeriod: req.body.billingPeriod || 'monthly',
        paymentMethodId: req.body.paymentMethodId,
        couponCode: req.body.couponCode,
      };

      const subscription = await billingService.createSubscription(request);

      return res.status(201).json({
        success: true,
        data: subscription,
      } as BillingResponse<typeof subscription>);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Get subscription
   * GET /billing/subscriptions/:id
   */
  router.get('/subscriptions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await billingService.getSubscription(req.params.id);

      return res.json({
        success: true,
        data: subscription,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Update subscription
   * PATCH /billing/subscriptions/:id
   */
  router.patch(
    '/subscriptions/:id',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const request: UpdateSubscriptionRequest = {
          tier: req.body.tier,
          billingPeriod: req.body.billingPeriod,
          autoRenew: req.body.autoRenew,
        };

        const subscription = await billingService.updateSubscription(req.params.id, request);

        return res.json({
          success: true,
          data: subscription,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Upgrade subscription
   * POST /billing/subscriptions/:id/upgrade
   */
  router.post(
    '/subscriptions/:id/upgrade',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const request: UpgradeSubscriptionRequest = {
          newTier: req.body.newTier,
          billingPeriod: req.body.billingPeriod,
          prorationBehavior: req.body.prorationBehavior || 'create_prorations',
        };

        const subscription = await billingService.upgradeSubscription(req.params.id, request);

        return res.json({
          success: true,
          data: subscription,
          metadata: {
            message: 'Subscription upgraded successfully',
            prorationApplied: true,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Downgrade subscription
   * POST /billing/subscriptions/:id/downgrade
   */
  router.post(
    '/subscriptions/:id/downgrade',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const subscription = await billingService.downgradeSubscription(
          req.params.id,
          req.body.newTier,
          req.body.atPeriodEnd !== false
        );

        return res.json({
          success: true,
          data: subscription,
          metadata: {
            message: req.body.atPeriodEnd ? 'Downgrade scheduled for next billing cycle' : 'Subscription downgraded immediately',
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Cancel subscription
   * POST /billing/subscriptions/:id/cancel
   */
  router.post(
    '/subscriptions/:id/cancel',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const request: CancelSubscriptionRequest = {
          reason: req.body.reason,
          feedbackNotes: req.body.feedbackNotes,
          cancelImmediately: req.body.cancelImmediately || false,
        };

        const subscription = await billingService.cancelSubscription(req.params.id, request);

        return res.json({
          success: true,
          data: subscription,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Pause subscription
   * POST /billing/subscriptions/:id/pause
   */
  router.post(
    '/subscriptions/:id/pause',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const subscription = await billingService.pauseSubscription(req.params.id);

        return res.json({
          success: true,
          data: subscription,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Resume subscription
   * POST /billing/subscriptions/:id/resume
   */
  router.post(
    '/subscriptions/:id/resume',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const subscription = await billingService.resumeSubscription(req.params.id);

        return res.json({
          success: true,
          data: subscription,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // =====================================================
  // PAYMENT METHOD ENDPOINTS
  // =====================================================

  /**
   * Get payment methods
   * GET /billing/payment-methods
   */
  router.get(
    '/payment-methods',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customerId = req.query.customerId as string || req.user?.customerId;
        const paymentMethods = await billingService.getPaymentMethods(customerId);

        return res.json({
          success: true,
          data: paymentMethods,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Add payment method
   * POST /billing/payment-methods
   */
  router.post(
    '/payment-methods',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customerId = req.body.customerId || req.user?.customerId;
        const paymentMethod = await billingService.addPaymentMethod(
          customerId,
          req.body.stripePaymentMethodId,
          req.body.isDefault || false
        );

        return res.status(201).json({
          success: true,
          data: paymentMethod,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Remove payment method
   * DELETE /billing/payment-methods/:id
   */
  router.delete(
    '/payment-methods/:id',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await billingService.removePaymentMethod(req.params.id);

        return res.json({
          success: true,
          data: { deleted: true },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Set default payment method
   * POST /billing/payment-methods/:id/default
   */
  router.post(
    '/payment-methods/:id/default',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customerId = req.body.customerId || req.user?.customerId;
        await billingService.setDefaultPaymentMethod(customerId, req.params.id);

        return res.json({
          success: true,
          data: { isDefault: true },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // =====================================================
  // INVOICE ENDPOINTS
  // =====================================================

  /**
   * Get invoices
   * GET /billing/invoices
   */
  router.get('/invoices', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = req.query.customerId as string || req.user?.customerId;
      const limit = parseInt(req.query.limit as string) || 10;
      const invoices = await billingService.getInvoices(customerId, limit);

      return res.json({
        success: true,
        data: invoices,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Get invoice
   * GET /billing/invoices/:id
   */
  router.get('/invoices/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoice = await billingService.getInvoice(req.params.id);

      return res.json({
        success: true,
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Download invoice PDF
   * GET /billing/invoices/:id/download
   */
  router.get(
    '/invoices/:id/download',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const invoice = await billingService.getInvoice(req.params.id);

        if (!invoice.pdfUrl) {
          return res.status(404).json({
            success: false,
            error: { code: 'PDF_NOT_AVAILABLE', message: 'Invoice PDF is not available' },
          });
        }

        // Redirect to PDF URL or return as attachment
        return res.redirect(invoice.pdfUrl);
      } catch (error) {
        next(error);
      }
    }
  );

  // =====================================================
  // USAGE & METERING ENDPOINTS
  // =====================================================

  /**
   * Get usage metrics
   * GET /billing/usage
   */
  router.get('/usage', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = req.query.customerId as string || req.user?.customerId;
      const subscription = await billingService.getSubscriptionByCustomer(customerId);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription found' },
        });
      }

      const metrics = await billingService.getUsageMetrics(customerId, subscription);

      return res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Record usage
   * POST /billing/usage
   */
  router.post('/usage', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = req.body.customerId || req.user?.customerId;

      await billingService.recordUsage({
        customerId,
        agentCount: req.body.agentCount || 0,
        userCount: req.body.userCount || 0,
        dataUsedMB: req.body.dataUsedMB || 0,
      });

      // Check limits
      const subscription = await billingService.getSubscriptionByCustomer(customerId);
      if (subscription) {
        const withinLimits = await billingService.checkUsageLimits(customerId, subscription);

        return res.json({
          success: true,
          data: { recorded: true, withinLimits },
        });
      }

      return res.json({
        success: true,
        data: { recorded: true },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Check usage limits
   * GET /billing/usage/check
   */
  router.get(
    '/usage/check',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customerId = req.query.customerId as string || req.user?.customerId;
        const subscription = await billingService.getSubscriptionByCustomer(customerId);

        if (!subscription) {
          return res.status(404).json({
            success: false,
            error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription found' },
          });
        }

        const withinLimits = await billingService.checkUsageLimits(customerId, subscription);

        return res.json({
          success: true,
          data: { withinLimits },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Calculate metered charges
   * GET /billing/usage/charges
   */
  router.get(
    '/usage/charges',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customerId = req.query.customerId as string || req.user?.customerId;
        const subscription = await billingService.getSubscriptionByCustomer(customerId);

        if (!subscription) {
          return res.status(404).json({
            success: false,
            error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription found' },
          });
        }

        const charges = await billingService.calculateMeteredCharges(customerId, subscription);

        return res.json({
          success: true,
          data: { meteredCharges: charges },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // =====================================================
  // BILLING ACCOUNT ENDPOINTS
  // =====================================================

  /**
   * Get billing account
   * GET /billing/account
   */
  router.get('/account', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = req.query.customerId as string || req.user?.customerId;
      const account = await billingService.getBillingAccount(customerId);

      return res.json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createBillingRouter;
