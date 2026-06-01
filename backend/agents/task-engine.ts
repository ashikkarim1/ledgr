/**
 * Ledgr Task Execution Engine
 * Manages task queuing, scheduling, parallel execution, rollback, and recovery
 */

import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, TaskPriority, AgentSchedule, ScheduleFrequency } from './agent-types';
import { FinancialAgent } from './agent-framework';

// ============================================================================
// Task Execution Engine
// ============================================================================

export class TaskExecutionEngine {
  private taskQueues: Map<TaskPriority, Task[]> = new Map();
  private executingTasks: Map<string, Task> = new Map();
  private scheduledTasks: Map<string, AgentSchedule> = new Map();
  private database: any;
  private agentRegistry: Map<string, FinancialAgent> = new Map();
  private maxConcurrentTasks: number = 10;
  private executionInterval: NodeJS.Timeout | null = null;

  constructor(database: any) {
    this.database = database;
    this.initializePriorityQueues();
  }

  // ========================================================================
  // Task Submission & Queuing
  // ========================================================================

  /**
   * Submit a new task for execution
   */
  async submitTask(task: Task): Promise<Task> {
    // Generate task ID if not provided
    if (!task.id) {
      task.id = uuidv4();
    }

    // Set initial status
    task.status = 'pending';
    task.created_at = new Date();
    task.retry_count = 0;

    // Validate task
    await this.validateTask(task);

    // Save to database
    await this.database.saveTask(task);

    // Queue for execution
    this.enqueueTask(task);

    return task;
  }

  /**
   * Schedule a recurring task
   */
  async scheduleTask(schedule: AgentSchedule): Promise<AgentSchedule> {
    if (!schedule.id) {
      schedule.id = uuidv4();
    }

    // Calculate next run time
    schedule.next_run_at = this.calculateNextRunTime(schedule.frequency);

    // Save schedule
    await this.database.saveAgentSchedule(schedule);
    this.scheduledTasks.set(schedule.id, schedule);

    return schedule;
  }

  /**
   * Enqueue task based on priority
   */
  private enqueueTask(task: Task): void {
    task.status = 'queued';

    const queue = this.taskQueues.get(task.priority);
    if (queue) {
      queue.push(task);
    }
  }

  /**
   * Get next task from queue (respecting priority)
   */
  private dequeueTask(): Task | null {
    const priorities: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

    for (const priority of priorities) {
      const queue = this.taskQueues.get(priority);
      if (queue && queue.length > 0) {
        return queue.shift() || null;
      }
    }

    return null;
  }

  // ========================================================================
  // Task Execution
  // ========================================================================

  /**
   * Start the task execution loop
   */
  startExecutionLoop(intervalMs: number = 5000): void {
    if (this.executionInterval) {
      clearInterval(this.executionInterval);
    }

    this.executionInterval = setInterval(() => {
      this.processNextTask();
    }, intervalMs);
  }

  /**
   * Stop the execution loop
   */
  stopExecutionLoop(): void {
    if (this.executionInterval) {
      clearInterval(this.executionInterval);
      this.executionInterval = null;
    }
  }

  /**
   * Process next task in queue
   */
  private async processNextTask(): Promise<void> {
    // Check if we have capacity
    if (this.executingTasks.size >= this.maxConcurrentTasks) {
      return;
    }

    // Get next task
    const task = this.dequeueTask();
    if (!task) {
      return;
    }

    // Get agent for this task
    const agent = this.agentRegistry.get(task.agent_id);
    if (!agent) {
      await this.handleMissingAgent(task);
      return;
    }

    // Execute task
    this.executingTasks.set(task.id, task);

    try {
      const executedTask = await agent.executeTask(task);
      await this.database.updateTask(executedTask);
    } catch (error) {
      console.error(`Task ${task.id} execution failed:`, error);
    } finally {
      this.executingTasks.delete(task.id);
    }
  }

  /**
   * Execute task immediately (not queued)
   */
  async executeTaskNow(task: Task): Promise<Task> {
    const agent = this.agentRegistry.get(task.agent_id);
    if (!agent) {
      throw new Error(`Agent ${task.agent_id} not found`);
    }

    return await agent.executeTask(task);
  }

  // ========================================================================
  // Scheduled Task Execution
  // ========================================================================

  /**
   * Check and execute due scheduled tasks
   */
  async processScheduledTasks(): Promise<void> {
    const now = new Date();

    for (const [scheduleId, schedule] of this.scheduledTasks) {
      if (schedule.is_active && schedule.next_run_at <= now) {
        // Create task from template
        const task = this.createTaskFromTemplate(schedule);
        await this.submitTask(task);

        // Calculate next run
        schedule.last_run_at = now;
        schedule.next_run_at = this.calculateNextRunTime(schedule.frequency);
        await this.database.updateAgentSchedule(schedule);
      }
    }
  }

  /**
   * Create task from template
   */
  private createTaskFromTemplate(schedule: AgentSchedule): Task {
    const template = schedule.task_template;

    return {
      id: uuidv4(),
      org_id: schedule.org_id,
      agent_id: schedule.agent_id,
      agent_type: schedule.frequency as any, // Will be set properly
      title: template.title_template,
      description: template.description_template,
      input_data: template.input_data_template,
      status: 'pending',
      priority: template.priority,
      created_at: new Date(),
      retry_count: 0,
      tags: template.tags,
    };
  }

