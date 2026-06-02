/**
 * Stripe Webhook Handler
 * Processes Stripe events and updates local database
 */

import { Pool } from 'pg';
import Stripe from 'stripe';
import {
  StripeEventType,
  WebhookEvent,
  Subscription,
  SubscriptionStatus,
} from "./billing-types.js";
import { BillingService } from "./billing.js";

export class WebhookHandler {
  constructor(
    private db: Pool,
    private billingService: BillingService,
    private stripe: Stripe
  ) {}

  /**
   * Process incoming Stripe webhook event
   */
  async processWebhook(event: Stripe.Event): Promise<WebhookEvent> {
    const webhookEvent: WebhookEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      stripeEventId: event.id,
      type: event.type as StripeEventType,
      data: event.data,
      processed: false,
      createdAt: new Date(),
    };

    try {
      // Store webhook event
      await this.storeWebhookEvent(webhookEvent);

      // Process based on event type
      switch (event.type) {
        case 'customer.created':
          await this.handleCustomerCreated(event.data.object as Stripe.Customer);
          break;

        case 'customer.updated':
          await this.handleCustomerUpdated(event.data.object as Stripe.Customer);
          break;

        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
            event.data.previous_attributes
          );
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.created':
          await this.handleInvoiceCreated(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.finalized':
          await this.handleInvoiceFinalized(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object as Stripe.Charge);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      // Mark webhook as processed
      await this.markWebhookProcessed(webhookEvent.id);
      webhookEvent.processed = true;
      webhookEvent.processedAt = new Date();

      return webhookEvent;
    } catch (error) {
      webhookEvent.error = error instanceof Error ? error.message : String(error);
      await this.storeWebhookEvent(webhookEvent);
      throw error;
    }
  }

  // =====================================================
  // CUSTOMER EVENT HANDLERS
  // =====================================================

  private async handleCustomerCreated(customer: Stripe.Customer): Promise<void> {
    console.log(`[Webhook] Customer created: ${customer.id}`);
    // Customer data is stored when billing account is created in the API
  }

  private async handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
    console.log(`[Webhook] Customer updated: ${customer.id}`);

    // Update customer in database if exists
    const query = `
      UPDATE customers
      SET email = $1, metadata = $2, updated_at = NOW()
      WHERE stripe_customer_id = $3
    `;

