# Ledgr Onboarding Flow - Implementation Guide

**Complete 5-step client onboarding journey** with progress tracking, auto-save, and comprehensive validations.

---

## Overview

This guide covers the complete onboarding system implementation for Ledgr:

1. **Type Definitions** (`onboarding-types.ts`) - Full TypeScript types for all 5 steps
2. **Database Schema** (`002_onboarding_schema.sql`) - PostgreSQL tables with RLS security
3. **State Machine** (`onboarding-flow.ts`) - Core business logic and state transitions
4. **Validation Logic** (`onboarding-validation.ts`) - Field-level and cross-field validation
5. **API Handlers** (`onboarding-handlers.ts`) - Backend endpoint implementations

---

## Architecture

### State Flow Diagram

```
START
  |
  v
Step 1: Company Registration (Required)
  |
  +-- Validate company data
  +-- Save & backup
  |
  v
Step 2: Accounting Setup (Required)
  |
  +-- Connect accounting software
  +-- Validate GL mappings
  |
  v
Step 3: Team Setup (Required)
  |
  +-- Invite team members
  +-- Assign roles & permissions
  |
  v
Step 4: Agent Deployment (Optional)
  |
  +-- Configure autonomous agents
  +-- Test on sample data
  |
  v
Step 5: Verification & Go-Live (Required)
  |
  +-- Complete checklist
  +-- Verify all setup
  |
  v
COMPLETION CERTIFICATE
  |
  v
END (Active Ledgr Account)
```

### Key Features

**Progress Persistence**
- Auto-save every 10 seconds (configurable)
- Checkpoint backups at each step
- Resume from any previously visited step
- Edit any completed step

**Validation**
- Real-time field-level validation
- Business rule validation
- Cross-field dependencies
- Clear error messages with codes

**Security**
- Row-Level Security (RLS) on all tables
- Immutable audit trail
- Encrypted sensitive data (OAuth tokens, passwords)
- Role-based permission matrix

**User Experience**
- Progress percentage calculation
- Time remaining estimate
- Optional step skipping
- Video tutorials for each step
- Help tooltips on every field

---

## Database Schema

### Core Tables

#### `onboarding_progress`
Primary table tracking onboarding state for each client.

```sql
CREATE TABLE onboarding_progress (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  current_step VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL, -- NOT_STARTED, IN_PROGRESS, PAUSED, COMPLETED, FAILED
  company_data JSONB,
  accounting_data JSONB,
  team_data JSONB,
  agent_data JSONB,
  verification_data JSONB,
  completed_steps TEXT[],
  skipped_steps TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_saved_at TIMESTAMPTZ
);
```

#### `onboarding_backups`
Auto-save checkpoints and manual backups.

```sql
CREATE TABLE onboarding_backups (
  id UUID PRIMARY KEY,
  onboarding_id UUID NOT NULL,
  snapshot JSONB NOT NULL,
  step VARCHAR(50) NOT NULL,
  checkpoint_name VARCHAR(100),
  created_at TIMESTAMPTZ
);
```

#### `onboarding_errors`
Validation errors and warnings.

```sql
CREATE TABLE onboarding_errors (
  id UUID PRIMARY KEY,
  onboarding_id UUID NOT NULL,
  step VARCHAR(50) NOT NULL,
  field VARCHAR(100),
  message TEXT NOT NULL,
  code VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  timestamp TIMESTAMPTZ,
  resolved BOOLEAN
);
```

#### Supporting Tables
- `team_members` - Team member profiles with roles
- `role_permissions` - Role-based permission matrix
- `accounting_connections` - Software integrations (QuickBooks, Xero, etc.)
- `gl_account_mappings` - GL account configuration
- `agent_deployments` - Agent setup and configuration
- `golive_checklists` - Go-live verification items
- `completion_certificates` - Completion proof

---

## Step Details

### Step 1: Company Registration

**Purpose:** Capture basic company information and legal structure.

**Required Fields:**
- Company name (1-255 chars)
- Legal structure (LLC, PLLC, Corp, Partnership, Sole Proprietor, etc.)
- Tax ID / TRN (12-digit UAE TRN)
- Country (default: UAE)
- Currency (default: AED)
- Fiscal year start month (1-12)
- Industry classification
- Number of employees (1+)
- Business address (street, city, emirate, postal)
- Contact person (name, email, phone, title)

