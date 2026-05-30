# Ledgr Database Architecture & Role System
**Date:** May 30, 2026  
**Project:** Ledgr - UAE Fintech/Accounting Platform  
**Status:** MVP Phase Planning

---

## Part 1: Database Architecture

### Core Data Model

#### Users Table
```sql
users (
  id: uuid PRIMARY KEY,
  email: string UNIQUE,
  password_hash: string,
  first_name: string,
  last_name: string,
  phone?: string,
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at?: timestamp,
  is_active: boolean
)
```

#### Organizations Table
```sql
organizations (
  id: uuid PRIMARY KEY,
  slug: string UNIQUE,
  name: string,
  industry?: string,
  country: string (default: 'AE'),
  tax_id?: string,
  registration_number?: string,
  fiscal_year_start: date,
  created_by: uuid FK -> users.id,
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at?: timestamp
)
```

#### Organization Members Table
```sql
organization_members (
  id: uuid PRIMARY KEY,
  organization_id: uuid FK -> organizations.id,
  user_id: uuid FK -> users.id,
  role_id: uuid FK -> roles.id,
  invited_by: uuid FK -> users.id,
  joined_at: timestamp,
  invited_at: timestamp,
  accepted_at?: timestamp,
  deleted_at?: timestamp,
  UNIQUE(organization_id, user_id)
)
```

#### Roles Table
```sql
roles (
  id: uuid PRIMARY KEY,
  slug: string UNIQUE,
  name: string,
  description: text,
  organization_id?: uuid FK -> organizations.id (NULL = global system role),
  created_at: timestamp,
  updated_at: timestamp
)
```

#### Permissions Table
```sql
permissions (
  id: uuid PRIMARY KEY,
  slug: string UNIQUE,
  name: string,
  description: text,
  category: string,
  created_at: timestamp
)
```

#### Role Permissions Table
```sql
role_permissions (
  id: uuid PRIMARY KEY,
  role_id: uuid FK -> roles.id,
  permission_id: uuid FK -> permissions.id,
  created_at: timestamp,
  UNIQUE(role_id, permission_id)
)
```

#### Accounts Table
```sql
accounts (
  id: uuid PRIMARY KEY,
  organization_id: uuid FK -> organizations.id,
  name: string,
  account_type: enum ['bank', 'credit_card', 'savings', 'investment', 'loan'],
  currency: string (default: 'AED'),
  balance: decimal(15,2),
  balance_as_of: date,
  status: enum ['active', 'inactive', 'closed'],
  created_at: timestamp,
  updated_at: timestamp,
  UNIQUE(organization_id, name)
)
```

#### Transactions Table
```sql
transactions (
  id: uuid PRIMARY KEY,
  organization_id: uuid FK -> organizations.id,
  account_id: uuid FK -> accounts.id,
  date: date,
  amount: decimal(15,2),
  description: string,
  category?: string,
  status: enum ['pending', 'completed', 'failed'],
  created_at: timestamp,
  updated_at: timestamp,
  INDEX(organization_id, date),
  INDEX(account_id, date)
)
```

#### Contacts Table (VAT, Payroll, Vendors)
```sql
contacts (
  id: uuid PRIMARY KEY,
  organization_id: uuid FK -> organizations.id,
  name: string,
  email?: string,
  phone?: string,
  contact_type: enum ['vendor', 'customer', 'employee', 'service_provider'],
  tax_id?: string,
  address?: text,
  created_at: timestamp,
  updated_at: timestamp,
  UNIQUE(organization_id, name, contact_type)
)
```

#### VAT Returns Table
```sql
vat_returns (
  id: uuid PRIMARY KEY,
  organization_id: uuid FK -> organizations.id,
  period_start: date,
  period_end: date,
  status: enum ['draft', 'filed', 'accepted', 'rejected'],
  total_taxable_supplies: decimal(15,2),
  total_vat_collected: decimal(15,2),
  total_vat_paid: decimal(15,2),
  net_vat: decimal(15,2),
  filed_on?: date,
  created_at: timestamp,
  updated_at: timestamp,
  UNIQUE(organization_id, period_start, period_end)
)
```

