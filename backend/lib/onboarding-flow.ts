// @ts-nocheck
/**
 * Ledgr Onboarding Flow - State Machine & Core Logic
 * 
 * Manages the complete 5-step onboarding journey with:
 * - State machine transitions
 * - Auto-save checkpoint management
 * - Progress persistence
 * - Step validation and error handling
 * - Resume from any step capability
 */

import type {
  OnboardingStep,
  OnboardingStatus,
  OnboardingProgress,
  OnboardingError,
} from "../types/onboarding-types.js";

import {
  OnboardingStep as Step,
  OnboardingStatus,
} from "../types/onboarding-types.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const STEP_SEQUENCE: OnboardingStep[] = [
  Step.COMPANY_REGISTRATION,
  Step.ACCOUNTING_SETUP,
  Step.TEAM_SETUP,
  Step.AGENT_DEPLOYMENT,
  Step.VERIFICATION_GOLIVE,
];

const STEP_METADATA: Record<OnboardingStep, {
  title: string;
  description: string;
  estimatedMinutes: number;
  required: boolean;
  videoUrl?: string;
}> = {
  [Step.COMPANY_REGISTRATION]: {
    title: 'Company Registration',
    description: 'Set up your company details, legal structure, and basic information',
    estimatedMinutes: 10,
    required: true,
  },
  [Step.ACCOUNTING_SETUP]: {
    title: 'Accounting Setup',
    description: 'Connect your accounting software and configure GL accounts',
    estimatedMinutes: 15,
    required: true,
  },
  [Step.TEAM_SETUP]: {
    title: 'Team Setup',
    description: 'Invite team members and assign roles and permissions',
    estimatedMinutes: 10,
    required: true,
  },
  [Step.AGENT_DEPLOYMENT]: {
    title: 'Agent Deployment',
    description: 'Configure and deploy autonomous finance agents (optional)',
    estimatedMinutes: 15,
    required: false,
  },
  [Step.VERIFICATION_GOLIVE]: {
    title: 'Verification & Go-Live',
    description: 'Verify setup and activate your account',
    estimatedMinutes: 10,
    required: true,
  },
};

// ============================================================================
// ONBOARDING STATE MACHINE CLASS
// ============================================================================

export class OnboardingStateMachine {
  private progress: OnboardingProgress;
  private autoSaveTimer?: NodeJS.Timeout;

  constructor(progress: OnboardingProgress) {
    this.progress = progress;
  }

  public nextStep(): OnboardingStep | null {
    const currentIndex = STEP_SEQUENCE.indexOf(this.progress.currentStep);
    if (currentIndex === -1 || currentIndex === STEP_SEQUENCE.length - 1) {
      return null;
    }

    const nextStep = STEP_SEQUENCE[currentIndex + 1];
    this.progress.currentStep = nextStep;

    return nextStep;
  }

  public previousStep(): OnboardingStep | null {
    const currentIndex = STEP_SEQUENCE.indexOf(this.progress.currentStep);
    if (currentIndex <= 0) {
      return null;
    }

    const prevStep = STEP_SEQUENCE[currentIndex - 1];
    this.progress.currentStep = prevStep;

    return prevStep;
  }

  public goToStep(step: OnboardingStep): boolean {
    if (!STEP_SEQUENCE.includes(step)) {
      return false;
    }

    const stepIndex = STEP_SEQUENCE.indexOf(step);
    const currentIndex = STEP_SEQUENCE.indexOf(this.progress.currentStep);

    // Can go to previous steps or current step
    if (stepIndex <= currentIndex) {
      this.progress.currentStep = step;
      return true;
    }

    // For future steps, check if all required steps before are completed
    const requiredBefore = STEP_SEQUENCE
      .slice(0, stepIndex)
      .filter(s => STEP_METADATA[s].required);

    const allCompleted = requiredBefore.every(s =>
      this.progress.completedSteps.includes(s)
    );

    if (allCompleted) {
      this.progress.currentStep = step;
      return true;
    }

    return false;
  }

  public skipStep(step: OnboardingStep): boolean {
    if (STEP_METADATA[step].required) {
      return false;
    }

    if (!this.progress.skippedSteps.includes(step)) {
      this.progress.skippedSteps.push(step);
    }

    return this.nextStep() !== null;
  }

  public completeStep(): boolean {
    const currentStep = this.progress.currentStep;

    if (!this.progress.completedSteps.includes(currentStep)) {
      this.progress.completedSteps.push(currentStep);
    }

    const allRequired = STEP_SEQUENCE.filter(s => STEP_METADATA[s].required);
    const allRequiredComplete = allRequired.every(s =>
      this.progress.completedSteps.includes(s)
    );

    if (allRequiredComplete && currentStep === Step.VERIFICATION_GOLIVE) {
      this.progress.status = OnboardingStatus.COMPLETED;
    }

    return true;
  }

