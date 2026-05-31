// Integration Factory & Manager
// Provides centralized creation, lifecycle management, and configuration of integrations

import { BaseIntegration } from './base';
import { QuickBooksIntegration } from './quickbooks';
import { XeroIntegration } from './xero';
import { FreshBooksIntegration } from './freshbooks';
import { PlaidIntegration } from './plaid';
import { SyncScheduler } from './sync-scheduler';
import { IntegrationSetup, SyncJob } from './integration-types';

/**
 * Integration Factory
 * Creates and manages integration instances with lifecycle hooks
 * 
 * Responsibilities:
 * - Instantiate integrations by type
 * - Manage integration registry
 * - Coordinate sync scheduling
 * - Provide centralized configuration
 */

export interface IntegrationConfig {
  enableAutoSync: boolean;
  defaultSyncFrequency: 'hourly' | 'daily' | 'weekly' | 'manual';
  maxConcurrentSyncs: number;
  syncRetryConfig: {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
  };
}

export interface IntegrationFactory {
  createIntegration(
    type: string,
    orgId: string,
    setup?: Partial<IntegrationSetup>
  ): Promise<BaseIntegration>;
  
  getIntegration(integrationId: string): BaseIntegration | undefined;
  
  deleteIntegration(integrationId: string): Promise<void>;
  
  listIntegrations(orgId: string): BaseIntegration[];
  
  scheduleSync(
    integrationId: string,
    frequency: 'hourly' | 'daily' | 'weekly' | 'manual'
  ): Promise<void>;
  
  triggerSync(
    integrationId: string,
    initiator: string
  ): Promise<SyncJob>;
  
  getStats(): IntegrationManagerStats;
}

export interface IntegrationManagerStats {
  totalIntegrations: number;
  integrationsByType: { [key: string]: number };
  activeSchedules: number;
  queueSize: number;
  processingCount: number;
}

/**
 * Default configuration for integration layer
 */
const DEFAULT_CONFIG: IntegrationConfig = {
  enableAutoSync: true,
  defaultSyncFrequency: 'daily',
  maxConcurrentSyncs: 5,
  syncRetryConfig: {
    maxRetries: 3,
    initialDelayMs: 5000,
    maxDelayMs: 300000 // 5 minutes
  }
};

/**
 * Integration Manager Implementation
 * Manages lifecycle of multiple integrations with centralized scheduling
 */
export class IntegrationManager implements IntegrationFactory {
  private integrations: Map<string, BaseIntegration> = new Map();
  private integrationsByOrg: Map<string, Set<string>> = new Map();
  private integrationsByType: Map<string, Set<string>> = new Map();
  private scheduler: SyncScheduler;
  private config: IntegrationConfig;

  constructor(config: Partial<IntegrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scheduler = new SyncScheduler({
      maxConcurrentSyncs: this.config.maxConcurrentSyncs,
      syncRetryConfig: this.config.syncRetryConfig
    });

    this.initializeScheduler();
  }

  /**
   * Create new integration instance
   */
  async createIntegration(
    type: string,
    orgId: string,
    setup?: Partial<IntegrationSetup>
  ): Promise<BaseIntegration> {
    const integrationId = this.generateIntegrationId();
    let integration: BaseIntegration;

    // Factory switch - create appropriate integration type
    switch (type.toLowerCase()) {
      case 'quickbooks':
        integration = new QuickBooksIntegration(integrationId, orgId);
        break;
      
      case 'xero':
        integration = new XeroIntegration(integrationId, orgId);
        break;
      
      case 'freshbooks':
        integration = new FreshBooksIntegration(integrationId, orgId);
        break;
      
      case 'plaid':
        integration = new PlaidIntegration(integrationId, orgId);
        break;
      
      default:
        throw new Error(`Unknown integration type: ${type}`);
    }

    // Apply custom configuration if provided
    if (setup?.config) {
      integration.setup.config = { ...integration.setup.config, ...setup.config };
    }
    if (setup?.syncSettings) {
      integration.setup.syncSettings = { ...integration.setup.syncSettings, ...setup.syncSettings };
    }

    // Register integration
    this.integrations.set(integrationId, integration);
    
    // Track by org
    if (!this.integrationsByOrg.has(orgId)) {
      this.integrationsByOrg.set(orgId, new Set());
    }
    this.integrationsByOrg.get(orgId)!.add(integrationId);

    // Track by type
    if (!this.integrationsByType.has(type)) {
      this.integrationsByType.set(type, new Set());
    }
    this.integrationsByType.get(type)!.add(integrationId);

    console.log(`Created ${type} integration: ${integrationId}`);
    return integration;
  }

