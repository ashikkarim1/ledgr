/**
 * MetricCard Component
 * Reusable KPI card for displaying financial metrics
 */

import React from 'react';
import { FinancialMetric } from '../types';
import '../styles/components.css';

interface MetricCardProps {
  metric: FinancialMetric;
  onClick?: () => void;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  metric,
  onClick,
  className = '',
}) => {
  const statusClass = metric.status ? `metric-card--${metric.status}` : '';
  const trendClass = metric.trend ? `metric-card--trend-${metric.trend}` : '';

  return (
    <div
      className={`metric-card ${statusClass} ${trendClass} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="metric-card__label">{metric.label}</div>
      
      <div className="metric-card__value">
        {metric.value}
        {metric.unit && <span className="metric-card__unit">{metric.unit}</span>}
      </div>

      {metric.trend && metric.trendValue && (
        <div className={`metric-card__trend metric-card__trend--${metric.trend}`}>
          <span className="metric-card__trend-icon">
            {metric.trend === 'up' && '↑'}
            {metric.trend === 'down' && '↓'}
            {metric.trend === 'neutral' && '→'}
          </span>
          <span className="metric-card__trend-value">{metric.trendValue}</span>
        </div>
      )}

      {metric.status && (
        <div className={`metric-card__status metric-card__status--${metric.status}`}>
          {metric.status === 'healthy' && '✓ Healthy'}
          {metric.status === 'warning' && '⚠ Warning'}
          {metric.status === 'critical' && '✕ Critical'}
        </div>
      )}
    </div>
  );
};