#### Audit Log Table
```sql
audit_logs (
  id: uuid PRIMARY KEY,
  organization_id: uuid FK -> organizations.id,
  user_id: uuid FK -> users.id,
  action: string,
  entity_type: string,
  entity_id: uuid,
  changes: json,
  ip_address?: string,
  user_agent?: string,
  created_at: timestamp,
  INDEX(organization_id, created_at)
)
```

### Database Relationships Diagram

```
users (1) ────────── (*) organization_members
         │
         └──────────────── (*) audit_logs

organizations (1) ────────── (*) organization_members
              │           │
              │           └── (1) roles
              │
              ├────────── (*) accounts
              │
              ├────────── (*) transactions
              │
              ├────────── (*) contacts
              │
              └────────── (*) vat_returns

roles (1) ────────── (*) role_permissions
      │
      └────────── (*) organization_members

permissions (1) ────────── (*) role_permissions
```

### Indexes for Performance

```sql
-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Organizations
CREATE INDEX idx_orgs_created_by ON organizations(created_by);
CREATE INDEX idx_orgs_slug ON organizations(slug);

-- Organization Members
CREATE INDEX idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX idx_org_members_role_id ON organization_members(role_id);

-- Transactions (critical for queries)
CREATE INDEX idx_txns_org_date ON transactions(organization_id, date);
CREATE INDEX idx_txns_account_date ON transactions(account_id, date);
CREATE INDEX idx_txns_category ON transactions(category);

-- VAT Returns
CREATE INDEX idx_vat_org_period ON vat_returns(organization_id, period_start);

-- Audit Logs
CREATE INDEX idx_audit_org_date ON audit_logs(organization_id, created_at);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
```

---

## Part 2: Role System Architecture

### Permission Categories

1. **Organization Management**
   - `org.view` - View organization details
   - `org.edit` - Edit organization settings
   - `org.members.manage` - Add/remove members, assign roles
   - `org.delete` - Delete organization

2. **Accounting & Transactions**
   - `accounts.view` - View accounts
   - `accounts.create` - Create accounts
   - `accounts.edit` - Edit accounts
   - `accounts.delete` - Delete accounts
   - `transactions.view` - View transactions
   - `transactions.create` - Create/import transactions
   - `transactions.edit` - Edit transactions
   - `transactions.delete` - Delete transactions
   - `reconciliation.view` - View reconciliation
   - `reconciliation.manage` - Manage reconciliation

3. **Reporting & Analytics**
   - `reports.view` - View reports
   - `reports.export` - Export reports to PDF/Excel
   - `insights.view` - View AI insights/dashboard
   - `audit_logs.view` - View audit logs

4. **Tax & Compliance**
   - `vat.view` - View VAT information
   - `vat.file` - File VAT returns
   - `tax.view` - View tax information
   - `compliance.view` - View compliance status

5. **Contacts & Vendors**
   - `contacts.view` - View contacts
   - `contacts.create` - Add contacts
   - `contacts.edit` - Edit contacts
   - `contacts.delete` - Delete contacts

6. **Payroll (Phase 2)**
   - `payroll.view` - View payroll
   - `payroll.manage` - Manage payroll runs
   - `employees.manage` - Manage employee records

7. **Admin & Security**
   - `audit_logs.view` - View audit logs
   - `security.manage` - Change security settings
   - `api_keys.manage` - Manage API keys
   - `integrations.manage` - Enable/disable integrations

---

## Part 3: MVP Role Definitions (Week 1-6)

### 1. Owner
**Scope:** Full access to organization and all features  
**Permissions:**
- All organization management permissions
- All accounting permissions
- All reporting permissions
- All tax/compliance permissions
- All contact permissions
- Member management
- Audit log access

**Typical User:** Founder, CFO, Business Owner

---

### 2. Admin
**Scope:** Full operational access, limited member management  
**Permissions:**
- All accounting permissions
- All reporting permissions
- All tax/compliance permissions
- All contact permissions
- Organization settings (view only - cannot delete org)
- Member invitations (cannot manage roles for other admins)
- Audit log access

**Typical User:** Finance Manager, Accounting Lead

---

