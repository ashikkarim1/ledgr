/**
 * Financial Dashboard Page
 * Detailed financial overview with charts, transactions, and reconciliation status
 */

import React, { useState, useEffect } from 'react';
import { FinancialMetric, Transaction } from '../types';
import '../styles/pages.css';

export const FinancialDashboardPage: React.FC = () => {
  const [metrics, setMetrics] = useState<FinancialMetric[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [closeStatus, setCloseStatus] = useState({
    processed: { current: 4287, total: 4298, pct: 99.7 },
    reconciliation: { status: 'Complete', detail: 'All accounts verified' },
    taxCompliance: { current: 2, total: 2, pct: 100 },
    financialStatements: { status: 'Ready', detail: 'Awaiting sign-off' },
  });

  useEffect(() => {
    // Initialize metrics
    setMetrics([
      { label: 'Total Revenue (YTD)', value: '$2.4M', status: 'healthy' },
      { label: 'Total Expenses (YTD)', value: '$890K', status: 'healthy' },
      { label: 'Net Margin', value: '63%', status: 'healthy' },
      { label: 'Close Completion', value: '99.7%', status: 'healthy' },
    ]);

    // Initialize transactions
    setTransactions([
      {
        id: '1',
        date: '2024-05-30',
        vendor: 'Acme Corp',
        amount: 5200,
        category: 'Supplies',
        status: 'posted',
      },
      {
        id: '2',
        date: '2024-05-29',
        vendor: 'Cloud Services Inc',
        amount: 1200,
        category: 'Software',
        status: 'posted',
      },
      {
        id: '3',
        date: '2024-05-29',
        vendor: 'Vendor Portal',
        amount: 8900,
        category: 'Professional Services',
        status: 'pending',
      },
      {
        id: '4',
        date: '2024-05-28',
        vendor: 'Office Supplies Co',
        amount: 456,
        category: 'Office',
        status: 'posted',
      },
    ]);
  }, []);

  return (
    <div className="page page--financial-dashboard">
      {/* Header */}
      <div className="page__header">
        <h1 className="page__title">Financial Dashboard</h1>
        <p className="page__subtitle">Complete view of your financial position and operations</p>
      </div>

      {/* Key Metrics */}
      <section className="page__section">
        <h2 className="page__section-title">Financial Summary</h2>
        <div className="financial-grid">
          {metrics.map((metric) => (
            <div key={metric.label} className="financial-card">
              <div className="financial-card__label">{metric.label}</div>
              <div className="financial-card__value">{metric.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Monthly Close Status */}
      <section className="page__section">
        <h2 className="page__section-title">Monthly Close Status</h2>
        <div className="close-status-grid">
          <div className="close-status-card">
            <div className="close-status-card__percentage">
              {closeStatus.processed.pct}%
            </div>
            <div className="close-status-card__label">Transactions Processed</div>
            <div className="close-status-card__detail">
              {closeStatus.processed.current} of {closeStatus.processed.total}
            </div>
          </div>

          <div className="close-status-card">
            <div className="close-status-card__icon">✓</div>
            <div className="close-status-card__label">Reconciliation</div>
            <div className="close-status-card__detail">
              {closeStatus.reconciliation.detail}
            </div>
          </div>

          <div className="close-status-card">
            <div className="close-status-card__percentage">
              {closeStatus.taxCompliance.pct}%
            </div>
            <div className="close-status-card__label">Tax Compliance Ready</div>
            <div className="close-status-card__detail">
              {closeStatus.taxCompliance.current} items reviewed
            </div>
          </div>

          <div className="close-status-card">
            <div className="close-status-card__icon">✓</div>
            <div className="close-status-card__label">Financial Statements</div>
            <div className="close-status-card__detail">
              {closeStatus.financialStatements.detail}
            </div>
          </div>
        </div>
      </section>

      {/* Recent Transactions */}
      <section className="page__section">
        <h2 className="page__section-title">Recent Transactions</h2>
        <div className="transactions-table">
          <div className="table-header">
            <div className="table-header__cell">Date</div>
            <div className="table-header__cell">Vendor</div>
            <div className="table-header__cell">Category</div>
            <div className="table-header__cell">Amount</div>
            <div className="table-header__cell">Status</div>
          </div>
          {transactions.map((tx) => (
            <div key={tx.id} className="table-row">
              <div className="table-cell">{tx.date}</div>
              <div className="table-cell">{tx.vendor}</div>
              <div className="table-cell">{tx.category}</div>
              <div className="table-cell">${tx.amount.toLocaleString()}</div>
              <div className={`table-cell table-cell--${tx.status}`}>
                {tx.status === 'posted' ? '✓ Posted' : '⏳ Pending'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Performance Metrics */}
      <section className="page__section">
        <h2 className="page__section-title">This Period Performance</h2>
        <div className="performance-grid">
          <div className="performance-card">
            <div className="performance-card__icon">🛡️</div>
            <div className="performance-card__label">Errors Caught</div>
            <div className="performance-card__value">12</div>
            <div className="performance-card__detail">Fraud prevention</div>
          </div>
          <div className="performance-card">
            <div className="performance-card__icon">⚠️</div>
            <div className="performance-card__label">Unusual Items Flagged</div>
            <div className="performance-card__value">8</div>
            <div className="performance-card__detail">All investigated</div>
          </div>
          <div className="performance-card">
            <div className="performance-card__icon">✓</div>
            <div className="performance-card__label">Violations Prevented</div>
            <div className="performance-card__value">3</div>
            <div className="performance-card__detail">Compliance wins</div>
          </div>
          <div className="performance-card">
            <div className="performance-card__icon">⏱️</div>
            <div className="performance-card__label">Time Saved</div>
            <div className="performance-card__value">16h</div>
            <div className="performance-card__detail">vs manual process</div>
          </div>
        </div>
      </section>
    </div>
  );
};
