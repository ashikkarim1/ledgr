/**
 * Trial Limits Middleware
 * Enforces trial usage limits for documents, agent executions, and workspace members
 */

import { Request, Response, NextFunction } from 'express';
import { ApiErrorHandler } from "./error-handler.js";
import { ErrorCodes, HttpStatus } from "../response-types.js";
import {
  getTrialUsageStats,
  checkTrialDocumentLimit,
  checkTrialExecutionLimit,
  checkTrialUserLimit,
  getTrialInfo,
} from "../lib/db-helpers.js";

/**
 * Note: Express Request.user is already declared in auth-middleware.ts with JWTPayload type
 * which now includes trial_status field, so no need to redeclare here
 */

/**
 * Middleware: Check document upload limit for trial users
 */
export async function checkDocumentLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.workspace_id) {
      next();
      return;
    }

    // Get trial info
    const trialInfo = await getTrialInfo(req.user.workspace_id);
    
    // Only enforce limits for trial users
    if (trialInfo?.plan !== 'free_trial') {
      next();
      return;
    }

    // Check document limit
    const { allowed, current, limit } = await checkTrialDocumentLimit(req.user.workspace_id);
    
    if (!allowed) {
      throw new ApiErrorHandler(
        HttpStatus.TOO_MANY_REQUESTS,
        'TRIAL_DOCUMENT_LIMIT_EXCEEDED',
        `Document limit exceeded: ${current}/${limit} documents used`
      );
    }

    // Attach limit info to response for visibility
    res.setHeader('X-Trial-Documents', `${current}/${limit}`);
    next();
  } catch (error) {
    if (error instanceof ApiErrorHandler) {
      throw error;
    }
    // Graceful error handling - if trial info unavailable, allow request
    console.warn('[Trial Limits] Error checking document limit:', error);
    next();
  }
}

/**
 * Middleware: Check agent execution limit for trial users
 */
export async function checkExecutionLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.workspace_id) {
      next();
      return;
    }

    // Get trial info
    const trialInfo = await getTrialInfo(req.user.workspace_id);
    
    // Only enforce limits for trial users
    if (trialInfo?.plan !== 'free_trial') {
      next();
      return;
    }

    // Check execution limit
    const { allowed, current, limit } = await checkTrialExecutionLimit(req.user.workspace_id);
    
    if (!allowed) {
      throw new ApiErrorHandler(
        HttpStatus.TOO_MANY_REQUESTS,
        'TRIAL_EXECUTION_LIMIT_EXCEEDED',
        `Agent execution limit exceeded: ${current}/${limit} executions used`
      );
    }

    // Attach limit info to response for visibility
    res.setHeader('X-Trial-Executions', `${current}/${limit}`);
    next();
  } catch (error) {
    if (error instanceof ApiErrorHandler) {
      throw error;
    }
    // Graceful error handling
    console.warn('[Trial Limits] Error checking execution limit:', error);
    next();
  }
}

/**
 * Middleware: Check user limit for trial users
 */
export async function checkUserLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.workspace_id) {
      next();
      return;
    }

    // Get trial info
    const trialInfo = await getTrialInfo(req.user.workspace_id);
    
    // Only enforce limits for trial users
    if (trialInfo?.plan !== 'free_trial') {
      next();
      return;
    }

    // Check user limit
    const { allowed, current, limit } = await checkTrialUserLimit(req.user.workspace_id);
    
    if (!allowed) {
      return next(new ApiErrorHandler(
        HttpStatus.TOO_MANY_REQUESTS,
        'TRIAL_USER_LIMIT_EXCEEDED',
        `User limit exceeded: ${current}/${limit} users in workspace`
      ));
    }

    // Attach limit info to response for visibility
    res.setHeader('X-Trial-Users', `${current}/${limit}`);
    next();
  } catch (error) {
    if (error instanceof ApiErrorHandler) {
      return next(error);
    }
    // Graceful error handling
    console.warn('[Trial Limits] Error checking user limit:', error);
    next();
  }
}

/**
 * Middleware: Check if trial has expired
 */
export async function checkTrialExpired(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.workspace_id) {
      next();
      return;
    }

    // Get trial info
    const trialInfo = await getTrialInfo(req.user.workspace_id);
    
    // Only check for trial users
    if (trialInfo?.plan !== 'free_trial') {
      next();
      return;
    }

    // Check if trial has expired
    if (trialInfo?.trial_status === 'expired' || trialInfo?.days_remaining <= 0) {
      throw new ApiErrorHandler(
        HttpStatus.FORBIDDEN,
        'TRIAL_EXPIRED',
        'Your trial period has ended. Please upgrade to continue using this feature.'
      );
    }

    // Warn if trial ending soon (< 3 days)
    if (trialInfo?.days_remaining <= 3) {
      res.setHeader('X-Trial-Warning', `Trial ends in ${trialInfo.days_remaining} days`);
    }

    // Attach trial info to response
    res.setHeader('X-Trial-Days-Remaining', trialInfo?.days_remaining || '0');
    next();
  } catch (error) {
    if (error instanceof ApiErrorHandler) {
      throw error;
    }
    // Graceful error handling
    console.warn('[Trial Limits] Error checking trial expiration:', error);
    next();
  }
}
