/**
 * Stripe API Wrapper
 * Encapsulates all Stripe API interactions with type safety
 */

import Stripe from 'stripe';
import {
  Subscription,
  PaymentMethod,
  Invoice,
  Customer,
  BillingPeriod,
  PlanTier,
  SubscriptionTierConfig,
  Invoice as BillingInvoice,
  InvoiceLineItem,
} from './billing-types';

/**
 * Stripe Configuration & Pricing
 */
export const SUBSCRIPTION_TIERS: Record<PlanTier, SubscriptionTierConfig> = {
  starter: {
    tier: 'starter',
    name: 'Starter',
    description: '1 user, 1 agent, basic support',
    monthlyPrice: 99,
    annualPrice: 950.4, // 20% discount
    features: {
      maxUsers: 1,
      maxAgents: 1,
      storage: 5000, // 5GB
      supportLevel: 'basic',
    },
  },
  professional: {
    tier: 'professional',
    name: 'Professional',
    description: '5 users, 3 agents, priority support',
    monthlyPrice: 299,
    annualPrice: 2871.6, // 20% discount
    features: {
      maxUsers: 5,
      maxAgents: 3,
      storage: 50000, // 50GB
      supportLevel: 'priority',
    },
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited users & agents, dedicated support',
    monthlyPrice: 0, // Custom pricing
    annualPrice: 0,
    features: {
      maxUsers: 999999,
      maxAgents: 999999,
      storage: 1000000, // 1TB
      supportLevel: 'dedicated',
    },
  },
};

/**
 * Metered Pricing Configuration
 */
export const METERED_PRICING = {
  additionalAgent: 50, // $50/month per agent
  additionalUser: 20, // $20/month per user
  dataUsagePerMB: 0.01, // $0.01 per MB/month
};

/**
 * Stripe Integration Class
 */
