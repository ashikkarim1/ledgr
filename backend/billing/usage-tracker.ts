/**
 * Usage Tracking System
 * Tracks resource usage per workspace/customer
 */

import { Pool } from 'pg';
import {
  UsageMetrics,
  UsageWarning,
  MeteredUsage,
  Subscription,
  PlanTier,
} from "./billing-types.js";
import { SUBSCRIPTION_TIERS } from "./stripe-integration.js";

export class UsageTracker {
  constructor(private db: Pool) {}

  // =====================================================
  // USAGE TRACKING
  // =====================================================

  /**
   * Track metered usage event
   */
  async recordUsage(usage: MeteredUsage): Promise<void> {
    const query = `
      INSERT INTO metered_usage (workspace_id, customer_id, timestamp, metrics)
      VALUES ($1, $2, $3, $4)
    `;

    try {
      await this.db.query(query, [
        usage.workspaceId,
        usage.customerId,
        usage.timestamp,
        JSON.stringify(usage.metrics),
      ]);
    } catch (error) {
      throw new Error(`Failed to record usage: ${error}`);
    }
  }

  /**
   * Get current usage metrics for a workspace
   */
  async getUsageMetrics(
    workspaceId: string,
    customerId: string,
    subscription: Subscription
  ): Promise<UsageMetrics> {
    const tierConfig = SUBSCRIPTION_TIERS[subscription.tier];

    // Get current period metrics
    const periodStart = subscription.currentPeriodStart;
    const periodEnd = subscription.currentPeriodEnd;

    const query = `
      SELECT 
        COALESCE(MAX((metrics->>'agentCount')::int), 0) as agents_deployed,
        COALESCE(MAX((metrics->>'userCount')::int), 0) as users_added,
        COALESCE(SUM((metrics->>'dataUsedMB')::float), 0) as data_used_mb
      FROM metered_usage
      WHERE workspace_id = $1 
        AND customer_id = $2
        AND timestamp >= $3
        AND timestamp < $4
    `;

    try {
      const result = await this.db.query(query, [
        workspaceId,
        customerId,
        periodStart,
        periodEnd,
      ]);

      const row = result.rows[0];
      const agentsDeployed = row.agents_deployed || 0;
      const usersAdded = row.users_added || 0;
      const dataUsedMB = row.data_used_mb || 0;

      // Get limits from subscription tier
      const maxAgents = subscription.usageOverrides?.maxAgents || tierConfig.features.maxAgents;
      const maxUsers = subscription.usageOverrides?.maxUsers || tierConfig.features.maxUsers;
      const maxDataGB = subscription.usageOverrides?.maxDataUsageGB || tierConfig.features.storage / 1024;

      // Calculate warnings
      const warnings = this.generateWarnings(
        { agentsDeployed, usersAdded, dataUsedMB },
        { maxAgents, maxUsers, maxDataGB }
      );

      return {
        workspaceId,
        customerId,
        period: { start: periodStart, end: periodEnd },
        usage: {
          agentsDeployed,
          usersAdded,
          dataUsedMB,
        },
        limits: {
          maxAgents,
          maxUsers,
          maxDataGB,
        },
        warnings,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to get usage metrics: ${error}`);
    }
  }

  /**
   * Get historical usage data
   */
  async getUsageHistory(
    workspaceId: string,
    customerId: string,
    days: number = 30
  ): Promise<MeteredUsage[]> {
    const query = `
      SELECT workspace_id, customer_id, timestamp, metrics
      FROM metered_usage
      WHERE workspace_id = $1 
        AND customer_id = $2
        AND timestamp >= NOW() - INTERVAL '1 day' * $3
      ORDER BY timestamp DESC
    `;

    try {
      const result = await this.db.query(query, [workspaceId, customerId, days]);

      return result.rows.map((row) => ({
        workspaceId: row.workspace_id,
        customerId: row.customer_id,
        timestamp: new Date(row.timestamp),
        metrics: JSON.parse(row.metrics),
      }));
    } catch (error) {
      throw new Error(`Failed to get usage history: ${error}`);
    }
  }

  /**
   * Check if usage exceeds limits (soft/hard)
   */
  async checkUsageLimits(
    workspaceId: string,
    customerId: string,
    subscription: Subscription
  ): Promise<{
    isWithinLimits: boolean;
    softLimitExceeded: boolean;
    hardLimitExceeded: boolean;
    warnings: UsageWarning[];
  }> {
    const metrics = await this.getUsageMetrics(workspaceId, customerId, subscription);

    const softLimitThreshold = 0.8; // 80%
    const hardLimitThreshold = 1.0; // 100%

    let softLimitExceeded = false;
    let hardLimitExceeded = false;

    // Check agents
    if (metrics.usage.agentsDeployed / metrics.limits.maxAgents >= hardLimitThreshold) {
      hardLimitExceeded = true;
    } else if (metrics.usage.agentsDeployed / metrics.limits.maxAgents >= softLimitThreshold) {
      softLimitExceeded = true;
    }

    // Check users
    if (metrics.usage.usersAdded / metrics.limits.maxUsers >= hardLimitThreshold) {
      hardLimitExceeded = true;
    } else if (metrics.usage.usersAdded / metrics.limits.maxUsers >= softLimitThreshold) {
      softLimitExceeded = true;
    }

    // Check data
    const dataUsedGB = metrics.usage.dataUsedMB / 1024;
    if (dataUsedGB / metrics.limits.maxDataGB >= hardLimitThreshold) {
      hardLimitExceeded = true;
    } else if (dataUsedGB / metrics.limits.maxDataGB >= softLimitThreshold) {
      softLimitExceeded = true;
    }

    return {
      isWithinLimits: !softLimitExceeded && !hardLimitExceeded,
      softLimitExceeded,
      hardLimitExceeded,
      warnings: metrics.warnings,
    };
  }

  /**
   * Calculate metered charges for billing
   */
  async calculateMeteredCharges(
    workspaceId: string,
    customerId: string,
    subscription: Subscription
  ): Promise<{
    additionalAgentCharges: number;
    additionalUserCharges: number;
    dataUsageCharges: number;
    totalMeteredCharges: number;
  }> {
    const metrics = await this.getUsageMetrics(workspaceId, customerId, subscription);
    const tierConfig = SUBSCRIPTION_TIERS[subscription.tier];

    const additionalAgentCount = Math.max(
      0,
      metrics.usage.agentsDeployed - tierConfig.features.maxAgents
    );
    const additionalUserCount = Math.max(
      0,
      metrics.usage.usersAdded - tierConfig.features.maxUsers
    );

    const METERED_PRICING = {
      additionalAgent: 50,
      additionalUser: 20,
      dataUsagePerMB: 0.01,
    };

    const additionalAgentCharges = additionalAgentCount * METERED_PRICING.additionalAgent;
    const additionalUserCharges = additionalUserCount * METERED_PRICING.additionalUser;
    const dataUsageCharges = metrics.usage.dataUsedMB * METERED_PRICING.dataUsagePerMB;

    return {
      additionalAgentCharges,
      additionalUserCharges,
      dataUsageCharges,
      totalMeteredCharges: additionalAgentCharges + additionalUserCharges + dataUsageCharges,
    };
  }

  /**
   * Create usage alert if approaching limit
   */
  async createUsageAlert(
    workspaceId: string,
    customerId: string,
    alertType: 'warning' | 'critical'
  ): Promise<void> {
    const query = `
      INSERT INTO usage_alerts (workspace_id, customer_id, alert_type, created_at)
      VALUES ($1, $2, $3, NOW())
    `;

    try {
      await this.db.query(query, [workspaceId, customerId, alertType]);
    } catch (error) {
      throw new Error(`Failed to create usage alert: ${error}`);
    }
  }

  /**
   * Get pending usage alerts
   */
  async getPendingAlerts(workspaceId: string, customerId: string): Promise<any[]> {
    const query = `
      SELECT id, alert_type, created_at, notified_at
      FROM usage_alerts
      WHERE workspace_id = $1 
        AND customer_id = $2
        AND notified_at IS NULL
      ORDER BY created_at DESC
    `;

    try {
      const result = await this.db.query(query, [workspaceId, customerId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get pending alerts: ${error}`);
    }
  }