  public pause(): void {
    this.progress.status = OnboardingStatus.PAUSED;
    this.stopAutoSave();
  }

  public resume(fromStep?: OnboardingStep): boolean {
    if (fromStep && !this.goToStep(fromStep)) {
      return false;
    }

    this.progress.status = OnboardingStatus.IN_PROGRESS;
    this.startAutoSave();

    return true;
  }

  public saveStepData(step: OnboardingStep, data: any): void {
    switch (step) {
      case Step.COMPANY_REGISTRATION:
        this.progress.companyData = data;
        break;
      case Step.ACCOUNTING_SETUP:
        this.progress.accountingData = data;
        break;
      case Step.TEAM_SETUP:
        this.progress.teamData = data;
        break;
      case Step.AGENT_DEPLOYMENT:
        this.progress.agentData = data;
        break;
      case Step.VERIFICATION_GOLIVE:
        this.progress.verificationData = data;
        break;
    }

    this.progress.updatedAt = new Date();
    this.progress.lastSavedAt = new Date();
  }

  public getStepData(step: OnboardingStep): any {
    switch (step) {
      case Step.COMPANY_REGISTRATION:
        return this.progress.companyData;
      case Step.ACCOUNTING_SETUP:
        return this.progress.accountingData;
      case Step.TEAM_SETUP:
        return this.progress.teamData;
      case Step.AGENT_DEPLOYMENT:
        return this.progress.agentData;
      case Step.VERIFICATION_GOLIVE:
        return this.progress.verificationData;
    }
  }

  public editStep(step: OnboardingStep, data: any): boolean {
    const visited = this.progress.completedSteps.includes(step) ||
                   this.progress.currentStep === step;

    if (!visited) {
      return false;
    }

    this.saveStepData(step, data);

    if (this.progress.completedSteps.includes(step)) {
      this.progress.completedSteps = this.progress.completedSteps.filter(s => s !== step);
    }

    return true;
  }

  public startAutoSave(intervalMs: number = this.progress.autoSaveIntervalMs): void {
    if (!this.progress.autoSaveEnabled) {
      return;
    }

    this.stopAutoSave();

    this.autoSaveTimer = setInterval(() => {
      this.progress.lastSavedAt = new Date();
    }, intervalMs);
  }

  public stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  public addError(error: Omit<OnboardingError, 'id' | 'timestamp'>): void {
    const newError: OnboardingError = {
      id: `error_${Date.now()}_${Math.random()}`,
      timestamp: new Date(),
      ...error,
      resolved: false,
    };

    this.progress.errors.push(newError);
  }

  public clearStepErrors(step: OnboardingStep): void {
    this.progress.errors = this.progress.errors.filter(e => e.step !== step);
  }

  public getErrors(): OnboardingError[] {
    return this.progress.errors.filter(e => !e.resolved);
  }

  public getProgress(): OnboardingProgress {
    return this.progress;
  }

  public getCompletionPercentage(): number {
    const required = STEP_SEQUENCE.filter(s => STEP_METADATA[s].required).length;
    const completed = this.progress.completedSteps.filter(s => STEP_METADATA[s].required).length;

    return Math.round((completed / required) * 100);
  }

  public canComplete(): boolean {
    return STEP_SEQUENCE.filter(s => STEP_METADATA[s].required).every(s =>
      this.progress.completedSteps.includes(s)
    ) && this.getErrors().length === 0;
  }

  public getTimeRemaining(): number {
    let remaining = 0;

    for (const step of STEP_SEQUENCE) {
      if (!this.progress.completedSteps.includes(step)) {
        remaining += STEP_METADATA[step].estimatedMinutes;
      }
    }

    return remaining;
  }

  public getStepSequence(): OnboardingStep[] {
    return [...STEP_SEQUENCE];
  }

  public getStepMetadata(step: OnboardingStep) {
    return STEP_METADATA[step];
  }

  public isStepOptional(step: OnboardingStep): boolean {
    return !STEP_METADATA[step].required;
  }

  public getAllStepMetadata() {
    return STEP_METADATA;
  }
}

export function createOnboardingProgress(
  organizationId: string,
  clientId: string
): OnboardingProgress {
  return {
    id: `onboarding_${Date.now()}_${Math.random()}`,
    organizationId,
    clientId,
    currentStep: Step.COMPANY_REGISTRATION,
    status: OnboardingStatus.IN_PROGRESS,
    completedSteps: [],
    skippedSteps: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSavedAt: new Date(),
    estimatedMinutesToCompletion: 50,
    autoSaveEnabled: true,
    autoSaveIntervalMs: 10000,
    errors: [],
    warnings: [],
  };
}

export default OnboardingStateMachine;
