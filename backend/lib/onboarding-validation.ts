/**
 * Ledgr Onboarding Flow - Validation Logic
 * 
 * Comprehensive validation for each onboarding step with:
 * - Field-level validation
 * - Business rule validation
 * - Cross-field validation
 * - Error message generation
 */

import type {
  OnboardingError,
  OnboardingStep,
  CompanyRegistrationData,
  AccountingSetupData,
  TeamSetupData,
  AgentDeploymentData,
  VerificationData,
} from "../types/onboarding-types.js";

import { OnboardingStep as Step } from "../types/onboarding-types.js";

// ============================================================================
// VALIDATION RULES
// ============================================================================

interface ValidationResult {
  valid: boolean;
  errors: OnboardingError[];
  warnings: string[];
}

// ============================================================================
// STEP 1: COMPANY REGISTRATION VALIDATION
// ============================================================================

export function validateCompanyRegistration(data: CompanyRegistrationData): ValidationResult {
  const errors: OnboardingError[] = [];
  const warnings: string[] = [];

  // Company Name
  if (!data.companyName || data.companyName.trim().length === 0) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'companyName',
      'Company name is required',
      'COMPANY_NAME_REQUIRED'
    ));
  } else if (data.companyName.length > 255) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'companyName',
      'Company name must be less than 255 characters',
      'COMPANY_NAME_TOO_LONG'
    ));
  }

  // Legal Structure
  if (!data.legalStructure) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'legalStructure',
      'Legal structure is required',
      'LEGAL_STRUCTURE_REQUIRED'
    ));
  }

  // Tax ID (UAE TRN format: 123456789012)
  if (!data.taxId || data.taxId.trim().length === 0) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'taxId',
      'Tax ID (TRN) is required',
      'TAX_ID_REQUIRED'
    ));
  } else if (!/^\d{12}$/.test(data.taxId.replace(/\s/g, ''))) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'taxId',
      'Tax ID must be a 12-digit number',
      'TAX_ID_INVALID_FORMAT'
    ));
  }

  // Contact Person
  if (!data.contactPerson.firstName || data.contactPerson.firstName.trim().length === 0) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'contactPerson.firstName',
      'First name is required',
      'FIRST_NAME_REQUIRED'
    ));
  }

  if (!data.contactPerson.lastName || data.contactPerson.lastName.trim().length === 0) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'contactPerson.lastName',
      'Last name is required',
      'LAST_NAME_REQUIRED'
    ));
  }

  if (!data.contactPerson.email || !isValidEmail(data.contactPerson.email)) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'contactPerson.email',
      'Valid email address is required',
      'EMAIL_INVALID'
    ));
  }

  if (!data.contactPerson.phone || !isValidPhone(data.contactPerson.phone)) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'contactPerson.phone',
      'Valid phone number is required',
      'PHONE_INVALID'
    ));
  }

  // Industry
  if (!data.industry) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'industry',
      'Industry is required',
      'INDUSTRY_REQUIRED'
    ));
  }

  // Number of Employees
  if (data.numberOfEmployees < 1) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'numberOfEmployees',
      'Number of employees must be at least 1',
      'EMPLOYEES_INVALID'
    ));
  }

  // Business Address
  if (!data.businessAddress.street || data.businessAddress.street.trim().length === 0) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'businessAddress.street',
      'Street address is required',
      'STREET_REQUIRED'
    ));
  }

  if (!data.businessAddress.city || data.businessAddress.city.trim().length === 0) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'businessAddress.city',
      'City is required',
      'CITY_REQUIRED'
    ));
  }

  // Fiscal Year Start
  if (data.fiscalYearStart < 1 || data.fiscalYearStart > 12) {
    errors.push(createError(
      Step.COMPANY_REGISTRATION,
      'fiscalYearStart',
      'Fiscal year start month must be between 1 and 12',
      'FISCAL_YEAR_INVALID'
    ));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// STEP 2: ACCOUNTING SETUP VALIDATION
// ============================================================================

export function validateAccountingSetup(data: AccountingSetupData): ValidationResult {
  const errors: OnboardingError[] = [];
  const warnings: string[] = [];

  // Software Connection
  if (!data.softwareConnection.provider) {
    errors.push(createError(
      Step.ACCOUNTING_SETUP,
      'softwareConnection.provider',
      'Accounting software provider is required',
      'PROVIDER_REQUIRED'
    ));
  }

  if (data.softwareConnection.provider !== 'NONE' && !data.softwareConnection.isConnected) {
    errors.push(createError(
      Step.ACCOUNTING_SETUP,
      'softwareConnection.isConnected',
      `${data.softwareConnection.provider} connection failed. Please try again.`,
      'CONNECTION_FAILED'
    ));
  }

  // GL Accounts
  if (!data.defaultGLAccounts.bankAccount) {
    warnings.push('Bank account GL mapping not configured');
  }

  if (!data.defaultGLAccounts.arAccount) {
    warnings.push('Accounts receivable GL mapping not configured');
  }

  if (!data.defaultGLAccounts.apAccount) {
    warnings.push('Accounts payable GL mapping not configured');
  }

  // Tax Settings
  if (!data.taxSettings.taxIdNumber || data.taxSettings.taxIdNumber.trim().length === 0) {
    errors.push(createError(
      Step.ACCOUNTING_SETUP,
      'taxSettings.taxIdNumber',
      'Tax ID number is required',
      'TAX_ID_REQUIRED'
    ));
  }

  if (!data.taxSettings.categories || data.taxSettings.categories.length === 0) {
    warnings.push('No tax categories configured');
  }

  // Tax Filing Frequency
  if (!data.taxSettings.taxFilingFrequency) {
    errors.push(createError(
      Step.ACCOUNTING_SETUP,
      'taxSettings.taxFilingFrequency',
      'Tax filing frequency is required',
      'TAX_FREQUENCY_REQUIRED'
    ));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// STEP 3: TEAM SETUP VALIDATION
// ============================================================================

export function validateTeamSetup(data: TeamSetupData): ValidationResult {
  const errors: OnboardingError[] = [];
  const warnings: string[] = [];

  // At least one team member (the primary contact)
  if (!data.teamMembers || data.teamMembers.length === 0) {
    errors.push(createError(
      Step.TEAM_SETUP,
      'teamMembers',
      'At least one team member is required',
      'TEAM_MEMBERS_REQUIRED'
    ));
  }

  // Validate each team member
  data.teamMembers?.forEach((member, index) => {
    if (!member.email || !isValidEmail(member.email)) {
      errors.push(createError(
        Step.TEAM_SETUP,
        `teamMembers[${index}].email`,
        `Team member email is invalid`,
        'EMAIL_INVALID'
      ));
    }

    if (!member.role) {
      errors.push(createError(
        Step.TEAM_SETUP,
        `teamMembers[${index}].role`,
        `Team member role is required`,
        'ROLE_REQUIRED'
      ));
    }
  });

  // Check for duplicate emails
  const emails = data.teamMembers?.map(m => m.email.toLowerCase()) || [];
  const duplicates = emails.filter((e, i) => emails.indexOf(e) !== i);

  if (duplicates.length > 0) {
    errors.push(createError(
      Step.TEAM_SETUP,
      'teamMembers',
      `Duplicate email addresses found: ${duplicates.join(', ')}`,
      'DUPLICATE_EMAILS'
    ));
  }

  // Ensure at least one admin
  const hasAdmin = data.teamMembers?.some(m => m.role === 'CLIENT_ADMIN');
  if (!hasAdmin) {
    errors.push(createError(
      Step.TEAM_SETUP,
      'teamMembers',
      'At least one team member must have CLIENT_ADMIN role',
      'NO_ADMIN'
    ));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// STEP 4: AGENT DEPLOYMENT VALIDATION
// ============================================================================

export function validateAgentDeployment(data: AgentDeploymentData): ValidationResult {
  const errors: OnboardingError[] = [];
  const warnings: string[] = [];

  // This step is optional, so minimal validation
  if (data.selectedAgents && data.selectedAgents.length > 0) {
    // Validate each agent
    data.selectedAgents.forEach((agent, index) => {
      if (!agent.agentType) {
        errors.push(createError(
          Step.AGENT_DEPLOYMENT,
          `selectedAgents[${index}].agentType`,
          'Agent type is required',
          'AGENT_TYPE_REQUIRED'
        ));
      }

      if (agent.costPerMonth < 0) {
        errors.push(createError(
          Step.AGENT_DEPLOYMENT,
          `selectedAgents[${index}].costPerMonth`,
          'Cost per month cannot be negative',
          'COST_INVALID'
        ));
      }
    });
  }

  // Check for duplicate agents
  if (data.selectedAgents && data.selectedAgents.length > 1) {
    const types = data.selectedAgents.map(a => a.agentType);
    const duplicates = types.filter((t, i) => types.indexOf(t) !== i);

    if (duplicates.length > 0) {
      warnings.push(`Duplicate agent types selected: ${duplicates.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// STEP 5: VERIFICATION & GO-LIVE VALIDATION
// ============================================================================

export function validateVerification(data: VerificationData): ValidationResult {
  const errors: OnboardingError[] = [];
  const warnings: string[] = [];

  // All required checklist items must be completed
  const requiredItems = data.checklist.filter(item => item.required);
  const incompleteItems = requiredItems.filter(item => !item.completed);

  if (incompleteItems.length > 0) {
    errors.push(createError(
      Step.VERIFICATION_GOLIVE,
      'checklist',
      `${incompleteItems.length} required checklist items are incomplete`,
      'INCOMPLETE_CHECKLIST'
    ));
  }

  // Data validation
  if (!data.dataValidation.accountsValidated) {
    errors.push(createError(
      Step.VERIFICATION_GOLIVE,
      'dataValidation.accountsValidated',
      'Accounts must be validated before go-live',
      'ACCOUNTS_NOT_VALIDATED'
    ));
  }

  if (!data.dataValidation.transactionsValidated) {
    warnings.push('Transactions have not been validated');
  }

  if (!data.dataValidation.teamValidated) {
    warnings.push('Team setup has not been validated');
  }

  // Support Contact
  if (!data.supportContact.name || data.supportContact.name.trim().length === 0) {
    errors.push(createError(
      Step.VERIFICATION_GOLIVE,
      'supportContact.name',
      'Support contact name is required',
      'SUPPORT_NAME_REQUIRED'
    ));
  }

  if (!data.supportContact.email || !isValidEmail(data.supportContact.email)) {
    errors.push(createError(
      Step.VERIFICATION_GOLIVE,
      'supportContact.email',
      'Valid support email is required',
      'SUPPORT_EMAIL_INVALID'
    ));
  }

  if (!data.supportContact.phone || !isValidPhone(data.supportContact.phone)) {
    errors.push(createError(
      Step.VERIFICATION_GOLIVE,
      'supportContact.phone',
      'Valid support phone is required',
      'SUPPORT_PHONE_INVALID'
    ));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createError(
  step: OnboardingStep,
  field: string,
  message: string,
  code: string,
  severity: 'ERROR' | 'WARNING' = 'ERROR'
): OnboardingError {
  return {
    id: `error_${Date.now()}_${Math.random()}`,
    step,
    field,
    message,
    code,
    severity,
    timestamp: new Date(),
    resolved: false,
  };
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  // Accept various phone formats including +971XXXXXXXXX, 05XXXXXXXXX, etc.
  const phoneRegex = /^(\+\d{1,3})?[\d\s\-\(\)]{7,}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

export function isValidTRN(trn: string): boolean {
  return /^\d{12}$/.test(trn.replace(/\s/g, ''));
}

// ============================================================================
// UNIVERSAL VALIDATION ROUTER
// ============================================================================

export function validateStep(
  step: OnboardingStep,
  data: any
): ValidationResult {
  switch (step) {
    case Step.COMPANY_REGISTRATION:
      return validateCompanyRegistration(data);
    case Step.ACCOUNTING_SETUP:
      return validateAccountingSetup(data);
    case Step.TEAM_SETUP:
      return validateTeamSetup(data);
    case Step.AGENT_DEPLOYMENT:
      return validateAgentDeployment(data);
    case Step.VERIFICATION_GOLIVE:
      return validateVerification(data);
    default:
      return {
        valid: false,
        errors: [createError(step, '', 'Unknown step', 'UNKNOWN_STEP')],
        warnings: [],
      };
  }
}

export default {
  validateCompanyRegistration,
  validateAccountingSetup,
  validateTeamSetup,
  validateAgentDeployment,
  validateVerification,
  validateStep,
  isValidEmail,
  isValidPhone,
  isValidTRN,
};
