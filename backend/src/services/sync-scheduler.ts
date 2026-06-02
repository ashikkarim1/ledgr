import { db } from '../db';

interface SyncTask {
  org_id: string;
  company_id?: string;
  realm_id?: string;
  provider: 'wafeq' | 'quickbooks';
  access_token: string;
  sync_type: 'full' | 'incremental';
  last_sync_time?: Date;
}

/**
 * SyncScheduler manages periodic syncs for both Wafeq and QuickBooks
 * Runs background jobs to sync data at configured intervals
 */
class SyncScheduler {
  private wafeqInterval: NodeJS.Timeout | null = null;
  private quickBooksInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Start the sync scheduler
   * Checks for pending syncs every 5 minutes
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('Sync scheduler is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting sync scheduler...');

    // Run wafeq sync check every 5 minutes
    this.wafeqInterval = setInterval(
      () => this.checkAndExecuteWafeqSyncs(),
      5 * 60 * 1000 // 5 minutes
    );

    // Run QuickBooks sync check every 5 minutes
    this.quickBooksInterval = setInterval(
      () => this.checkAndExecuteQuickBooksSyncs(),
      5 * 60 * 1000 // 5 minutes
    );

    // Run initial check immediately
    await this.checkAndExecuteWafeqSyncs();
    await this.checkAndExecuteQuickBooksSyncs();
  }

  /**
   * Stop the sync scheduler
   */
  stop(): void {
    if (this.wafeqInterval) {
      clearInterval(this.wafeqInterval);
      this.wafeqInterval = null;
    }
    if (this.quickBooksInterval) {
      clearInterval(this.quickBooksInterval);
      this.quickBooksInterval = null;
    }
    this.isRunning = false;
    console.log('Sync scheduler stopped');
  }

  /**
   * Check and execute pending Wafeq syncs
   */
  private async checkAndExecuteWafeqSyncs(): Promise<void> {
    try {
      // Find all active Wafeq connections due for sync
      const connectionsResult = await db.query(
        `SELECT org_id, company_id, access_token, refresh_token, expires_at, 
                last_synced_at, next_scheduled_sync, sync_frequency_minutes
         FROM wafeq_connections
         WHERE active = true AND (
           next_scheduled_sync IS NULL OR 
           next_scheduled_sync <= NOW()
         )
         ORDER BY next_scheduled_sync ASC
         LIMIT 10`
      );

      const connections = connectionsResult.rows;

      for (const connection of connections) {
        const syncTask: SyncTask = {
          org_id: connection.org_id,
          company_id: connection.company_id,
          provider: 'wafeq',
          access_token: connection.access_token,
          sync_type: connection.last_synced_at ? 'incremental' : 'full',
          last_sync_time: connection.last_synced_at,
        };

        // Check if token needs refresh
        if (new Date(connection.expires_at) <= new Date()) {
          try {
            // Token refresh would go here - using access token directly for now
            console.log(
              `[Wafeq] Token expires soon for org ${connection.org_id}, would refresh`
            );
          } catch (tokenError) {
            console.error(
              `Failed to refresh Wafeq token for org ${connection.org_id}:`,
              tokenError
            );
            continue;
          }
        }

        // Execute the sync
        await this.executeWafeqSync(syncTask);

        // Schedule next sync
        const nextSyncMinutes = connection.sync_frequency_minutes || 15;
        await db.query(
          `UPDATE wafeq_connections 
           SET next_scheduled_sync = NOW() + INTERVAL '${nextSyncMinutes} minutes',
               last_synced_at = NOW()
           WHERE org_id = $1 AND company_id = $2`,
          [connection.org_id, connection.company_id]
        );
      }
    } catch (error) {
      console.error('Error in checkAndExecuteWafeqSyncs:', error);
    }
  }

  /**
   * Check and execute pending QuickBooks syncs
   */
  private async checkAndExecuteQuickBooksSyncs(): Promise<void> {
    try {
      // Find all active QB connections due for sync
      const connectionsResult = await db.query(
        `SELECT org_id, realm_id, access_token, refresh_token, expires_at,
                last_synced_at, next_scheduled_sync, sync_frequency_minutes
         FROM qb_connections
         WHERE active = true AND (
           next_scheduled_sync IS NULL OR 
           next_scheduled_sync <= NOW()
         )
         ORDER BY next_scheduled_sync ASC
         LIMIT 10`
      );

      const connections = connectionsResult.rows;

      for (const connection of connections) {
        const syncTask: SyncTask = {
          org_id: connection.org_id,
          realm_id: connection.realm_id,
          provider: 'quickbooks',
          access_token: connection.access_token,
          sync_type: connection.last_synced_at ? 'incremental' : 'full',
          last_sync_time: connection.last_synced_at,
        };

        // Check if token needs refresh
        if (new Date(connection.expires_at) <= new Date()) {
          try {
            // Token refresh would go here - using access token directly for now
            console.log(
              `[QuickBooks] Token expires soon for org ${connection.org_id}, would refresh`
            );
          } catch (tokenError) {
            console.error(
              `Failed to refresh QB token for org ${connection.org_id}:`,
              tokenError
            );
            continue;
          }
        }

        // Execute the sync
        await this.executeQuickBooksSync(syncTask);

        // Schedule next sync
        const nextSyncMinutes = connection.sync_frequency_minutes || 15;
        await db.query(
          `UPDATE qb_connections 
           SET next_scheduled_sync = NOW() + INTERVAL '${nextSyncMinutes} minutes',
               last_synced_at = NOW()
           WHERE org_id = $1 AND realm_id = $2`,
          [connection.org_id, connection.realm_id]
        );
      }
    } catch (error) {
      console.error('Error in checkAndExecuteQuickBooksSyncs:', error);
    }
  }

  /**
   * Execute a Wafeq sync task
   */
  private async executeWafeqSync(task: SyncTask): Promise<void> {
    const startTime = new Date();

    try {
      console.log(
        `[Wafeq] Starting ${task.sync_type} sync for org ${task.org_id}, company ${task.company_id}`
      );

      // Placeholder for actual sync logic
      // In production, this would call wafeqService methods
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate sync

      const endTime = new Date();

      // Log successful sync
      await db.query(
        `INSERT INTO wafeq_sync_log (org_id, company_id, status, started_at, completed_at)
         VALUES ($1, $2, 'success', $3, $4)`,
        [task.org_id, task.company_id, startTime, endTime]
      );

      console.log(
        `[Wafeq] Completed ${task.sync_type} sync for org ${task.org_id} in ${(endTime.getTime() - startTime.getTime()) / 1000}s`
      );
    } catch (error) {
      const endTime = new Date();

      // Log failed sync
      await db.query(
        `INSERT INTO wafeq_sync_log (org_id, company_id, status, started_at, completed_at, error_message)
         VALUES ($1, $2, 'failed', $3, $4, $5)`,
        [task.org_id, task.company_id, startTime, endTime, String(error)]
      );

      console.error(`[Wafeq] Sync failed for org ${task.org_id}:`, error);
    }
  }

  /**
   * Execute a QuickBooks sync task
   */
  private async executeQuickBooksSync(task: SyncTask): Promise<void> {
    const startTime = new Date();

    try {
      console.log(
        `[QuickBooks] Starting ${task.sync_type} sync for org ${task.org_id}, realm ${task.realm_id}`
      );

      // Placeholder for actual sync logic
      // In production, this would call quickBooksService methods
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate sync

      const endTime = new Date();

      // Log successful sync
      await db.query(
        `INSERT INTO qb_sync_log (org_id, realm_id, status, started_at, completed_at)
         VALUES ($1, $2, 'success', $3, $4)`,
        [task.org_id, task.realm_id, startTime, endTime]
      );

      console.log(
        `[QuickBooks] Completed ${task.sync_type} sync for org ${task.org_id} in ${(endTime.getTime() - startTime.getTime()) / 1000}s`
      );
    } catch (error) {
      const endTime = new Date();

      // Log failed sync
      await db.query(
        `INSERT INTO qb_sync_log (org_id, realm_id, status, started_at, completed_at, error_message)
         VALUES ($1, $2, 'failed', $3, $4, $5)`,
        [task.org_id, task.realm_id, startTime, endTime, String(error)]
      );

      console.error(`[QuickBooks] Sync failed for org ${task.org_id}:`, error);
    }
  }

  /**
   * Get current scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    wafeqChecksCount?: number;
    quickBooksChecksCount?: number;
  } {
    return {
      isRunning: this.isRunning,
    };
  }
}

// Export singleton instance
export default new SyncScheduler();
