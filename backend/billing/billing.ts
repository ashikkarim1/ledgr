/**
 * Billing Service
 * Core business logic for subscription and billing operations
 */

import { Pool } from 'pg';
import StripeIntegration, { SUBSCRIPTION_TIERS, METERED_PRICING } from './stripe-integration';
import { UsageTracker } from './usage-tracker';
import {
  Subscription,
  Customer,
  Invoice,
  PaymentMethod,
  BillingAccount,
  SubscriptionStatus,
  PlanTier,
  BillingPeriod,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  UpgradeSubscriptionRequest,
  CancelSubscriptionRequest,
  UsageMetrics,
} from './billing-types';

export class BillingService {
  private stripe: StripeIntegration;
  private usageTracker: UsageTracker;

  constructor(db: Pool, stripeApiKey: string, webhookSecret: string) {
    this.stripe = new StripeIntegration(stripeApiKey, webhookSecret);
    this.usageTracker = new UsageTracker(db);
  }

  // =====================================================
  // CUSTOMER MANAGEMENT
  // =====================================================

  async createCustomer(params: {
    workspaceId: string;
    email: string;
    companyName: string;
    billingEmail?: string;
  }): Promise<Customer> {
    // Create in Stripe
    const stripeCustomer = await this.stripe.createCustomer({
      email: params.email,
      name: params.companyName,
      metadata: {
        workspaceId: params.workspaceId,
      },
    });

    // Store in database
    const query = `
      INSERT INTO customers (
        workspace_id, stripe_customer_id, email, billing_email, company_name, status
      ) VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING *
    `;

    const result = await this.db.query(query, [
      params.workspaceId,
      stripeCustomer.id,
      params.email,
      params.billingEmail || params.email,
      params.companyName,
    ]);

    return this.mapDatabaseCustomer(result.rows[0]);
  }

  async getCustomer(customerId: string): Promise<Customer> {
    const query = `
      SELECT * FROM customers WHERE id = $1
    `;

    const result = await this.db.query(query, [customerId]);
    if (result.rows.length === 0) {
      throw new Error(`Customer ${customerId} not found`);
    }

    return this.mapDatabaseCustomer(result.rows[0]);
  }

  async updateCustomer(customerId: string, updates: Partial<Customer>): Promise<Customer> {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.email) {
      fields.push(`email = $${paramIndex++}`);
      values.push(updates.email);
    }
    if (updates.billingEmail) {
      fields.push(`billing_email = $${paramIndex++}`);
      values.push(updates.billingEmail);
    }
    if (updates.companyName) {
      fields.push(`company_name = $${paramIndex++}`);
      values.push(updates.companyName);
    }

    fields.push(`updated_at = NOW()`);
    values.push(customerId);

