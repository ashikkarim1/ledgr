// @ts-nocheck
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import WafeqService from '../../integrations/wafeq/service';
import { db } from '../../db';
import { authenticateRequest } from '../../middleware/auth';

const router = Router();
const wafeqService = new WafeqService();

// Middleware to ensure authenticated requests
router.use(authenticateRequest);

/**
 * GET /api/integrations/wafeq/auth
 * Generate OAuth2 authorization URL for Wafeq
 */
router.get('/auth', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = uuidv4();
    const org_id = req.user?.org_id;

    if (!org_id) {
      return res.status(401).json({ error: 'Unauthorized: org_id required' });
    }

    // Store state in cache or session for verification on callback
    // In production, use Redis or session store
    const authState = {
      state,
      org_id,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minute expiry
    };

    // Store in database for verification
    await db.query(
      `INSERT INTO oauth_states (state, org_id, provider, expires_at, created_at)
       VALUES ($1, $2, 'wafeq', $3, $4)`,
      [state, org_id, authState.expires_at, authState.created_at]
    );

    const authUrl = wafeqService.generateAuthorizationUrl(state);

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
 * POST /api/integrations/wafeq/callback
 * Handle OAuth2 callback and exchange code for access token
 */
router.post('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state } = req.body;
    const org_id = req.user?.org_id;

    if (!code || !state || !org_id) {
      return res.status(400).json({ error: 'Missing required parameters: code, state, org_id' });
    }

    // Verify state token exists and hasn't expired
    const stateResult = await db.query(
      `SELECT state, org_id FROM oauth_states 
       WHERE state = $1 AND provider = 'wafeq' AND expires_at > NOW()`,
      [state]
    );

    if (stateResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired state token' });
    }

    // Exchange authorization code for access token
    const tokenData = await wafeqService.exchangeCodeForToken(code);

    // Get company details from Wafeq API using the token
    const companyDetails = await wafeqService.fetchCompanyDetails(tokenData.access_token);
    const company_id = companyDetails.id;
    const company_name = companyDetails.name;

    // Store the connection in database
    await wafeqService.storeCompanyConnection(
      org_id,
      company_id,
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
        await wafeqService.performFullSync(org_id, company_id, tokenData.access_token);
        
        // Log sync completion
        await db.query(
          `INSERT INTO sync_events (org_id, provider, event_type, company_id, status, details)
           VALUES ($1, 'wafeq', 'full_sync_completed', $2, 'success', $3)`,
          [org_id, company_id, JSON.stringify({ records_synced: true })]
        );
      } catch (syncError) {
        console.error('Initial Wafeq sync failed:', syncError);
        await db.query(
          `INSERT INTO sync_events (org_id, provider, event_type, company_id, status, details)
           VALUES ($1, 'wafeq', 'full_sync_failed', $2, 'error', $3)`,
          [org_id, company_id, JSON.stringify({ error: String(syncError) })]
        );
      }
    });

    res.json({
      success: true,
      message: 'Wafeq connection established successfully',
      company_id,
      company_name,
      initial_sync_queued: true,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/wafeq/sync
 * Manually trigger full or incremental sync
 */
router.post('/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { company_id, sync_type = 'incremental' } = req.body;
    const org_id = req.user?.org_id;

    if (!company_id || !org_id) {
      return res.status(400).json({ error: 'Missing required parameters: company_id, org_id' });
    }

    // Fetch the Wafeq connection
    const connectionResult = await db.query(
      `SELECT access_token, refresh_token, expires_at FROM wafeq_connections
       WHERE org_id = $1 AND company_id = $2 AND active = true`,
      [org_id, company_id]
    );

    if (connectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active Wafeq connection found for this company' });
    }

    const connection = connectionResult.rows[0];
    let accessToken = connection.access_token;

    // Refresh token if expired
    if (new Date(connection.expires_at) <= new Date()) {
      accessToken = await wafeqService.refreshAccessToken(connection.refresh_token);
      // Update stored token
      await db.query(
        `UPDATE wafeq_connections SET access_token = $1, expires_at = NOW() + INTERVAL '3600 seconds'
         WHERE org_id = $2 AND company_id = $3`,
        [accessToken, org_id, company_id]
      );
    }

    // Trigger sync in background
    setImmediate(async () => {
      try {
        if (sync_type === 'full') {
          await wafeqService.performFullSync(org_id, company_id, accessToken);
        } else {
          const lastSyncResult = await db.query(
            `SELECT MAX(completed_at) as last_sync FROM wafeq_sync_log
             WHERE org_id = $1 AND company_id = $2 AND status = 'success'`,
            [org_id, company_id]
          );
          const lastSync = lastSyncResult.rows[0]?.last_sync || new Date(Date.now() - 24 * 60 * 60 * 1000);
          await wafeqService.performIncrementalSync(org_id, company_id, accessToken, lastSync);
        }
      } catch (syncError) {
        console.error(`Wafeq ${sync_type} sync failed:`, syncError);
      }
    });

    res.json({
      success: true,
      message: `${sync_type === 'full' ? 'Full' : 'Incremental'} sync queued`,
      company_id,
      sync_type,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/integrations/wafeq/sync-status
 * Get sync status and health information
 */
router.get('/sync-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { company_id } = req.query;
    const org_id = req.user?.org_id;

    if (!company_id || !org_id) {
      return res.status(400).json({ error: 'Missing required parameters: company_id, org_id' });
    }

    // Get connection status
    const connectionResult = await db.query(
      `SELECT active, last_synced_at, next_scheduled_sync, sync_frequency_minutes
       FROM wafeq_connections
       WHERE org_id = $1 AND company_id = $2`,
      [org_id, company_id]
    );

    if (connectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'No Wafeq connection found' });
    }

    const connection = connectionResult.rows[0];

    // Get latest sync log
    const syncLogResult = await db.query(
      `SELECT status, started_at, completed_at, records_synced, records_failed, error_message
       FROM wafeq_sync_log
       WHERE org_id = $1 AND company_id = $2
       ORDER BY started_at DESC
       LIMIT 1`,
      [org_id, company_id]
    );

    const lastSync = syncLogResult.rows[0] || null;

    // Get data statistics
    const statsResult = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM wafeq_gl_entries WHERE org_id = $1 AND company_id = $2) as gl_count,
         (SELECT COUNT(*) FROM wafeq_invoices WHERE org_id = $1 AND company_id = $2) as invoice_count,
         (SELECT COUNT(*) FROM wafeq_bills WHERE org_id = $1 AND company_id = $2) as bill_count,
         (SELECT COUNT(*) FROM wafeq_bank_transactions WHERE org_id = $1 AND company_id = $2) as bank_tx_count,
         (SELECT COUNT(*) FROM wafeq_vat_returns WHERE org_id = $1 AND company_id = $2) as vat_count`,
      [org_id, company_id]
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
        gl_entries: parseInt(stats.gl_count),
        invoices: parseInt(stats.invoice_count),
        bills: parseInt(stats.bill_count),
        bank_transactions: parseInt(stats.bank_tx_count),
        vat_returns: parseInt(stats.vat_count),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/wafeq/webhook
 * Receive real-time webhook events from Wafeq
 */
router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { event_type, company_id, data, timestamp } = req.body;

    // Note: In production, verify webhook signature using Wafeq's signing key
    if (!event_type || !company_id) {
      return res.status(400).json({ error: 'Missing required webhook fields' });
    }

    // Find org_id from company_id
    const orgResult = await db.query(
      `SELECT org_id FROM wafeq_connections WHERE company_id = $1 LIMIT 1`,
      [company_id]
    );

    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const org_id = orgResult.rows[0].org_id;

    // Route webhook to appropriate handler
    await wafeqService.handleWebhook(org_id, company_id, event_type, data);

    // Log webhook receipt
    await db.query(
      `INSERT INTO webhook_events (org_id, provider, event_type, company_id, payload, received_at)
       VALUES ($1, 'wafeq', $2, $3, $4, $5)`,
      [org_id, event_type, company_id, JSON.stringify(data), new Date()]
    );

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/wafeq/disconnect
 * Revoke access and deactivate connection
 */
router.post('/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { company_id } = req.body;
    const org_id = req.user?.org_id;

    if (!company_id || !org_id) {
      return res.status(400).json({ error: 'Missing required parameters: company_id, org_id' });
    }

    // Get connection to revoke token
    const connectionResult = await db.query(
      `SELECT access_token FROM wafeq_connections
       WHERE org_id = $1 AND company_id = $2`,
      [org_id, company_id]
    );

    if (connectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'No Wafeq connection found' });
    }

    // Revoke token at Wafeq (if they support it)
    // await wafeqService.revokeAccessToken(connectionResult.rows[0].access_token);

    // Mark connection as inactive in database
    await db.query(
      `UPDATE wafeq_connections SET active = false, disconnected_at = NOW()
       WHERE org_id = $1 AND company_id = $2`,
      [org_id, company_id]
    );

    res.json({
      success: true,
      message: 'Wafeq connection disconnected successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
