/**
 * Ledgr Onboarding Flow - API Handlers
 * 
 * Backend endpoints for:
 * - Initialize onboarding
 * - Save/update progress
 * - Validate steps
 * - Skip steps
 * - Resume onboarding
 * - Complete onboarding
 */

import type {
  OnboardingProgress,
  SaveProgressRequest,
  SaveProgressResponse,
  ValidateStepRequest,
  ValidateStepResponse,
  GetProgressResponse,
} from "../types/onboarding-types.js";

import { OnboardingStep } from "../types/onboarding-types.js";
import OnboardingStateMachine, { createOnboardingProgress } from "../lib/onboarding-flow.js";
import { validateStep } from "../lib/onboarding-validation.js";

// ============================================================================
// DATABASE INTERFACE (abstraction layer)
// ============================================================================

interface Database {
  saveProgress(progress: OnboardingProgress): Promise<OnboardingProgress>;
  getProgress(organizationId: string, clientId: string): Promise<OnboardingProgress | null>;
  saveBackup(onboardingId: string, backup: any): Promise<void>;
  getBackup(onboardingId: string, checkpointName: string): Promise<any | null>;
}

// ============================================================================
// HANDLER CLASS
// ============================================================================

export class OnboardingHandler {
  constructor(private db: Database) {}

  /**
   * Initialize new onboarding flow
   */
  async initializeOnboarding(
    organizationId: string,
    clientId: string
  ): Promise<OnboardingProgress> {
    const existing = await this.db.getProgress(organizationId, clientId);
    if (existing) {
      return existing;
    }

    const progress = createOnboardingProgress(organizationId, clientId);
    return await this.db.saveProgress(progress);
  }

  /**
   * Get current onboarding progress
   */
  async getProgress(
    organizationId: string,
    clientId: string
  ): Promise<GetProgressResponse> {
    const progress = await this.db.getProgress(organizationId, clientId);
    
    if (!progress) {
      throw new Error('Onboarding not found');
    }

    const stateMachine = new OnboardingStateMachine(progress);
    const currentMetadata = stateMachine.getStepMetadata(progress.currentStep);

    const stepSequence = stateMachine.getStepSequence();
    const currentIndex = stepSequence.indexOf(progress.currentStep);
    const nextStep = currentIndex < stepSequence.length - 1
      ? stepSequence[currentIndex + 1]
      : undefined;
    const previousStep = currentIndex > 0
      ? stepSequence[currentIndex - 1]
      : undefined;

    return {
      progress,
      currentStepMetadata: {
        title: currentMetadata.title,
        description: currentMetadata.description,
        estimatedMinutes: currentMetadata.estimatedMinutes,
      },
      nextStep,
      previousStep,
    };
  }

  /**
   * Save progress at current step
   */
  async saveProgress(request: SaveProgressRequest): Promise<SaveProgressResponse> {
    const progress = await this.db.getProgress(
      request.organizationId,
      request.data.clientId || ''
    );

    if (!progress) {
      throw new Error('Onboarding not found');
    }

    const stateMachine = new OnboardingStateMachine(progress);
    stateMachine.saveStepData(request.step, request.data[`${request.step.toLowerCase()}Data`]);

    if (request.autoSave) {
      const backup = {
        checkpoint_name: 'Auto-save',
        snapshot: JSON.parse(JSON.stringify(progress)),
        step: progress.currentStep,
        created_at: new Date(),
      };
      await this.db.saveBackup(progress.id, backup);
    }

    const updated = await this.db.saveProgress(progress);

    return {
      success: true,
      progress: updated,
      errors: stateMachine.getErrors(),
    };
  }

  /**
   * Validate current step data
   */
  async validateStep(request: ValidateStepRequest): Promise<ValidateStepResponse> {
    const result = validateStep(request.step, request.data);

    const progress = createOnboardingProgress('temp', 'temp');
    const stateMachine = new OnboardingStateMachine(progress);
    const timeRemaining = stateMachine.getTimeRemaining();

    return {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      estimatedCompletionTimeMs: timeRemaining * 60 * 1000,
    };
  }

