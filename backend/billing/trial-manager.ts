/**
 * Trial Manager
 * Handles free trial lifecycle, usage tracking, and graceful degradation
 * Features:
 * - 14-day trial period
 * - 5 documents/month limit
 * - 10 agent executions/month limit
 * - 1 concurrent user allowed
 * - Graceful degradation without hard upgrade walls
 */

import { TrialStatus, TrialUsage, TrialUsageStatus, TrialStatusResponse } from './billing-types';

export interface TrialConfig {
  durationDays: number;
  maxDocuments: number;
  maxAgentExecutions: number;
  maxUsers: number;
  maxStorageMB: number;
}

export class TrialManager {
  private static readonly DEFAULT_CONFIG: TrialConfig = {
    durationDays: 14,
    maxDocuments: 5,
    maxAgentExecutions: 10,
    maxUsers: 1,
    maxStorageMB: 100,
  };

  /**
   * Get default trial configuration
   */
  static getDefaultConfig(): TrialConfig {
    return { ...this.DEFAULT_CONFIG };
  }

  /**
   * Check if trial is currently active
   */
  static isTrialActive(trialStatus: TrialStatus, endDate?: Date): boolean {
    if (trialStatus !== 'active' || !endDate) {
      return false;
    }
    return new Date() < endDate;
  }

  /**
   * Get complete trial status for a workspace
   */
  static getTrialStatus(
    trialStatus: TrialStatus,
    startDate: Date | undefined,
    endDate: Date | undefined,
    usage: TrialUsage | undefined
  ): TrialStatusResponse {
    const now = new Date();
    const isActive = this.isTrialActive(trialStatus, endDate);

    let daysRemaining = 0;
    if (endDate) {
      const diffTime = endDate.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    const usageStatuses: TrialUsageStatus[] = [];

    if (usage) {
      // Documents usage status
      const docsPercentage = (usage.documentsUsed / usage.maxDocuments) * 100;
      usageStatuses.push({
        metric: 'documents',
        currentUsage: usage.documentsUsed,
        limit: usage.maxDocuments,
        percentage: docsPercentage,
        status: this.getUsageStatus(docsPercentage),
        message: `Using ${usage.documentsUsed} of ${usage.maxDocuments} documents`,
      });

      // Agent executions usage status
      const execPercentage = (usage.agentExecutionsUsed / usage.maxAgentExecutions) * 100;
      usageStatuses.push({
        metric: 'agent_executions',
        currentUsage: usage.agentExecutionsUsed,
        limit: usage.maxAgentExecutions,
        percentage: execPercentage,
        status: this.getUsageStatus(execPercentage),
        message: `Using ${usage.agentExecutionsUsed} of ${usage.maxAgentExecutions} agent executions`,
      });

      // Users usage status
      const usersPercentage = (usage.usersAdded / usage.maxUsers) * 100;
      usageStatuses.push({
        metric: 'users',
        currentUsage: usage.usersAdded,
        limit: usage.maxUsers,
        percentage: usersPercentage,
        status: this.getUsageStatus(usersPercentage),
        message: `Using ${usage.usersAdded} of ${usage.maxUsers} user slot(s)`,
      });
    }

    const upgradePromptMessage = this.getUpgradePromptMessage(isActive, daysRemaining, usageStatuses);

    return {
      isActive,
      trialStatus,
      startDate,
      endDate,
      daysRemaining: isActive ? daysRemaining : 0,
      usage: usageStatuses,
      upgradePromptMessage,
    };
  }

  /**
   * Check usage limits and return graceful degradation status
   * Returns status instead of throwing errors for better UX
   */
  static checkUsageLimits(
    usage: TrialUsage,
    usageType: 'documents' | 'agent_executions' | 'users'
  ): { canProceed: boolean; status: 'available' | 'approaching_limit' | 'at_limit'; message: string } {
    switch (usageType) {
      case 'documents':
        return this.checkDocumentLimit(usage);
      case 'agent_executions':
        return this.checkExecutionLimit(usage);
      case 'users':
        return this.checkUserLimit(usage);
    }
  }

  /**
   * Initialize trial usage tracking
   */
  static initializeTrialUsage(config: TrialConfig = this.DEFAULT_CONFIG): TrialUsage {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + config.durationDays);

    return {
      documentsUsed: 0,
      maxDocuments: config.maxDocuments,
      agentExecutionsUsed: 0,
      maxAgentExecutions: config.maxAgentExecutions,
      usersAdded: 0,
      maxUsers: config.maxUsers,
      lastResetDate: now,
      daysRemaining: config.durationDays,
    };
  }

  /**
   * Calculate trial expiry date
   */
  static calculateExpiryDate(startDate: Date, durationDays: number = 14): Date {
    const expiryDate = new Date(startDate);
    expiryDate.setDate(expiryDate.getDate() + durationDays);
    return expiryDate;
  }

  /**
   * Update trial usage metrics
   */
  static updateUsage(
    usage: TrialUsage,
    updates: Partial<TrialUsage>
  ): TrialUsage {
    return {
      ...usage,
      ...updates,
      lastResetDate: usage.lastResetDate,
    };
  }

  /**
   * Check if trial usage should be reset (monthly reset)
   */
  static shouldResetUsage(lastResetDate: Date): boolean {
    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    return lastResetDate < oneMonthAgo;
  }

