import React, { useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'

interface Plan {
  id: string
  name: string
  price: number
  billingCycle: 'monthly' | 'annual'
  features: string[]
  limits: Record<string, number>
  isCurrent?: boolean
}

interface Invoice {
  id: string
  date: string
  amount: number
  status: 'paid' | 'pending' | 'overdue'
  description: string
}

interface PaymentMethod {
  id: string
  type: 'card' | 'bank'
  last4: string
  brand?: string
  expiryMonth?: number
  expiryYear?: number
  isDefault?: boolean
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Essential',
    price: 199,
    billingCycle: 'monthly',
    features: ['Up to 5 team members', '10 AI agents', 'Basic reporting', 'Email support'],
    limits: {
      teamMembers: 5,
      agents: 10,
      transactions: 10000
    }
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 799,
    billingCycle: 'monthly',
    features: [
      'Up to 20 team members',
      'Unlimited AI agents',
      'Advanced reporting',
      'Priority support',
      'Custom integrations'
    ],
    limits: {
      teamMembers: 20,
      agents: -1,
      transactions: -1
    },
    isCurrent: true
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 2499,
    billingCycle: 'monthly',
    features: [
      'Unlimited team members',
      'Unlimited AI agents',
      'Custom reporting',
      'Dedicated support',
      'Custom SLA',
      'Dedicated infrastructure'
    ],
    limits: {
      teamMembers: -1,
      agents: -1,
      transactions: -1
    }
  }
]