### 3. Accountant
**Scope:** Day-to-day accounting and bookkeeping  
**Permissions:**
- `accounts.view`, `accounts.create`, `accounts.edit`
- `transactions.view`, `transactions.create`, `transactions.edit`
- `reconciliation.view`, `reconciliation.manage`
- `contacts.view`, `contacts.create`, `contacts.edit`
- `reports.view`, `reports.export`
- `audit_logs.view` (self activity only)

**Limitations:**
- Cannot delete accounts or transactions (requires Admin)
- Cannot file VAT returns (requires Admin)
- Cannot manage organization members

**Typical User:** Bookkeeper, Junior Accountant

---

### 4. Viewer/Reader
**Scope:** Read-only access to reports and insights  
**Permissions:**
- `accounts.view`
- `transactions.view`
- `reports.view`, `reports.export`
- `insights.view`
- `vat.view`
- `tax.view`

**Limitations:**
- Cannot create, edit, or delete any data
- Cannot manage anything
- No access to audit logs

**Typical User:** CEO, CFO (for dashboard), External Stakeholder, Investor

---

### 5. Guest (Optional for MVP)
**Scope:** Very limited read-only access  
**Permissions:**
- `reports.view` (dashboard summary only)
- `insights.view` (summary only)

**Limitations:**
- Cannot export
- No access to detailed transactions
- No access to compliance data

**Typical User:** Board member, Limited stakeholder access

---

## Part 4: Phase 2 Role Definitions (Week 7-10)

### New Roles

#### 6. Tax Specialist
**Scope:** Tax filing and compliance management  
**Permissions:**
- All accounting view permissions
- `vat.view`, `vat.file`
- `tax.view`, `tax.file`
- `compliance.view`
- `audit_logs.view` (tax-related only)
- `reports.view`, `reports.export`

**Limitations:**
- Cannot modify transactions
- Cannot modify accounts
- Cannot manage contacts

**Typical User:** Tax consultant, Tax advisor (third-party)

---

#### 7. Payroll Administrator
**Scope:** Employee and payroll management  
**Permissions:**
- `contacts.view`, `contacts.create`, `contacts.edit` (employees only)
- `payroll.view`, `payroll.manage`
- `employees.manage`
- `reports.view`, `reports.export` (payroll reports only)
- `audit_logs.view` (payroll-related only)

**Limitations:**
- Cannot access financial accounts
- Cannot file tax returns
- Cannot manage other organization members

**Typical User:** HR Manager, Payroll Officer

---

#### 8. Auditor (External)
**Scope:** Full read-only access for audit purposes  
**Permissions:**
- `accounts.view`
- `transactions.view`
- `contacts.view`
- `vat.view`
- `tax.view`
- `reports.view`, `reports.export`
- `audit_logs.view`
- `compliance.view`

**Limitations:**
- Completely read-only
- Cannot create or modify anything
- Time-bound (engagement period)

**Typical User:** External auditor, Internal audit team

---

#### 9. CFO (Advanced)
**Scope:** Strategic finance and reporting (subset of Owner)  
**Permissions:**
- All reporting permissions
- All insights and analytics
- `accounts.view`
- `transactions.view`
- `vat.view`
- `tax.view`
- `compliance.view`
- Cannot modify core settings or delete organization

**Limitations:**
- Cannot add/remove members
- Cannot change organization settings
- Cannot delete accounts or transactions

**Typical User:** Chief Financial Officer

---

#### 10. API Integrator
**Scope:** System integrations and third-party connections  
**Permissions:**
- `api_keys.manage`
- `integrations.manage`
- `accounts.view` (for integration setup)
- Permissions based on connected services

**Limitations:**
- Very limited UI access
- Primarily API-driven
- Rate-limited

**Typical User:** Technical integrator, System administrator

---

### Phase 2 Third-Party Ecosystem Roles

#### External Service Provider
**Scope:** Limited access as requested by organization  
**Permissions:** Customizable based on engagement type
- Can be audit-focused (Auditor template)
- Can be tax-focused (Tax Specialist template)
- Can be compliance-focused (Auditor + Tax Specialist hybrid)

---

#### Integrator Partner
**Scope:** System integration on behalf of client  
**Permissions:**
- `api_keys.manage`
- `integrations.manage`
- Delegated permissions based on integration type

---

## Part 5: Week 1-10 Task Breakdown

### Week 1: Foundation & Authentication (MVP)