  /**
   * Reset monthly usage counters
   */
  static resetMonthlyUsage(usage: TrialUsage): TrialUsage {
    return {
      ...usage,
      documentsUsed: 0,
      agentExecutionsUsed: 0,
      usersAdded: 0,
      lastResetDate: new Date(),
    };
  }

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================

  /**
   * Determine usage status based on percentage
   */
  private static getUsageStatus(percentage: number): 'available' | 'approaching_limit' | 'at_limit' {
    if (percentage >= 100) return 'at_limit';
    if (percentage >= 80) return 'approaching_limit';
    return 'available';
  }

  /**
   * Check document limit
   */
  private static checkDocumentLimit(usage: TrialUsage): {
    canProceed: boolean;
    status: 'available' | 'approaching_limit' | 'at_limit';
    message: string;
  } {
    const percentage = (usage.documentsUsed / usage.maxDocuments) * 100;
    const status = this.getUsageStatus(percentage);

    if (status === 'at_limit') {
      return {
        canProceed: true, // Graceful degradation - don't block, just warn
        status: 'at_limit',
        message: `Document limit reached (${usage.documentsUsed}/${usage.maxDocuments}). Upgrade to add more documents.`,
      };
    }

    if (status === 'approaching_limit') {
      return {
        canProceed: true,
        status: 'approaching_limit',
        message: `You're nearing your document limit (${usage.documentsUsed}/${usage.maxDocuments}). Consider upgrading soon.`,
      };
    }

    return {
      canProceed: true,
      status: 'available',
      message: `Documents available (${usage.documentsUsed}/${usage.maxDocuments})`,
    };
  }

  /**
   * Check agent execution limit
   */
  private static checkExecutionLimit(usage: TrialUsage): {
    canProceed: boolean;
    status: 'available' | 'approaching_limit' | 'at_limit';
    message: string;
  } {
    const percentage = (usage.agentExecutionsUsed / usage.maxAgentExecutions) * 100;
    const status = this.getUsageStatus(percentage);

    if (status === 'at_limit') {
      return {
        canProceed: true,
        status: 'at_limit',
        message: `Agent execution limit reached (${usage.agentExecutionsUsed}/${usage.maxAgentExecutions}). Upgrade to run more tasks.`,
      };
    }

    if (status === 'approaching_limit') {
      return {
        canProceed: true,
        status: 'approaching_limit',
        message: `You're nearing your execution limit (${usage.agentExecutionsUsed}/${usage.maxAgentExecutions}). Consider upgrading soon.`,
      };
    }

    return {
      canProceed: true,
      status: 'available',
      message: `Agent executions available (${usage.agentExecutionsUsed}/${usage.maxAgentExecutions})`,
    };
  }

  /**
   * Check user limit
   */
  private static checkUserLimit(usage: TrialUsage): {
    canProceed: boolean;
    status: 'available' | 'approaching_limit' | 'at_limit';
    message: string;
  } {
    const percentage = (usage.usersAdded / usage.maxUsers) * 100;
    const status = this.getUsageStatus(percentage);

    if (status === 'at_limit') {
      return {
        canProceed: true,
        status: 'at_limit',
        message: `User limit reached (${usage.usersAdded}/${usage.maxUsers}). Upgrade to add more team members.`,
      };
    }

    if (status === 'approaching_limit') {
      return {
        canProceed: true,
        status: 'approaching_limit',
        message: `You're using your only user slot. Upgrade to add more team members.`,
      };
    }

    return {
      canProceed: true,
      status: 'available',
      message: `User slot available`,
    };
  }

  /**
   * Generate upgrade prompt message based on trial status and usage
   */
  private static getUpgradePromptMessage(
    isActive: boolean,
    daysRemaining: number,
    usageStatuses: TrialUsageStatus[]
  ): string | undefined {
    if (!isActive) {
      return 'Your free trial has expired. Upgrade to continue using Ledgr.';
    }

    if (daysRemaining <= 3) {
      return `Your trial expires in ${daysRemaining} day(s). Upgrade now to avoid losing access.`;
    }

    const atLimitMetrics = usageStatuses.filter((u) => u.status === 'at_limit');
    if (atLimitMetrics.length > 0) {
      const metrics = atLimitMetrics.map((u) => u.metric).join(', ');
      return `You've reached your ${metrics} limit. Upgrade to increase limits.`;
    }

    const approachingLimitMetrics = usageStatuses.filter((u) => u.status === 'approaching_limit');
    if (approachingLimitMetrics.length > 0) {
      const metrics = approachingLimitMetrics.map((u) => u.metric).join(', ');
      return `You're nearing your ${metrics} limit. Upgrade to avoid interruptions.`;
    }

    return undefined;
  }
}

// =====================================================
// TRIAL TIER CONFIGURATION CONSTANTS
// =====================================================

export const TRIAL_TIER_CONFIG: TrialConfig = {
  durationDays: 14,
  maxDocuments: 5,
  maxAgentExecutions: 10,
  maxUsers: 1,
  maxStorageMB: 100,
};

/**
 * Get trial tier configuration for frontend/messaging
 */
export const TRIAL_TIER_DISPLAY = {
  name: 'Free Trial',
  description: 'Try Ledgr for 14 days with limited features',
  benefits: [
    '14-day free trial',
    'Up to 5 documents',
    'Up to 10 agent executions',
    '1 user',
    '100 MB storage',
    'Email support',
  ],
  limitations: [
    'Limited to 5 documents per month',
    'Limited to 10 agent executions per month',
    'Only 1 user allowed',
    'No advanced reporting',
  ],
};
