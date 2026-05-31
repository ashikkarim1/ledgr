/**
 * Billing System Type Definitions
 * Comprehensive types for Stripe integration and SaaS billing
 */

// =====================================================
// SUBSCRIPTION TYPES
// =====================================================

export type BillingPeriod = 'monthly' | 'annual';
export type SubscriptionStatus = 'active' | 'past_due' | 'paused' | 'canceled' | 'incomplete' | 'incomplete_expired';
export type PlanTier = 'starter' | 'professional' | 'enterprise';

export interface SubscriptionTierConfig {
  tier: PlanTier;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: {
    maxUsers: number;
    maxAgents: number;
    storage: number; // MB
    supportLevel: 'basic' | 'priority' | 'dedicated';
  };
}

export interface Subscription {
  id: string;
  customerId: string;
  workspaceId: string;
  tier: PlanTier;
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod;
  stripeSubscriptionId: string;
  stripePriceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAt?: Date;
  canceledAt?: Date;
  pausedAt?: Date;
  autoRenew: boolean;
  usageOverrides?: UsageOverrides;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, string>;
}

export interface UsageOverrides {
  maxUsers?: number;
  maxAgents?: number;
  maxDataUsageGB?: number;
}

// =====================================================
// PAYMENT & INVOICE TYPES
// =====================================================

export interface PaymentMethod {
  id: string;
  customerId: string;
  stripePaymentMethodId: string;
  type: 'card' | 'bank_account';
  brand?: string; // visa, mastercard, amex, etc
  last4: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  customerId: string;
  workspaceId: string;
  subscriptionId?: string;
  stripeInvoiceId: string;
  invoiceNumber: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  description?: string;
  amountSubtotal: number;
  amountTax: number;
  amountDue: number;
  amountPaid: number;
  currency: string; // ISO 4217 code
  billingEmail: string;
  invoiceDate: Date;
  dueDate?: Date;
  paidAt?: Date;
  pdfUrl?: string;
  items: InvoiceLineItem[];
  tax?: TaxBreakdown;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  proration?: {
    isProration: boolean;
    reason: 'subscription_tier_change' | 'subscription_update' | 'cycle_change';
  };
}

export interface TaxBreakdown {
  taxId?: string;
  taxType: 'sales_tax' | 'vat' | 'gst';
  rate: number; // percentage
  jurisdiction: string; // state or country code
  calculatedAt: Date;
}

// =====================================================
// USAGE TRACKING TYPES
// =====================================================