**Day 1-2: Database Setup**
- [ ] Create PostgreSQL schema with tables from Part 1
- [ ] Create indexes for performance
- [ ] Set up migrations framework
- [ ] Create seed data for testing (demo organization, demo users)

**Day 3: User Authentication**
- [ ] Implement user registration flow
- [ ] Implement login/session management
- [ ] Implement password reset
- [ ] Add email verification (optional for MVP)

**Day 4-5: Organization Setup**
- [ ] Create organization creation flow
- [ ] Implement organization member invitation
- [ ] Create role assignment system (Owner/Admin/Accountant/Viewer)
- [ ] Build permission checking middleware

**Day 6-7: Dashboard Foundation**
- [ ] Create user dashboard layout (from Ledgr prototype)
- [ ] Implement role-based dashboard variants
- [ ] Add organization switcher (if user is in multiple orgs)
- [ ] Create nav menu based on user role

**Day 8: Testing & Security**
- [ ] Write permission checks tests
- [ ] Test role assignments
- [ ] Add CSRF protection
- [ ] Security audit of auth system

**Day 9-10: API Endpoints**
- [ ] Create /auth endpoints (register, login, logout)
- [ ] Create /organizations endpoints
- [ ] Create /users/profile endpoints
- [ ] Create /roles endpoints (admin only)

---

### Week 2: Accounts & Transactions (MVP)

**Day 11-12: Account Management**
- [ ] Create account CRUD endpoints
- [ ] Implement account form UI
- [ ] Add account balance tracking
- [ ] Create account list view with filters

**Day 13-14: Transaction Management**
- [ ] Create transaction CRUD endpoints
- [ ] Implement transaction form UI
- [ ] Add transaction categorization
- [ ] Create transaction list with sorting/filtering
- [ ] Add bulk import (CSV) foundation

**Day 15-16: Reconciliation Foundation**
- [ ] Create reconciliation UI layout
- [ ] Implement match transaction logic
- [ ] Add reconciliation status tracking
- [ ] Create reconciliation reports

**Day 17-18: Dashboard Numbers**
- [ ] Add KPI cards (total balance, monthly spend, etc.)
- [ ] Implement real-time balance calculation
- [ ] Create trend sparklines
- [ ] Add period comparisons

**Day 19-20: Testing & Validation**
- [ ] Test CRUD operations
- [ ] Test permission boundaries (only see own org accounts)
- [ ] Test bulk import error handling
- [ ] Performance test with 10k+ transactions

---

### Week 3: Reporting & Insights (MVP)

**Day 21-22: Report Builder**
- [ ] Create income statement report
- [ ] Create balance sheet report
- [ ] Create cash flow report
- [ ] Implement report filters (date range, account, category)

**Day 23-24: Export Functionality**
- [ ] Add PDF export for reports
- [ ] Add Excel export for reports
- [ ] Implement chart rendering in exports
- [ ] Add branded headers/footers

**Day 25-26: Dashboards & Visualizations**
- [ ] Create spending by category chart
- [ ] Create monthly trend chart
- [ ] Create account breakdown pie chart
- [ ] Implement chart interactivity (drill-down)

**Day 27-28: AI Insights (Phase 2 Preparation)**
- [ ] Design insight card system
- [ ] Create "Spending trends" insight template
- [ ] Create "Budget variance" insight template
- [ ] Build insight generation engine (mock for MVP)

**Day 29-30: Testing & Polish**
- [ ] Test all reports with various data volumes
- [ ] Test export functionality
- [ ] Performance test dashboards
- [ ] Visual QA across browsers

---

### Week 4: VAT & Compliance (MVP)

**Day 31-32: VAT Collection**
- [ ] Create VAT tracking by transaction
- [ ] Build VAT calculation engine
- [ ] Implement VAT category assignment
- [ ] Create VAT dashboard view

**Day 33-34: VAT Returns**
- [ ] Create VAT return form UI
- [ ] Implement VAT return calculations
- [ ] Add return submission workflow
- [ ] Create return history view

**Day 35-36: Compliance Dashboard**
- [ ] Create compliance status overview
- [ ] Add VAT filing deadline alerts
- [ ] Create tax obligation tracker
- [ ] Add regulatory requirement checklist

