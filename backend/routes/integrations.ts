// Integration Routes & Middleware
// Handles OAuth callbacks, webhook processing, and integration management endpoints

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { IntegrationManager } from '../integrations/integration-factory';
import { PlaidIntegration } from '../integrations/plaid';

/**
 * Express router for integration endpoints
 * 
 * Routes:
 * POST   /integrations/connect/{type}           - Get OAuth URL
 * GET    /integrations/callback                 - OAuth callback
 * POST   /integrations/{id}/disconnect          - Revoke authorization
 * GET    /integrations/{id}/status              - Get connection status
 * POST   /integrations/{id}/sync                - Trigger manual sync
 * GET    /integrations/{id}/sync/{jobId}        - Get sync job status
 * POST   /webhooks/plaid                        - Plaid webhook receiver
 * GET    /integrations                          - List org integrations
 */

export function createIntegrationRoutes(manager: IntegrationManager): Router {
  const router = Router();

  // Middleware: Validate organization context
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.orgId) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Organization context required'
      });
    }
    next();
  });

  /**
   * POST /integrations/connect/:type
   * Get OAuth authorization URL for specified integration type
   * 
   * Response: { authUrl: string, integrationId: string, expiresIn: number }
   */
  router.post('/connect/:type', async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      const orgId = req.user!.orgId;

      // Validate integration type
      const supportedTypes = ['quickbooks', 'xero', 'freshbooks', 'plaid'];
      if (!supportedTypes.includes(type)) {
        return res.status(400).json({
          error: 'invalid_type',
          message: `Integration type '${type}' not supported. Supported: ${supportedTypes.join(', ')}`
        });
      }

      // Create integration instance
      const integration = await manager.createIntegration(type, orgId, {
        config: {
          baseCurrency: req.body.baseCurrency || 'AED',
          timezone: req.body.timezone || 'Asia/Dubai'
        }
      });

      // Get authorization URL
      const authUrl = await integration.getAuthorizationUrl();

      // Store integration ID in session for callback matching
      if (req.session) {
        req.session.pendingIntegrationId = integration.id;
        req.session.pendingIntegrationType = type;
      }

      res.json({
        authUrl,
        integrationId: integration.id,
        expiresIn: 600,
        type
      });
    } catch (error) {
      console.error('Failed to create integration:', error);
      res.status(500).json({
        error: 'connection_failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /integrations/callback
   * OAuth callback handler for all integration types
   */
  router.get('/callback', async (req: Request, res: Response) => {
    try {
      const { code, state, integrationId } = req.query;

      if (!code || !state) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Missing code or state parameter'
        });
      }

      const intId = (integrationId as string) || (req.session?.pendingIntegrationId);
      if (!intId) {
        return res.status(400).json({
          error: 'invalid_state',
          message: 'Integration ID not found'
        });
      }

      const integration = manager.getIntegration(intId);
      if (!integration) {
        return res.status(404).json({
          error: 'not_found',
          message: `Integration ${intId} not found`
        });
      }

      try {
        await integration.handleOAuthCallback(code as string, state as string);
      } catch (error) {
        await manager.deleteIntegration(intId);
        return res.status(401).json({
          error: 'oauth_failed',
          message: error instanceof Error ? error.message : 'OAuth callback failed',
          integrationId: intId
        });
      }

      const isConnected = await integration.testConnection();
      if (!isConnected) {
        await manager.deleteIntegration(intId);
        return res.status(500).json({
          error: 'connection_test_failed',
          message: 'Connected but failed to verify credentials'
        });
      }

      if (req.session) {
        delete req.session.pendingIntegrationId;
        delete req.session.pendingIntegrationType;
      }

      const acceptJson = req.headers.accept?.includes('application/json');
      if (acceptJson) {
        res.json({
          success: true,
          integrationId: intId,
          type: integration.type,
          message: 'Connected successfully'
        });
      } else {
        res.redirect(`/dashboard/integrations?success=true&id=${intId}`);
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.status(500).json({
        error: 'callback_error',
        message: error instanceof Error ? error.message : 'Callback processing failed'
      });
    }
  });

  /**
   * GET /integrations
   * List all integrations for authenticated organization
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const integrations = manager.listIntegrations(req.user!.orgId);
      const response = integrations.map(int => ({
        id: int.id,
        type: int.type,
        isConnected: int.setup.isConnected,
        connectionStatus: int.setup.connectionStatus,
        syncSettings: int.setup.syncSettings,
        lastError: int.getErrors()[0],
        createdAt: int.setup.createdAt
      }));

      res.json({
        integrations: response,
        total: response.length
      });
    } catch (error) {
      res.status(500).json({
        error: 'list_failed',
        message: error instanceof Error ? error.message : 'Failed to list integrations'
      });
    }
  });

  /**
   * GET /integrations/:id/status
   * Get integration connection status and metadata
   */
  router.get('/:id/status', async (req: Request, res: Response) => {
    try {
      const integration = manager.getIntegration(req.params.id);
      if (!integration) {
        return res.status(404).json({ error: 'not_found' });
      }

      if (integration.orgId !== req.user!.orgId) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const isConnected = await integration.testConnection();
      const latestJob = integration.getSyncStatus();
      const recentErrors = integration.getErrors().slice(0, 5);

      res.json({
        id: integration.id,
        type: integration.type,
        isConnected,
        connectionStatus: integration.setup.connectionStatus,
        syncSettings: integration.setup.syncSettings,
        lastSyncJob: latestJob,
        recentErrors,
        createdAt: integration.setup.createdAt
      });
    } catch (error) {
      res.status(500).json({
        error: 'status_check_failed',
        message: error instanceof Error ? error.message : 'Failed to check status'
      });
    }
  });

  /**
   * POST /integrations/:id/sync
   * Trigger manual sync job
   */
  router.post('/:id/sync', async (req: Request, res: Response) => {
    try {
      const integration = manager.getIntegration(req.params.id);
      if (!integration) {
        return res.status(404).json({ error: 'not_found' });
      }

      if (integration.orgId !== req.user!.orgId) {
        return res.status(403).json({ error: 'forbidden' });
      }

      if (!integration.setup.isConnected) {
        return res.status(400).json({
          error: 'not_connected',
          message: 'Integration must be connected before syncing'
        });
      }

      const job = await manager.triggerSync(integration.id, req.user!.userId);

      res.json({
        jobId: job.id,
        integrationId: integration.id,
        status: job.status,
        initiatedAt: job.startedAt,
        message: 'Sync job queued'
      });
    } catch (error) {
      res.status(500).json({
        error: 'sync_failed',
        message: error instanceof Error ? error.message : 'Failed to trigger sync'
      });
    }
  });

  /**
   * GET /integrations/:id/sync/:jobId
   * Get sync job status and progress
   */
  router.get('/:id/sync/:jobId', (req: Request, res: Response) => {
    try {
      const integration = manager.getIntegration(req.params.id);
      if (!integration) {
        return res.status(404).json({ error: 'not_found' });
      }

      if (integration.orgId !== req.user!.orgId) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const job = integration.getSyncStatus(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: 'job_not_found' });
      }

      res.json({
        id: job.id,
        integrationId: integration.id,
        status: job.status,
        progress: {
          processed: job.itemsProcessed,
          created: job.itemsCreated,
          updated: job.itemsUpdated,
          failed: job.itemsFailed
        },
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        duration: job.duration,
        errors: job.errors,
        retryCount: job.retryCount,
        nextRetryAt: job.nextRetryAt
      });
    } catch (error) {
      res.status(500).json({
        error: 'status_failed',
        message: error instanceof Error ? error.message : 'Failed to get job status'
      });
    }
  });

  /**
   * POST /integrations/:id/disconnect
   * Revoke authorization and disconnect integration
   */
  router.post('/:id/disconnect', async (req: Request, res: Response) => {
    try {
      const integration = manager.getIntegration(req.params.id);
      if (!integration) {
        return res.status(404).json({ error: 'not_found' });
      }

      if (integration.orgId !== req.user!.orgId) {
        return res.status(403).json({ error: 'forbidden' });
      }

      await manager.deleteIntegration(req.params.id);

      res.json({
        success: true,
        message: 'Integration disconnected',
        integrationId: req.params.id
      });
    } catch (error) {
      res.status(500).json({
        error: 'disconnect_failed',
        message: error instanceof Error ? error.message : 'Failed to disconnect'
      });
    }
  });

  /**
   * POST /integrations/:id/schedule
   * Set up recurring sync schedule
   */
  router.post('/:id/schedule', async (req: Request, res: Response) => {
    try {
      const { frequency } = req.body;
      if (!['hourly', 'daily', 'weekly', 'manual'].includes(frequency)) {
        return res.status(400).json({
          error: 'invalid_frequency',
          message: 'Frequency must be hourly, daily, weekly, or manual'
        });
      }

      const integration = manager.getIntegration(req.params.id);
      if (!integration) {
        return res.status(404).json({ error: 'not_found' });
      }

      if (integration.orgId !== req.user!.orgId) {
        return res.status(403).json({ error: 'forbidden' });
      }

      await manager.scheduleSync(req.params.id, frequency);

      res.json({
        success: true,
        integrationId: req.params.id,
        frequency,
        message: `Sync scheduled for ${frequency}`
      });
    } catch (error) {
      res.status(500).json({
        error: 'schedule_failed',
        message: error instanceof Error ? error.message : 'Failed to schedule sync'
      });
    }
  });

  return router;
}