export interface UsageMetrics {
  workspaceId: string;
  customerId: string;
  period: {
    start: Date;
    end: Date;
  };
  usage: {
    agentsDeployed: number;
    usersAdded: number;
    dataUsedMB: number;
  };
  limits: {
    maxAgents: number;
    maxUsers: number;
    maxDataGB: number;
  };
  warnings: UsageWarning[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageWarning {
  metric: 'agents' | 'users' | 'data';
  currentUsage: number;
  limit: number;
  percentage: number;
  severity: 'warning' | 'critical'; // warning: 80%, critical: 95%
  message: string;
}

export interface MeteredUsage {
  workspaceId: string;
  customerId: string;
  timestamp: Date;
  metrics: {
    agentCount: number;
    userCount: number;
    dataUsedMB: number;
    deploymentCount: number;
  };
}

// =====================================================
// CUSTOMER & BILLING ACCOUNT TYPES
// =====================================================

export interface Customer {
  id: string;
  workspaceId: string;
  stripeCustomerId: string;
  email: string;
  billingEmail: string;
  companyName: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  taxId?: string; // VAT ID, EIN, etc
  defaultPaymentMethodId?: string;
  subscriptionId?: string;
  status: 'active' | 'inactive' | 'suspended';
  metadata?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingAccount {
  id: string;
  customerId: string;
  workspaceId: string;
  subscription: Subscription;
  paymentMethods: PaymentMethod[];
  defaultPaymentMethodId?: string;
  invoices: Invoice[];
  usageMetrics: UsageMetrics;
  settings: BillingSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingSettings {
  autoRenew: boolean;
  sendInvoiceEmails: boolean;
  sendPaymentReminders: boolean;
  remindDaysBeforeDue: number;
  billingCycle: 'monthly' | 'annual';
  currencyPreference: string;
}

// =====================================================
// DISCOUNT & COUPON TYPES
// =====================================================

export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed_amount' | 'free_trial';
  value: number;
  currency?: string;
  description?: string;
  maxRedemptions?: number;
  redemptions: number;
  expiresAt?: Date;
  restrictions?: {
    minAmount?: number;
    allowedTiers?: PlanTier[];
    allowedBillingPeriods?: BillingPeriod[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface AppliedCoupon {
  id: string;
  customerId: string;
  couponId: string;
  coupon: Coupon;
  appliedAt: Date;
  expiresAt?: Date;
  redemptionCount: number;
}

// =====================================================
// PAYMENT RETRY & FAILURE TYPES
// =====================================================

export interface PaymentAttempt {
  id: string;
  invoiceId: string;
  customerId: string;
  stripeChargeId?: string;
  amount: number;
  status: 'pending' | 'succeeded' | 'failed' | 'requires_action';
  failureCode?: string;
  failureReason?: string;
  attemptNumber: number;
  nextRetryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentRetryPolicy {
  maxRetries: number;
  retryIntervalDays: number;
  finalRetryDays: number; // Days before final retry
}

// =====================================================
// WEBHOOK TYPES
// =====================================================

export type StripeEventType =
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.created'
  | 'invoice.updated'
  | 'invoice.finalized'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed'
  | 'invoice.payment_action_required'
  | 'charge.succeeded'
  | 'charge.failed'
  | 'charge.refunded'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed';

export interface WebhookEvent {
  id: string;
  stripeEventId: string;
  type: StripeEventType;
  data: any;
  processed: boolean;
  processedAt?: Date;
  error?: string;
  createdAt: Date;
}

// =====================================================
// FINANCIAL REPORTING TYPES
// =====================================================

export interface MRRData {
  period: Date;
  totalMRR: number;
  newMRR: number;
  expansionMRR: number;
  contractionMRR: number;
  churnMRR: number;
  byTier: {
    starter: number;
    professional: number;
    enterprise: number;
  };
}

export interface ChurnMetrics {
  period: Date;
  totalCustomers: number;
  churnedCustomers: number;
  churnRate: number; // percentage
  netsNewCustomers: number;
}

export interface CustomerLifetimeValue {
  customerId: string;
  totalRevenue: number;
  averageMonthlyRevenue: number;
  totalMonthsActive: number;
  estimatedLTV: number;
  churnRisk: number; // 0-100 percentage
}

export interface CohortAnalysis {
  cohort: string; // YYYY-MM format
  cohortSize: number;
  periods: {
    month: number;
    activeCustomers: number;
    revenue: number;
    retentionRate: number;
  }[];
}

export interface FinancialSummary {
  period: {
    start: Date;
    end: Date;
  };
  mrr: MRRData;
  arr: number;
  totalRevenue: number;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  customerMetrics: {
    totalCustomers: number;
    newCustomers: number;
    churnedCustomers: number;
  };
}

// =====================================================
// API REQUEST/RESPONSE TYPES
// =====================================================

export interface CreateSubscriptionRequest {
  workspaceId: string;
  tier: PlanTier;
  billingPeriod: BillingPeriod;
  paymentMethodId?: string;
  couponCode?: string;
}

export interface UpdateSubscriptionRequest {
  tier?: PlanTier;
  billingPeriod?: BillingPeriod;
  autoRenew?: boolean;
}

export interface CancelSubscriptionRequest {
  reason?: string;
  feedbackNotes?: string;
  cancelImmediately?: boolean;
}

export interface UpgradeSubscriptionRequest {
  newTier: PlanTier;
  billingPeriod?: BillingPeriod;
  prorationBehavior?: 'create_prorations' | 'none';
}

// =====================================================
// ERROR & RESPONSE TYPES
// =====================================================

export interface BillingError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
}

export interface BillingResponse<T> {
  success: boolean;
  data?: T;
  error?: BillingError;
  metadata?: {
    requestId: string;
    timestamp: Date;
  };
}