    try {
      await this.db.query(query, [
        customer.email,
        JSON.stringify(customer.metadata || {}),
        customer.id,
      ]);
    } catch (error) {
      console.error(`Failed to update customer: ${error}`);
    }
  }

  // =====================================================
  // SUBSCRIPTION EVENT HANDLERS
  // =====================================================

  private async handleSubscriptionCreated(stripeSubscription: Stripe.Subscription): Promise<void> {
    console.log(`[Webhook] Subscription created: ${stripeSubscription.id}`);

    const subscription: Subscription = {
      id: `sub_${Date.now()}`,
      customerId: stripeSubscription.customer as string,
      workspaceId: stripeSubscription.metadata?.workspace_id || '',
      tier: (stripeSubscription.metadata?.tier as any) || 'starter',
      status: this.mapSubscriptionStatus(stripeSubscription.status),
      billingPeriod: (stripeSubscription.metadata?.billing_period as any) || 'monthly',
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId: stripeSubscription.items.data[0]?.price.id || '',
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      autoRenew: !stripeSubscription.cancel_at_period_end,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const query = `
      INSERT INTO subscriptions (
        id, customer_id, workspace_id, tier, status, billing_period,
        stripe_subscription_id, stripe_price_id, current_period_start,
        current_period_end, auto_renew, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;

    try {
      await this.db.query(query, [
        subscription.id,
        subscription.customerId,
        subscription.workspaceId,
        subscription.tier,
        subscription.status,
        subscription.billingPeriod,
        subscription.stripeSubscriptionId,
        subscription.stripePriceId,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
        subscription.autoRenew,
        subscription.createdAt,
        subscription.updatedAt,
      ]);
    } catch (error) {
      console.error(`Failed to create subscription: ${error}`);
    }
  }

  private async handleSubscriptionUpdated(
    stripeSubscription: Stripe.Subscription,
    previousAttributes?: any
  ): Promise<void> {
    console.log(`[Webhook] Subscription updated: ${stripeSubscription.id}`);

    const updates: any = {
      status: this.mapSubscriptionStatus(stripeSubscription.status),
      current_period_start: new Date(stripeSubscription.current_period_start * 1000),
      current_period_end: new Date(stripeSubscription.current_period_end * 1000),
      auto_renew: !stripeSubscription.cancel_at_period_end,
      updated_at: new Date(),
    };

    // Handle pause/resume
    if (stripeSubscription.pause_collection) {
      updates.status = 'paused';
      updates.paused_at = new Date();
    }

    // Handle cancellation
    if (stripeSubscription.cancel_at_period_end) {
      updates.status = 'canceled';
      if (stripeSubscription.cancel_at) {
        updates.cancel_at = new Date(stripeSubscription.cancel_at * 1000);
      }
    }

    const query = `
      UPDATE subscriptions
      SET status = $1, current_period_start = $2, current_period_end = $3,
          auto_renew = $4, updated_at = $5
      WHERE stripe_subscription_id = $6
    `;

    try {
      await this.db.query(query, [
        updates.status,
        updates.current_period_start,
        updates.current_period_end,
        updates.auto_renew,
        updates.updated_at,
        stripeSubscription.id,
      ]);
    } catch (error) {
      console.error(`Failed to update subscription: ${error}`);
    }
  }

  private async handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription): Promise<void> {
    console.log(`[Webhook] Subscription deleted: ${stripeSubscription.id}`);

    const query = `
      UPDATE subscriptions
      SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
      WHERE stripe_subscription_id = $1
    `;

    try {
      await this.db.query(query, [stripeSubscription.id]);
    } catch (error) {
      console.error(`Failed to delete subscription: ${error}`);
    }
  }

  // =====================================================
  // INVOICE EVENT HANDLERS
  // =====================================================

  private async handleInvoiceCreated(stripeInvoice: Stripe.Invoice): Promise<void> {
    console.log(`[Webhook] Invoice created: ${stripeInvoice.id}`);
    // Invoice will be finalized before payment processing
  }

  private async handleInvoiceFinalized(stripeInvoice: Stripe.Invoice): Promise<void> {
    console.log(`[Webhook] Invoice finalized: ${stripeInvoice.id}`);

    // Store invoice in database
    const query = `
      INSERT INTO invoices (
        stripe_invoice_id, customer_id, workspace_id, subscription_id,
        invoice_number, status, amount_subtotal, amount_tax, amount_due,
        amount_paid, currency, billing_email, invoice_date, pdf_url, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (stripe_invoice_id) DO UPDATE SET
        status = EXCLUDED.status, amount_due = EXCLUDED.amount_due,
        pdf_url = EXCLUDED.pdf_url, updated_at = NOW()
    `;

    try {
      await this.db.query(query, [
        stripeInvoice.id,
        stripeInvoice.customer,
        stripeInvoice.metadata?.workspace_id || '',
        stripeInvoice.subscription,
        stripeInvoice.number || '',
        stripeInvoice.status,
        stripeInvoice.subtotal || 0,
        stripeInvoice.tax || 0,
        stripeInvoice.amount_due || 0,
        stripeInvoice.amount_paid || 0,
        stripeInvoice.currency,
        stripeInvoice.billing_reason ? stripeInvoice.customer_email : '',
        new Date(stripeInvoice.created * 1000),
        stripeInvoice.pdf || '',
      ]);

      // Emit invoice created event (for email notifications, etc)
      await this.emitEvent('invoice.created', {
        invoiceId: stripeInvoice.id,
        customerId: stripeInvoice.customer,
        amount: stripeInvoice.amount_due,
      });
    } catch (error) {
      console.error(`Failed to store invoice: ${error}`);
    }
  }

  private async handlePaymentSucceeded(stripeInvoice: Stripe.Invoice): Promise<void> {
    console.log(`[Webhook] Payment succeeded: ${stripeInvoice.id}`);

    const query = `
      UPDATE invoices
      SET status = 'paid', amount_paid = $1, paid_at = NOW(), updated_at = NOW()
      WHERE stripe_invoice_id = $2
    `;

    try {
      await this.db.query(query, [stripeInvoice.amount_paid, stripeInvoice.id]);

      // Emit payment success event
      await this.emitEvent('payment.succeeded', {
        invoiceId: stripeInvoice.id,
        customerId: stripeInvoice.customer,
        amount: stripeInvoice.amount_paid,
      });
    } catch (error) {
      console.error(`Failed to update invoice payment: ${error}`);
    }
  }

  private async handlePaymentFailed(stripeInvoice: Stripe.Invoice): Promise<void> {
    console.log(`[Webhook] Payment failed: ${stripeInvoice.id}`);

    const query = `
      UPDATE invoices
      SET status = 'open', updated_at = NOW()
      WHERE stripe_invoice_id = $1
    `;

    try {
      await this.db.query(query, [stripeInvoice.id]);

      // Record payment attempt
      await this.recordFailedPaymentAttempt(
        stripeInvoice.id,
        stripeInvoice.customer as string,
        stripeInvoice.amount_due
      );

      // Schedule retry
      await this.schedulePaymentRetry(stripeInvoice.id, stripeInvoice.customer as string);

      // Emit payment failure event
      await this.emitEvent('payment.failed', {
        invoiceId: stripeInvoice.id,
        customerId: stripeInvoice.customer,
        amount: stripeInvoice.amount_due,
      });
    } catch (error) {
      console.error(`Failed to handle payment failure: ${error}`);
    }
  }

  private async handleChargeRefunded(stripeCharge: Stripe.Charge): Promise<void> {
    console.log(`[Webhook] Charge refunded: ${stripeCharge.id}`);

    // Find associated invoice and update
    const invoiceQuery = `
      SELECT id FROM invoices
      WHERE customer_id = $1 AND status = 'paid'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    try {
      const result = await this.db.query(invoiceQuery, [stripeCharge.customer]);
      if (result.rows.length > 0) {
        const invoiceId = result.rows[0].id;

        // Update invoice status
        await this.db.query(
          `UPDATE invoices SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
          [invoiceId]
        );
      }
    } catch (error) {
      console.error(`Failed to handle refund: ${error}`);
    }
  }

  // =====================================================
  // PAYMENT RETRY LOGIC
  // =====================================================

  private async recordFailedPaymentAttempt(
    invoiceId: string,
    customerId: string,
    amount: number
  ): Promise<void> {
    const query = `
      INSERT INTO payment_attempts (
        invoice_id, customer_id, amount, status, attempt_number, created_at
      ) VALUES ($1, $2, $3, 'failed', 
        COALESCE((SELECT COUNT(*) FROM payment_attempts WHERE invoice_id = $1), 0) + 1,
        NOW())
    `;

    try {
      await this.db.query(query, [invoiceId, customerId, amount]);
    } catch (error) {
      console.error(`Failed to record payment attempt: ${error}`);
    }
  }

  private async schedulePaymentRetry(invoiceId: string, customerId: string): Promise<void> {
    const MAX_RETRIES = 3;
    const RETRY_INTERVAL_DAYS = 1;

    // Get attempt count
    const countQuery = `
      SELECT COUNT(*) as count FROM payment_attempts
      WHERE invoice_id = $1 AND status = 'failed'
    `;

    try {
      const result = await this.db.query(countQuery, [invoiceId]);
      const attemptCount = result.rows[0].count;

      if (attemptCount < MAX_RETRIES) {
        // Schedule next retry
        const nextRetryDate = new Date();
        nextRetryDate.setDate(nextRetryDate.getDate() + RETRY_INTERVAL_DAYS);

        const scheduleQuery = `
          INSERT INTO payment_retry_schedule (
            invoice_id, customer_id, retry_at, attempt_number, created_at
          ) VALUES ($1, $2, $3, $4, NOW())
        `;

        await this.db.query(scheduleQuery, [
          invoiceId,
          customerId,
          nextRetryDate,
          attemptCount + 1,
        ]);
      } else {
        // Max retries exceeded - mark for suspension
        const invoiceQuery = `
          SELECT customer_id FROM invoices WHERE stripe_invoice_id = $1
        `;
        const invoiceResult = await this.db.query(invoiceQuery, [invoiceId]);

        if (invoiceResult.rows.length > 0) {
          const customerId = invoiceResult.rows[0].customer_id;

          // Update subscription status to past_due or suspend
          await this.db.query(
            `UPDATE subscriptions SET status = 'past_due', updated_at = NOW() 
             WHERE customer_id = $1`,
            [customerId]
          );
        }
      }
    } catch (error) {
      console.error(`Failed to schedule payment retry: ${error}`);
    }
  }

  // =====================================================
  // WEBHOOK STORAGE
  // =====================================================

  private async storeWebhookEvent(event: WebhookEvent): Promise<void> {
    const query = `
      INSERT INTO webhook_events (
        stripe_event_id, type, data, processed, processed_at, error, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (stripe_event_id) DO NOTHING
    `;

    try {
      await this.db.query(query, [
        event.stripeEventId,
        event.type,
        JSON.stringify(event.data),
        event.processed,
        event.processedAt,
        event.error,
        event.createdAt,
      ]);
    } catch (error) {
      console.error(`Failed to store webhook event: ${error}`);
    }
  }

  private async markWebhookProcessed(eventId: string): Promise<void> {
    const query = `
      UPDATE webhook_events
      SET processed = true, processed_at = NOW()
      WHERE id = $1
    `;

    try {
      await this.db.query(query, [eventId]);
    } catch (error) {
      console.error(`Failed to mark webhook as processed: ${error}`);
    }
  }

  // =====================================================
  // EVENT EMISSION (for notifications, integrations)
  // =====================================================

  private async emitEvent(eventType: string, data: any): Promise<void> {
    // This could emit to message queue, trigger notifications, etc.
    console.log(`[Event] ${eventType}:`, data);
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private mapSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      active: 'active',
      past_due: 'past_due',
      unpaid: 'past_due',
      canceled: 'canceled',
      incomplete: 'incomplete',
      incomplete_expired: 'incomplete_expired',
    };

    return statusMap[stripeStatus] || ('active' as SubscriptionStatus);
  }
}

export default WebhookHandler;
