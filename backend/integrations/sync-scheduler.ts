// @ts-nocheck
/**
 * Sync Scheduler
 * Manages scheduled syncs, retries, and automatic reconciliation
 */

import crypto from 'crypto';
import { Logger } from "./base.js";
import {
  SyncJob,
  SyncError,
  IntegrationSetup,
  SyncSettings,
} from "./integration-types.js";

// ============================================================================
// Sync Job Queue
// ============================================================================

export class SyncQueue {
  private queue: SyncJob[] = [];
  private processing = new Set<string>();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('SyncQueue');
  }

  enqueue(job: SyncJob): void {
    this.queue.push(job);
    this.logger.info('Job enqueued', {
      jobId: job.id,
      integrationId: job.integrationId,
      position: this.queue.length,
    });
  }

  dequeue(): SyncJob | undefined {
    return this.queue.shift();
  }

  isProcessing(jobId: string): boolean {
    return this.processing.has(jobId);
  }

  markProcessing(jobId: string): void {
    this.processing.add(jobId);
  }

  markComplete(jobId: string): void {
    this.processing.delete(jobId);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getProcessingCount(): number {
    return this.processing.size;
  }

  clear(): void {
    this.queue = [];
    this.processing.clear();
  }
}

// ============================================================================
// Sync Scheduler
// ============================================================================

export class SyncScheduler {
  private queue: SyncQueue;
  private schedules = new Map<string, NodeJS.Timer>();
  private syncJobs = new Map<string, SyncJob>();
  private logger: Logger;
  private maxConcurrentSyncs: number;
  private syncRetryConfig = {
    maxRetries: 3,
    initialDelayMs: 5000,
    maxDelayMs: 300000, // 5 minutes
  };

  constructor(maxConcurrentSyncs: number = 5) {
    this.queue = new SyncQueue();
    this.maxConcurrentSyncs = maxConcurrentSyncs;
    this.logger = new Logger('SyncScheduler');
  }

  // ========================================================================
  // Schedule Management
  // ========================================================================

  /**
   * Schedule recurring syncs based on integration settings
   */
  scheduleIntegration(integrationId: string, settings: SyncSettings): void {
    if (!settings.autoSync) {
      this.unscheduleIntegration(integrationId);
      return;
    }

    const interval = this.getIntervalMs(settings.syncFrequency, settings.syncTime);

    // Clear existing schedule
    this.unscheduleIntegration(integrationId);

    // Set new schedule
    const timer = setInterval(() => {
      this.createSyncJob(integrationId, 'system');
    }, interval);

    this.schedules.set(integrationId, timer);
    this.logger.info('Integration scheduled', {
      integrationId,
      frequency: settings.syncFrequency,
      interval: interval,
    });
  }

  /**
   * Remove scheduled sync for integration
   */
  unscheduleIntegration(integrationId: string): void {
    const timer = this.schedules.get(integrationId);
    if (timer) {
      clearInterval(timer);
      this.schedules.delete(integrationId);
      this.logger.info('Integration unscheduled', { integrationId });
    }
  }

  /**
   * Clear all schedules
   */
  clear(): void {
    for (const timer of this.schedules.values()) {
      clearInterval(timer);
    }
    this.schedules.clear();
    this.queue.clear();
    this.logger.info('All schedules cleared');
  }

  // ========================================================================
  // Job Management
  // ========================================================================

  /**
   * Create a new sync job
   */
  createSyncJob(
    integrationId: string,
    initiatedBy: 'system' | 'user' | 'webhook' = 'system',
    dataTypes?: string[]
  ): SyncJob {
    const job: SyncJob = {
      id: crypto.randomUUID(),
      integrationId,
      orgId: '', // Would be set from integration context
      type: 'incremental',
      dataTypes: (dataTypes || [
        'accounts',
        'invoices',
        'bills',
        'transactions',
      ]) as any,
      status: 'pending',
      startedAt: Date.now(),
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      itemsFailed: 0,
      errors: [],
      warnings: [],
      retryCount: 0,
      initiatedBy,
    };

    this.syncJobs.set(job.id, job);
    this.queue.enqueue(job);

    this.logger.info('Sync job created', {
      jobId: job.id,
      integrationId,
      initiatedBy,
    });

    return job;
  }

  /**
   * Get sync job by ID
   */
  getJob(jobId: string): SyncJob | undefined {
    return this.syncJobs.get(jobId);
  }

  /**
   * Get latest sync job for integration
   */
  getLatestJobForIntegration(integrationId: string): SyncJob | undefined {
    let latest: SyncJob | undefined;
    let latestTime = 0;

    for (const job of this.syncJobs.values()) {
      if (job.integrationId === integrationId && job.startedAt > latestTime) {
        latest = job;
        latestTime = job.startedAt;
      }
    }

    return latest;
  }

  /**
   * Update job status
   */
  updateJobStatus(
    jobId: string,
    status: 'pending' | 'running' | 'completed' | 'failed' | 'partial'
  ): void {
    const job = this.syncJobs.get(jobId);
    if (job) {
      job.status = status;
      if (status === 'completed' || status === 'failed' || status === 'partial') {
        job.completedAt = Date.now();
        job.duration = job.completedAt - job.startedAt;
      }
    }
  }

  /**
   * Add error to job
   */
  addJobError(jobId: string, error: SyncError): void {
    const job = this.syncJobs.get(jobId);
    if (job) {
      job.errors.push(error);
    }
  }

