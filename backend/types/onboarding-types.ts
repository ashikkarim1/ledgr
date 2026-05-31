/**
 * Ledgr Onboarding Flow - Type Definitions
 * 
 * Complete TypeScript types for the 5-step onboarding wizard:
 * 1. Company Registration
 * 2. Accounting Setup
 * 3. Team Setup
 * 4. Agent Deployment (Optional)
 * 5. Verification & Go-Live
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum OnboardingStep {
  COMPANY_REGISTRATION = 'COMPANY_REGISTRATION',
  ACCOUNTING_SETUP = 'ACCOUNTING_SETUP',
  TEAM_SETUP = 'TEAM_SETUP',
  AGENT_DEPLOYMENT = 'AGENT_DEPLOYMENT',
  VERIFICATION_GOLIVE = 'VERIFICATION_GOLIVE',
}

export enum LegalStructure {
  SOLE_PROPRIETOR = 'SOLE_PROPRIETOR',
  LLC = 'LLC',
  LLC_INVESTMENT = 'LLC_INVESTMENT',
  LLC_SERVICES = 'LLC_SERVICES',
  PRIVATE_COMPANY = 'PRIVATE_COMPANY',
  PUBLIC_COMPANY = 'PUBLIC_COMPANY',
  PARTNERSHIP = 'PARTNERSHIP',
  JOINT_VENTURE = 'JOINT_VENTURE',
  BRANCH_FOREIGN = 'BRANCH_FOREIGN',
}

export enum Industry {
  TECHNOLOGY = 'TECHNOLOGY',
  HEALTHCARE = 'HEALTHCARE',
  RETAIL = 'RETAIL',
  MANUFACTURING = 'MANUFACTURING',
  CONSTRUCTION = 'CONSTRUCTION',
  REAL_ESTATE = 'REAL_ESTATE',
  FINANCE_INSURANCE = 'FINANCE_INSURANCE',
  HOSPITALITY = 'HOSPITALITY',
  TRANSPORTATION = 'TRANSPORTATION',
  EDUCATION = 'EDUCATION',
  MEDIA_ENTERTAINMENT = 'MEDIA_ENTERTAINMENT',
  PROFESSIONAL_SERVICES = 'PROFESSIONAL_SERVICES',
  WHOLESALE = 'WHOLESALE',
  ECOMMERCE = 'ECOMMERCE',
  OTHER = 'OTHER',
}

export enum AccountingSoftware {
  QUICKBOOKS = 'QUICKBOOKS',
  XERO = 'XERO',
  FRESHBOOKS = 'FRESHBOOKS',
  SAP = 'SAP',
  ORACLE = 'ORACLE',
  NONE = 'NONE',
}

export enum UserRole {
  CLIENT_ADMIN = 'CLIENT_ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  CFO = 'CFO',
  AGENT_MANAGER = 'AGENT_MANAGER',
  FINANCE_TEAM = 'FINANCE_TEAM',
  OPERATIONAL = 'OPERATIONAL',
  VIEWER = 'VIEWER',
}

export enum AgentType {
  INVOICING = 'INVOICING',
  PAYABLES = 'PAYABLES',
  RECONCILIATION = 'RECONCILIATION',
  FORECASTING = 'FORECASTING',
  TAX_FILING = 'TAX_FILING',
  VAT_MANAGEMENT = 'VAT_MANAGEMENT',
  EXPENSE_CATEGORIZATION = 'EXPENSE_CATEGORIZATION',
  CASH_FLOW = 'CASH_FLOW',
}

export enum OnboardingStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// ============================================================================
// STEP 1: COMPANY REGISTRATION
// ============================================================================

export interface CompanyRegistrationData {
  companyName: string;
  legalStructure: LegalStructure;
  taxId: string;
  businessRegistration?: string;
  country: string;
  currency: string;
  fiscalYearStart: number;
  industry: Industry;
  numberOfEmployees: number;
  businessDescription?: string;
  website?: string;
  businessAddress: {
    street: string;
    city: string;
    emirate: string;
    zipCode?: string;
    poBox?: string;
  };
  contactPerson: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    title?: string;
  };
  validatedAt?: Date;
  validationErrors?: string[];
}

// ============================================================================
// STEP 2: ACCOUNTING SETUP
// ============================================================================

export interface AccountingSoftwareConnection {
  provider: AccountingSoftware;
  isConnected: boolean;
  connectedAt?: Date;
  connectionStatus: 'PENDING' | 'CONNECTED' | 'FAILED' | 'DISCONNECTED';
  lastSyncAt?: Date;
  syncErrors?: string[];
}

export interface ChartOfAccountsMapping {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  mappedToGLAccount?: string;
  isActive: boolean;
}

export interface TaxCategory {
  id: string;
  name: string;
  rate: number;
  type: 'VAT' | 'CORPORATE_TAX' | 'WITHHOLDING_TAX' | 'OTHER';
  isDefault: boolean;
}

export interface GLAccountMapping {
  id: string;
  name: string;
  code: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  defaultAccount: boolean;
  description?: string;
}

export interface AccountingSetupData {
  softwareConnection: AccountingSoftwareConnection;
  chartOfAccounts: ChartOfAccountsMapping[];
  defaultGLAccounts: {
    bankAccount?: GLAccountMapping;
    arAccount?: GLAccountMapping;
    apAccount?: GLAccountMapping;
    revenueAccount?: GLAccountMapping;
    expenseAccount?: GLAccountMapping;
  };
  taxSettings: {
    taxIdNumber: string;
    categories: TaxCategory[];
    taxFilingFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
    nextFilingDate?: Date;
  };
  validatedAt?: Date;
  validationErrors?: string[];
}

// ============================================================================
// STEP 3: TEAM SETUP
// ============================================================================

export interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  invitedAt: Date;
  acceptedAt?: Date;
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REMOVED';
  mfaEnabled: boolean;
  lastLoginAt?: Date;
}

export interface Permission {
  id: string;
  resource: string;
  action: 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE';
  grantedAt: Date;
}

export interface RolePermissionMatrix {
  role: UserRole;
  permissions: {
    resource: string;
    allowedActions: string[];
  }[];
  description: string;
}

export interface TeamSetupData {
  teamMembers: TeamMember[];
  defaultRoles: UserRole[];
  validatedAt?: Date;
  validationErrors?: string[];
}

// ============================================================================
// STEP 4: AGENT DEPLOYMENT
// ============================================================================

export interface AgentDeploymentConfig {
  agentType: AgentType;
  isEnabled: boolean;
  confidence: number;
  estimatedAccuracy: number;
  costPerMonth: number;
  performanceMetrics?: {
    avgProcessingTime: number;
    errorRate: number;
    costPerTransaction: number;
  };
}

export interface AgentDeploymentData {
  selectedAgents: AgentDeploymentConfig[];
  automationScope: {
    invoicing: boolean;
    payables: boolean;
    reconciliation: boolean;
    forecasting: boolean;
    taxFiling: boolean;
    vatManagement: boolean;
    expenseCategorization: boolean;
    cashFlow: boolean;
  };
  testStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  estimatedMonthlyCost: number;
  goLiveDate?: Date;
  validatedAt?: Date;
  validationErrors?: string[];
}

// ============================================================================
// STEP 5: VERIFICATION & GO-LIVE
// ============================================================================

export interface GoLiveChecklist {
  id: string;
  item: string;
  required: boolean;
  completed: boolean;
  completedAt?: Date;
}

export interface VerificationData {
  checklist: GoLiveChecklist[];
  dataValidation: {
    accountsValidated: boolean;
    transactionsValidated: boolean;
    teamValidated: boolean;
  };
  supportContact: {
    name: string;
    email: string;
    phone: string;
    timezone: string;
  };
  allRequirementsMetAt?: Date;
  goLiveConfirmedAt?: Date;
  validationErrors?: string[];
}

// ============================================================================
// ONBOARDING PROGRESS & STATE
// ============================================================================

export interface OnboardingProgress {
  id: string;
  organizationId: string;
  clientId: string;
  currentStep: OnboardingStep;
  status: OnboardingStatus;
  companyData?: CompanyRegistrationData;
  accountingData?: AccountingSetupData;
  teamData?: TeamSetupData;
  agentData?: AgentDeploymentData;
  verificationData?: VerificationData;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  createdAt: Date;
  updatedAt: Date;
  lastSavedAt: Date;
  estimatedMinutesToCompletion: number;
  autoSaveEnabled: boolean;
  autoSaveIntervalMs: number;
  errors: OnboardingError[];
  warnings: string[];
}

export interface OnboardingError {
  id: string;
  step: OnboardingStep;
  field: string;
  message: string;
  code: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  timestamp: Date;
  resolved: boolean;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface SaveProgressRequest {
  organizationId: string;
  step: OnboardingStep;
  data: Partial<OnboardingProgress>;
  autoSave?: boolean;
}

export interface SaveProgressResponse {
  success: boolean;
  progress: OnboardingProgress;
  errors?: OnboardingError[];
}

export interface ValidateStepRequest {
  step: OnboardingStep;
  data: any;
}

export interface ValidateStepResponse {
  valid: boolean;
  errors: OnboardingError[];
  warnings: string[];
}

export interface GetProgressResponse {
  progress: OnboardingProgress;
  currentStepMetadata: {
    title: string;
    description: string;
    estimatedMinutes: number;
  };
  nextStep?: OnboardingStep;
  previousStep?: OnboardingStep;
}