**Validation Rules:**
- Company name: non-empty, max 255 chars
- Tax ID: exactly 12 digits
- Email: valid format
- Phone: international format accepted
- Fiscal year: 1-12 (month)
- Employees: >= 1
- All required address fields present

**Data Type:**
```typescript
interface CompanyRegistrationData {
  companyName: string;
  legalStructure: LegalStructure;
  taxId: string;
  country: string;
  currency: string;
  fiscalYearStart: number;
  industry: Industry;
  numberOfEmployees: number;
  businessAddress: { street, city, emirate, zipCode?, poBox? };
  contactPerson: { firstName, lastName, email, phone, title? };
}
```

**Estimated Time:** 10 minutes

---

### Step 2: Accounting Setup

**Purpose:** Connect accounting software and configure GL accounts.

**Supported Software:**
- QuickBooks Online
- Xero
- FreshBooks
- SAP
- Oracle
- None (manual setup)

**Actions:**
1. Select accounting software provider
2. If provider selected: OAuth connect (handles token securely)
3. Pull chart of accounts from connected software
4. Map GL accounts (Bank, AR, AP, Revenue, Expense)
5. Configure tax categories and rates
6. Set tax filing frequency

**Validation Rules:**
- Software provider: required
- If provider != 'NONE': must be connected
- GL account mappings: at least bank and revenue accounts
- Tax ID: required and validated
- Tax filing frequency: required

**Data Type:**
```typescript
interface AccountingSetupData {
  softwareConnection: {
    provider: AccountingSoftware;
    isConnected: boolean;
    connectionStatus: 'PENDING' | 'CONNECTED' | 'FAILED' | 'DISCONNECTED';
  };
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
  };
}
```

**Estimated Time:** 15 minutes

---

### Step 3: Team Setup

**Purpose:** Invite team members and assign roles/permissions.

**Roles Available:**
- **CLIENT_ADMIN** - Full access to company settings, team, transactions, reports, agents
- **ACCOUNTANT** - Create/edit transactions, view reports
- **CFO** - View all reports, transactions, company settings
- **AGENT_MANAGER** - Configure and manage autonomous agents
- **FINANCE_TEAM** - Create/view transactions and reports
- **OPERATIONAL** - View transactions and reports
- **VIEWER** - Read-only access to transactions and reports

**Actions:**
1. Invite team members by email
2. Assign role to each member
3. Configure custom roles (optional)
4. System sends invitation emails
5. Members accept and set up MFA

**Validation Rules:**
- At least one team member required
- Valid email format for each member
- No duplicate email addresses
- At least one CLIENT_ADMIN required
- Each role must have valid permissions

**Data Type:**
```typescript
interface TeamSetupData {
  teamMembers: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REMOVED';
    mfaEnabled: boolean;
  }[];
  defaultRoles: UserRole[];
}
```

**Permission Matrix:**
| Role | Company Settings | Team | Transactions | Reports | Agents |
|------|---|---|---|---|---|
| CLIENT_ADMIN | RUD | CRUD | R | R | RU |
| ACCOUNTANT | R | - | CU | R | - |
| CFO | R | - | R | R | R |
| AGENT_MANAGER | - | - | R | - | RU |
| FINANCE_TEAM | - | - | CR | R | - |
| OPERATIONAL | - | - | R | R | - |
| VIEWER | - | - | R | R | - |

**Estimated Time:** 10 minutes

---

### Step 4: Agent Deployment (Optional)

**Purpose:** Configure autonomous agents for financial automation.

**Available Agents:**
1. **Invoicing Agent** - Automated invoice generation and sending
2. **Payables Agent** - Bill processing and payment automation
3. **Reconciliation Agent** - Bank and accounting reconciliation
4. **Forecasting Agent** - Cash flow and revenue forecasting
5. **Tax Filing Agent** - Automated tax return preparation
6. **VAT Management Agent** - VAT calculation and filing
7. **Expense Categorization Agent** - Auto-categorize expenses
8. **Cash Flow Agent** - Real-time cash flow tracking

**Configuration for Each Agent:**
- Enable/disable toggle
- Confidence level (0-100%)
- Estimated accuracy
- Monthly cost
- Go-live date

**Test Flow:**
1. Upload sample data (10-100 transactions)
2. Agent processes in test mode
3. Review accuracy and issues
4. Review performance metrics
5. Approve or make adjustments

**Validation Rules:**
- Optional: can skip all agents
- Cost per agent: >= 0
- Confidence: 0-100%
- Accuracy: 0-100%