**Day 37-38: Contact Management**
- [ ] Create contacts CRUD
- [ ] Implement vendor/customer tagging
- [ ] Add contact tax ID tracking
- [ ] Create contact directory

**Day 39-40: Testing & Documentation**
- [ ] Test VAT calculations
- [ ] Test return generation
- [ ] Create compliance documentation
- [ ] User guide for VAT filing

---

### Week 5: Advanced Features & Polish (MVP)

**Day 41-42: Audit Logging**
- [ ] Implement audit trail for all changes
- [ ] Create audit log viewer (Admin only)
- [ ] Add user activity reports
- [ ] Implement data change tracking

**Day 43-44: Settings & Preferences**
- [ ] Create organization settings page
- [ ] Add user preference settings
- [ ] Implement fiscal year configuration
- [ ] Add notification preferences

**Day 45-46: Mobile Responsiveness**
- [ ] Test all pages on mobile
- [ ] Optimize forms for mobile input
- [ ] Test touch interactions
- [ ] Performance test on 3G

**Day 47-48: Accessibility**
- [ ] WCAG 2.1 AA audit
- [ ] Add keyboard navigation
- [ ] Test with screen readers
- [ ] Fix color contrast issues

**Day 49-50: Localization (AE/UAE Focus)**
- [ ] Add Arabic language support (future)
- [ ] Implement RTL support (CSS structure)
- [ ] Localize currency to AED
- [ ] Localize date formats

---

### Week 6: Launch Preparation (MVP)

**Day 51-52: Performance Optimization**
- [ ] Optimize database queries
- [ ] Implement caching strategy
- [ ] Compress assets
- [ ] Optimize images

**Day 53-54: Security Hardening**
- [ ] Penetration testing
- [ ] Rate limiting on endpoints
- [ ] Input validation audit
- [ ] SQL injection prevention check

**Day 55-56: Documentation**
- [ ] API documentation (Swagger/OpenAPI)
- [ ] User guide for all features
- [ ] Admin setup guide
- [ ] Security documentation

**Day 57-58: Soft Launch**
- [ ] Deploy to staging
- [ ] Internal testing
- [ ] Bug fixes
- [ ] Performance monitoring setup

**Day 59-60: Launch & Monitoring**
- [ ] Production deployment
- [ ] Monitoring dashboard setup
- [ ] Error tracking (Sentry/similar)
- [ ] User support preparation
- [ ] Marketing/announcement

---

### Week 7-10: Phase 2 Features

#### Week 7: Payroll Foundation
**Day 61-70:**
- [ ] Employee database structure
- [ ] Salary configuration
- [ ] Tax withholding calculations
- [ ] Payroll run generation
- [ ] Payment distribution tracking

#### Week 8: Advanced Tax & Compliance
**Day 71-80:**
- [ ] Corporate tax return generation
- [ ] Multi-entity tax consolidation
- [ ] Tax projection engine
- [ ] Regulatory change alerts
- [ ] Compliance audit trail

#### Week 9: AI Features
**Day 81-90:**
- [ ] AI-powered expense categorization
- [ ] Predictive cash flow forecasting
- [ ] Budget anomaly detection
- [ ] Invoice matching automation
- [ ] CFO advisory insights

#### Week 10: Managed Services & Polish
**Day 91-100:**
- [ ] Audit readiness toolkit
- [ ] Financial statement generation
- [ ] Managed service workflows
- [ ] Advanced reporting
- [ ] System hardening & scale prep

---

## Implementation Notes

### Database Migration Strategy
- Use migration files (Flyway or similar)
- Each migration is version-controlled
- Can rollback safely
- Seed data migrations for testing

### Authentication Strategy
- JWT tokens for API
- Session cookies for web
- Refresh token rotation
- Optional 2FA for Phase 2

### Authorization Strategy
- Permission-based access control (PBAC)
- Role-based groups for easier management
- Organization-scoped permissions
- Per-endpoint permission checks

### Audit & Compliance
- Every data change logged
- User identity tracked
- Timestamp on all records
- Non-repudiation via signatures (Phase 2)

### Performance Targets
- Dashboard load: <2s
- Report generation: <5s
- Transaction list with 10k items: <1.5s
- API response time: <200ms (p99)

---

**End of Database Architecture & Role System Document**
