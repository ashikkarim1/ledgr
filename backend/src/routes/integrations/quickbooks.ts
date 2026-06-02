import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import QuickBooksService from '../../integrations/quickbooks/service';
import { db } from '../../db';
import { authenticateRequest } from '../../middleware/auth';

const router = Router();
const quickBooksService = new QuickBooksService();

// Middleware to ensure authenticated requests
router.use(authenticateRequest);

/**
 * GET /api/integrations/quickbooks/auth
 * Generate OAuth2 authorization URL for QuickBooks Online
 */
router.get('/auth', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = uuidv4();
    const org_id = req.user?.org_id;

    if (!org_id) {
      return res.status(401).json({ error: 'Unauthorized: org_id required' });
    }

    // Store state in database for verification on callback
    const authState = {
      state,
      org_id,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minute expiry
    };

    await db.query(
      `INSERT INTO oauth_states (state, org_id, provider, expires_at, created_at)
       VALUES ($1, $2, 'quickbooks', $3, $4)`,
      [state, org_id, authState.expires_at, authState.created_at]
    );

    const authUrl = quickBooksService.generateAuthorizationUrl(state);

    res.json({
      success: true,
      auth_url: authUrl,
      state,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/quickbooks/callback
 * Handle OAuth2 callback and exchange code for access token
 */
router.post('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, realm_id } = req.body;
    const org_id = req.user?.org_id;

    if (!code || !state || !org_id || !realm_id) {
      return res.status(400).json({ error: 'Missing required parameters: code, state, realm_id, org_id' });
    }

    // Verify state token exists and hasn't expired
    const stateResult = await db.query(
      `SELECT state, org_id FROM oauth_states 
       WHERE state = $1 AND provider = 'quickbooks' AND expires_at > NOW()`,
      [state]
    );

    if (stateResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired state token' });
    }

    // Exchange authorization code for access token
    const tokenData = await quickBooksService.exchangeCodeForToken(code, realm_id);

    // Fetch company details using the token
    const companyDetails = await quickBooksService.fetchCompanyInfo(tokenData.access_token, realm_id);
    const company_name = companyDetails.CompanyName;

    // Store the connection in database
    await quickBooksService.storeCompanyConnection(
      org_id,
      realm_id,
      company_name,
      tokenData
    );

    // Mark the state as used
    await db.query(
      `UPDATE oauth_states SET used_at = NOW() WHERE state = $1`,
      [state]
    );

    // Trigger initial full sync in background
    setImmediate(async () => {
      try {
        await quickBooksService.performFullSync(org_id, tokenData.access_token, realm_id);
        
        // Log sync completion
        await db.query(
          `INSERT INTO sync_events (org_id, provider, event_type, company_id, status, details)
           VALUES ($1, 'quickbooks', 'full_sync_completed', $2, 'success', $3)`,
          [org_id, realm_id, JSON.stringify({ records_synced: true })]
        );
      } catch (syncError) {
        console.error('Initial QuickBooks sync failed:', syncError);
        await db.query(
          `INSERT INTO sync_events (org_id, provider, event_type, company_id, status, details)
           VALUES ($1, 'quickbooks', 'full_sync_failed', $2, 'error', $3)`,
          [org_id, realm_id, JSON.stringify({ error: String(syncError) })]
        );
      }
    });

    res.json({
      success: true,
      message: 'QuickBooks connection established successfully',
      realm_id,
      company_name,
      initial_sync_queued: true,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/quickbooks/sync
 * Manually trigger full or incremental sync
 */
router.post('/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { realm_id, sync_type = 'incremental' } = req.body;
    const org_id = req.user?.org_id;

    if (!realm_id || !org_id) {
      return res.status(400).json({ error: 'Missing required parameters: realm_id, org_id' });
    }

    // Fetch the QuickBooks connection
    const connectionResult = await db.query(
      `SELECT access_token, refresh_token, expires_at FROM qb_connections
       WHERE org_id = $1 AND realm_id = $2 AND active = true`,
      [org_id, realm_id]
    );

    if (connectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active QuickBooks connection found for this realm' });
    }

    const connection = connectionResult.rows[0];
    let accessToken = connection.access_token;

    // Refresh token if expired
    if (new Date(connection.expires_at) <= new Date()) {
      accessToken = await quickBooksService.refreshAccessToken(connection.refresh_token);
      // Update stored token
      await db.query(
        `UPDATE qb_connections SET access_token = $1, expires_at = NOW() + INTERVAL '3600 seconds'
         WHERE org_id = $2 AND realm_id = $3`,
        [accessToken, org_id, realm_id]
      );
    }

    // Trigger sync in background
    setImmediate(async () => {
      try {
        if (sync_type === 'full') {
          await quickBooksService.performFullSync(org_id, accessToken, realm_id);
        } else {
          const lastSyncResult = await db.query(
            `SELECT MAX(completed_at) as last_sync FROM qb_sync_log
             WHERE org_id = $1 AND realm_id = $2 AND status = 'success'`,
            [org_id, realm_id]
          );
          const lastSync = lastSyncResult.rows[0]?.last_sync || new Date(Date.now() - 24 * 60 * 60 * 1000);
          await quickBooksService.performIncrementalSync(org_id, accessToken, realm_id, lastSync);
        }
      } catch (syncError) {
        console.error(`QuickBooks ${sync_type} sync failed:`, syncError);
      }
    });

    res.json({
      success: true,
      message: `${sync_type === 'full' ? 'Full' : 'Incremental'} sync queued`,
      realm_id,
      sync_type,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/integrations/quickbooks/sync-status
 * Get sync status and health information
 */
router.get('/sync-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { realm_id } = req.query;
    const org_id = req.user?.org_id;

    if (!realm_id || !org_id) {
      return res.status(400).json({ error: 'Missing required parameters: realm_id, org_id' });
    }

    // Get connection status
    const connectionResult = await db.query(
      `SELECT active, last_synced_at, next_scheduled_sync, sync_frequency_minutes
       FROM qb_connections
       WHERE org_id = $1 AND realm_id = $2`,
      [org_id, realm_id]
    );

    if (connectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'No QuickBooks connection found' });
    }

    const connection = connectionResult.rows[0];

    // Get latest sync log
    const syncLogResult = await db.query(
      `SELECT status, started_at, completed_at, records_synced, records_failed, error_message
       FROM qb_sync_log
       WHERE org_id = $1 AND realm_id = $2
       ORDER BY started_at DESC
       LIMIT 1`,
      [org_id, realm_id]
    );

    const lastSync = syncLogResult.rows[0] || null;

    // Get data statistics
    const statsResult = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM qb_journal_entries WHERE org_id = $1 AND realm_id = $2) as je_count,
         (SELECT COUNT(*) FROM qb_invoices WHERE org_id = $1 AND realm_id = $2) as invoice_count,
         (SELECT COUNT(*) FROM qb_bills WHERE org_id = $1 AND realm_id = $2) as bill_count,
         (SELECT COUNT(*) FROM qb_customers WHERE org_id = $1 AND realm_id = $2) as customer_count,
         (SELECT COUNT(*) FROM qb_vendors WHERE org_id = $1 AND realm_id = $2) as vendor_count,
         (SELECT COUNT(*) FROM qb_bank_transactions WHERE org_id = $1 AND realm_id = $2) as bank_tx_count`,
      [org_id, realm_id]
    );

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      connection: {
        active: connection.active,
        last_synced_at: connection.last_synced_at,
        next_scheduled_sync: connection.next_scheduled_sync,
        sync_frequency_minutes: connection.sync_frequency_minutes,
      },
      last_sync: lastSync,
      data_statistics: {
        journal_entries: parseInt(stats.je_count),
        invoices: parseInt(stats.invoice_count),
        bills: parseInt(stats.bill_count),
        customers: parseInt(stats.customer_count),
        vendors: parseInt(stats.vendor_count),
        bank_transactions: parseInt(stats.bank_tx_count),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/quickbooks/webhook
 * Receive real-time webhook events from QuickBooks (via Intuit webhooks)
 */
router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventNotifications } = req.body;

    // Note: In production, verify webhook signature using Intuit's certificate
    if (!eventNotifications || !Array.isArray(eventNotifications)) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Process each event notification
    for (const notification of eventNotifications) {
      const { realmId, dataChangeEvent } = notification;
      
      if (!realmId || !dataChangeEvent) continue;

      // Find org_id from realm_id
      const orgResult = await db.query(
        `SELECT org_id FROM qb_connections WHERE realm_id = $1 LIMIT 1`,
        [realmId]
      );

      if (orgResult.rows.length === 0) {
        console.warn(`Webhook received for unknown realm: ${realmId}`);
        continue;
      }

      const org_id = orgResult.rows[0].org_id;

      // Route webhook to appropriate handler
      const { entities } = dataChangeEvent;
      if (entities && Array.isArray(entities)) {
        for (const entity of entities) {
          const { name, operation, id } = entity;
          await quickBooksService.handleWebhook(org_id, realmId, name, operation, id);
        }
      }

      // Log webhook receipt
      await db.query(
        `INSERT INTO webhook_events (org_id, provider, event_type, company_id, payload, received_at)
         VALUES ($1, 'quickbooks', 'datachange', $2, $3, $4)`,
        [org_id, realmId, JSON.stringify(dataChangeEvent), new Date()]
      );
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/quickbooks/disconnect
 * Revoke access and deactivate connection
 */
router.post('/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { realm_id } = req.body;
    const org_id = req.user?.org_id;

    if (!realm_id || !org_id) {
      return res.status(400).json({ error: 'Missing required parameters: realm_id, org_id' });
    }

    // Get connection to revoke token
    const connectionResult = await db.query(
      `SELECT access_token FROM qb_connections
       WHERE org_id = $1 AND realm_id = $2`,
      [org_id, realm_id]
    );

    if (connectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'No QuickBooks connection found' });
    }

    // Revoke token at QuickBooks (if they support it)
    // await quickBooksService.revokeAccessToken(connectionResult.rows[0].access_token);

    // Mark connection as inactive in database
    await db.query(
      `UPDATE qb_connections SET active = false, disconnected_at = NOW()
       WHERE org_id = $1 AND realm_id = $2`,
      [org_id, realm_id]
    );

    res.json({
      success: true,
      message: 'QuickBooks connection disconnected successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