    const query = `
      UPDATE customers
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return this.mapDatabaseCustomer(result.rows[0]);
  }

  // =====================================================
  // SUBSCRIPTION MANAGEMENT
  // =====================================================

  async createSubscription(req: CreateSubscriptionRequest): Promise<Subscription> {
    // Get or create customer
    let customer = await this.getOrCreateCustomer(req.workspaceId);

    // Create Stripe subscription
    const stripeSubscription = await this.stripe.createSubscription({
      customerId: customer.stripeCustomerId,
      tier: req.tier,
      billingPeriod: req.billingPeriod,
      paymentMethodId: req.paymentMethodId,
      metadata: {
        workspaceId: req.workspaceId,
      },
    });

    // Store subscription in database
    const query = `
      INSERT INTO subscriptions (
        customer_id, workspace_id, tier, status, billing_period,
        stripe_subscription_id, stripe_price_id, current_period_start,
        current_period_end, auto_renew, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
    `;

    const result = await this.db.query(query, [
      customer.id,
      req.workspaceId,
      req.tier,
      'active',
      req.billingPeriod,
      stripeSubscription.id,
      stripeSubscription.items.data[0]?.price.id || '',
      new Date(stripeSubscription.current_period_start * 1000),
      new Date(stripeSubscription.current_period_end * 1000),
      true,
    ]);

    // Update customer with subscription
    await this.db.query(
      `UPDATE customers SET subscription_id = $1 WHERE id = $2`,
      [result.rows[0].id, customer.id]
    );

    return this.mapDatabaseSubscription(result.rows[0]);
  }

  async getSubscription(subscriptionId: string): Promise<Subscription> {
    const query = `
      SELECT * FROM subscriptions WHERE id = $1
    `;

    const result = await this.db.query(query, [subscriptionId]);
    if (result.rows.length === 0) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    return this.mapDatabaseSubscription(result.rows[0]);
  }

  async updateSubscription(
    subscriptionId: string,
    req: UpdateSubscriptionRequest
  ): Promise<Subscription> {
    const subscription = await this.getSubscription(subscriptionId);

    // Update in Stripe
    if (req.tier || req.billingPeriod) {
      await this.stripe.updateSubscription(subscription.stripeSubscriptionId, {
        tier: req.tier,
        billingPeriod: req.billingPeriod,
      });
    }

    // Update in database
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (req.tier) {
      updates.push(`tier = $${paramIndex++}`);
      values.push(req.tier);
    }
    if (req.billingPeriod) {
      updates.push(`billing_period = $${paramIndex++}`);
      values.push(req.billingPeriod);
    }
    if (req.autoRenew !== undefined) {
      updates.push(`auto_renew = $${paramIndex++}`);
      values.push(req.autoRenew);
    }

    updates.push(`updated_at = NOW()`);
    values.push(subscriptionId);

    const query = `
      UPDATE subscriptions
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return this.mapDatabaseSubscription(result.rows[0]);
  }

  async upgradeSubscription(
    subscriptionId: string,
    req: UpgradeSubscriptionRequest
  ): Promise<Subscription> {
    return await this.updateSubscription(subscriptionId, {
      tier: req.newTier,
      billingPeriod: req.billingPeriod,
    });
  }

  async downgradeSubscription(
    subscriptionId: string,
    newTier: PlanTier,
    atPeriodEnd: boolean = true
  ): Promise<Subscription> {
    const subscription = await this.getSubscription(subscriptionId);

    // Schedule downgrade at period end or immediately
    if (atPeriodEnd) {
      // Update immediately but it takes effect at next billing cycle
      return await this.updateSubscription(subscriptionId, { tier: newTier });
    } else {
      // Immediate downgrade with proration
      return await this.updateSubscription(subscriptionId, { tier: newTier });
    }
  }

  async cancelSubscription(
    subscriptionId: string,
    req: CancelSubscriptionRequest
  ): Promise<Subscription> {
    const subscription = await this.getSubscription(subscriptionId);

    // Cancel in Stripe
    await this.stripe.cancelSubscription(
      subscription.stripeSubscriptionId,
      req.cancelImmediately || false
    );

    // Update in database
    const query = `
      UPDATE subscriptions
      SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.db.query(query, [subscriptionId]);
    return this.mapDatabaseSubscription(result.rows[0]);
  }

  async pauseSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.getSubscription(subscriptionId);

    // Pause in Stripe
    await this.stripe.pauseSubscription(subscription.stripeSubscriptionId);

    // Update in database
    const query = `
      UPDATE subscriptions
      SET status = 'paused', paused_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.db.query(query, [subscriptionId]);
    return this.mapDatabaseSubscription(result.rows[0]);
  }

  async resumeSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.getSubscription(subscriptionId);

    // Resume in Stripe
    await this.stripe.resumeSubscription(subscription.stripeSubscriptionId);