  /**
   * Mark alert as notified
   */
  async markAlertNotified(alertId: string): Promise<void> {
    const query = `
      UPDATE usage_alerts
      SET notified_at = NOW()
      WHERE id = $1
    `;

    try {
      await this.db.query(query, [alertId]);
    } catch (error) {
      throw new Error(`Failed to mark alert as notified: ${error}`);
    }
  }

  /**
   * Reset usage for new billing cycle
   */
  async resetUsageForNewCycle(workspaceId: string, customerId: string): Promise<void> {
    const query = `
      UPDATE metered_usage
      SET archived = true
      WHERE workspace_id = $1 
        AND customer_id = $2
        AND archived = false
    `;

    try {
      await this.db.query(query, [workspaceId, customerId]);
    } catch (error) {
      throw new Error(`Failed to reset usage: ${error}`);
    }
  }

  // =====================================================
  // PRIVATE HELPER METHODS
  // =====================================================

  private generateWarnings(
    usage: {
      agentsDeployed: number;
      usersAdded: number;
      dataUsedMB: number;
    },
    limits: {
      maxAgents: number;
      maxUsers: number;
      maxDataGB: number;
    }
  ): UsageWarning[] {
    const warnings: UsageWarning[] = [];

    // Check agents
    const agentPercentage = (usage.agentsDeployed / limits.maxAgents) * 100;
    if (agentPercentage >= 95) {
      warnings.push({
        metric: 'agents',
        currentUsage: usage.agentsDeployed,
        limit: limits.maxAgents,
        percentage: agentPercentage,
        severity: 'critical',
        message: `Agent limit at ${Math.round(agentPercentage)}% (${usage.agentsDeployed}/${limits.maxAgents})`,
      });
    } else if (agentPercentage >= 80) {
      warnings.push({
        metric: 'agents',
        currentUsage: usage.agentsDeployed,
        limit: limits.maxAgents,
        percentage: agentPercentage,
        severity: 'warning',
        message: `Approaching agent limit: ${Math.round(agentPercentage)}% used`,
      });
    }

    // Check users
    const userPercentage = (usage.usersAdded / limits.maxUsers) * 100;
    if (userPercentage >= 95) {
      warnings.push({
        metric: 'users',
        currentUsage: usage.usersAdded,
        limit: limits.maxUsers,
        percentage: userPercentage,
        severity: 'critical',
        message: `User limit at ${Math.round(userPercentage)}% (${usage.usersAdded}/${limits.maxUsers})`,
      });
    } else if (userPercentage >= 80) {
      warnings.push({
        metric: 'users',
        currentUsage: usage.usersAdded,
        limit: limits.maxUsers,
        percentage: userPercentage,
        severity: 'warning',
        message: `Approaching user limit: ${Math.round(userPercentage)}% used`,
      });
    }

    // Check data
    const dataGB = usage.dataUsedMB / 1024;
    const dataPercentage = (dataGB / limits.maxDataGB) * 100;
    if (dataPercentage >= 95) {
      warnings.push({
        metric: 'data',
        currentUsage: dataGB,
        limit: limits.maxDataGB,
        percentage: dataPercentage,
        severity: 'critical',
        message: `Data storage at ${Math.round(dataPercentage)}% (${dataGB.toFixed(2)}GB/${limits.maxDataGB}GB)`,
      });
    } else if (dataPercentage >= 80) {
      warnings.push({
        metric: 'data',
        currentUsage: dataGB,
        limit: limits.maxDataGB,
        percentage: dataPercentage,
        severity: 'warning',
        message: `Approaching storage limit: ${Math.round(dataPercentage)}% used`,
      });
    }

    return warnings;
  }
}

export default UsageTracker;