/**
 * Webhook router for incoming webhooks from integrations
 * Handles signature verification and routing to appropriate handlers
 */
export function createWebhookRoutes(manager: IntegrationManager): Router {
  const router = Router();

  /**
   * POST /plaid
   * Receive and process Plaid webhooks
   */
  router.post('/plaid', async (req: Request, res: Response) => {
    try {
      const signature = req.headers['x-webhook-signature'] as string;
      const timestamp = req.headers['x-webhook-timestamp'] as string;

      if (!signature || !timestamp) {
        return res.status(401).json({
          error: 'missing_signature',
          message: 'Webhook signature verification failed'
        });
      }

      const isValid = verifyPlaidWebhookSignature(
        req.rawBody || JSON.stringify(req.body),
        signature,
        timestamp
      );

      if (!isValid) {
        return res.status(401).json({
          error: 'invalid_signature',
          message: 'Webhook signature verification failed'
        });
      }

      const { item_id, webhook_type, webhook_code } = req.body;

      const integration = manager.getIntegration(item_id);
      if (!integration || !(integration instanceof PlaidIntegration)) {
        return res.status(404).json({
          error: 'integration_not_found',
          message: 'No Plaid integration found for this item'
        });
      }

      if (webhook_type === 'TRANSACTIONS') {
        await integration.handleTransactionWebhook(req.body);
      } else if (webhook_type === 'ITEM') {
        await integration.handleItemWebhook(req.body);
      } else {
        console.warn(`Unhandled webhook type: ${webhook_type}`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({
        error: 'webhook_failed',
        message: error instanceof Error ? error.message : 'Webhook processing failed'
      });
    }
  });

  return router;
}

/**
 * Verify Plaid webhook signature
 * Plaid uses HMAC-SHA256 for signature verification
 */
function verifyPlaidWebhookSignature(
  body: string,
  signature: string,
  timestamp: string
): boolean {
  const secret = process.env.PLAID_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('PLAID_WEBHOOK_SECRET not configured');
    return false;
  }

  const message = timestamp + body;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  return computed === signature;
}

/**
 * Middleware: Raw body parser for webhook signature verification
 */
export function webhookRawBodyParser(req: Request, res: Response, next: NextFunction) {
  let rawBody = '';
  req.on('data', (chunk) => {
    rawBody += chunk.toString();
  });
  req.on('end', () => {
    (req as any).rawBody = rawBody;
    next();
  });
}

/**
 * Middleware: Error handler for integration routes
 */
export function integrationErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Integration route error:', err);

  const statusCode = (err as any).statusCode || 500;
  const message = err.message || 'Integration error';

  res.status(statusCode).json({
    error: 'integration_error',
    message,
    timestamp: new Date().toISOString()
  });
}
