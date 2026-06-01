# Ledgr Billing System Integration Guide

## Overview

This guide provides complete instructions for integrating the Ledgr Stripe billing system into your application. The billing system includes subscription management, usage tracking, payment processing, and webhook handling.

## Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [Database Schema](#database-schema)
3. [Environment Variables](#environment-variables)
4. [Webhook Configuration](#webhook-configuration)
5. [Integration Guide](#integration-guide)
6. [API Reference](#api-reference)
7. [Usage Examples](#usage-examples)
8. [Payment Retry Workflow](#payment-retry-workflow)
9. [Admin Dashboard](#admin-dashboard)
10. [Troubleshooting](#troubleshooting)

---

## Setup & Configuration

### Prerequisites

- Stripe account (production and test environments)
- Node.js 16+ with TypeScript support
- PostgreSQL database
- Express.js API server
- React frontend (for billing dashboard)

### Installation

```bash
# Install Stripe SDK
npm install stripe @stripe/stripe-js

# Install types
npm install --save-dev @types/stripe

# Backend dependencies (if not already installed)
npm install express dotenv pg
```

### Stripe API Version

This integration uses **Stripe API v2024-04-10**. Ensure your Stripe account is configured to use this version in your Dashboard → Settings → API Version.

---

## Database Schema

### Create Required Tables

Run the following SQL to set up the billing database tables:

```sql
-- Customers Table
CREATE TABLE IF NOT EXISTS billing_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE,
  stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions Table
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES billing_customers(id),
  stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
  plan_tier VARCHAR(50) NOT NULL, -- 'starter', 'professional', 'enterprise'
  status VARCHAR(50) NOT NULL, -- 'active', 'past_due', 'paused', 'canceled', 'incomplete'
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  billing_period VARCHAR(50), -- 'monthly', 'annual'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Methods Table
CREATE TABLE IF NOT EXISTS billing_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES billing_customers(id),
  stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,
  type VARCHAR(50), -- 'card', 'sepa_debit', 'ach_credit_transfer'
  card_brand VARCHAR(50),
  card_last_four VARCHAR(4),
  exp_month INTEGER,
  exp_year INTEGER,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices Table
CREATE TABLE IF NOT EXISTS billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES billing_customers(id),
  stripe_invoice_id VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50), -- 'draft', 'open', 'paid', 'void', 'uncollectible'
  amount_due BIGINT, -- in cents
  amount_paid BIGINT,
  amount_remaining BIGINT,
  currency VARCHAR(3) DEFAULT 'usd',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usage Tracking Table
CREATE TABLE IF NOT EXISTS billing_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES billing_customers(id),
  billing_period_start TIMESTAMP NOT NULL,
  billing_period_end TIMESTAMP NOT NULL,
  agent_count INTEGER DEFAULT 0,
  user_count INTEGER DEFAULT 0,
  data_used_mb DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usage Alerts Table
CREATE TABLE IF NOT EXISTS billing_usage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES billing_customers(id),
  billing_period_start TIMESTAMP NOT NULL,
  alert_type VARCHAR(50), -- 'warning' (80%), 'critical' (95%)
  metric_type VARCHAR(50), -- 'agents', 'users', 'storage'
  current_usage INTEGER,
  limit_value INTEGER,
  notified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhook Events Table
CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  event_data JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Attempts Table
CREATE TABLE IF NOT EXISTS billing_payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES billing_invoices(id),
  customer_id UUID NOT NULL REFERENCES billing_customers(id),
  attempt_number INTEGER DEFAULT 1,
  failed_at TIMESTAMP,
  next_retry_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for Performance
CREATE INDEX idx_billing_customers_stripe_id ON billing_customers(stripe_customer_id);
CREATE INDEX idx_billing_subscriptions_customer_id ON billing_subscriptions(customer_id);
CREATE INDEX idx_billing_subscriptions_stripe_id ON billing_subscriptions(stripe_subscription_id);
CREATE INDEX idx_billing_payment_methods_customer_id ON billing_payment_methods(customer_id);
CREATE INDEX idx_billing_invoices_customer_id ON billing_invoices(customer_id);
CREATE INDEX idx_billing_usage_customer_id ON billing_usage(customer_id);
CREATE INDEX idx_billing_webhook_events_stripe_id ON billing_webhook_events(stripe_event_id);
CREATE INDEX idx_billing_payment_attempts_invoice_id ON billing_payment_attempts(invoice_id);
```

---

## Environment Variables

Create a `.env` file in your backend root directory:

```env
# Stripe Keys (get from Stripe Dashboard)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Stripe API Version
STRIPE_API_VERSION=2024-04-10

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/ledgr_db

# Server Configuration
SERVER_PORT=3000
NODE_ENV=development

# Webhook Configuration
WEBHOOK_ENDPOINT_URL=https://yourdomain.com/api/webhooks/stripe

# Admin Email for Billing Notifications
ADMIN_EMAIL=billing@ledgr.io

# Tax Configuration (optional)
TAX_ID_TYPE=us_sales_tax_enabled
ENABLE_TAX_CALCULATION=true
```

### Loading Environment Variables

In your Express app:

```typescript
import dotenv from 'dotenv';

dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const databaseUrl = process.env.DATABASE_URL;
```

---

## Webhook Configuration

### Register Webhook Endpoint with Stripe

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers → Webhooks**
3. Click **+ Add endpoint**
4. Enter Endpoint URL: `https://yourdomain.com/api/webhooks/stripe`
5. Select events to listen for:
   - `customer.created`
   - `customer.updated`
   - `customer.deleted`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.created`
   - `invoice.finalized`
   - `charge.succeeded`
   - `charge.failed`
   - `charge.refunded`
6. Click **Add endpoint**
7. Copy the **Signing Secret** and add to your `.env` file as `STRIPE_WEBHOOK_SECRET`

### Webhook Endpoint Implementation

```typescript
// In your Express app (backend/routes/webhooks.ts)
import express from 'express';
import { WebhookHandler } from '../billing/webhook-handler';

const router = express.Router();
const webhookHandler = new WebhookHandler();

// Raw body required for Stripe signature verification
router.post('/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing webhook signature or secret' });
  }

  try {
    // Process webhook - signature verification happens inside
    await webhookHandler.processWebhook(req.body, sig);
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

export default router;
```

---

## Integration Guide

### Step 1: Initialize Stripe Integration in Your App

```typescript
// backend/services/billing.ts
import { BillingService } from '../billing/billing';
import { StripeIntegration } from '../billing/stripe-integration';
import { UsageTracker } from '../billing/usage-tracker';

const stripeIntegration = new StripeIntegration(
  process.env.STRIPE_SECRET_KEY!,
  process.env.STRIPE_API_VERSION!
);

const usageTracker = new UsageTracker();

export const billingService = new BillingService(
  stripeIntegration,
  usageTracker
);
```

### Step 2: Add Billing Routes to Express App

```typescript
// backend/server.ts
import express from 'express';
import billingRoutes from './billing/billing-api';
import webhookRoutes from './routes/webhooks';

const app = express();

// Middleware
app.use(express.json());

// Billing endpoints
app.use('/api/billing', billingRoutes);

// Webhook endpoints (must be before JSON parsing middleware)
app.use('/api/webhooks', webhookRoutes);

app.listen(3000, () => console.log('Server running on port 3000'));
```

### Step 3: Integrate Billing Dashboard in Frontend

```typescript
// frontend/pages/billing.tsx
import React from 'react';
import { BillingDashboard } from '../components/billing-dashboard';

export default function BillingPage() {
  return (
    <div>
      <h1>Billing & Subscription Management</h1>
      <BillingDashboard />
    </div>
  );
}
```

### Step 4: Track Usage in Your Application

When users perform metered actions (add agents, users, upload data):

```typescript
// Anywhere in your application when usage occurs
import { billingService } from '../services/billing';

// Track agent usage
await billingService.recordUsage(customerId, {
  agentCount: 1,
  userCount: 0,
  dataUsedMB: 0
});

// Check if customer has hit usage limits
const limits = await billingService.checkUsageLimits(customerId);
if (limits.hardLimitExceeded) {
  // Prevent user action or show warning
  throw new Error('Usage limit exceeded. Please upgrade your plan.');
}
```

---

## API Reference

### Subscription Endpoints

#### Create Subscription
```
POST /api/billing/subscriptions
Content-Type: application/json

{
  "customerId": "uuid",
  "planTier": "professional",
  "billingPeriod": "monthly",
  "paymentMethodId": "pm_xxxxx"
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "stripeSubscriptionId": "sub_xxxxx",
    "planTier": "professional",
    "status": "active"
  }
}
```

#### Upgrade/Downgrade Subscription
```
POST /api/billing/subscriptions/:id/upgrade
Content-Type: application/json

{
  "newPlanTier": "enterprise"
}

Response:
{
  "success": true,
  "data": { /* updated subscription */ }
}
```

#### Cancel Subscription
```
POST /api/billing/subscriptions/:id/cancel
Response:
{
  "success": true,
  "data": { /* canceled subscription */ }
}
```

### Payment Method Endpoints

#### Add Payment Method
```
POST /api/billing/payment-methods
Content-Type: application/json

{
  "customerId": "uuid",
  "stripePaymentMethodId": "pm_xxxxx"
}

Response:
{
  "success": true,
  "data": { /* payment method */ }
}
```

#### Set Default Payment Method
```
POST /api/billing/payment-methods/:id/default
Response:
{
  "success": true,
  "data": { /* payment method */ }
}
```

### Invoice Endpoints

#### List Invoices
```
GET /api/billing/invoices?customerId=uuid&limit=10&offset=0
Response:
{
  "success": true,
  "data": {
    "invoices": [ /* invoice objects */ ],
    "total": 42
  }
}
```

#### Download Invoice PDF
```
GET /api/billing/invoices/:id/download
Response: PDF file
```

### Usage Endpoints

#### Get Usage Metrics
```
GET /api/billing/usage?customerId=uuid
Response:
{
  "success": true,
  "data": {
    "currentUsage": {
      "agentCount": 5,
      "userCount": 12,
      "dataUsedMB": 250.5
    },
    "limits": {
      "maxAgents": 10,
      "maxUsers": 50,
      "maxStorageMB": 1000
    },
    "warnings": [ /* usage alerts */ ]
  }
}
```

#### Record Usage
```
POST /api/billing/usage
Content-Type: application/json

{
  "customerId": "uuid",
  "agentCount": 1,
  "userCount": 2,
  "dataUsedMB": 50.2
}

Response:
{
  "success": true,
  "data": { /* usage record */ }
}
```

#### Check Usage Limits
```
GET /api/billing/usage/check?customerId=uuid
Response:
{
  "success": true,
  "data": {
    "withinLimits": true,
    "softLimitExceeded": false,
    "hardLimitExceeded": false,
    "percentageUsed": 65
  }
}
```

#### Calculate Metered Charges
```
GET /api/billing/usage/charges?customerId=uuid
Response:
{
  "success": true,
  "data": {
    "additionalAgentCharges": 0,
    "additionalUserCharges": 20,
    "dataUsageCharges": 2.50,
    "totalOverages": 22.50
  }
}
```

### Billing Account Endpoint

#### Get Full Billing Account
```
GET /api/billing/account?customerId=uuid
Response:
{
  "success": true,
  "data": {
    "customer": { /* customer object */ },
    "subscription": { /* subscription object */ },
    "paymentMethods": [ /* payment methods */ ],
    "invoices": [ /* invoices */ ],
    "usage": { /* usage metrics */ }
  }
}
```

---

## Usage Examples

### Example 1: Create a Customer and Subscription

```typescript
import { billingService } from './services/billing';

async function createCustomerSubscription() {
  // Step 1: Create customer
  const customer = await billingService.createCustomer({
    organizationId: 'org_123',
    email: 'billing@company.com',
    name: 'Company Name'
  });

  // Step 2: Add payment method
  const paymentMethod = await billingService.addPaymentMethod(customer.id, 'pm_xxxxx');

  // Step 3: Create subscription
  const subscription = await billingService.createSubscription(customer.id, {
    planTier: 'professional',
    billingPeriod: 'monthly',
    paymentMethodId: paymentMethod.id
  });

  console.log('Subscription created:', subscription);
  return subscription;
}
```

### Example 2: Handle Usage Tracking and Overage Charges

```typescript
async function handleAgentCreation(customerId: string) {
  // Record the new agent
  await billingService.recordUsage(customerId, {
    agentCount: 1,
    userCount: 0,
    dataUsedMB: 0
  });

  // Check if limits exceeded
  const limits = await billingService.checkUsageLimits(customerId);
  
  if (limits.softLimitExceeded) {
    // Send warning email at 80% usage
    console.warn(`Customer ${customerId} is at 80% agent limit`);
  }

  if (limits.hardLimitExceeded) {
    throw new Error('Agent limit exceeded. Please upgrade your plan.');
  }

  // Calculate any overage charges
  const charges = await billingService.calculateMeteredCharges(customerId);
  if (charges.additionalAgentCharges > 0) {
    console.log(`Overage charges: $${charges.additionalAgentCharges}`);
  }
}
```

### Example 3: Upgrade Subscription

```typescript
async function upgradeUserPlan(customerId: string) {
  const subscription = await billingService.getSubscriptionByCustomer(customerId);
  
  const upgraded = await billingService.upgradeSubscription(
    subscription.id,
    'enterprise'
  );

  console.log('Plan upgraded:', upgraded);
  
  // Note: Stripe handles proration automatically
  // Customer will be charged/credited for the difference
}
```

### Example 4: Pause and Resume Subscription

```typescript
// Pause subscription (e.g., customer took a break)
const paused = await billingService.pauseSubscription(subscriptionId);

// Resume after a break
const resumed = await billingService.resumeSubscription(subscriptionId);
```

---

## Payment Retry Workflow

The billing system automatically retries failed payments with this workflow:

**Configuration:**
- Max retries: 3 attempts
- Retry interval: 1 day between attempts
- Total window: Up to 5 days

**Retry Timeline:**
1. **Day 0**: Initial payment attempt fails → Record attempt, schedule Day 1 retry
2. **Day 1**: Automatic retry attempt → If fails, schedule Day 2 retry
3. **Day 2**: Automatic retry attempt → If fails, schedule Day 3 retry
4. **Day 3**: Final retry attempt
5. **Day 4-5**: If all retries fail, invoice marked as uncollectible, subscription paused

**Webhook Events Triggered:**
- `charge.failed` → Records failed payment attempt
- After max retries exceeded → Subscription moved to `past_due` status

**Manual Intervention:**

```typescript
// Check payment attempts for an invoice
async function checkPaymentAttempts(invoiceId: string) {
  // Query billing_payment_attempts table for invoice_id
  const attempts = await db.query(
    'SELECT * FROM billing_payment_attempts WHERE invoice_id = $1',
    [invoiceId]
  );
  
  console.log(`Payment attempts: ${attempts.rows.length}/3`);
  attempts.rows.forEach((attempt, i) => {
    console.log(`Attempt ${i + 1}: ${attempt.failed_at}, Next retry: ${attempt.next_retry_at}`);
  });
}

// Manually retry a failed payment
async function retryPayment(invoiceId: string, paymentMethodId: string) {
  const invoice = await billingService.getInvoice(invoiceId);
  
  // Create new payment intent with existing payment method
  const payment = await stripeIntegration.stripe.paymentIntents.create({
    amount: invoice.amountDue,
    currency: 'usd',
    customer: invoice.customerId,
    payment_method: paymentMethodId,
    off_session: true
  });

  console.log('Manual payment attempt created:', payment.id);
}
```

---

## Admin Dashboard

### Setting Up Admin Billing Controls

Create an admin section to manage customer billing:

```typescript
// backend/routes/admin/billing.ts
import express from 'express';
import { billingService } from '../../services/billing';
import { requireAdmin } from '../../middleware/auth';

const router = express.Router();

// Admin: Get all customers
router.get('/customers', requireAdmin, async (req, res) => {
  const customers = await db.query('SELECT * FROM billing_customers');
  res.json(customers.rows);
});

// Admin: Manually issue refund
router.post('/refunds', requireAdmin, async (req, res) => {
  const { invoiceId, amount } = req.body;
  
  const refund = await stripeIntegration.createRefund(invoiceId, {
    amount: Math.round(amount * 100) // Convert to cents
  });

  res.json(refund);
});

// Admin: Pause/resume subscriptions
router.post('/subscriptions/:id/admin-pause', requireAdmin, async (req, res) => {
  const paused = await billingService.pauseSubscription(req.params.id);
  res.json(paused);
});

// Admin: View customer usage
router.get('/customers/:customerId/usage', requireAdmin, async (req, res) => {
  const usage = await billingService.getUsageMetrics(req.params.customerId);
  res.json(usage);
});

export default router;
```

### Financial Reporting

Calculate key billing metrics:

```typescript
// Calculate Monthly Recurring Revenue (MRR)
async function calculateMRR() {
  const result = await db.query(`
    SELECT 
      SUM(CASE 
        WHEN billing_period = 'monthly' THEN (
          SELECT amount FROM billing_invoices 
          WHERE stripe_invoice_id = stripe_subscription_id 
          LIMIT 1
        )
        WHEN billing_period = 'annual' THEN (
          SELECT amount / 12 FROM billing_invoices 
          WHERE stripe_invoice_id = stripe_subscription_id 
          LIMIT 1
        )
      END) as mrr
    FROM billing_subscriptions
    WHERE status = 'active'
  `);
  
  return result.rows[0].mrr / 100; // Convert from cents
}

// Calculate Annual Recurring Revenue (ARR)
async function calculateARR() {
  const mrr = await calculateMRR();
  return mrr * 12;
}

// Calculate Customer Churn
async function calculateChurn(monthsBack: number = 1) {
  const result = await db.query(`
    SELECT 
      COUNT(*) as churned_count
    FROM billing_subscriptions
    WHERE status = 'canceled'
    AND updated_at > NOW() - INTERVAL '1 month' * $1
  `, [monthsBack]);
  
  return result.rows[0].churned_count;
}

// Calculate Customer Lifetime Value (CLV)
async function calculateCLV(customerId: string) {
  const result = await db.query(`
    SELECT 
      SUM(amount_paid) as total_paid,
      COUNT(*) as invoice_count,
      AVG(amount_paid) as avg_invoice
    FROM billing_invoices
    WHERE customer_id = $1 AND status = 'paid'
  `, [customerId]);
  
  const row = result.rows[0];
  return {
    totalPaid: (row.total_paid || 0) / 100,
    invoiceCount: row.invoice_count || 0,
    averageInvoice: (row.avg_invoice || 0) / 100
  };
}
```

---

## Troubleshooting

### Common Issues

#### 1. Webhook Signature Verification Fails

**Problem:** "Invalid webhook signature" error

**Solution:**
```typescript
// Ensure you're using the correct webhook secret from Stripe
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET; // Should be whsec_xxxxx

// Make sure Express isn't parsing JSON before webhook handler
app.post('/api/webhooks/stripe', 
  express.raw({type: 'application/json'}), // Raw body for signature verification
  handleWebhook
);

// app.use(express.json()) must come AFTER webhook route
```

#### 2. Customer Not Found in Database

**Problem:** Subscription created in Stripe but customer not in local database

**Solution:**
```typescript
// Customer webhook events should create local records
// Ensure webhook handler is properly processing customer.created events
// Check webhook logs in Stripe Dashboard
// Manually sync customer:

async function syncStripeCustomer(stripeCustomerId: string) {
  const stripeCustomer = await stripe.customers.retrieve(stripeCustomerId);
  
  const customer = await db.query(`
    INSERT INTO billing_customers (stripe_customer_id, email, name)
    VALUES ($1, $2, $3)
    ON CONFLICT (stripe_customer_id) DO UPDATE SET updated_at = NOW()
    RETURNING *
  `, [stripeCustomer.id, stripeCustomer.email, stripeCustomer.name]);
  
  return customer.rows[0];
}
```

#### 3. Usage Limits Not Enforcing

**Problem:** Customers exceed limits without restriction

**Solution:**
```typescript
// Always call checkUsageLimits before allowing metered actions
async function createAgent(customerId: string) {
  // Check BEFORE creating
  const limits = await billingService.checkUsageLimits(customerId);
  
  if (limits.hardLimitExceeded) {
    throw new Error('Agent limit reached. Upgrade your plan to add more.');
  }

  // Only after check passes
  const agent = await createAgentInDatabase(customerId);
  
  // Then record usage
  await billingService.recordUsage(customerId, {
    agentCount: 1,
    userCount: 0,
    dataUsedMB: 0
  });
  
  return agent;
}
```

#### 4. Webhook Events Not Processing

**Problem:** Webhooks received but not updating database

**Solution:**
```typescript
// Check webhook logs
SELECT * FROM billing_webhook_events 
WHERE processed = false 
ORDER BY created_at DESC;

// Manually reprocess failed webhooks
async function reprocessFailedWebhooks() {
  const failedEvents = await db.query(`
    SELECT * FROM billing_webhook_events 
    WHERE processed = false
  `);

  for (const event of failedEvents.rows) {
    try {
      await webhookHandler.processWebhook(event.event_data, event.stripe_event_id);
      await db.query(
        'UPDATE billing_webhook_events SET processed = true WHERE id = $1',
        [event.id]
      );
    } catch (error) {
      console.error(`Failed to reprocess webhook ${event.id}:`, error);
    }
  }
}
```

#### 5. Payment Retry Not Triggering

**Problem:** Failed payments not retrying automatically

**Solution:**
```typescript
// Ensure cron job is running to trigger retries
// Add this to your application startup:

import cron from 'node-cron';

// Run every hour to check for due retries
cron.schedule('0 * * * *', async () => {
  const dueRetries = await db.query(`
    SELECT * FROM billing_payment_attempts 
    WHERE next_retry_at <= NOW() 
    AND attempt_number < 3
  `);

  for (const attempt of dueRetries.rows) {
    await billingService.retryPayment(attempt.invoice_id);
  }
});
```

### Debug Mode

Enable detailed logging:

```typescript
// In your billing service initialization
const billingService = new BillingService(stripeIntegration, usageTracker);

// Add logging middleware
billingService.on('operation', (op) => {
  console.log(`[BILLING] ${op.type}: ${op.description}`, op.data);
});

// Or use environment variable
if (process.env.BILLING_DEBUG === 'true') {
  // Enable verbose logging
}
```

### Stripe Dashboard Testing

1. Use test keys (pk_test_*, sk_test_*)
2. Use test card numbers:
   - Visa: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - 3D Secure: `4000 0025 0000 3155`
3. Test webhook events in Stripe Dashboard → Webhooks → Your endpoint → Send test event

---

## Support & Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Billing Guide](https://stripe.com/docs/billing)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- Ledgr Billing Code: `/backend/billing/`

## Production Checklist

- [ ] Switch to live Stripe keys in production
- [ ] Update webhook endpoint URL to production domain
- [ ] Configure STRIPE_WEBHOOK_SECRET in production environment
- [ ] Set up database backups for billing tables
- [ ] Configure payment retry cron job
- [ ] Enable audit logging for all billing operations
- [ ] Set up monitoring alerts for failed payments
- [ ] Test full subscription lifecycle in staging
- [ ] Configure SSL/TLS for webhook endpoint
- [ ] Set up email notifications for billing events
- [ ] Document custom billing logic for your team
- [ ] Configure automated billing reports for finance team
