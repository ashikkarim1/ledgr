/**
 * Billing Dashboard React Component
 * Complete UI for managing subscriptions, payments, and usage
 */

import React, { useState, useEffect } from 'react';
import {
  BillingAccount,
  Subscription,
  Invoice,
  PaymentMethod,
  UsageMetrics,
  PlanTier,
  SUBSCRIPTION_TIERS,
} from './billing-types';

interface BillingDashboardProps {
  customerId: string;
  apiBaseUrl?: string;
}

interface LoadingState {
  account: boolean;
  subscriptions: boolean;
  payments: boolean;
  invoices: boolean;
  usage: boolean;
}

/**
 * Main Billing Dashboard Component
 */
export const BillingDashboard: React.FC<BillingDashboardProps> = ({
  customerId,
  apiBaseUrl = '/api',
}) => {
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [loading, setLoading] = useState<LoadingState>({
    account: true,
    subscriptions: true,
    payments: true,
    invoices: true,
    usage: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'subscription' | 'payments' | 'invoices' | 'usage'>('overview');

  useEffect(() => {
    loadBillingAccount();
  }, [customerId]);

  const loadBillingAccount = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/billing/account?customerId=${customerId}`);
      if (!response.ok) throw new Error('Failed to load billing account');
      const data = await response.json();
      setAccount(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading((prev) => ({
        ...prev,
        account: false,
        subscriptions: false,
        payments: false,
        invoices: false,
        usage: false,
      }));
    }
  };

  if (loading.account) {
    return <div className="billing-dashboard loading">Loading billing information...</div>;
  }

  if (error) {
    return <div className="billing-dashboard error">Error: {error}</div>;
  }

  if (!account) {
    return <div className="billing-dashboard">No billing account found</div>;
  }

  return (
    <div className="billing-dashboard">
      <div className="billing-header">
        <h1>Billing & Subscription</h1>
        <p className="subtitle">Manage your subscription, payments, and usage</p>
      </div>

      {/* Navigation Tabs */}
      <div className="billing-tabs">
        {(['overview', 'subscription', 'payments', 'invoices', 'usage'] as const).map(
          (tab) => (
            <button
              key={tab}
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          )
        )}
      </div>

      {/* Tab Content */}
      <div className="billing-content">
        {activeTab === 'overview' && (
          <OverviewTab account={account} onUpgrade={() => setActiveTab('subscription')} />
        )}
        {activeTab === 'subscription' && <SubscriptionTab account={account} />}
        {activeTab === 'payments' && <PaymentsTab account={account} />}
        {activeTab === 'invoices' && <InvoicesTab account={account} />}
        {activeTab === 'usage' && <UsageTab account={account} />}
      </div>
    </div>
  );
};

/**
 * Overview Tab Component
 */
const OverviewTab: React.FC<{
  account: BillingAccount;
  onUpgrade: () => void;
}> = ({ account, onUpgrade }) => {
  const tierConfig = SUBSCRIPTION_TIERS[account.subscription.tier];

  return (
    <div className="tab-pane overview">
      <div className="overview-grid">
        {/* Current Plan */}
        <div className="overview-card plan-card">
          <h3>Current Plan</h3>
          <div className="plan-badge">{tierConfig.name}</div>
          <p className="plan-description">{tierConfig.description}</p>

          <div className="plan-pricing">
            <div className="price">
              ${account.subscription.billingPeriod === 'monthly'
                ? tierConfig.monthlyPrice
                : Math.round(tierConfig.annualPrice)}
              <span className="period">
                /{account.subscription.billingPeriod === 'monthly' ? 'month' : 'year'}
              </span>
            </div>
          </div>

          <div className="plan-features">
            <h4>Features</h4>
            <ul>
              <li>
                <strong>{tierConfig.features.maxUsers}</strong> User{tierConfig.features.maxUsers !== 1 ? 's' : ''}
              </li>
              <li>
                <strong>{tierConfig.features.maxAgents}</strong> Agent{tierConfig.features.maxAgents !== 1 ? 's' : ''}
              </li>
              <li>
                <strong>{(tierConfig.features.storage / 1024).toFixed(0)}</strong>GB Storage
              </li>
              <li>
                <strong>{tierConfig.features.supportLevel}</strong> Support
              </li>
            </ul>
          </div>

          {account.subscription.tier !== 'enterprise' && (
            <button className="btn btn-primary" onClick={onUpgrade}>
              Upgrade Plan
            </button>
          )}
        </div>

        {/* Subscription Status */}
        <div className="overview-card status-card">
          <h3>Subscription Status</h3>

          <div className="status-item">
            <label>Status</label>
            <div className={`status-badge status-${account.subscription.status}`}>
              {account.subscription.status}
            </div>
          </div>

          <div className="status-item">
            <label>Billing Period</label>
            <p>{account.subscription.billingPeriod}</p>
          </div>

          <div className="status-item">
            <label>Billing Cycle</label>
            <p>
              {new Date(account.subscription.currentPeriodStart).toLocaleDateString()} -{' '}
              {new Date(account.subscription.currentPeriodEnd).toLocaleDateString()}
            </p>
          </div>

          <div className="status-item">
            <label>Auto-Renewal</label>
            <p>{account.subscription.autoRenew ? 'Enabled' : 'Disabled'}</p>
          </div>
        </div>

        {/* Usage Summary */}
        <div className="overview-card usage-card">
          <h3>Usage Summary</h3>

          {account.usageMetrics.warnings.length > 0 && (
            <div className="usage-warnings">
              {account.usageMetrics.warnings.map((warning, idx) => (
                <div key={idx} className={`warning warning-${warning.severity}`}>
                  <strong>{warning.metric}:</strong> {warning.message}
                </div>
              ))}
            </div>
          )}

          <div className="usage-bars">
            {/* Agents */}
            <div className="usage-bar-item">
              <div className="bar-label">
                <span>Agents</span>
                <span className="bar-value">
                  {account.usageMetrics.usage.agentsDeployed}/{account.usageMetrics.limits.maxAgents}
                </span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.min(100, (account.usageMetrics.usage.agentsDeployed / account.usageMetrics.limits.maxAgents) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Users */}
            <div className="usage-bar-item">
              <div className="bar-label">
                <span>Users</span>
                <span className="bar-value">
                  {account.usageMetrics.usage.usersAdded}/{account.usageMetrics.limits.maxUsers}
                </span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.min(100, (account.usageMetrics.usage.usersAdded / account.usageMetrics.limits.maxUsers) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Data */}
            <div className="usage-bar-item">
              <div className="bar-label">
                <span>Storage</span>
                <span className="bar-value">
                  {(account.usageMetrics.usage.dataUsedMB / 1024).toFixed(1)}GB /{' '}
                  {account.usageMetrics.limits.maxDataGB}GB
                </span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.min(100, ((account.usageMetrics.usage.dataUsedMB / 1024) / account.usageMetrics.limits.maxDataGB) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Subscription Tab Component
 */
const SubscriptionTab: React.FC<{ account: BillingAccount }> = ({ account }) => {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  return (
    <div className="tab-pane subscription">
      <div className="subscription-cards">
        {Object.entries(SUBSCRIPTION_TIERS).map(([tier, config]) => (
          <div key={tier} className={`plan-card ${account.subscription.tier === tier ? 'active' : ''}`}>
            <div className="plan-header">
              <h3>{config.name}</h3>
              {account.subscription.tier === tier && <span className="badge">Current</span>}
            </div>

            <div className="plan-price">
              <span className="amount">${config.monthlyPrice}</span>
              <span className="period">/month</span>
            </div>

            <div className="plan-features">
              <ul>
                <li>{config.features.maxUsers} User{config.features.maxUsers !== 1 ? 's' : ''}</li>
                <li>{config.features.maxAgents} Agent{config.features.maxAgents !== 1 ? 's' : ''}</li>
                <li>{(config.features.storage / 1024).toFixed(0)}GB Storage</li>
                <li>{config.features.supportLevel} Support</li>
              </ul>
            </div>

            {account.subscription.tier !== tier && (
              <button className="btn btn-primary" onClick={() => setShowUpgradeModal(true)}>
                {tier > account.subscription.tier ? 'Upgrade' : 'Downgrade'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="subscription-actions">
        <button
          className="btn btn-secondary"
          onClick={() => setShowCancelModal(true)}
          disabled={account.subscription.status === 'canceled'}
        >
          Cancel Subscription
        </button>
      </div>
    </div>
  );
};

/**
 * Payments Tab Component
 */
const PaymentsTab: React.FC<{ account: BillingAccount }> = ({ account }) => {
  return (
    <div className="tab-pane payments">
      <div className="section">
        <h3>Payment Methods</h3>

        {account.paymentMethods.length === 0 ? (
          <div className="empty-state">
            <p>No payment methods on file</p>
            <button className="btn btn-primary">Add Payment Method</button>
          </div>
        ) : (
          <div className="payment-methods-list">
            {account.paymentMethods.map((method) => (
              <div key={method.id} className="payment-method-item">
                <div className="method-info">
                  <div className="method-type">{method.type === 'card' ? '💳 Card' : '🏦 Bank'}</div>
                  <div className="method-details">
                    <strong>{method.brand?.toUpperCase()}</strong>
                    <span> ending in {method.last4}</span>
                  </div>
                </div>

                {method.isDefault && <span className="default-badge">Default</span>}

                <div className="method-actions">
                  {!method.isDefault && <button className="btn btn-sm">Set as Default</button>}
                  <button className="btn btn-sm btn-danger">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-primary">Add New Payment Method</button>
      </div>

      <div className="section">
        <h3>Billing Information</h3>
        <div className="billing-info">
          <div className="info-item">
            <label>Email</label>
            <p>{account.settings.currencyPreference}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Invoices Tab Component
 */
const InvoicesTab: React.FC<{ account: BillingAccount }> = ({ account }) => {
  return (
    <div className="tab-pane invoices">
      <div className="invoices-table">
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {account.invoices.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-message">
                  No invoices yet
                </td>
              </tr>
            ) : (
              account.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                  <td>${(invoice.amountDue / 100).toFixed(2)}</td>
                  <td>
                    <span className={`status-badge status-${invoice.status}`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td>
                    {invoice.pdfUrl && (
                      <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                        Download
                      </a>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * Usage Tab Component
 */
const UsageTab: React.FC<{ account: BillingAccount }> = ({ account }) => {
  const metrics = account.usageMetrics;

  return (
    <div className="tab-pane usage">
      <div className="usage-grid">
        <div className="usage-card">
          <h3>Agents Deployed</h3>
          <div className="usage-number">
            {metrics.usage.agentsDeployed}/{metrics.limits.maxAgents}
          </div>
          <div className="usage-bar">
            <div
              className="usage-bar-fill"
              style={{
                width: `${Math.min(100, (metrics.usage.agentsDeployed / metrics.limits.maxAgents) * 100)}%`,
              }}
            />
          </div>
          <p className="usage-percentage">
            {Math.round((metrics.usage.agentsDeployed / metrics.limits.maxAgents) * 100)}% used
          </p>
        </div>

        <div className="usage-card">
          <h3>Users Added</h3>
          <div className="usage-number">
            {metrics.usage.usersAdded}/{metrics.limits.maxUsers}
          </div>
          <div className="usage-bar">
            <div
              className="usage-bar-fill"
              style={{
                width: `${Math.min(100, (metrics.usage.usersAdded / metrics.limits.maxUsers) * 100)}%`,
              }}
            />
          </div>
          <p className="usage-percentage">
            {Math.round((metrics.usage.usersAdded / metrics.limits.maxUsers) * 100)}% used
          </p>
        </div>

        <div className="usage-card">
          <h3>Storage Used</h3>
          <div className="usage-number">
            {(metrics.usage.dataUsedMB / 1024).toFixed(1)}GB/{metrics.limits.maxDataGB}GB
          </div>
          <div className="usage-bar">
            <div
              className="usage-bar-fill"
              style={{
                width: `${Math.min(100, ((metrics.usage.dataUsedMB / 1024) / metrics.limits.maxDataGB) * 100)}%`,
              }}
            />
          </div>
          <p className="usage-percentage">
            {Math.round(((metrics.usage.dataUsedMB / 1024) / metrics.limits.maxDataGB) * 100)}% used
          </p>
        </div>
      </div>

      {metrics.warnings.length > 0 && (
        <div className="usage-alerts">
          <h3>Usage Alerts</h3>
          {metrics.warnings.map((warning, idx) => (
            <div key={idx} className={`alert alert-${warning.severity}`}>
              <strong>{warning.metric}:</strong> {warning.message}
            </div>
          ))}
        </div>
      )}

      <div className="billing-period">
        <h3>Current Billing Period</h3>
        <p>
          {new Date(metrics.period.start).toLocaleDateString()} -{' '}
          {new Date(metrics.period.end).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};

export default BillingDashboard;
