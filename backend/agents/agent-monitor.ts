/**
 * Ledgr Agent Monitoring & Alerting System
 * Real-time monitoring, performance metrics, health checks, anomaly detection
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AgentMetrics,
  AgentAlert,
  AlertType,
  AgentHealthStatus,
  TaskExecutionStats,
  CostBreakdown,
  Agent,
  AgentType,
} from './agent-types';

// ============================================================================
// Agent Monitor
// ============================================================================

export class AgentMonitor {
  private database: any;
  private agents: Map<string, Agent> = new Map();
  private healthChecks: Map<string, AgentHealthStatus> = new Map();
  private alerts: AgentAlert[] = [];
  private metrics: Map<string, AgentMetrics> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  // Alert thresholds
  private readonly THRESHOLDS = {
    error_rate_critical: 0.2, // 20%
    error_rate_warning: 0.1, // 10%
    accuracy_critical: 0.7, // 70%
    accuracy_warning: 0.85, // 85%
    execution_timeout_ms: 60000, // 1 minute
    cost_daily_threshold_usd: 1000,
  };

  constructor(database: any) {
    this.database = database;
  }

  // ========================================================================
  // Health Monitoring
  // ========================================================================

  /**
   * Start continuous monitoring loop
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.runHealthChecks();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Run comprehensive health checks on all agents
   */
  async runHealthChecks(): Promise<Map<string, AgentHealthStatus>> {
    const allAgents = await this.database.getAllAgents();

    for (const agent of allAgents) {
      await this.checkAgentHealth(agent);
    }

    return this.healthChecks;
  }

  /**
   * Check health of single agent
   */
  async checkAgentHealth(agent: Agent): Promise<AgentHealthStatus> {
    const metrics = await this.calculateMetrics(agent.id);
    const tasks = await this.database.getAgentTasks(agent.id, 24); // Last 24 hours

    const failedTasks = tasks.filter((t: any) => t.status === 'failed').length;
    const errorRate = tasks.length > 0 ? failedTasks / tasks.length : 0;

    const health: AgentHealthStatus = {
      agent_id: agent.id,
      overall_health: this.determineHealth(metrics, errorRate),
      error_rate: errorRate,
      uptime_percentage: 100 - errorRate * 100,
      last_successful_task: this.getLastSuccessfulTask(tasks),
      last_failure: this.getLastFailure(tasks),
      queued_tasks: await this.database.countQueuedTasks(agent.id),
      avg_response_time_ms: metrics.avg_execution_time_seconds * 1000,
    };

    this.healthChecks.set(agent.id, health);
    this.metrics.set(agent.id, metrics);

    // Check thresholds and create alerts
    await this.evaluateHealthThresholds(agent, health);

    return health;
  }

  /**
   * Get the last successful task for an agent
   */
  private getLastSuccessfulTask(tasks: any[]): Date | undefined {
    const successful = tasks.filter((t: any) => t.status === 'completed');
    if (successful.length === 0) return undefined;
    return new Date(Math.max(...successful.map((t: any) => new Date(t.completed_at).getTime())));
  }

  /**
   * Get the last failure for an agent
   */
  private getLastFailure(tasks: any[]): any | undefined {
    const failed = tasks.filter((t: any) => t.status === 'failed');
    if (failed.length === 0) return undefined;
    return failed[failed.length - 1].error;
  }

  /**
   * Determine overall health status
   */
  private determineHealth(
    metrics: AgentMetrics,
    errorRate: number
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (errorRate > this.THRESHOLDS.error_rate_critical) {
      return 'unhealthy';
    }

    if (
      errorRate > this.THRESHOLDS.error_rate_warning ||
      metrics.accuracy_rate < this.THRESHOLDS.accuracy_critical
    ) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Evaluate health against thresholds and create alerts
   */
  private async evaluateHealthThresholds(
    agent: Agent,
    health: AgentHealthStatus
  ): Promise<void> {
    const existingAlerts = this.alerts.filter(
      (a) => a.agent_id === agent.id && !a.is_resolved
    );

    // Check error rate
    if (health.error_rate > this.THRESHOLDS.error_rate_critical) {
      await this.createAlert(
        agent.id,
        AlertType.HIGH_ERROR_RATE,
        'critical',
        `Error rate ${(health.error_rate * 100).toFixed(1)}% exceeds critical threshold`
      );
    }

    // Check accuracy
    const metrics = this.metrics.get(agent.id);
    if (metrics && metrics.accuracy_rate < this.THRESHOLDS.accuracy_critical) {
      await this.createAlert(
        agent.id,
        AlertType.ACCURACY_DECLINE,
        'critical',
        `Accuracy ${metrics.accuracy_rate.toFixed(1)}% below critical threshold`
      );
    }

    // Check for recent successful tasks
    if (!health.last_successful_task) {
      await this.createAlert(
        agent.id,
        AlertType.AGENT_OFFLINE,
        'warning',
        'No successful tasks in last 24 hours'
      );
    }

    // Escalation queue
    if (health.queued_tasks > 100) {
      await this.createAlert(
        agent.id,
        AlertType.ESCALATION_QUEUE_FULL,
        'warning',
        `${health.queued_tasks} tasks waiting for human review`
      );
    }
  }

  // ========================================================================
  // Performance Metrics
  // ========================================================================

  /**
   * Calculate comprehensive metrics for agent
   */
  async calculateMetrics(agentId: string): Promise<AgentMetrics> {
    const tasks = await this.database.getAgentTasks(agentId, 30); // Last 30 days

    const completedTasks = tasks.filter((t: any) => t.status === 'completed');
    const failedTasks = tasks.filter((t: any) => t.status === 'failed');
    const approvalRate = this.calculateApprovalRate(tasks);

    const metrics: AgentMetrics = {
      total_tasks: tasks.length,
      successful_tasks: completedTasks.length,
      failed_tasks: failedTasks.length,
      approval_rate: approvalRate,
      accuracy_rate: await this.calculateAccuracy(agentId),
      avg_execution_time_seconds: this.calculateAvgExecutionTime(completedTasks),
      cost_usd: this.calculateCost(completedTasks),
      last_7_day_accuracy: await this.calculateAccuracy(agentId, 7),
    };

    return metrics;
  }

  /**
   * Calculate approval rate (% of tasks requiring human approval)
   */
  private calculateApprovalRate(tasks: any[]): number {
    const escalatedTasks = tasks.filter((t) => t.status === 'escalated').length;
    return tasks.length > 0 ? (escalatedTasks / tasks.length) * 100 : 0;
  }

  /**
   * Calculate accuracy from feedback
   */
  private async calculateAccuracy(agentId: string, days?: number): Promise<number> {
    const feedback = await this.database.getAgentFeedback(agentId, days);

    if (feedback.length === 0) {
      return 100; // No feedback = assume accurate
    }

    const correct = feedback.filter((f: any) =>
      ['correct', 'partial'].includes(f.feedback_type)
    ).length;

    return (correct / feedback.length) * 100;
  }

  /**
   * Calculate average execution time
   */
  private calculateAvgExecutionTime(tasks: any[]): number {
    const tasksWithMetadata = tasks.filter(
      (t) => t.execution_metadata?.execution_duration_ms
    );

    if (tasksWithMetadata.length === 0) return 0;

    const totalTime = tasksWithMetadata.reduce(
      (sum, t) => sum + t.execution_metadata.execution_duration_ms,
      0
    );

    return Math.round((totalTime / tasksWithMetadata.length) * 1000) / 1000;
  }

  /**
   * Calculate total cost for tasks
   */
  private calculateCost(tasks: any[]): number {
    return tasks.reduce((sum, t) => sum + (t.execution_metadata?.cost_usd || 0), 0);
  }

  /**
   * Get cost breakdown by agent
   */
  async getCostBreakdown(orgId: string, period: Date): Promise<CostBreakdown> {
    const agents = await this.database.getOrgAgents(orgId);
    const breakdown: CostBreakdown = {
      org_id: orgId,
      period,
      agent_costs: {} as Record<string, number>,
      total_usd: 0,
      tokens_used: 0,
      billable_tasks: 0,
    };

    for (const agent of agents) {
      const tasks = await this.database.getAgentTasksSince(agent.id, period);
      const cost = this.calculateCost(tasks);
      const tokens = tasks.reduce((sum: number, t: any) => sum + (t.execution_metadata?.tokens_used || 0), 0);

      const agentType = agent.type as AgentType;
      breakdown.agent_costs[agentType] = (breakdown.agent_costs[agentType] || 0) + cost;
      breakdown.total_usd += cost;
      breakdown.tokens_used += tokens;
      breakdown.billable_tasks += tasks.length;
    }

    return breakdown;
  }

  // ========================================================================
  // Alerting System
  // ========================================================================

  /**
   * Create an alert
   */
  async createAlert(
    agentId: string,
    alertType: AlertType,
    severity: 'info' | 'warning' | 'critical',
    message: string,
    metadata?: Record<string, any>
  ): Promise<AgentAlert> {
    const orgId = await this.database.getAgentOrgId(agentId);

    // Check if similar unresolved alert already exists
    const existing = this.alerts.find(
      (a) =>
        a.agent_id === agentId &&
        a.alert_type === alertType &&
        !a.is_resolved
    );

    if (existing) {
      return existing; // Don't create duplicate
    }

    const alert: AgentAlert = {
      id: uuidv4(),
      org_id: orgId,
      agent_id: agentId,
      alert_type: alertType,
      severity,
      message,
      metadata,
      is_resolved: false,
      created_at: new Date(),
    };

    this.alerts.push(alert);
    await this.database.saveAlert(alert);

    // Send notification if critical
    if (severity === 'critical') {
      await this.sendCriticalAlert(alert);
    }

    return alert;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<AgentAlert | null> {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return null;

    alert.is_resolved = true;
    alert.resolved_at = new Date();
    await this.database.updateAlert(alert);

    return alert;
  }

  /**
   * Get active alerts for organization
   */
  async getActiveAlerts(orgId: string): Promise<AgentAlert[]> {
    return this.alerts.filter((a) => a.org_id === orgId && !a.is_resolved);
  }

  /**
   * Send critical alert notification
   */
  private async sendCriticalAlert(alert: AgentAlert): Promise<void> {
    // Send email/Slack to admins
    console.log(`CRITICAL ALERT: ${alert.message}`);
  }

  // ========================================================================
  // Anomaly Detection
  // ========================================================================

  /**
   * Detect anomalies in agent behavior
   */
  async detectAnomalies(agentId: string): Promise<string[]> {
    const anomalies: string[] = [];
    const tasks = await this.database.getAgentTasks(agentId, 7);

    // Check execution time anomalies
    const executionTimes = tasks
      .map((t: any) => t.execution_metadata?.execution_duration_ms)
      .filter(Boolean);

    if (executionTimes.length > 0) {
      const avgTime = executionTimes.reduce((a: number, b: number) => a + b) / executionTimes.length;
      const outliers = executionTimes.filter(
        (t: number) => Math.abs(t - avgTime) > avgTime * 2
      );

      if (outliers.length > 0) {
        anomalies.push(`${outliers.length} tasks had unusual execution time`);
      }
    }

    // Check output consistency
    const outputs = tasks.map((t: any) => t.output_actions?.length || 0);
    const avgOutputs = outputs.reduce((a: number, b: number) => a + b, 0) / outputs.length;

    const consistencyAnomalies = outputs.filter((o: number) => o === 0 && avgOutputs > 0).length;
    if (consistencyAnomalies > tasks.length * 0.3) {
      anomalies.push('Agent produced no actions in >30% of tasks');
    }

    return anomalies;
  }

  // ========================================================================
  // Dashboard Data
  // ========================================================================

  /**
   * Get dashboard data for UI
   */
  async getDashboardData(orgId: string): Promise<{
    agents: any[];
    tasks: any;
    alerts: any[];
    costs: any;
  }> {
    const agents = await this.database.getOrgAgents(orgId);
    const dashboardAgents = agents.map((agent: Agent) => {
      const health = this.healthChecks.get(agent.id);
      const metrics = this.metrics.get(agent.id);

      return {
        id: agent.id,
        type: agent.type,
        name: agent.name,
        is_enabled: agent.is_enabled,
        health: health?.overall_health || 'unknown',
        error_rate: (health?.error_rate || 0) * 100,
        accuracy: metrics?.accuracy_rate || 0,
        tasks_queued: health?.queued_tasks || 0,
        last_task: agent.last_task_at,
      };
    });

    const tasks = await this.database.getOrgTaskStats(orgId, 7);
    const alerts = await this.getActiveAlerts(orgId);
    const costs = await this.getCostBreakdown(orgId, new Date());

    return {
      agents: dashboardAgents,
      tasks,
      alerts,
      costs,
    };
  }

  /**
   * Get detailed agent performance report
   */
  async getAgentPerformanceReport(agentId: string): Promise<any> {
    const health = this.healthChecks.get(agentId);
    const metrics = this.metrics.get(agentId);
    const tasks = await this.database.getAgentTasks(agentId, 30);
    const anomalies = await this.detectAnomalies(agentId);

    return {
      agent_id: agentId,
      health_status: health,
      metrics,
      recent_tasks: tasks.slice(0, 10),
      anomalies,
      "7_day_trend": await this.getPerformanceTrend(agentId, 7),
      "30_day_trend": await this.getPerformanceTrend(agentId, 30),
    };
  }

  private async getPerformanceTrend(agentId: string, days: number): Promise<any> {
    // Calculate accuracy trend over time
    const history: any[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      const accuracy = await this.calculateAccuracy(agentId, 1); // Daily accuracy
      history.push({
        date: date.toISOString().split('T')[0],
        accuracy,
      });
    }

    return history.reverse();
  }

  // ========================================================================
  // Getters
  // ========================================================================

  getHealthStatus(agentId: string): AgentHealthStatus | undefined {
    return this.healthChecks.get(agentId);
  }

  getMetrics(agentId: string): AgentMetrics | undefined {
    return this.metrics.get(agentId);
  }

  getAllAlerts(): AgentAlert[] {
    return this.alerts;
  }
}