export default function Billing() {
  const { currentUser } = useDashboard()
  const [currentPlan, setCurrentPlan] = useState(PLANS.find(p => p.isCurrent) || PLANS[1])
  
  const [invoices, setInvoices] = useState<Invoice[]>([
    {
      id: 'inv-001',
      date: '2025-05-01',
      amount: 799,
      status: 'paid',
      description: 'Professional Plan - May 2025'
    },
    {
      id: 'inv-002',
      date: '2025-04-01',
      amount: 799,
      status: 'paid',
      description: 'Professional Plan - April 2025'
    },
    {
      id: 'inv-003',
      date: '2025-03-01',
      amount: 799,
      status: 'paid',
      description: 'Professional Plan - March 2025'
    }
  ])

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    {
      id: 'pm-1',
      type: 'card',
      last4: '4242',
      brand: 'Visa',
      expiryMonth: 12,
      expiryYear: 2026,
      isDefault: true
    }
  ])

  const [showAddPayment, setShowAddPayment] = useState(false)
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false)
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<Plan | null>(null)

  const handleUpgradePlan = (plan: Plan) => {
    setSelectedUpgradePlan(plan)
    setShowUpgradeDialog(true)
  }

  const confirmUpgrade = () => {
    if (selectedUpgradePlan) {
      setCurrentPlan(selectedUpgradePlan)
      setShowUpgradeDialog(false)
      setSelectedUpgradePlan(null)
    }
  }

  const getUsagePercentage = (used: number, limit: number): number => {
    if (limit === -1) return 0
    return (used / limit) * 100
  }

  return (
    <div className="page page--billing">
      <div className="page__header">
        <h1>Billing & Subscriptions</h1>
        <p className="page__subtitle">Manage your subscription and payment methods</p>
      </div>

      {/* Current Subscription */}
      <section className="section">
        <h2 className="section__title">Current Subscription</h2>
        <div className="current-plan">
          <div className="plan-info">
            <h3>{currentPlan.name} Plan</h3>
            <p className="plan-price">
              <span className="currency">AED</span>
              <span className="amount">{currentPlan.price}</span>
              <span className="period">/{currentPlan.billingCycle}</span>
            </p>
            <p className="plan-next-billing">
              Next billing date: <strong>June 1, 2025</strong>
            </p>
          </div>
          <div className="plan-features">
            <h4>Included Features</h4>
            <ul>
              {currentPlan.features.map((feature, idx) => (
                <li key={idx}>✓ {feature}</li>
              ))}
            </ul>
          </div>
          {currentUser?.role === 'client-admin' && (
            <div className="plan-actions">
              <button className="button button--secondary">Change Billing Cycle</button>
              <button className="button button--critical">Cancel Subscription</button>
            </div>
          )}
        </div>
      </section>

      {/* Usage */}
      <section className="section">
        <h2 className="section__title">Usage</h2>
        <div className="usage-grid">
          <div className="usage-card">
            <h4>Team Members</h4>
            <p className="usage-amount">4 / {currentPlan.limits.teamMembers === -1 ? '∞' : currentPlan.limits.teamMembers}</p>
            {currentPlan.limits.teamMembers !== -1 && (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${getUsagePercentage(4, currentPlan.limits.teamMembers)}%`
                  }}
                />
              </div>
            )}
          </div>
          <div className="usage-card">
            <h4>AI Agents Deployed</h4>
            <p className="usage-amount">5 / {currentPlan.limits.agents === -1 ? '∞' : currentPlan.limits.agents}</p>
            {currentPlan.limits.agents !== -1 && (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${getUsagePercentage(5, currentPlan.limits.agents)}%`
                  }}
                />
              </div>
            )}
          </div>
          <div className="usage-card">
            <h4>Transactions Processed</h4>
            <p className="usage-amount">24,582 / {currentPlan.limits.transactions === -1 ? '∞' : currentPlan.limits.transactions.toLocaleString()}</p>
            {currentPlan.limits.transactions !== -1 && (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${getUsagePercentage(24582, currentPlan.limits.transactions)}%`
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Upgrade Options */}
      <section className="section">
        <h2 className="section__title">Available Plans</h2>
        <div className="plans-grid">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`plan-card ${plan.id === currentPlan.id ? 'plan-card--current' : ''}`}
            >
              {plan.id === currentPlan.id && <div className="current-badge">Current Plan</div>}
              <h3>{plan.name}</h3>
              <p className="plan-price">
                <span className="currency">AED</span>
                <span className="amount">{plan.price}</span>
                <span className="period">/{plan.billingCycle}</span>
              </p>
              <ul className="plan-features-list">
                {plan.features.map((feature, idx) => (
                  <li key={idx}>{feature}</li>
                ))}
              </ul>
              {plan.id !== currentPlan.id && currentUser?.role === 'client-admin' && (
                <button
                  className={`button ${parseInt(plan.price) > currentPlan.price ? 'button--primary' : 'button--secondary'}`}
                  onClick={() => handleUpgradePlan(plan)}
                >
                  {parseInt(plan.price) > currentPlan.price ? 'Upgrade' : 'Downgrade'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Billing History */}
      <section className="section">
        <h2 className="section__title">Billing History</h2>
        <div className="invoices-table">
          <div className="table-header">
            <div className="table-cell">Date</div>
            <div className="table-cell">Description</div>
            <div className="table-cell">Amount</div>
            <div className="table-cell">Status</div>
            <div className="table-cell">Action</div>
          </div>
          {invoices.map((invoice) => (
            <div key={invoice.id} className="table-row">
              <div className="table-cell">{invoice.date}</div>
              <div className="table-cell">{invoice.description}</div>
              <div className="table-cell">AED {invoice.amount.toFixed(2)}</div>
              <div className="table-cell">
                <span
                  className={`status-badge status-badge--${invoice.status}`}
                >
                  {invoice.status}
                </span>
              </div>
              <div className="table-cell">
                <button className="button button--icon" title="Download invoice">
                  ⬇️
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Payment Methods */}
      <section className="section">
        <h2 className="section__title">Payment Methods</h2>
        <div className="payment-methods">
          {paymentMethods.map((method) => (
            <div key={method.id} className="payment-card">
              <div className="payment-card__header">
                {method.type === 'card' && <span className="payment-icon">💳</span>}
                {method.type === 'bank' && <span className="payment-icon">🏦</span>}
                <div>
                  <h4>
                    {method.brand || 'Bank Account'} ••••{method.last4}
                  </h4>
                  {method.isDefault && <span className="default-badge">Default</span>}
                </div>
              </div>
              {method.expiryYear && (
                <p className="text-secondary">
                  Expires {method.expiryMonth}/{method.expiryYear}
                </p>
              )}
              {currentUser?.role === 'client-admin' && (
                <div className="payment-actions">
                  {!method.isDefault && (
                    <button className="button button--secondary button--small">
                      Set as Default
                    </button>
                  )}
                  <button className="button button--critical button--small">Remove</button>
                </div>
              )}
            </div>
          ))}

          {currentUser?.role === 'client-admin' && (
            <>
              {!showAddPayment ? (
                <button
                  className="button button--secondary button--full"
                  onClick={() => setShowAddPayment(true)}
                >
                  + Add Payment Method
                </button>
              ) : (
                <div className="add-payment-form">
                  <h4>Add Payment Method</h4>
                  <div className="form-group">
                    <label htmlFor="card-name">Cardholder Name</label>
                    <input id="card-name" type="text" placeholder="Your Name" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="card-number">Card Number</label>
                    <input id="card-number" type="text" placeholder="1234 5678 9012 3456" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="card-expiry">Expiry Date</label>
                      <input id="card-expiry" type="text" placeholder="MM/YY" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="card-cvc">CVC</label>
                      <input id="card-cvc" type="text" placeholder="123" />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button className="button button--primary">Add Card</button>
                    <button
                      className="button button--secondary"
                      onClick={() => setShowAddPayment(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Upgrade Confirmation Dialog */}
      {showUpgradeDialog && selectedUpgradePlan && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Upgrade to {selectedUpgradePlan.name}</h3>
            <p>
              Your subscription will be upgraded immediately. You'll be charged the prorated
              difference and will get access to all {selectedUpgradePlan.name} features.
            </p>
            <div className="plan-comparison">
              <h4>Changes:</h4>
              <ul>
                {selectedUpgradePlan.features.map((feature, idx) => (
                  <li key={idx}>+ {feature}</li>
                ))}
              </ul>
            </div>
            <div className="modal-actions">
              <button
                className="button button--primary"
                onClick={confirmUpgrade}
              >
                Confirm Upgrade
              </button>
              <button
                className="button button--secondary"
                onClick={() => {
                  setShowUpgradeDialog(false)
                  setSelectedUpgradePlan(null)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