export class StripeIntegration {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(apiKey: string, webhookSecret: string) {
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2024-04-10',
      typescript: true,
    });
    this.webhookSecret = webhookSecret;
  }

  // =====================================================
  // CUSTOMER MANAGEMENT
  // =====================================================

  async createCustomer(customer: {
    email: string;
    name: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    try {
      return await this.stripe.customers.create({
        email: customer.email,
        name: customer.name,
        description: customer.description,
        metadata: customer.metadata,
      });
    } catch (error) {
      throw new Error(`Failed to create Stripe customer: ${error}`);
    }
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    try {
      return await this.stripe.customers.retrieve(customerId);
    } catch (error) {
      throw new Error(`Failed to retrieve customer ${customerId}: ${error}`);
    }
  }

  async updateCustomer(
    customerId: string,
    updates: {
      email?: string;
      name?: string;
      address?: Stripe.AddressParam;
      metadata?: Record<string, string>;
    }
  ): Promise<Stripe.Customer> {
    try {
      return await this.stripe.customers.update(customerId, updates);
    } catch (error) {
      throw new Error(`Failed to update customer ${customerId}: ${error}`);
    }
  }

  // =====================================================
  // SUBSCRIPTION MANAGEMENT
  // =====================================================

  async createSubscription(params: {
    customerId: string;
    tier: PlanTier;
    billingPeriod: BillingPeriod;
    paymentMethodId?: string;
    trialDays?: number;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    try {
      const tierConfig = SUBSCRIPTION_TIERS[params.tier];
      const price = params.billingPeriod === 'monthly' ? tierConfig.monthlyPrice : tierConfig.annualPrice;
      const interval = params.billingPeriod === 'monthly' ? 'month' : 'year';

      const items: Stripe.SubscriptionCreateParams.Item[] = [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(price * 100),
            recurring: {
              interval,
              interval_count: 1,
            },
            product_data: {
              name: `${tierConfig.name} Plan`,
              description: tierConfig.description,
              metadata: {
                tier: params.tier,
                billingPeriod: params.billingPeriod,
              },
            },
          },
          quantity: 1,
        },
      ];

      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: params.customerId,
        items,
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          tier: params.tier,
          billingPeriod: params.billingPeriod,
          ...params.metadata,
        },
      };

      if (params.trialDays) {
        subscriptionParams.trial_period_days = params.trialDays;
      }

      if (params.paymentMethodId) {
        subscriptionParams.default_payment_method = params.paymentMethodId;
      }

      return await this.stripe.subscriptions.create(subscriptionParams);
    } catch (error) {
      throw new Error(`Failed to create subscription: ${error}`);
    }
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice'],
      });
    } catch (error) {
      throw new Error(`Failed to retrieve subscription ${subscriptionId}: ${error}`);
    }
  }

  async updateSubscription(
    subscriptionId: string,
    updates: {
      tier?: PlanTier;
      billingPeriod?: BillingPeriod;
      paymentMethod?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<Stripe.Subscription> {
    try {
      const stripeUpdates: Stripe.SubscriptionUpdateParams = {};

      if (updates.metadata) {
        stripeUpdates.metadata = updates.metadata;
      }

      if (updates.paymentMethod) {
        stripeUpdates.default_payment_method = updates.paymentMethod;
      }

      // If tier or billing period changed, handle item upgrade/downgrade
      if (updates.tier || updates.billingPeriod) {
        const sub = await this.getSubscription(subscriptionId);
        const currentItem = sub.items.data[0];

        if (currentItem) {
          const newTier = updates.tier;
          const tierConfig = SUBSCRIPTION_TIERS[newTier || 'starter'];
          const newPrice =
            (updates.billingPeriod || 'monthly') === 'monthly'
              ? tierConfig.monthlyPrice
              : tierConfig.annualPrice;

          stripeUpdates.items = [
            {
              id: currentItem.id,
              price_data: {
                currency: 'usd',
                unit_amount: Math.round(newPrice * 100),
                recurring: {
                  interval: (updates.billingPeriod || 'monthly') === 'monthly' ? 'month' : 'year',
                  interval_count: 1,
                },
                product: currentItem.price.product as string,
              },
            },
          ];

          stripeUpdates.proration_behavior = 'create_prorations';
        }
      }

      return await this.stripe.subscriptions.update(subscriptionId, stripeUpdates);
    } catch (error) {
      throw new Error(`Failed to update subscription ${subscriptionId}: ${error}`);
    }
  }

  async cancelSubscription(
    subscriptionId: string,
    immediate: boolean = false
  ): Promise<Stripe.Subscription> {
    try {
      if (immediate) {
        return await this.stripe.subscriptions.del(subscriptionId);
      } else {
        return await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      }
    } catch (error) {
      throw new Error(`Failed to cancel subscription ${subscriptionId}: ${error}`);
    }
  }

  async pauseSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.update(subscriptionId, {
        pause_collection: { behavior: 'void' },
      });
    } catch (error) {
      throw new Error(`Failed to pause subscription ${subscriptionId}: ${error}`);
    }
  }

  async resumeSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.update(subscriptionId, {
        pause_collection: null as any,
      });
    } catch (error) {
      throw new Error(`Failed to resume subscription ${subscriptionId}: ${error}`);
    }
  }

  // =====================================================
  // PAYMENT METHOD MANAGEMENT
  // =====================================================

  async attachPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<Stripe.PaymentMethod> {
    try {
      return await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    } catch (error) {
      throw new Error(`Failed to attach payment method: ${error}`);
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    try {
      return await this.stripe.paymentMethods.detach(paymentMethodId);
    } catch (error) {
      throw new Error(`Failed to detach payment method: ${error}`);
    }
  }

  async getPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    try {
      return await this.stripe.paymentMethods.retrieve(paymentMethodId);
    } catch (error) {
      throw new Error(`Failed to retrieve payment method: ${error}`);
    }
  }

  async updatePaymentMethod(
    paymentMethodId: string,
    updates: {
      billingDetails?: Stripe.PaymentMethodUpdateParams.BillingDetails;
      metadata?: Record<string, string>;
    }
  ): Promise<Stripe.PaymentMethod> {
    try {
      return await this.stripe.paymentMethods.update(paymentMethodId, updates);
    } catch (error) {
      throw new Error(`Failed to update payment method: ${error}`);
    }
  }

  // =====================================================
  // INVOICE MANAGEMENT
  // =====================================================

  async createInvoice(params: {
    customerId: string;
    description?: string;
    items: Array<{
      description: string;
      amount: number;
      quantity?: number;
    }>;
    dueDate?: Date;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Invoice> {
    try {
      const invoice = await this.stripe.invoices.create({
        customer: params.customerId,
        description: params.description,
        metadata: params.metadata,
      });

      for (const item of params.items) {
        await this.stripe.invoiceItems.create({
          invoice: invoice.id,
          customer: params.customerId,
          description: item.description,
          amount: Math.round(item.amount * 100),
          quantity: item.quantity || 1,
        });
      }

      if (params.dueDate) {
        await this.stripe.invoices.update(invoice.id, {
          due_date: Math.floor(params.dueDate.getTime() / 1000),
        });
      }

      return await this.stripe.invoices.finalizeInvoice(invoice.id);
    } catch (error) {
      throw new Error(`Failed to create invoice: ${error}`);
    }
  }

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    try {
      return await this.stripe.invoices.retrieve(invoiceId);
    } catch (error) {
      throw new Error(`Failed to retrieve invoice ${invoiceId}: ${error}`);
    }
  }

  async listCustomerInvoices(
    customerId: string,
    limit: number = 10
  ): Promise<Stripe.Invoice[]> {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit,
      });
      return invoices.data;
    } catch (error) {
      throw new Error(`Failed to list invoices for customer ${customerId}: ${error}`);
    }
  }

  async sendInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    try {
      return await this.stripe.invoices.sendInvoice(invoiceId);
    } catch (error) {
      throw new Error(`Failed to send invoice ${invoiceId}: ${error}`);
    }
  }

  async voidInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    try {
      return await this.stripe.invoices.voidInvoice(invoiceId);
    } catch (error) {
      throw new Error(`Failed to void invoice ${invoiceId}: ${error}`);
    }
  }

  async markInvoiceUncollectible(invoiceId: string): Promise<Stripe.Invoice> {
    try {
      return await this.stripe.invoices.markUncollectible(invoiceId);
    } catch (error) {
      throw new Error(`Failed to mark invoice as uncollectible: ${error}`);
    }
  }

  // =====================================================
  // REFUND & CREDIT MANAGEMENT
  // =====================================================

  async createRefund(params: {
    chargeId?: string;
    paymentIntentId?: string;
    amount?: number;
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    metadata?: Record<string, string>;
  }): Promise<Stripe.Refund> {
    try {
      return await this.stripe.refunds.create({
        charge: params.chargeId,
        payment_intent: params.paymentIntentId,
        amount: params.amount ? Math.round(params.amount * 100) : undefined,
        reason: params.reason,
        metadata: params.metadata,
      });
    } catch (error) {
      throw new Error(`Failed to create refund: ${error}`);
    }
  }

  async createCreditNote(params: {
    invoiceId: string;
    amount?: number;
    reason?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.CreditNote> {
    try {
      return await this.stripe.creditNotes.create({
        invoice: params.invoiceId,
        amount: params.amount ? Math.round(params.amount * 100) : undefined,
        reason: params.reason as any,
        metadata: params.metadata,
      });
    } catch (error) {
      throw new Error(`Failed to create credit note: ${error}`);
    }
  }

  // =====================================================
  // COUPON & DISCOUNT MANAGEMENT
  // =====================================================

  async createCoupon(params: {
    code: string;
    type: 'percentage' | 'amount_off';
    value: number; // percentage (e.g., 20) or amount in cents
    duration: 'forever' | 'repeating' | 'once';
    durationInMonths?: number;
    maxRedemptions?: number;
    expiresAt?: Date;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Coupon> {
    try {
      const couponData: Stripe.CouponCreateParams = {
        id: params.code,
        duration: params.duration,
        metadata: params.metadata,
      };

      if (params.type === 'percentage') {
        couponData.percent_off = params.value;
      } else {
        couponData.amount_off = Math.round(params.value * 100);
        couponData.currency = 'usd';
      }

      if (params.durationInMonths && params.duration === 'repeating') {
        couponData.duration_in_months = params.durationInMonths;
      }

      if (params.maxRedemptions) {
        couponData.max_redemptions = params.maxRedemptions;
      }

      if (params.expiresAt) {
        couponData.redeem_by = Math.floor(params.expiresAt.getTime() / 1000);
      }

      return await this.stripe.coupons.create(couponData);
    } catch (error) {
      throw new Error(`Failed to create coupon: ${error}`);
    }
  }

  async applyCouponToCustomer(
    customerId: string,
    couponId: string
  ): Promise<Stripe.Customer> {
    try {
      return await this.stripe.customers.update(customerId, {
        coupon: couponId,
      });
    } catch (error) {
      throw new Error(`Failed to apply coupon: ${error}`);
    }
  }

  // =====================================================
  // WEBHOOK HANDLING
  // =====================================================

  constructWebhookEvent(body: string, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(body, signature, this.webhookSecret);
    } catch (error) {
      throw new Error(`Webhook signature verification failed: ${error}`);
    }
  }

  // =====================================================
  // REPORTING & ANALYTICS
  // =====================================================

  async listSubscriptions(
    params: Stripe.SubscriptionListParams = {}
  ): Promise<Stripe.Subscription[]> {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        ...params,
        limit: 100,
      });
      return subscriptions.data;
    } catch (error) {
      throw new Error(`Failed to list subscriptions: ${error}`);
    }
  }

  async getAccountBalance(): Promise<Stripe.Balance> {
    try {
      return await this.stripe.balance.retrieve();
    } catch (error) {
      throw new Error(`Failed to retrieve account balance: ${error}`);
    }
  }

  async listCharges(
    params: Stripe.ChargeListParams = {}
  ): Promise<Stripe.Charge[]> {
    try {
      const charges = await this.stripe.charges.list({
        ...params,
        limit: 100,
      });
      return charges.data;
    } catch (error) {
      throw new Error(`Failed to list charges: ${error}`);
    }
  }
}

export default StripeIntegration;