  /**
   * Increment job counters
   */
  incrementJobCounter(
    jobId: string,
    counter: 'itemsProcessed' | 'itemsCreated' | 'itemsUpdated' | 'itemsSkipped' | 'itemsFailed',
    amount: number = 1
  ): void {
    const job = this.syncJobs.get(jobId);
    if (job) {
      job[counter] += amount;
    }
  }

  // ========================================================================
  // Retry Logic
  // ========================================================================

  /**
   * Determine if job should be retried
   */
  shouldRetry(job: SyncJob): boolean {
    return (
      job.retryCount < this.syncRetryConfig.maxRetries &&
      job.errors.some((e) => e.retryable)
    );
  }

  /**
   * Schedule job retry
   */
  scheduleRetry(job: SyncJob): void {
    job.retryCount++;

    const delayMs = Math.min(
      this.syncRetryConfig.initialDelayMs * Math.pow(2, job.retryCount - 1),
      this.syncRetryConfig.maxDelayMs
    );

    job.nextRetryAt = Date.now() + delayMs;
    job.status = 'pending';

    setTimeout(() => {
      this.queue.enqueue(job);
      this.logger.info('Job retry scheduled', {
        jobId: job.id,
        retryCount: job.retryCount,
        delayMs,
      });
    }, delayMs);
  }

  // ========================================================================
  // Processing
  // ========================================================================

  /**
   * Process next job in queue
   * @returns Promise resolves when job is processed
   */
  async processNextJob(): Promise<SyncJob | null> {
    if (this.queue.getProcessingCount() >= this.maxConcurrentSyncs) {
      return null;
    }

    const job = this.queue.dequeue();
    if (!job) {
      return null;
    }

    this.queue.markProcessing(job.id);
    this.updateJobStatus(job.id, 'running');

    try {
      this.logger.info('Processing sync job', {
        jobId: job.id,
        integrationId: job.integrationId,
      });

      // Job processing would be handled by integration service
      // This scheduler just manages the queue and lifecycle
      return job;
    } finally {
      this.queue.markComplete(job.id);
    }
  }

  /**
   * Process all pending jobs
   */
  async processAll(): Promise<void> {
    while (true) {
      const job = await this.processNextJob();
      if (!job) break;
      await this.delay(100); // Small delay between jobs
    }
  }

  /**
   * Start continuous processing loop
   */
  startProcessing(intervalMs: number = 1000): NodeJS.Timer {
    return setInterval(() => {
      this.processNextJob().catch((error) => {
        this.logger.error('Error processing job', { error });
      });
    }, intervalMs);
  }

  // ========================================================================
  // Statistics & Monitoring
  // ========================================================================

  getStats(): Record<string, any> {
    const completedJobs = Array.from(this.syncJobs.values()).filter(
      (j) => j.status === 'completed'
    );
    const failedJobs = Array.from(this.syncJobs.values()).filter((j) => j.status === 'failed');
    const totalProcessed = completedJobs.reduce((sum, j) => sum + j.itemsProcessed, 0);
    const averageDuration =
      completedJobs.length > 0
        ? completedJobs.reduce((sum, j) => sum + (j.duration || 0), 0) / completedJobs.length
        : 0;

    return {
      queueSize: this.queue.getQueueSize(),
      processing: this.queue.getProcessingCount(),
      scheduled: this.schedules.size,
      totalJobs: this.syncJobs.size,
      completedJobs: completedJobs.length,
      failedJobs: failedJobs.length,
      totalProcessed,
      averageDuration: Math.round(averageDuration),
      failureRate:
        this.syncJobs.size > 0 ? (failedJobs.length / this.syncJobs.size) * 100 : 0,
    };
  }

  /**
   * Get pending jobs
   */
  getPendingJobs(): SyncJob[] {
    return Array.from(this.syncJobs.values()).filter((j) => j.status === 'pending');
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: string): SyncJob[] {
    return Array.from(this.syncJobs.values()).filter((j) => j.status === status);
  }

  // ========================================================================
  // Utilities
  // ========================================================================

  private getIntervalMs(frequency: string, syncTime?: string): number {
    const intervals: Record<string, number> = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
    };

    return intervals[frequency] || intervals.daily;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Reconciliation Scheduler
// ============================================================================

export class ReconciliationScheduler {
  private logger: Logger;
  private reconciliations = new Map<string, any>();

  constructor() {
    this.logger = new Logger('ReconciliationScheduler');
  }

  /**
   * Schedule automatic reconciliation check
   */
  scheduleReconciliation(
    integrationId: string,
    accountId: string,
    intervalMs: number = 24 * 60 * 60 * 1000
  ): NodeJS.Timer {
    const timer = setInterval(() => {
      this.logger.info('Running automatic reconciliation', { integrationId, accountId });
      // Reconciliation would be executed here
    }, intervalMs);

    const key = `${integrationId}:${accountId}`;
    this.reconciliations.set(key, { timer, lastRun: Date.now() });

    return timer;
  }

  /**
   * Unschedule reconciliation
   */
  unscheduleReconciliation(integrationId: string, accountId: string): void {
    const key = `${integrationId}:${accountId}`;
    const record = this.reconciliations.get(key);
    if (record) {
      clearInterval(record.timer);
      this.reconciliations.delete(key);
    }
  }

  /**
   * Clear all reconciliation schedules
   */
  clear(): void {
    for (const record of this.reconciliations.values()) {
      clearInterval(record.timer);
    }
    this.reconciliations.clear();
  }
}

export default SyncScheduler;
