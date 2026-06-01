/**
 * Documents Controller
 * Handles document uploads, processing, and result retrieval
 */

import { Request, Response } from "express";
import { ApiErrors, asyncHandler } from "../middleware/error-handler";
import { ApiResponse } from "../response-types";
import {
  processDocument,
  getProcessingJob,
  getWorkspaceJobs,
  approveProcessingResults,
  rejectProcessingResults,
  ProcessingJob,
} from "../agents/document-processor";
import { checkTrialDocumentLimit, getTrialInfo, updateTrialUsage } from "../lib/db-helpers";

/**
 * POST /v1/documents/upload
 * Upload and process a document
 */
export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  let { workspace_id } = req.body;
  const file = (req as any).file; // Assuming multer middleware

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  // Use default workspace if not provided
  if (!workspace_id) {
    workspace_id = `workspace_${user.user_id}`;
  }

  if (!file) {
    throw ApiErrors.invalidRequest("No file provided");
  }

  // Verify access (currently allows all for MVP)
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
  if (!hasAccess && workspace_id !== `workspace_${user.user_id}`) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  // Read file content
  let fileContent = "";
  try {
    fileContent = file.buffer.toString("utf8");
  } catch (error) {
    throw ApiErrors.invalidRequest("Unable to read file content");
  }

  // Check trial document limit
  const trialInfo = await getTrialInfo(workspace_id);
  if (trialInfo && trialInfo.plan === "free_trial") {
    const docLimitCheck = await checkTrialDocumentLimit(workspace_id);
    if (!docLimitCheck.allowed) {
      throw ApiErrors.conflict(
        `Document limit exceeded (${docLimitCheck.current}/${docLimitCheck.limit} documents per month for free trial)`
      );
    }
  }

  // Start processing
  const job = await processDocument(
    fileContent,
    file.originalname,
    file.mimetype,
    user.user_id,
    workspace_id
  );

  // Increment trial usage counter if on free trial
  if (trialInfo && trialInfo.plan === "free_trial") {
    const docLimitCheck = await checkTrialDocumentLimit(workspace_id);
    await updateTrialUsage(workspace_id, {
      documentsUsed: docLimitCheck.current + 1,
    });
  }

  const response: ApiResponse<ProcessingJob> = {
    success: true,
    data: {
      ...job,
      processing_results: {
        processing_metadata: job.processing_results.processing_metadata,
      },
    } as ProcessingJob,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.status(201).json(response);
});

/**
 * GET /v1/documents/:job_id
 * Get processing job status and results
 */
export const getDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { job_id } = req.params;
  const { workspace_id } = req.query;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id) {
    throw ApiErrors.invalidRequest("workspace_id is required");
  }

  // Verify access
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id as string);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  const job = getProcessingJob(job_id);
  if (!job) {
    throw ApiErrors.notFound("Processing job not found");
  }

  // Verify ownership
  if (job.workspace_id !== (workspace_id as string)) {
    throw ApiErrors.forbidden("No access to this processing job");
  }

  const response: ApiResponse<ProcessingJob> = {
    success: true,
    data: job,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.json(response);
});

/**
 * GET /v1/documents
 * List processing jobs in workspace
 */
export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { workspace_id } = req.query;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id) {
    throw ApiErrors.invalidRequest("workspace_id is required");
  }

  // Verify access
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id as string);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const jobs = getWorkspaceJobs(workspace_id as string, limit);

  const response: ApiResponse<ProcessingJob[]> = {
    success: true,
    data: jobs,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
      pagination: {
        page: 1,
        limit,
        total: jobs.length,
        pages: 1,
      },
    },
    errors: null,
  };

  res.json(response);
});

/**
 * POST /v1/documents/:job_id/approve
 * Approve processing results (requires accountant role)
 */
export const approveDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { job_id } = req.params;
  const { workspace_id } = req.body;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id) {
    throw ApiErrors.invalidRequest("workspace_id is required");
  }

  // Verify access and role (only accountants can approve)
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  const hasRole = await userHasRole(user.user_id, workspace_id, "accountant");
  if (!hasRole) {
    throw ApiErrors.forbidden(
      "Only accountants can approve processing results"
    );
  }

  const job = approveProcessingResults(job_id, user.user_id);
  if (!job) {
    throw ApiErrors.notFound("Processing job not found");
  }

  const response: ApiResponse<ProcessingJob> = {
    success: true,
    data: job,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.json(response);
});

/**
 * POST /v1/documents/:job_id/reject
 * Reject processing results (requires accountant role)
 */
export const rejectDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { job_id } = req.params;
  const { workspace_id, reason } = req.body;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id) {
    throw ApiErrors.invalidRequest("workspace_id is required");
  }

  // Verify access and role
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  const hasRole = await userHasRole(user.user_id, workspace_id, "accountant");
  if (!hasRole) {
    throw ApiErrors.forbidden(
      "Only accountants can reject processing results"
    );
  }

  const job = rejectProcessingResults(
    job_id,
    reason || "Rejected by accountant"
  );
  if (!job) {
    throw ApiErrors.notFound("Processing job not found");
  }

  const response: ApiResponse<ProcessingJob> = {
    success: true,
    data: job,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.json(response);
});

/**
 * GET /v1/documents/:job_id/summary
 * Get processing results summary for dashboard
 */
export const getDocumentSummary = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { job_id } = req.params;
  const { workspace_id } = req.query;

  if (!user) {
    throw ApiErrors.unauthorized("Authentication required");
  }

  if (!workspace_id) {
    throw ApiErrors.invalidRequest("workspace_id is required");
  }

  // Verify access
  const hasAccess = await userHasWorkspaceAccess(user.user_id, workspace_id as string);
  if (!hasAccess) {
    throw ApiErrors.forbidden("No access to this workspace");
  }

  const job = getProcessingJob(job_id);
  if (!job) {
    throw ApiErrors.notFound("Processing job not found");
  }

  // Create summary for dashboard
  const summary = {
    job_id: job.job_id,
    file_name: job.file_name,
    status: job.processing_status,
    approval_status:
      job.processing_results.processing_metadata.approval_status,
    agents_executed:
      job.processing_results.processing_metadata.agents_executed,
    processing_time:
      job.processing_results.processing_metadata.total_duration_ms,
    metrics: {
      invoices_processed: (job.processing_results.ap_data || []).length,
      transactions_classified: (job.processing_results.tax_data?.tax_items || [])
        .length,
      accounts_reconciled: job.processing_results.reconciliation_data
        ?.matched_count || 0,
      employees_processed: (job.processing_results.payroll_data?.records || [])
        .length,
    },
    completed_at: job.completed_at,
    error: job.error,
  };

  const response: ApiResponse<typeof summary> = {
    success: true,
    data: summary,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.headers["x-request-id"] as string,
      version: "v1",
    },
    errors: null,
  };

  res.json(response);
});

// ============================================================================
// Helper Functions (to be implemented with actual database)
// ============================================================================

async function userHasWorkspaceAccess(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  // TODO: Implement actual database check
  return true;
}

async function userHasRole(
  userId: string,
  workspaceId: string,
  role: string
): Promise<boolean> {
  // TODO: Implement actual database check
  return true;
}