    // Update in database
    const query = `
      UPDATE subscriptions
      SET status = 'active', paused_at = NULL, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.db.query(query, [subscriptionId]);
    return this.mapDatabaseSubscription(result.rows[0]);
  }

  // =====================================================
  // PAYMENT METHOD MANAGEMENT
  // =====================================================

  async addPaymentMethod(
    customerId: string,
    stripePaymentMethodId: string,
    isDefault: boolean = false
  ): Promise<PaymentMethod> {
    const customer = await this.getCustomer(customerId);

    // Attach to Stripe customer
    await this.stripe.attachPaymentMethod(customer.stripeCustomerId, stripePaymentMethodId);

    // Store in database
    const query = `
      INSERT INTO payment_methods (
        customer_id, stripe_payment_method_id, is_default
      ) VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await this.db.query(query, [customerId, stripePaymentMethodId, isDefault]);
    return this.mapDatabasePaymentMethod(result.rows[0]);
  }

  async removePaymentMethod(paymentMethodId: string): Promise<void> {
    const query = `
      SELECT stripe_payment_method_id FROM payment_methods WHERE id = $1
    `;

    const result = await this.db.query(query, [paymentMethodId]);
    if (result.rows.length === 0) {
      throw new Error(`Payment method ${paymentMethodId} not found`);
    }

    // Detach from Stripe
    await this.stripe.detachPaymentMethod(result.rows[0].stripe_payment_method_id);

    // Delete from database
    await this.db.query(`DELETE FROM payment_methods WHERE id = $1`, [paymentMethodId]);
  }

  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    const query = `
      UPDATE payment_methods
      SET is_default = (id = $1)
      WHERE customer_id = $2
    `;

    await this.db.query(query, [paymentMethodId, customerId]);
  }

  // =====================================================
  // INVOICE MANAGEMENT
  // =====================================================

  async getInvoices(customerId: string, limit: number = 10): Promise<Invoice[]> {
    const query = `
      SELECT * FROM invoices
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.db.query(query, [customerId, limit]);
    return result.rows.map((row) => this.mapDatabaseInvoice(row));
  }

  async getInvoice(invoiceId: string): Promise<Invoice> {
    const query = `
      SELECT * FROM invoices WHERE id = $1
    `;

    const result = await this.db.query(query, [invoiceId]);
    if (result.rows.length === 0) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    return this.mapDatabaseInvoice(result.rows[0]);
  }

  async createManualInvoice(params: {
    customerId: string;
    description: string;
    items: Array<{ description: string; amount: number; quantity?: number }>;
    dueDate?: Date;
  }): Promise<Invoice> {
    const customer = await this.getCustomer(params.customerId);

    // Create in Stripe
    const stripeInvoice = await this.stripe.createInvoice({
      customerId: customer.stripeCustomerId,
      description: params.description,
      items: params.items,
      dueDate: params.dueDate,
      metadata: {
        customerId: params.customerId,
      },
    });

    // Store in database
    const query = `
      INSERT INTO invoices (
        customer_id, stripe_invoice_id, invoice_number, status,
        description, amount_due, currency, billing_email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      params.customerId,
      stripeInvoice.id,
      stripeInvoice.number || '',
      stripeInvoice.status || 'draft',
      params.description,
      stripeInvoice.amount_due || 0,
      stripeInvoice.currency,
      customer.billingEmail,
    ]);

    return this.mapDatabaseInvoice(result.rows[0]);
  }

  // =====================================================
  // USAGE & METERING
  // =====================================================

  async getUsageMetrics(
    customerId: string,
    subscription: Subscription
  ): Promise<UsageMetrics> {
    const customer = await this.getCustomer(customerId);
    return await this.usageTracker.getUsageMetrics(customer.workspaceId, customerId, subscription);
  }

  async recordUsage(params: {
    customerId: string;
    agentCount: number;
    userCount: number;
    dataUsedMB: number;
  }): Promise<void> {
    const customer = await this.getCustomer(params.customerId);

    await this.usageTracker.recordUsage({
      workspaceId: customer.workspaceId,
      customerId: params.customerId,
      timestamp: new Date(),
      metrics: {
        agentCount: params.agentCount,
        userCount: params.userCount,
        dataUsedMB: params.dataUsedMB,
        deploymentCount: 1,
      },
    });
  }

  async checkUsageLimits(customerId: string, subscription: Subscription): Promise<boolean> {
    const customer = await this.getCustomer(customerId);
    const limits = await this.usageTracker.checkUsageLimits(
      customer.workspaceId,
      customerId,
      subscription
    );

    return limits.isWithinLimits;
  }

  async calculateMeteredCharges(
    customerId: string,
    subscription: Subscription
  ): Promise<number> {
    const customer = await this.getCustomer(customerId);
    const charges = await this.usageTracker.calculateMeteredCharges(
      customer.workspaceId,
      customerId,
      subscription
    );

    return charges.totalMeteredCharges;
  }

  // =====================================================
  // BILLING ACCOUNT & REPORTING
  // =====================================================

  async getBillingAccount(customerId: string): Promise<BillingAccount> {
    const customer = await this.getCustomer(customerId);
    const subscription = await this.getSubscriptionByCustomer(customerId);

    if (!subscription) {
      throw new Error(`No subscription found for customer ${customerId}`);
    }

    const paymentMethods = await this.getPaymentMethods(customerId);
    const invoices = await this.getInvoices(customerId);
    const usageMetrics = await this.getUsageMetrics(customerId, subscription);

    return {
      id: `billing_${customerId}`,
      customerId,
      workspaceId: customer.workspaceId,
      subscription,
      paymentMethods,
      invoices,
      usageMetrics,
      settings: {
        autoRenew: subscription.autoRenew,
        sendInvoiceEmails: true,
        sendPaymentReminders: true,
        remindDaysBeforeDue: 3,
        billingCycle: subscription.billingPeriod,
        currencyPreference: 'USD',
      },
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  async getSubscriptionByCustomer(customerId: string): Promise<Subscription | null> {
    const query = `
      SELECT * FROM subscriptions
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [customerId]);
    return result.rows.length > 0 ? this.mapDatabaseSubscription(result.rows[0]) : null;
  }

  async getPaymentMethods(customerId: string): Promise<PaymentMethod[]> {
    const query = `
      SELECT * FROM payment_methods
      WHERE customer_id = $1
      ORDER BY is_default DESC, created_at DESC
    `;

    const result = await this.db.query(query, [customerId]);
    return result.rows.map((row) => this.mapDatabasePaymentMethod(row));
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private async getOrCreateCustomer(workspaceId: string): Promise<Customer> {
    const query = `
      SELECT * FROM customers WHERE workspace_id = $1 LIMIT 1
    `;

    const result = await this.db.query(query, [workspaceId]);
    if (result.rows.length > 0) {
      return this.mapDatabaseCustomer(result.rows[0]);
    }

    // Create new customer with placeholder data
    return await this.createCustomer({
      workspaceId,
      email: `workspace-${workspaceId}@ledgr.local`,
      companyName: `Workspace ${workspaceId}`,
    });
  }

  private mapDatabaseCustomer(row: any): Customer {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      stripeCustomerId: row.stripe_customer_id,
      email: row.email,
      billingEmail: row.billing_email,
      companyName: row.company_name,
      status: row.status || 'active',
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapDatabaseSubscription(row: any): Subscription {
    return {
      id: row.id,
      customerId: row.customer_id,
      workspaceId: row.workspace_id,
      tier: row.tier as PlanTier,
      status: row.status as SubscriptionStatus,
      billingPeriod: row.billing_period as BillingPeriod,
      stripeSubscriptionId: row.stripe_subscription_id,
      stripePriceId: row.stripe_price_id,
      currentPeriodStart: new Date(row.current_period_start),
      currentPeriodEnd: new Date(row.current_period_end),
      autoRenew: row.auto_renew,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapDatabaseInvoice(row: any): Invoice {
    return {
      id: row.id,
      customerId: row.customer_id,
      workspaceId: row.workspace_id,
      subscriptionId: row.subscription_id,
      stripeInvoiceId: row.stripe_invoice_id,
      invoiceNumber: row.invoice_number,
      status: row.status,
      description: row.description,
      amountSubtotal: row.amount_subtotal || 0,
      amountTax: row.amount_tax || 0,
      amountDue: row.amount_due || 0,
      amountPaid: row.amount_paid || 0,
      currency: row.currency || 'USD',
      billingEmail: row.billing_email,
      invoiceDate: new Date(row.invoice_date),
      paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
      pdfUrl: row.pdf_url,
      items: [],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapDatabasePaymentMethod(row: any): PaymentMethod {
    return {
      id: row.id,
      customerId: row.customer_id,
      stripePaymentMethodId: row.stripe_payment_method_id,
      type: row.type || 'card',
      brand: row.brand,
      last4: row.last4,
      isDefault: row.is_default,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // Stub for database access - should be injected
  private db: Pool = null as any;
}

export default BillingService;
