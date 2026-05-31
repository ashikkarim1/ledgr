/**
 * AgentCard Component
 * Displays individual agent status and performance
 */

import React from 'react';
import { Agent } from '../types';
import '../styles/components.css';

interface AgentCardProps {
  agent: Agent;
  onClick?: () => void;
  className?: string;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  onClick,
  className = '',
}) => {
  const isActive = agent.status === 'active';

  return (
    <div
      className={`agent-card ${agent.status === 'offline' ? 'agent-card--offline' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="agent-card__header">
        <h3 className="agent-card__role">{agent.name}</h3>
        <div className={`agent-card__status agent-card__status--${agent.status}`}>
          <span className="agent-card__status-dot"></span>
          {agent.status === 'active' && 'Active'}
          {agent.status === 'standby' && 'Standby'}
          {agent.status === 'offline' && 'Offline'}
        </div>
      </div>

      {agent.currentTask && (
        <div className="agent-card__current">
          <span className="agent-card__current-label">Currently:</span>
          <span className="agent-card__current-task">{agent.currentTask}</span>
        </div>
      )}

      <div className="agent-card__stats">
        <div className="agent-card__stat">
          <span className="agent-card__stat-label">Accuracy</span>
          <span className="agent-card__stat-value">{agent.accuracy.toFixed(1)}%</span>
        </div>
        <div className="agent-card__stat">
          <span className="agent-card__stat-label">Completed</span>
          <span className="agent-card__stat-value">{agent.completedItems}</span>
        </div>
        <div className="agent-card__stat">
          <span className="agent-card__stat-label">Confidence</span>
          <span className="agent-card__stat-value">{(agent.confidence * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="agent-card__confidence-bar">
        <div
          className="agent-card__confidence-fill"
          style={{ width: `${agent.confidence * 100}%` }}
        ></div>
      </div>
    </div>
  );
};