  /**
   * Move to next step
   */
  async nextStep(organizationId: string, clientId: string): Promise<OnboardingProgress> {
    const progress = await this.db.getProgress(organizationId, clientId);
    
    if (!progress) {
      throw new Error('Onboarding not found');
    }

    const stateMachine = new OnboardingStateMachine(progress);
    const nextStep = stateMachine.nextStep();

    if (!nextStep) {
      throw new Error('Already at the last step');
    }

    return await this.db.saveProgress(progress);
  }

  /**
   * Move to previous step
   */
  async previousStep(organizationId: string, clientId: string): Promise<OnboardingProgress> {
    const progress = await this.db.getProgress(organizationId, clientId);
    
    if (!progress) {
      throw new Error('Onboarding not found');
    }

    const stateMachine = new OnboardingStateMachine(progress);
    const prevStep = stateMachine.previousStep();

    if (!prevStep) {
      throw new Error('Already at the first step');
    }

    return await this.db.saveProgress(progress);
  }

  /**
   * Go to specific step
   */
  async goToStep(
    organizationId: string,
    clientId: string,
    step: OnboardingStep
  ): Promise<OnboardingProgress> {
    const progress = await this.db.getProgress(organizationId, clientId);
    
    if (!progress) {
      throw new Error('Onboarding not found');
    }

    const stateMachine = new OnboardingStateMachine(progress);
    
    if (!stateMachine.goToStep(step)) {
      throw new Error(`Cannot go to step ${step}. Complete required steps first.`);
    }

    return await this.db.saveProgress(progress);
  }

  /**
   * Complete current step
   */
  async completeStep(
    organizationId: string,
    clientId: string
  ): Promise<OnboardingProgress> {
    const progress = await this.db.getProgress(organizationId, clientId);
    
    if (!progress) {
      throw new Error('Onboarding not found');
    }

    const stateMachine = new OnboardingStateMachine(progress);
    stateMachine.completeStep();

    return await this.db.saveProgress(progress);
  }

  /**
   * Pause onboarding
   */
  async pauseOnboarding(
    organizationId: string,
    clientId: string
  ): Promise<OnboardingProgress> {
    const progress = await this.db.getProgress(organizationId, clientId);
    
    if (!progress) {
      throw new Error('Onboarding not found');
    }

    const stateMachine = new OnboardingStateMachine(progress);
    stateMachine.pause();

    return await this.db.saveProgress(progress);
  }

  /**
   * Resume onboarding
   */
  async resumeOnboarding(
    organizationId: string,
    clientId: string,
    fromStep?: OnboardingStep
  ): Promise<OnboardingProgress> {
    const progress = await this.db.getProgress(organizationId, clientId);
    
    if (!progress) {
      throw new Error('Onboarding not found');
    }

    const stateMachine = new OnboardingStateMachine(progress);
    
    if (!stateMachine.resume(fromStep)) {
      throw new Error(`Cannot resume from step ${fromStep}`);
    }

    return await this.db.saveProgress(progress);
  }

  /**
   * Complete onboarding (final step)
   */
  async completeOnboarding(
    organizationId: string,
    clientId: string
  ): Promise<OnboardingProgress> {
    const progress = await this.db.getProgress(organizationId, clientId);
    
    if (!progress) {
      throw new Error('Onboarding not found');
    }

    const stateMachine = new OnboardingStateMachine(progress);

    if (!stateMachine.canComplete()) {
      const errors = stateMachine.getErrors();
      throw new Error(
        `Cannot complete onboarding. ${errors.length} validation error(s)`
      );
    }

    stateMachine.completeStep();

    return await this.db.saveProgress(progress);
  }

  /**
   * Get completion percentage
   */
  async getCompletionPercentage(
    organizationId: string,
    clientId: string
  ): Promise<number> {
    const progress = await this.db.getProgress(organizationId, clientId);
    
    if (!progress) {
      throw new Error('Onboarding not found');
    }

    const stateMachine = new OnboardingStateMachine(progress);
    return stateMachine.getCompletionPercentage();
  }

  /**
   * Get time remaining estimate
   */
  async getTimeRemaining(
    organizationId: string,
    clientId: string
  ): Promise<number> {
    const progress = await this.db.getProgress(organizationId, clientId);
    
    if (!progress) {
      throw new Error('Onboarding not found');
    }

    const stateMachine = new OnboardingStateMachine(progress);
    return stateMachine.getTimeRemaining();
  }
}

export default OnboardingHandler;