  /**
   * Calculate next run time for schedule
   */
  private calculateNextRunTime(frequency: ScheduleFrequency): Date {
    const now = new Date();

    switch (frequency) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'biweekly':
        return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return nextMonth;
      case 'quarterly':
        const nextQuarter = new Date(now);
        nextQuarter.setMonth(nextQuarter.getMonth() + 3);
        return nextQuarter;
      case 'once':
      default:
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // Far future
    }
  }

  // ========================================================================
  // Task Approval Workflow
  // ========================================================================

  /**
   * Approve pending actions for a task
   */
  async approveTask(
    taskId: string,
    approverUserId: string,
    feedback?: string
  ): Promise<Task> {
    const task = await this.database.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Mark as approved
    task.status = 'approved';
    task.reviewed_by = approverUserId;
    task.reviewed_at = new Date();
    task.feedback = feedback;

    // Execute approved actions
    const agent = this.agentRegistry.get(task.agent_id);
    if (agent && task.output_actions) {
      // Re-execute with approved status
      // (In real implementation, would call executeActions method)
    }

    await this.database.updateTask(task);
    return task;
  }

  /**
   * Reject task and provide feedback
   */
  async rejectTask(
    taskId: string,
    rejectorUserId: string,
    reason: string
  ): Promise<Task> {
    const task = await this.database.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.status = 'rejected';
    task.reviewed_by = rejectorUserId;
    task.reviewed_at = new Date();
    task.feedback = reason;

    // Rollback any partially executed actions
    if (task.output_actions) {
      for (const action of task.output_actions) {
        if (action.status === 'executed') {
          // Would rollback via agent
        }
      }
    }

    await this.database.updateTask(task);
    return task;
  }

  // ========================================================================
  // Task Rollback & Recovery
  // ========================================================================

  /**
   * Rollback a completed task (undo all actions)
   */
  async rollbackTask(taskId: string): Promise<Task> {
    const task = await this.database.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (!task.output_actions) {
      return task;
    }

    // Rollback each action in reverse order
    for (let i = task.output_actions.length - 1; i >= 0; i--) {
      const action = task.output_actions[i];
      if (action.status === 'executed') {
        // Delete created resources
        switch (action.type) {
          case 'create_invoice':
            await this.database.deleteInvoice(action.resource_id);
            break;
          case 'create_payment':
            await this.database.deletePayment(action.resource_id);
            break;
          case 'create_journal_entry':
            await this.database.deleteJournalEntry(action.resource_id);
            break;
        }

        action.status = 'rolled_back';
        action.rollback_at = new Date();
        await this.database.saveAction(action);
      }
    }

    task.status = 'rejected';
    await this.database.updateTask(task);

    return task;
  }

  // ========================================================================
  // Agent Registration & Management
  // ========================================================================

  /**
   * Register an agent instance
   */
  registerAgent(agentId: string, agent: FinancialAgent): void {
    this.agentRegistry.set(agentId, agent);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agentRegistry.delete(agentId);
  }

  /**
   * Get registered agent
   */
  getAgent(agentId: string): FinancialAgent | undefined {
    return this.agentRegistry.get(agentId);
  }

  // ========================================================================
  // Monitoring & Metrics
  // ========================================================================

  /**
   * Get task execution statistics
   */
  async getTaskStats(orgId: string, periodDays: number = 7): Promise<any> {
    const tasks = await this.database.getTasksByOrg(orgId, periodDays);

    const stats = {
      total_tasks: tasks.length,
      completed_tasks: tasks.filter((t: Task) => t.status === 'completed').length,
      failed_tasks: tasks.filter((t: Task) => t.status === 'failed').length,
      pending_tasks: tasks.filter((t: Task) => t.status === 'pending').length,
      escalated_tasks: tasks.filter((t: Task) => t.status === 'escalated').length,
      avg_execution_time_ms: this.calculateAvgExecutionTime(tasks),
      success_rate: this.calculateSuccessRate(tasks),
    };

    return stats;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    total_queued: number;
    by_priority: Record<TaskPriority, number>;
    executing: number;
  } {
    const queues = {
      urgent: this.taskQueues.get('urgent')?.length || 0,
      high: this.taskQueues.get('high')?.length || 0,
      medium: this.taskQueues.get('medium')?.length || 0,
      low: this.taskQueues.get('low')?.length || 0,
    };

    return {
      total_queued: Object.values(queues).reduce((a, b) => a + b, 0),
      by_priority: queues,
      executing: this.executingTasks.size,
    };
  }

  // ========================================================================
  // Private Utilities
  // ========================================================================

  private initializePriorityQueues(): void {
    this.taskQueues.set('urgent', []);
    this.taskQueues.set('high', []);
    this.taskQueues.set('medium', []);
    this.taskQueues.set('low', []);
  }

  private async validateTask(task: Task): Promise<void> {
    if (!task.org_id) throw new Error('Task must have org_id');
    if (!task.agent_id) throw new Error('Task must have agent_id');
    if (!task.title) throw new Error('Task must have title');
    if (!task.input_data) throw new Error('Task must have input_data');
  }

  private calculateAvgExecutionTime(tasks: Task[]): number {
    const executedTasks = tasks.filter((t) => t.execution_metadata?.execution_duration_ms);
    if (executedTasks.length === 0) return 0;

    const totalTime = executedTasks.reduce(
      (sum, t) => sum + (t.execution_metadata?.execution_duration_ms || 0),
      0
    );
    return Math.round(totalTime / executedTasks.length);
  }

  private calculateSuccessRate(tasks: Task[]): number {
    const completed = tasks.filter((t) => t.status === 'completed').length;
    return tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
  }

  private async handleMissingAgent(task: Task): Promise<void> {
    task.status = 'failed';
    task.error = {
      code: 'AGENT_NOT_FOUND',
      message: `Agent ${task.agent_id} not registered`,
      severity: 'critical',
      escalate: true,
    };
    await this.database.updateTask(task);
  }
}
