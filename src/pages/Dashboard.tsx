/**
 * Dashboard Page
 * Main overview dashboard with KPIs, activity, and key metrics
 */

import React, { useState, useEffect } from 'react';
import { MetricCard } from '../components/MetricCard';
import { AgentCard } from '../components/AgentCard';
import { FinancialMetric, Agent, ActivityItem } from '../types';
import '../styles/pages.css';

interface DashboardPageProps {
  isDemoMode?: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ isDemoMode = false }) => {
  const [metrics, setMetrics] = useState<FinancialMetric[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    // Initialize metrics
    setMetrics([
      {
        label: 'Cash Available',
        value: '$842,300',
        status: 'healthy',
        trend: 'up',
        trendValue: '+5.2%',
      },
      {
        label: 'Outstanding Receivables',
        value: '$234,100',
        status: 'healthy',
        trend: 'down',
        trendValue: '-2.1%',
      },
      {
        label: 'Payables Due',
        value: '$89,400',
        status: 'healthy',
      },
      {
        label: 'Days to Close',
        value: '2.4',
        status: 'healthy',
        trend: 'up',
        trendValue: 'Ahead of schedule',
      },
    ]);

    // Initialize agents
    setAgents([
      {
        id: '1',
        name: 'Chief Accountant',
        role: 'Chief Accountant',
        status: 'active',
        currentTask: 'Reconciliation review',
        confidence: 0.98,
        accuracy: 98.7,
        completedItems: 43,
      },
      {
        id: '2',
        name: 'Accounts Payable Manager',
        role: 'Accounts Payable Manager',
        status: 'active',
        currentTask: 'Invoice matching',
        confidence: 0.95,
        accuracy: 99.2,
        completedItems: 156,
      },
      {
        id: '3',
        name: 'Tax Advisor',
        role: 'Tax Advisor',
        status: 'active',
        currentTask: 'Deduction analysis',
        confidence: 0.97,
        accuracy: 94.3,
        completedItems: 28,
      },
      {
        id: '4',
        name: 'Accounts Receivable Specialist',
        role: 'Accounts Receivable Specialist',
        status: 'active',
        currentTask: 'Collection review',
        confidence: 0.96,
        accuracy: 97.8,
        completedItems: 34,
      },
    ]);

    // Initialize activities
    setActivities([
      {
        id: '1',
        agent: 'Chief Accountant',
        message: 'Completed reconciliation: 127 items verified, 3 discrepancies found',
        timestamp: '2:45 PM',
        type: 'success',
      },
      {
        id: '2',
        agent: 'Accounts Payable Manager',
        message: 'Matched 89 invoices with POs, flagging 2 mismatches',
        timestamp: '2:42 PM',
        type: 'info',
      },
      {
        id: '3',
        agent: 'Tax Advisor',
        message: 'Q1 deductions reviewed. Identified $47K opportunity',
        timestamp: '2:38 PM',
        type: 'info',
      },
    ]);
  }, []);

  return (
    <div className="page page--dashboard">
      {/* Header */}
      <div className="page__header">
        <h1 className="page__title">Dashboard Overview</h1>
        <p className="page__subtitle">Your unified financial operations command center</p>
      </div>

      {/* KPI Grid */}
      <section className="page__section">
        <h2 className="page__section-title">Key Metrics</h2>
        <div className="metrics-grid">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>
      </section>

      {/* Agents Section */}
      <section className="page__section">
        <h2 className="page__section-title">Your Finance Team</h2>
        <div className="agents-grid">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={() => window.location.href = `/agents/${agent.id}`}
            />
          ))}
        </div>
      </section>

      {/* Activity Feed */}
      <section className="page__section">
        <h2 className="page__section-title">Recent Activity</h2>
        <div className="activity-feed">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className={`activity-item activity-item--${activity.type}`}
            >
              <div className="activity-item__header">
                <span className="activity-item__agent">{activity.agent}</span>
                <span className="activity-item__time">{activity.timestamp}</span>
              </div>
              <p className="activity-item__message">{activity.message}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Call to Action */}
      <section className="page__section">
        <div className="cta-card">
          <h3 className="cta-card__title">Ready to streamline your finance operations?</h3>
          <p className="cta-card__description">
            Deploy your AI finance agents and start automating routine tasks
          </p>
          <div className="cta-card__buttons">
            <a href="/agents" className="btn btn--primary">
              View Agents
            </a>
            <a href="/financial" className="btn btn--secondary">
              Financial Dashboard
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};
