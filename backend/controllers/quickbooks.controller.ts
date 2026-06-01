/**
 * QuickBooks OAuth Controller
 * Handles OAuth flow, sync initiation, and integration management
 * Routes:
 * - POST /v1/integrations/quickbooks/auth
 * - POST /v1/integrations/quickbooks/callback
 * - POST /v1/integrations/quickbooks/sync
 * - GET /v1/integrations/quickbooks/status
 * - DELETE /v1/integrations/quickbooks/disconnect
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { IntegrationManager } from '../integrations/integration-factory';
import { QuickBooksIntegration } from '../integrations/quickbooks';
import { ApiErrors, asyncHandler } from '../middleware/error-handler';
import { ApiResponse } from '../response-types';
import {
  userHasWorkspaceAccess,
  getUserWorkspaceRole,
  getWorkspaceIntegration,
  saveIntegrationConfig,
  deleteIntegrationConfig,
  getSyncJobStatus,
  storeQBAccount,
  storeQBInvoice,
  storeQBBill,
  storeQBTransaction,
} from '../db/quickbooks-db';

/**
 * POST /v1/integrations/quickbooks/auth
 * Initiate OAuth flow and return authorization URL
 */
export const initiateQuickBooksAuth = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { workspace_id, baseCurrency, timezone } = req.body;

    if (!user) {
      throw ApiErrors.unauthorized('Authentication required');
    }

    if (!workspace_id) {
      throw ApiErrors.invalidRequest('workspace_id is required');
    }

    // Verify user has workspace access
    const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
    if (!hasAccess) {
      throw ApiErrors.forbidden('No access to this workspace');
    }

    // Verify user is workspace admin
    const userRole = await getUserWorkspaceRole(user.user_id, workspace_id);
    if (userRole !== 'admin') {
      throw ApiErrors.forbidden('Only workspace admins can connect integrations');
    }

    // Check if already connected
    const existing = await getWorkspaceIntegration(workspace_id, 'quickbooks');
    if (existing && existing.status === 'connected') {
      throw ApiErrors.conflict('QuickBooks already connected to this workspace');
    }

    try {
      // Get integration manager from app context
      const manager: IntegrationManager = (req.app as any).integrationManager;

      // Create QB integration instance
      const qbIntegration = await manager.createIntegration('quickbooks', workspace_id, {
        config: {
          baseCurrency: baseCurrency || 'AED',
          timezone: timezone || 'Asia/Dubai',
        },
      });

      // Get authorization URL
      const authUrl = await qbIntegration.getAuthorizationUrl();

      // Store integration ID in session for callback matching
      if (req.session) {
        req.session.pendingQBIntegrationId = qbIntegration.id;
        req.session.pendingWorkspaceId = workspace_id;
      }

      const response: ApiResponse<any> = {
        success: true,
        data: {
          integrationId: qbIntegration.id,
          authUrl,
          expiresIn: 900, // 15 minutes
          workspaceId: workspace_id,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers['x-request-id'] as string,
          version: 'v1',
        },
        errors: null,
      };

      res.json(response);
    } catch (error) {
      throw ApiErrors.internalServerError(
        `Failed to initiate QB auth: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

/**
 * POST /v1/integrations/quickbooks/callback
 * Handle OAuth callback and exchange code for tokens
 */
export const handleQuickBooksCallback = asyncHandler(
  async (req: Request, res: Response) => {
    const { code, state, realmId } = req.query;

    if (!code || !state) {
      throw ApiErrors.invalidRequest('Missing code or state parameter');
    }

    const integrationId = req.session?.pendingQBIntegrationId;
    const workspaceId = req.session?.pendingWorkspaceId;

    if (!integrationId || !workspaceId) {
      throw ApiErrors.unauthorized('Invalid or expired auth session');
    }

    try {
      const manager: IntegrationManager = (req.app as any).integrationManager;
      const integration = manager.getIntegration(integrationId);

      if (!integration || !(integration instanceof QuickBooksIntegration)) {
        throw ApiErrors.notFound(`Integration ${integrationId} not found`);
      }

      // Handle OAuth callback and exchange code for tokens
      await integration.handleOAuthCallback(code as string, state as string);

      // Test connection to verify tokens work
      const isConnected = await integration.testConnection();
      if (!isConnected) {
        await manager.deleteIntegration(integrationId);
        throw ApiErrors.internalServerError(
          'Connected but failed to verify credentials with QuickBooks'
        );
      }

      // Save integration configuration to database
      await saveIntegrationConfig(workspaceId, integration.id, integration.setup.config);

      // Schedule initial sync
      await manager.scheduleSync(integrationId, 'daily');

      // Clean up session
      if (req.session) {
        delete req.session.pendingQBIntegrationId;
        delete req.session.pendingWorkspaceId;
      }

      // Return response based on Accept header
      const acceptJson = req.headers.accept?.includes('application/json');
      if (acceptJson) {
        const response: ApiResponse<any> = {
          success: true,
          data: {
            integrationId,
            workspaceId,
            status: 'connected',
            message: 'QuickBooks connected successfully',
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: req.headers['x-request-id'] as string,
            version: 'v1',
          },
          errors: null,
        };
        res.json(response);
      } else {
        res.redirect(
          `/dashboard/integrations?success=true&integrationId=${integrationId}`
        );
      }
    } catch (error) {
      // Clean up on error
      if (integrationId) {
        try {
          const manager: IntegrationManager = (req.app as any).integrationManager;
          await manager.deleteIntegration(integrationId);
        } catch (deleteError) {
          // Log but don't throw
          console.warn('Failed to cleanup integration on error:', deleteError);
        }
      }

      throw error;
    }
  }
);

/**
 * GET /v1/integrations/quickbooks/status
 * Get QuickBooks integration status
 */
export const getQuickBooksStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id, integration_id } = req.query;

  if (!user) {
    throw ApiErrors.unauthorized('Authentication required');
  }

  if (!workspace_id) {
    throw ApiErrors.invalidRequest('workspace_id is required');
  }

  // Verify user has workspace access
  const hasAccess = await userHasWorkspaceAccess(
    user.user_id,
    workspace_id as string
  );
  if (!hasAccess) {
    throw ApiErrors.forbidden('No access to this workspace');
  }

  try {
    let integration;

    if (integration_id) {
      // Get specific integration by ID
      const manager: IntegrationManager = (req.app as any).integrationManager;
      integration = manager.getIntegration(integration_id as string);

      if (!integration) {
        throw ApiErrors.notFound('Integration not found');
      }

      // Verify integration belongs to this workspace
      if (integration.setup.orgId !== workspace_id) {
        throw ApiErrors.forbidden('Integration does not belong to this workspace');
      }
    } else {
      // Get workspace's QB integration
      integration = await getWorkspaceIntegration(
        workspace_id as string,
        'quickbooks'
      );

      if (!integration) {
        throw ApiErrors.notFound(
          'QuickBooks not connected to this workspace'
        );
      }
    }

    // Test connection
    const isConnected = await integration.testConnection();

    // Get latest sync job
    const latestJob = integration.getSyncStatus?.();
    const recentErrors = integration.getErrors?.().slice(0, 5) || [];

    const response: ApiResponse<any> = {
      success: true,
      data: {
        integrationId: integration.id,
        workspaceId: workspace_id,
        type: 'quickbooks',
        isConnected,
        connectionStatus: integration.setup.connectionStatus,
        syncSettings: integration.setup.syncSettings,
        lastSync: latestJob,
        recentErrors,
        createdAt: integration.setup.createdAt,
        updatedAt: integration.setup.updatedAt,
      },
      meta: {
        timestamp: new Date().toISOString(),
        request_id: req.headers['x-request-id'] as string,
        version: 'v1',
      },
      errors: null,
    };

    res.json(response);
  } catch (error) {
    throw ApiErrors.internalServerError(
      `Failed to get status: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

/**
 * POST /v1/integrations/quickbooks/sync
 * Trigger manual sync of QB data to Ledgr
 */
export const triggerQuickBooksSync = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { workspace_id, integration_id, syncType } = req.body;

    if (!user) {
      throw ApiErrors.unauthorized('Authentication required');
    }

    if (!workspace_id) {
      throw ApiErrors.invalidRequest('workspace_id is required');
    }

    // Verify user has workspace access
    const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
    if (!hasAccess) {
      throw ApiErrors.forbidden('No access to this workspace');
    }

    try {
      const manager: IntegrationManager = (req.app as any).integrationManager;

      let integration;
      if (integration_id) {
        integration = manager.getIntegration(integration_id);
      } else {
        integration = await getWorkspaceIntegration(workspace_id, 'quickbooks');
      }

      if (!integration) {
        throw ApiErrors.notFound('QuickBooks not connected');
      }

      if (!integration.setup.isConnected) {
        throw ApiErrors.badRequest('Integration not connected');
      }

      // Trigger sync
      const job = await manager.triggerSync(integration.id, user.user_id);

      const response: ApiResponse<any> = {
        success: true,
        data: {
          jobId: job.id,
          integrationId: integration.id,
          workspaceId: workspace_id,
          status: job.status,
          syncType: syncType || 'full',
          initiatedAt: job.startedAt,
          message: 'Sync queued successfully',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers['x-request-id'] as string,
          version: 'v1',
        },
        errors: null,
      };

      res.json(response);
    } catch (error) {
      throw ApiErrors.internalServerError(
        `Failed to trigger sync: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

/**
 * GET /v1/integrations/quickbooks/sync/:jobId
 * Get sync job progress and status
 */
export const getQuickBooksSyncStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { workspace_id } = req.query;
    const { jobId } = req.params;

    if (!user) {
      throw ApiErrors.unauthorized('Authentication required');
    }

    if (!workspace_id) {
      throw ApiErrors.invalidRequest('workspace_id is required');
    }

    // Verify user has workspace access
    const hasAccess = await userHasWorkspaceAccess(
      user.user_id,
      workspace_id as string
    );
    if (!hasAccess) {
      throw ApiErrors.forbidden('No access to this workspace');
    }

    try {
      // Query sync job status from database
      const jobStatus = await getSyncJobStatus(jobId);

      if (!jobStatus) {
        throw ApiErrors.notFound('Sync job not found');
      }

      const response: ApiResponse<any> = {
        success: true,
        data: {
          jobId: jobStatus.id,
          status: jobStatus.status,
          progress: {
            accountsSynced: jobStatus.accounts_synced,
            invoicesSynced: jobStatus.invoices_synced,
            billsSynced: jobStatus.bills_synced,
            transactionsSynced: jobStatus.transactions_synced,
          },
          metrics: {
            accountsCreated: jobStatus.accounts_created,
            accountsUpdated: jobStatus.accounts_updated,
            invoicesCreated: jobStatus.invoices_created,
            invoicesUpdated: jobStatus.invoices_updated,
            billsCreated: jobStatus.bills_created,
            billsUpdated: jobStatus.bills_updated,
          },
          timing: {
            startedAt: jobStatus.started_at,
            completedAt: jobStatus.completed_at,
          },
          errors: jobStatus.error_count,
          lastError: jobStatus.last_error_message,
          retryCount: jobStatus.retry_count,
          nextRetryAt: jobStatus.next_retry_at,
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers['x-request-id'] as string,
          version: 'v1',
        },
        errors: null,
      };

      res.json(response);
    } catch (error) {
      throw ApiErrors.internalServerError(
        `Failed to get sync status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

/**
 * DELETE /v1/integrations/quickbooks/disconnect
 * Disconnect QuickBooks and revoke authorization
 */
export const disconnectQuickBooks = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { workspace_id, integration_id } = req.body;

    if (!user) {
      throw ApiErrors.unauthorized('Authentication required');
    }

    if (!workspace_id) {
      throw ApiErrors.invalidRequest('workspace_id is required');
    }

    // Verify user has workspace access
    const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
    if (!hasAccess) {
      throw ApiErrors.forbidden('No access to this workspace');
    }

    // Verify user is workspace admin
    const userRole = await getUserWorkspaceRole(user.user_id, workspace_id);
    if (userRole !== 'admin') {
      throw ApiErrors.forbidden(
        'Only workspace admins can disconnect integrations'
      );
    }

    try {
      const manager: IntegrationManager = (req.app as any).integrationManager;

      let integration;
      if (integration_id) {
        integration = manager.getIntegration(integration_id);
      } else {
        integration = await getWorkspaceIntegration(workspace_id, 'quickbooks');
      }

      if (!integration) {
        throw ApiErrors.notFound('QuickBooks not connected');
      }

      // Disconnect integration
      await integration.disconnect();
      await manager.deleteIntegration(integration.id);

      // Delete from database
      await deleteIntegrationConfig(integration.id);

      const response: ApiResponse<any> = {
        success: true,
        data: {
          integrationId: integration.id,
          workspaceId: workspace_id,
          status: 'disconnected',
          message: 'QuickBooks disconnected successfully',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: req.headers['x-request-id'] as string,
          version: 'v1',
        },
        errors: null,
      };

      res.json(response);
    } catch (error) {
      throw ApiErrors.internalServerError(
        `Failed to disconnect: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);