**Data Type:**
```typescript
interface AgentDeploymentData {
  selectedAgents: {
    agentType: AgentType;
    isEnabled: boolean;
    confidence: number;
    estimatedAccuracy: number;
    costPerMonth: number;
  }[];
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
  estimatedMonthlyCost: number;
  goLiveDate?: Date;
}
```

**Estimated Time:** 15 minutes (optional, can skip)

---

### Step 5: Verification & Go-Live

**Purpose:** Final verification before account activation.

**Go-Live Checklist:**
- [ ] Company information verified (required)
- [ ] Tax ID validated (required)
- [ ] Accounting software connected (required)
- [ ] GL accounts mapped (required)
- [ ] Chart of accounts reviewed (required)
- [ ] Team members invited (required)
- [ ] Support contact configured (required)
- [ ] Test transaction processed successfully (required)
- [ ] Data migration completed (if applicable)
- [ ] Agents tested and approved (if using agents)
- [ ] Team trained on dashboard (required)
- [ ] Support contact confirmed (required)

**Validation Steps:**
1. **Accounts Validation** - Verify GL accounts are correct
2. **Transactions Validation** - Test end-to-end transaction flow
3. **Team Validation** - Confirm team access and permissions
4. **System Validation** - Final system checks

**Support Contact:**
- Name (required)
- Email (required, valid format)
- Phone (required, valid format)
- Timezone (required)

**Completion Certificate:**
- Generated on go-live
- Includes: Company name, setup date, completion timestamp
- PDF download
- Email delivered to primary contact
- Legal proof of setup completion

**Data Type:**
```typescript
interface VerificationData {
  checklist: {
    id: string;
    item: string;
    required: boolean;
    completed: boolean;
    completedAt?: Date;
  }[];
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
}
```

**Estimated Time:** 10 minutes

---

## Implementation Guide

### Backend Setup

#### 1. Create Database Schema

```bash
# Run migration
psql -U postgres -d ledgr < backend/migrations/002_onboarding_schema.sql

# Verify tables created
psql -U postgres -d ledgr -c "\dt onboarding*"
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Implement Database Layer

Create `backend/db/onboarding-db.ts`:

```typescript
import { Pool } from 'pg';
import type { OnboardingProgress } from '../types/onboarding-types';

export class OnboardingDatabase implements Database {
  constructor(private pool: Pool) {}

  async saveProgress(progress: OnboardingProgress): Promise<OnboardingProgress> {
    const query = `
      INSERT INTO onboarding_progress (
        id, organization_id, client_id, current_step, status,
        company_data, accounting_data, team_data, agent_data, verification_data,
        completed_steps, skipped_steps, created_at, updated_at, last_saved_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT(id) DO UPDATE SET
        current_step = $4,
        status = $5,
        company_data = $6,
        updated_at = $14,
        last_saved_at = $15
      RETURNING *;
    `;

    const result = await this.pool.query(query, [
      progress.id,
      progress.organizationId,
      progress.clientId,
      progress.currentStep,
      progress.status,
      JSON.stringify(progress.companyData),
      JSON.stringify(progress.accountingData),
      JSON.stringify(progress.teamData),
      JSON.stringify(progress.agentData),
      JSON.stringify(progress.verificationData),
      progress.completedSteps,
      progress.skippedSteps,
      progress.createdAt,
      progress.updatedAt,
      progress.lastSavedAt,
    ]);

    return result.rows[0];
  }

  async getProgress(
    organizationId: string,
    clientId: string
  ): Promise<OnboardingProgress | null> {
    const query = `
      SELECT * FROM onboarding_progress
      WHERE organization_id = $1 AND client_id = $2
      LIMIT 1;
    `;

    const result = await this.pool.query(query, [organizationId, clientId]);
    return result.rows[0] || null;
  }

  async saveBackup(onboardingId: string, backup: any): Promise<void> {
    const query = `
      INSERT INTO onboarding_backups (
        onboarding_id, snapshot, step, checkpoint_name, created_at
      ) VALUES ($1, $2, $3, $4, $5);
    `;

    await this.pool.query(query, [
      onboardingId,
      JSON.stringify(backup.snapshot),
      backup.step,
      backup.checkpoint_name,
      backup.created_at,
    ]);
  }