  /**
   * Get integration by ID
   */
  getIntegration(integrationId: string): BaseIntegration | undefined {
    return this.integrations.get(integrationId);
  }

  /**
   * Delete integration and cleanup
   */
  async deleteIntegration(integrationId: string): Promise<void> {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    // Revoke authorization
    try {
      await integration.disconnect();
    } catch (error) {
      console.warn(`Failed to revoke integration ${integrationId}:`, error);
    }

    // Unschedule any active syncs
    this.scheduler.unscheduleIntegration(integrationId);

    // Remove from registry
    this.integrations.delete(integrationId);
    
    // Remove from org tracking
    for (const [orgId, intSet] of this.integrationsByOrg) {
      intSet.delete(integrationId);
    }

    // Remove from type tracking
    for (const [type, intSet] of this.integrationsByType) {
      intSet.delete(integrationId);
    }

    console.log(`Deleted integration: ${integrationId}`);
  }

  /**
   * List integrations for organization
   */
  listIntegrations(orgId: string): BaseIntegration[] {
    const ids = this.integrationsByOrg.get(orgId) || new Set();
    return Array.from(ids)
      .map(id => this.integrations.get(id))
      .filter((i): i is BaseIntegration => i !== undefined);
  }

  /**
   * Schedule recurring sync for integration
   */
  async scheduleSync(
    integrationId: string,
    frequency: 'hourly' | 'daily' | 'weekly' | 'manual'
  ): Promise<void> {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    if (!integration.setup.isConnected) {
      throw new Error('Integration is not connected');
    }

    // Update sync settings
    integration.setup.syncSettings.syncFrequency = frequency;
    integration.setup.syncSettings.autoSync = frequency !== 'manual';

    // Schedule with system
    this.scheduler.scheduleIntegration(
      integrationId,
      frequency,
      async (job) => {
        await this.executeSyncJob(integration, job);
      }
    );

    console.log(`Scheduled ${frequency} sync for integration: ${integrationId}`);
  }

  /**
   * Trigger manual sync
   */
  async triggerSync(
    integrationId: string,
    initiator: string
  ): Promise<SyncJob> {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    if (!integration.setup.isConnected) {
      throw new Error('Integration is not connected');
    }

    const job = this.scheduler.createSyncJob(integrationId, initiator);
    
    // Enqueue for processing
    this.scheduler.enqueueJob(job);

    console.log(`Triggered manual sync for integration: ${integrationId}, job: ${job.id}`);
    return job;
  }

