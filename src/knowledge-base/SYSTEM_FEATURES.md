# System Features Guide

## Overview
Ledgr is an autonomous finance function platform designed for UAE businesses. This guide covers all core system features.

---

## Dashboard

### What is the Dashboard?
The Dashboard is your command center—it shows real-time financial snapshots, agent activity, and key metrics at a glance.

### Dashboard Views
- **Summary View**: Month-to-date revenue, expenses, cash flow
- **Agent Activity**: Shows which agents are running and what they're automating
- **Alerts**: Critical issues requiring attention
- **Quick Actions**: Fast access to common tasks

### Customizing Your Dashboard
1. Go to **Settings** → **Dashboard**
2. Toggle which widgets appear
3. Reorder cards by dragging
4. Set your preferred currency & date range

**Role Permissions:**
- Admins: Can customize for entire organization
- CFOs: Can customize personal view
- Accountants: Can view but not customize

---

## Transaction Management

### Recording Transactions
**Step 1:** Click **+ New Transaction**
**Step 2:** Select transaction type (Income, Expense, Transfer)
**Step 3:** Enter:
- Amount
- Account (which account was affected)
- Category (e.g., "Office Supplies")
- Description (brief note)
- Date
**Step 4:** Click **Save**

### Reconciliation
Bank reconciliation matches your records to bank statements.

1. **Import Statement**: Upload CSV/OFX from your bank
2. **Review Differences**: See unmatched transactions
3. **Match Transactions**: Drag-and-drop or auto-match
4. **Resolve Discrepancies**: Investigate mismatches
5. **Finalize**: Mark as reconciled

**Common Discrepancies:**
- Timing: Transaction recorded on different dates
- Amount mismatch: Usually typo or duplicate
- Missing transactions: Check date range

---

## Financial Reports

### Report Types Available

**Profit & Loss (P&L)**
- Shows revenue vs expenses over a period
- Use for monthly, quarterly, yearly reviews
- Helps forecast future performance

**Balance Sheet**
- Snapshot of assets, liabilities, equity
- Required for year-end filings
- Shows financial health

**Cash Flow**
- Tracks money in/out month-by-month
- Critical for SMEs managing cash
- Predicts shortages

**Budget vs Actual**
- Compares planned vs actual spending
- Identifies overspending by category
- Good for financial control

### Generating Reports
1. Go to **Reports** → Select report type
2. Choose date range
3. Select accounts/departments (optional)
4. Click **Generate**
5. Export as PDF, Excel, or CSV

### Interpreting Reports
- Compare month-over-month for trends
- Investigate large variances
- Use for board meetings, investor updates, tax filing

---

## User Management & Permissions

### User Roles Explained

**Admin**
- Full system access
- Can add/remove users
- Can configure integrations
- Can set compliance rules
- **Use for:** Owners, finance directors

**CFO / Finance Manager**
- Strategic planning access
- Can create forecasts
- Full reporting access
- Cannot modify user permissions
- **Use for:** Finance leadership

**Accountant**
- Day-to-day transaction access
- Can categorize, reconcile
- Can run reports
- Cannot manage users
- **Use for:** Accounting team members

**Viewer**
- Read-only access
- Can view reports & dashboards
- Cannot modify anything
- **Use for:** Board members, external auditors

### Adding a User
1. Go to **Settings** → **Team Members**
2. Click **+ Invite User**
3. Enter email address
4. Select role
5. Click **Send Invite**
6. User receives email with onboarding link

---

## Integrations Overview

### Supported Integrations

**QuickBooks Online**
- Sync transactions, customers, vendors
- Real-time bank feeds
- Auto-categorization

**Xero**
- Multi-currency support
- Automated workflows
- Project tracking integration

**Plaid (Bank Connections)**
- Real-time bank feeds
- 13,000+ banks supported
- Auto-categorization from merchant data

**Coming Soon**
- Stripe & Square (payments)
- Shopify (e-commerce)
- NetSuite (enterprise)

---

## Workflows & Automation

### What Can Be Automated?

**Data Capture**
- Auto-pull bank transactions
- Invoice scanning → expense categorization
- Duplicate detection

**Reconciliation**
- Auto-match transactions
- Flag odd patterns
- Monthly balance checks

**Reporting**
- Auto-generate P&L
- Schedule report delivery
- Alert on budget overruns

### Setting Up Workflows
1. Go to **Workflows** → **+ New Workflow**
2. Select trigger (e.g., "Daily at 8am")
3. Select action (e.g., "Sync QB")
4. Set conditions (optional)
5. Save

---

## Data Security & Compliance

### Data Encryption
- All data encrypted in transit (TLS 1.2+)
- At rest: AES-256
- Bank-level security

### Backups
- Automatic daily backups
- 30-day retention
- Disaster recovery plan in place

### Compliance Standards
- UAE Central Bank regulations
- GDPR-ready
- SOC 2 Type II certified
- Audit-ready logs

### Two-Factor Authentication
**Enable 2FA:**
1. Go to **Settings** → **Security**
2. Click **Enable 2FA**
3. Scan QR code with authenticator app
4. Save backup codes
5. You're secure!

---

## Support & Help

### Getting Help
- **In-app Help:** Click the ? icon
- **Help Centre:** https://ledgr.io/help
- **Email:** support@ledgr.io
- **WhatsApp:** +971-xxxxxxx

### Common Issues

**"Why is my balance wrong?"**
→ See the Reconciliation section above

**"Where's my data?"**
→ Check the date range filter on your dashboard

**"Can I undo a transaction?"**
→ Yes! Edit transactions anytime before reconciliation

---

## Glossary

**Reconciliation**: Matching your records to bank statements
**SKU**: Stock Keeping Unit (product code)
**P&L**: Profit & Loss statement
**API**: Interface for connecting apps
**Merchant Category Code (MCC)**: Standardized code for transaction type
**Two-Factor Authentication (2FA)**: Extra security using phone + password

---

*Last updated: May 2024*
*Need more help? Contact support@ledgr.io*
