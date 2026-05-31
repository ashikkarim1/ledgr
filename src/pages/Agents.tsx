/**
 * Agents Page
 * Manage, deploy, and monitor AI finance agents
 */

import React, { useState } from 'react';
import { AgentCard } from '../components/AgentCard';
import { Agent } from '../types';
import '../styles/pages.css';

export const AgentsPage: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([
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
    {
      id: '5',
      name: 'External CPA',
      role: 'External CPA',
      status: 'standby',
      confidence: 1.0,
      accuracy: 100,
      completedItems: 0,
    },
  ]);

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const activeAgents = agents.filter((a) => a.status === 'active');
  const standbyAgents = agents.filter((a) => a.status === 'standby');

  return (
    <div className="page page--agents">
      {/* Header */}
      <div className="page__header">
        <h1 className="page__title">Finance Agents</h1>
        <p className="page__subtitle">Deploy and monitor your AI finance team</p>
        <div className="page__actions">
          <button className="btn btn--primary" onClick={() => alert('Deploy new agent')}>
            + Deploy New Agent
          </button>
        </div>
      </div>

      {/* Active Agents */}
      <section className="page__section">
        <h2 className="page__section-title">
          Active Agents ({activeAgents.length})
        </h2>
        <div className="agents-grid">
          {activeAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={() => setSelectedAgent(agent.id)}
              className={selectedAgent === agent.id ? 'agent-card--selected' : ''}
            />
          ))}
        </div>
      </section>

      {/* Standby Agents */}
      {standbyAgents.length > 0 && (
        <section className="page__section">
          <h2 className="page__section-title">
            Standby Agents ({standbyAgents.length})
          </h2>
          <div className="agents-grid">
            {standbyAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={() => setSelectedAgent(agent.id)}
                className={selectedAgent === agent.id ? 'agent-card--selected' : ''}
              />
            ))}
          </div>
        </section>
      )}

      {/* Agent Details */}
      {selectedAgent && (
        <section className="page__section">
          <h2 className="page__section-title">Agent Configuration</h2>
          <div className="agent-config">
            <div className="agent-config__section">
              <h3 className="agent-config__heading">Task Configuration</h3>
              <div className="agent-config__item">
                <label>Minimum Confidence Threshold</label>
                <input type="range" min="0" max="100" defaultValue="85" />
              </div>
              <div className="agent-config__item">
                <label>Auto-escalation Amount</label>
                <input type="number" defaultValue="50000" />
              </div>
            </div>

            <div className="agent-config__section">
              <h3 className="agent-config__heading">Permissions</h3>
              <div className="agent-config__checkbox">
                <input type="checkbox" defaultChecked id="perm-post" />
                <label htmlFor="perm-post">Post transactions to general ledger</label>
              </div>
              <div className="agent-config__checkbox">
                <input type="checkbox" defaultChecked id="perm-reconcile" />
                <label htmlFor="perm-reconcile">Perform reconciliations</label>
              </div>
              <div className="agent-config__checkbox">
                <input type="checkbox" id="perm-approve" />
                <label htmlFor="perm-approve">Approve payments</label>
              </div>
            </div>

            <div className="agent-config__actions">
              <button className="btn btn--primary">Save Configuration</button>
              <button className="btn btn--secondary" onClick={() => setSelectedAgent(null)}>
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Agent Statistics */}
      <section className="page__section">
        <h2 className="page__section-title">Team Statistics</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card__label">Avg Accuracy</div>
            <div className="stat-card__value">
              {(
                agents.reduce((sum, a) => sum + a.accuracy, 0) / agents.length
              ).toFixed(1)}
              %
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Total Completed</div>
            <div className="stat-card__value">
              {agents.reduce((sum, a) => sum + a.completedItems, 0)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Active Tasks</div>
            <div className="stat-card__value">
              {activeAgents.filter((a) => a.currentTask).length}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Avg Confidence</div>
            <div className="stat-card__value">
              {(
                agents.reduce((sum, a) => sum + a.confidence, 0) / agents.length * 100
              ).toFixed(0)}
              %
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