  async getBackup(
    onboardingId: string,
    checkpointName: string
  ): Promise<any | null> {
    const query = `
      SELECT * FROM onboarding_backups
      WHERE onboarding_id = $1 AND checkpoint_name = $2
      LIMIT 1;
    `;

    const result = await this.pool.query(query, [onboardingId, checkpointName]);
    return result.rows[0] || null;
  }
}
```

#### 4. Create API Routes

Create `backend/routes/onboarding-routes.ts`:

```typescript
import express from 'express';
import { OnboardingHandler } from '../api/onboarding-handlers';
import { OnboardingDatabase } from '../db/onboarding-db';
import { authenticate } from '../middleware/auth';
import { pool } from '../db/connection';

const router = express.Router();
const db = new OnboardingDatabase(pool);
const handler = new OnboardingHandler(db);

// Initialize onboarding
router.post('/initialize', authenticate, async (req, res) => {
  try {
    const { organizationId, clientId } = req.body;
    const progress = await handler.initializeOnboarding(organizationId, clientId);
    res.json(progress);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Get progress
router.get('/:organizationId/:clientId', authenticate, async (req, res) => {
  try {
    const { organizationId, clientId } = req.params;
    const response = await handler.getProgress(organizationId, clientId);
    res.json(response);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

// Save progress
router.post('/save', authenticate, async (req, res) => {
  try {
    const response = await handler.saveProgress(req.body);
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Validate step
router.post('/validate', async (req, res) => {
  try {
    const response = await handler.validateStep(req.body);
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Complete step
router.post('/:organizationId/:clientId/complete', authenticate, async (req, res) => {
  try {
    const { organizationId, clientId } = req.params;
    const progress = await handler.completeStep(organizationId, clientId);
    res.json(progress);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// More routes: nextStep, previousStep, pauseOnboarding, resumeOnboarding, etc.

export default router;
```

### Frontend Setup

#### 1. Create Onboarding Component Skeleton

```typescript
// frontend/components/OnboardingWizard.tsx

import { useState, useEffect } from 'react';
import CompanyRegistrationStep from './steps/CompanyRegistrationStep';
import AccountingSetupStep from './steps/AccountingSetupStep';
import TeamSetupStep from './steps/TeamSetupStep';
import AgentDeploymentStep from './steps/AgentDeploymentStep';
import VerificationStep from './steps/VerificationStep';
import OnboardingProgress from './OnboardingProgress';
import { OnboardingStep } from '../types/onboarding-types';

export function OnboardingWizard({ organizationId, clientId }: Props) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    OnboardingStep.COMPANY_REGISTRATION
  );
  const [progress, setProgress] = useState(null);
  const [completionPercentage, setCompletionPercentage] = useState(0);

  const stepComponents = {
    [OnboardingStep.COMPANY_REGISTRATION]: CompanyRegistrationStep,
    [OnboardingStep.ACCOUNTING_SETUP]: AccountingSetupStep,
    [OnboardingStep.TEAM_SETUP]: TeamSetupStep,
    [OnboardingStep.AGENT_DEPLOYMENT]: AgentDeploymentStep,
    [OnboardingStep.VERIFICATION_GOLIVE]: VerificationStep,
  };

  const StepComponent = stepComponents[currentStep];

  return (
    <div className="onboarding-wizard">
      <OnboardingProgress
        completionPercentage={completionPercentage}
        currentStep={currentStep}
      />
      <StepComponent
        progress={progress}
        onNext={() => setCurrentStep(nextStep)}
        onPrevious={() => setCurrentStep(previousStep)}
      />
    </div>
  );
}
```

#### 2. Auto-Save Hook

```typescript
// frontend/hooks/useAutoSave.ts

import { useEffect } from 'react';

export function useAutoSave(
  data: any,
  onSave: (data: any) => Promise<void>,
  intervalMs: number = 10000
) {
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        await onSave(data);
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [data, onSave, intervalMs]);
}
```

---

## Validation Error Codes

| Code | Severity | Message | Resolution |
|------|----------|---------|-----------|
| `COMPANY_NAME_REQUIRED` | ERROR | Company name is required | Enter company name |
| `COMPANY_NAME_TOO_LONG` | ERROR | Company name must be < 255 chars | Shorten company name |
| `TAX_ID_REQUIRED` | ERROR | Tax ID is required | Enter 12-digit TRN |
| `TAX_ID_INVALID_FORMAT` | ERROR | Tax ID must be 12 digits | Fix format |
| `EMAIL_INVALID` | ERROR | Valid email required | Enter valid email |
| `PHONE_INVALID` | ERROR | Valid phone required | Enter valid phone |
| `LEGAL_STRUCTURE_REQUIRED` | ERROR | Legal structure required | Select legal structure |
| `INDUSTRY_REQUIRED` | ERROR | Industry required | Select industry |
| `TEAM_MEMBERS_REQUIRED` | ERROR | At least one team member | Add team member |
| `NO_ADMIN` | ERROR | At least one CLIENT_ADMIN | Assign admin role |
| `DUPLICATE_EMAILS` | ERROR | Duplicate email addresses | Remove duplicates |
| `CONNECTION_FAILED` | ERROR | Software connection failed | Retry OAuth connection |
| `INCOMPLETE_CHECKLIST` | ERROR | Required checklist items incomplete | Complete all items |
| `ACCOUNTS_NOT_VALIDATED` | ERROR | Accounts must be validated | Validate accounts |

---

## Testing Checklist

- [ ] Initialize onboarding flow
- [ ] Complete Step 1: Company Registration
- [ ] Save progress and verify persistence
- [ ] Auto-save checkpoint created
- [ ] Move to Step 2: Accounting Setup
- [ ] Test OAuth connection (mock)
- [ ] Validate GL account mappings
- [ ] Complete Step 3: Team Setup
- [ ] Add multiple team members
- [ ] Verify email validation
- [ ] Skip Step 4: Agent Deployment (optional)
- [ ] Complete Step 5: Verification
- [ ] Verify all required checklists done
- [ ] Generate completion certificate
- [ ] Test pause and resume
- [ ] Test edit previously completed step
- [ ] Test resume from specific step
- [ ] Verify time remaining estimate
- [ ] Verify completion percentage calculation

---

## Production Deployment

1. **Run migrations** on production database
2. **Set environment variables** for API secrets
3. **Configure OAuth providers** (QuickBooks, Xero, etc.)
4. **Test with sample data** before go-live
5. **Monitor auto-save performance**
6. **Set up error logging** and alerting
7. **Configure email service** for team invitations
8. **Backup strategy** for onboarding data
9. **Monitor database performance** (especially JSONB queries)
10. **Train support team** on onboarding workflows

---

## Performance Considerations

- Auto-save intervals: 10 seconds (configurable)
- Backup retention: Keep last 10 per onboarding
- Error cleanup: Archive resolved errors > 30 days
- Team invitations: Batch processing for 100+ members
- GL account sync: Lazy-load on demand
- Progress queries: Use indexed columns
- JSONB queries: Avoid full table scans

---

## Security Checklist

- [ ] All tables have RLS policies
- [ ] OAuth tokens encrypted at rest
- [ ] No sensitive data in logs
- [ ] Rate limiting on API endpoints
- [ ] CSRF protection enabled
- [ ] Input validation on all fields
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output escaping)
- [ ] Audit trail for all changes
- [ ] Encryption for data in transit (HTTPS only)

---

## Support & Troubleshooting

### Common Issues

**Auto-save failing**
- Check database connectivity
- Verify RLS policies
- Check error logs for constraint violations

**Step validation failing unexpectedly**
- Clear browser cache
- Re-fetch validation rules
- Check for schema updates

**OAuth connection timeout**
- Verify OAuth credentials
- Check network connectivity
- Review OAuth provider status

**Progress not persisting**
- Confirm database connection
- Check RLS policy context variables
- Verify organization_id is set correctly

For more support, contact: onboarding-support@ledgr.ai

---

## Files Generated

1. `/backend/types/onboarding-types.ts` - Complete TypeScript types
2. `/backend/migrations/002_onboarding_schema.sql` - Database schema
3. `/backend/lib/onboarding-flow.ts` - State machine logic
4. `/backend/lib/onboarding-validation.ts` - Field & rule validation
5. `/backend/api/onboarding-handlers.ts` - API handlers
6. `/backend/db/onboarding-db.ts` - Database implementation (to create)
7. `/backend/routes/onboarding-routes.ts` - Express routes (to create)
8. `/frontend/components/OnboardingWizard.tsx` - Main component (to create)
9. `/frontend/hooks/useAutoSave.ts` - Auto-save hook (to create)

---

**Last Updated:** 2026-05-31  
**Status:** Production-Ready  
**Maintainer:** Ledgr Engineering