  /**
   * Execute sync job with error handling
   */
  private async executeSyncJob(integration: BaseIntegration, job: SyncJob): Promise<void> {
    try {
      this.scheduler.updateJobStatus(job.id, 'running');
      const startTime = Date.now();

      // Execute sync steps based on integration type
      try {
        const companyInfo = await integration.syncCompanyInfo();
        this.scheduler.incrementJobCounter(job.id, 'itemsCreated', 1);
      } catch (error) {
        this.scheduler.addJobError(job.id, {
          code: 'sync_company_info_failed',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          apiEndpoint: '/company'
        });
      }

      try {
        const accounts = await integration.syncAccounts();
        this.scheduler.incrementJobCounter(job.id, 'itemsProcessed', accounts.length);
        this.scheduler.incrementJobCounter(job.id, 'itemsCreated', accounts.length);
      } catch (error) {
        this.scheduler.addJobError(job.id, {
          code: 'sync_accounts_failed',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          apiEndpoint: '/accounts'
        });
      }

      try {
        const invoices = await integration.syncInvoices();
        this.scheduler.incrementJobCounter(job.id, 'itemsProcessed', invoices.length);
        this.scheduler.incrementJobCounter(job.id, 'itemsCreated', invoices.length);
      } catch (error) {
        this.scheduler.addJobError(job.id, {
          code: 'sync_invoices_failed',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          apiEndpoint: '/invoices'
        });
      }

      try {
        const bills = await integration.syncBills();
        this.scheduler.incrementJobCounter(job.id, 'itemsProcessed', bills.length);
        this.scheduler.incrementJobCounter(job.id, 'itemsCreated', bills.length);
      } catch (error) {
        this.scheduler.addJobError(job.id, {
          code: 'sync_bills_failed',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          apiEndpoint: '/bills'
        });
      }

      try {
        const transactions = await integration.syncTransactions();
        this.scheduler.incrementJobCounter(job.id, 'itemsProcessed', transactions.length);
      } catch (error) {
        this.scheduler.addJobError(job.id, {
          code: 'sync_transactions_failed',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          apiEndpoint: '/transactions'
        });
      }

      // Try bank sync if supported
      try {
        const bankAccounts = await integration.syncBankAccounts();
        const bankTransactions = await integration.syncBankTransactions();
        this.scheduler.incrementJobCounter(job.id, 'itemsProcessed', bankTransactions.length);
      } catch (error) {
        // Bank sync may not be supported - log but don't fail
        console.warn(`Bank sync not supported for ${integration.type}:`, error);
      }

      // Determine job status
      const jobErrors = job.errors || [];
      if (jobErrors.length === 0) {
        this.scheduler.updateJobStatus(job.id, 'completed', Date.now() - startTime);
      } else if (jobErrors.some(e => e.retryable)) {
        // Has retryable errors - schedule retry
        if (this.scheduler.shouldRetry(job)) {
          this.scheduler.scheduleRetry(job.id);
          this.scheduler.updateJobStatus(job.id, 'partial', Date.now() - startTime);
        } else {
          this.scheduler.updateJobStatus(job.id, 'failed', Date.now() - startTime);
        }
      } else {
        // All errors are non-retryable
        this.scheduler.updateJobStatus(job.id, 'failed', Date.now() - startTime);
      }
    } catch (error) {
      this.scheduler.addJobError(job.id, {
        code: 'sync_execution_failed',
        message: error instanceof Error ? error.message : String(error),
        retryable: true
      });

      if (this.scheduler.shouldRetry(job)) {
        this.scheduler.scheduleRetry(job.id);
      } else {
        this.scheduler.updateJobStatus(job.id, 'failed', 0);
      }
    }
  }

  /**
   * Get manager statistics
   */
  getStats(): IntegrationManagerStats {
    const byType: { [key: string]: number } = {};
    for (const [type, set] of this.integrationsByType) {
      byType[type] = set.size;
    }

    const schedulerStats = this.scheduler.getStats();

    return {
      totalIntegrations: this.integrations.size,
      integrationsBy Type: byType,
      activeSchedules: schedulerStats.scheduled,
      queueSize: schedulerStats.queueSize,
      processingCount: schedulerStats.processing
    };
  }

  /**
   * Initialize scheduler processing
   */
  private initializeScheduler(): void {
    // Start background processing loop
    this.scheduler.startProcessing(1000); // Process every 1 second
  }

  /**
   * Shutdown manager gracefully
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down integration manager...');
    
    // Unschedule all integrations
    for (const integrationId of this.integrations.keys()) {
      this.scheduler.unscheduleIntegration(integrationId);
    }

    // Disconnect all integrations
    for (const integration of this.integrations.values()) {
      try {
        await integration.disconnect();
      } catch (error) {
        console.warn(`Error disconnecting ${integration.id}:`, error);
      }
    }

    // Clear scheduler
    this.scheduler.clear();
    this.integrations.clear();
    this.integrationsByOrg.clear();
    this.integrationsByType.clear();

    console.log('Integration manager shutdown complete');
  }

  /**
   * Generate unique integration ID
   */
  private generateIntegrationId(): string {
    return `int-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Export singleton manager instance
 * In production, this would be dependency-injected or created per request
 */
export const createIntegrationManager = (config?: Partial<IntegrationConfig>): IntegrationManager => {
  return new IntegrationManager(config);
};
