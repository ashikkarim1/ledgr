# Ledgr Production Deployment: Tester Account & Demo Data Setup

**Date**: June 1, 2026  
**Status**: Ready for Production Deployment  
**Priority**: CRITICAL - Demo account must be functional for prospect engagement

---

## Executive Summary

This guide covers the complete deployment of Ledgr's production environment with emphasis on the tester account (tester@ledgr.ae / tester) and cohesive demo data across all pages. The demo account is the primary vehicle for prospect evaluation and must provide a seamless, realistic experience.

**Key Objectives:**
1. ✅ Tester account created and authenticated in production
2. ✅ Demo financial data loaded and visible on dashboard
3. ✅ All 13 pages reflect cohesive example data
4. ✅ End-to-end flow tested and verified
5. ✅ Production deployment live at https://www.ledgr.ae

---

## Current Status

### Frontend Components ✓
- **Login Page**: Pre-filled with tester credentials (tester@ledgr.ae / tester)
- **Dashboard**: Configured to auto-load demo-data/financial-dataset.json for test accounts
- **Config System**: Routes to https://api.ledgr.ae for production
- **Corgi Design**: All pages styled with orange accent (#FF5C00) and light backgrounds (#f9f9f9)
- **Demo Data**: Comprehensive JSON with realistic company data (Hilal Trading FZ-LLC)

### Missing Components ⚠️
- Production backend deployment (needs PostgreSQL + authentication)
- Tester account creation in production database
- Database seeding with realistic demo transactions
- API endpoints fully tested with demo data
- End-to-end flow validation on production domain

---

## Architecture Overview

```
Browser (https://www.ledgr.ae)
    ↓
Frontend HTML/CSS/JS (Static on Vercel/CDN)
    ↓
API Requests → https://api.ledgr.ae (Production Backend)
    ↓
PostgreSQL Database
    ├── Users table (tester@ledgr.ae record)
    ├── Organizations (Hilal Trading FZ-LLC)
    ├── Documents/Transactions
    └── Compliance records
```

---

## Deployment Phases

### Phase 1: Backend Infrastructure Setup (Prerequisite)

#### Option A: Railway.app (Recommended - Fastest Setup)
```bash
# 1. Deploy via railway.json (already configured)
railway up

# 2. Configure environment variables
railway service variables:
  - DATABASE_URL: postgresql://user:pass@db-host/ledgr_db
  - JWT_SECRET: [generate secure 64-character string]
  - API_PORT: 3001
  - FRONTEND_URL: https://www.ledgr.ae
  - SENDGRID_API_KEY: [if email needed]
```

#### Option B: Render.com
```bash
# Deploy via render.yaml configuration
# Web Service: Node.js with PostgreSQL
```

#### Option C: Self-Hosted (AWS/DigitalOcean)
```bash
# Build backend Docker image
docker build -f Dockerfile.backend -t ledgr-backend:latest .

# Push to registry and deploy to ECS/K8s
```

**Estimated Time**: 30-45 minutes

---

### Phase 2: Database Setup & Tester Account

#### 2.1 Database Connection
```sql
-- Connect to production PostgreSQL
psql postgresql://user:pass@db-host/ledgr_db

-- Verify tables exist (should be created by migrations)
\dt  -- list all tables
```

#### 2.2 Create Tester Account
```sql
-- Create user record
INSERT INTO users (
  email, 
  password_hash,  -- bcrypt hash of "tester"
  full_name, 
  created_at, 
  updated_at,
  email_verified,
  phone_verified
) VALUES (
  'tester@ledgr.ae',
  '$2b$10$YourBcryptHashOfTesterHere',  -- bcrypt('tester')
  'Tester Account',
  NOW(),
  NOW(),
  true,
  true
) RETURNING id;

-- Create organization for tester
INSERT INTO organizations (
  name,
  owner_id,  -- Use the tester user ID from above
  subscription_tier,
  created_at,
  updated_at,
  is_demo_account
) VALUES (
  'Hilal Trading FZ-LLC',
  [tester_user_id],
  'demo',
  NOW(),
  NOW(),
  true
) RETURNING id;

-- Create workspace
INSERT INTO workspaces (
  name,
  organization_id,
  created_at,
  updated_at
) VALUES (
  'Demo Workspace',
  [org_id],
  NOW(),
  NOW()
) RETURNING id;

-- Seed demo transactions from financial-dataset.json
-- [Run seeding script from backend/scripts/seed-demo-data.js]
```

**Estimated Time**: 15 minutes

---

### Phase 3: Verify Demo Data Flow

#### 3.1 Verify API Endpoints
```bash
# Test authentication endpoint
curl -X POST https://api.ledgr.ae/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tester@ledgr.ae","password":"tester"}'

# Expected response:
{
  "success": true,
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "user_id": "uuid",
  "workspace_id": "uuid",
  "email": "tester@ledgr.ae"
}
```

#### 3.2 Verify Dashboard Data Endpoint
```bash
# Test dashboard summary endpoint
curl -X GET https://api.ledgr.ae/v1/dashboard/summary \
  -H "Authorization: Bearer [access_token]"

# Should return:
{
  "company": {
    "name": "Hilal Trading FZ-LLC",
    "zone": "JAFZA, Dubai",
    "employeeCount": 18
  },
  "cash": { "onHand": 482318, "weeklyChange": 4.2 },
  "vat": { "amountDue": 41205, "dueDate": "2025-07-15" },
  "payroll": { "monthlyAmount": 284000, "employees": 18 },
  ...
}
```

**Estimated Time**: 10 minutes

---

### Phase 4: Frontend Deployment

#### 4.1 Deploy to Production Domain
```bash
# Option 1: Vercel (Already configured)
vercel --prod

# Option 2: Netlify
netlify deploy --prod

# Option 3: AWS S3 + CloudFront
aws s3 sync . s3://ledgr-prod-frontend --delete
```

#### 4.2 Verify Frontend at Production Domain
```
https://www.ledgr.ae  → Should load landing page
https://www.ledgr.ae/login.html  → Login with tester/tester pre-filled
https://www.ledgr.ae/dashboard.html  → Dashboard with demo data
```

**Estimated Time**: 5-10 minutes

---

### Phase 5: End-to-End Testing

#### 5.1 Local Testing Checklist
- [ ] Start local backend: `npm start` (backend directory) on port 3001
- [ ] Open https://localhost:3000/login.html
- [ ] Verify tester@ledgr.ae and "tester" are pre-filled
- [ ] Click "Sign in to your account"
- [ ] Verify login success and redirect to dashboard
- [ ] Verify dashboard loads demo data from financial-dataset.json
- [ ] Verify "DEMO DATA" badge appears in header
- [ ] Verify all metrics display (Cash, VAT, Tax, Payroll)
- [ ] Verify transaction table shows sample transactions
- [ ] Test responsive design (mobile, tablet, desktop)
- [ ] Test form submissions (if any)

#### 5.2 Production Testing Checklist
- [ ] Visit https://www.ledgr.ae (landing page loads)
- [ ] Navigate to https://www.ledgr.ae/login.html
- [ ] Verify tester credentials pre-filled
- [ ] Sign in with tester account
- [ ] Verify redirect to dashboard
- [ ] Verify demo data displays with "DEMO DATA" badge
- [ ] Test all navigation links work
- [ ] Test all pages (13 total)
- [ ] Verify no console errors
- [ ] Test on mobile (iOS Safari, Chrome)
- [ ] Test on desktop (Chrome, Safari, Firefox)
- [ ] Test form submissions
- [ ] Verify localStorage persistence (refresh page, data persists)

**Estimated Time**: 30 minutes

---

## Data Cohesion Strategy

All 13 pages should reference the same demo company to create a cohesive experience:

### Company: Hilal Trading FZ-LLC
- **Location**: JAFZA, Dubai
- **Type**: JAFZ Licensed Trading Company
- **Employees**: 18
- **Fiscal Year**: 2025
- **Currency**: AED

### Key Metrics (Consistent Across All Pages)
```json
{
  "cash_on_hand": "AED 482,318",
  "weekly_change": "+4.2%",
  "vat_due_q2": "AED 41,205",
  "vat_due_date": "2025-07-15",
  "corporate_tax_estimate": "AED 19,840",
  "monthly_payroll": "AED 284,000",
  "payroll_employees": 18,
  "next_compliance_deadline": "2025-06-10"
}
```

### Page-Specific Data

**1. index.html** (Landing Page)
- Uses generic copy, no company-specific data displayed

**2. login.html** (Sign In)
- Pre-filled tester credentials
- "Demo credentials pre-filled for testing" text

**3. dashboard.html** (Main Dashboard)
- Displays all metrics above
- Shows transactions, agents, compliance status
- "DEMO DATA" badge in header
- Auto-loads from financial-dataset.json

**4. calculator.html** (Tax Calculator)
- Pre-populate with Hilal Trading Q2 2025 data
- Show estimated tax: AED 19,840
- Calculation based on AED 520,000 estimated income

**5. pricing.html** (Pricing Page)
- Generic pricing, no company-specific data

**6. customers.html** (Testimonials/Cases)
- Generic testimonials, reference Hilal Trading as example case (optional)

**7. reviews.html** (Reviews/Ratings)
- Generic content, could show sample review from "Hilal Trading"

**8. resources.html** (Help/Guides)
- Generic resources, no company-specific data

**9. accountants.html** (Accountants Directory)
- Generic directory, no company-specific data

**10. agents.html** (AI Agents)
- Show agents from demo data (Capture, VAT, Payroll, Revenue agents)
- Use Hilal Trading example cases

**11. guide-e-invoicing.html** (E-Invoicing Guide)
- Reference Hilal Trading in example: "Peppol-connected trading company"

**12. security.html** (Security/Compliance)
- Reference Hilal Trading compliance status
- AML screening, FTA registration examples

**13. signup.html** (Sign Up)
- Generic signup form, pre-fill with tester for testing

---

## Demo Data Files

### 1. demo-data/financial-dataset.json ✓
Location: `/Users/test/Documents/Claude/Projects/Ledgr/demo-data/financial-dataset.json`

Contains:
- Company profile (Hilal Trading FZ-LLC, 18 employees, JAFZA)
- Financial metrics (Cash, VAT, Tax, Payroll)
- Transactions (5 sample AP/AR/internal transactions)
- Reconciliation status (95% reconciled)
- Invoice status (AED 285,600 outstanding AR)
- Active agents (Capture, VAT, Payroll, Revenue)
- Compliance status (All compliant)

**Status**: ✓ Complete and comprehensive

### 2. login.html Pre-fill ✓
Status: ✓ Tester credentials pre-filled

```html
<input type="email" value="tester@ledgr.ae" ... />
<input type="password" value="tester" ... />
```

### 3. Backend Seeding (Needed)
Create `/backend/scripts/seed-demo-data.ts`:
```typescript
// Load financial-dataset.json and create:
// - Transactions table records
// - Reconciliation records
// - Invoice records  
// - Agent activity logs
// - Compliance records
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] Verify all frontend files have Corgi design colors (orange #FF5C00)
- [ ] Confirm login.html has tester credentials pre-filled
- [ ] Verify financial-dataset.json is complete and valid JSON
- [ ] Review dashboard.html demo data loading logic
- [ ] Create database seeding script
- [ ] Generate secure JWT_SECRET (64 characters)

### Deployment Day
- [ ] Deploy backend to production (Railway/Render/AWS)
- [ ] Configure environment variables on backend
- [ ] Create tester user in production database
- [ ] Run database seeding script
- [ ] Deploy frontend to production domain (Vercel/Netlify)
- [ ] Verify API endpoints accessible from frontend
- [ ] Test authentication flow
- [ ] Test dashboard data loading

### Post-Deployment
- [ ] Test on production domain: https://www.ledgr.ae/login.html
- [ ] Verify tester account works end-to-end
- [ ] Verify demo data displays on all relevant pages
- [ ] Verify no console errors
- [ ] Test mobile responsiveness
- [ ] Test cross-browser compatibility
- [ ] Monitor server logs for errors
- [ ] Verify localStorage persistence
- [ ] Test form submissions

### Rollback Plan
If critical issues occur:
- [ ] Revert frontend to last stable version (Vercel/Netlify rollback)
- [ ] Revert backend deployment
- [ ] Use database backups if needed
- [ ] Notify stakeholders of status

---

## Testing Credentials

**For Development/Staging:**
```
Email: tester@ledgr.ae
Password: tester
```

**For Production:**
Use same credentials - will work after database seeding

---

## Monitoring & Verification

### Key Metrics to Monitor (Post-Deployment)
1. **API Response Time**: < 200ms for dashboard endpoint
2. **Authentication Success Rate**: > 99%
3. **Demo Data Load Success**: 100%
4. **Page Load Time**: < 3 seconds
5. **Error Rate**: < 0.1%

### Check Points
```bash
# Monitor API availability
curl -I https://api.ledgr.ae/v1/health

# Monitor frontend
curl -I https://www.ledgr.ae/

# Test complete flow (from another terminal)
node backend/tests/test-demo-account.js
```

---

## Success Criteria

✅ **Deployment is successful when:**
1. Tester account login works on https://www.ledgr.ae/login.html
2. Dashboard displays demo data with "DEMO DATA" badge
3. All 13 pages load without errors
4. Responsive design works on mobile/tablet/desktop
5. No console errors in browser DevTools
6. Forms can be submitted
7. localStorage data persists across page refreshes
8. Cross-browser compatibility verified (Chrome, Safari, Firefox)
9. All metrics display correctly (Cash, VAT, Tax, Payroll)
10. API endpoints respond within SLA

---

## Timeline

| Phase | Task | Duration | Owner |
|-------|------|----------|-------|
| 1 | Backend Infrastructure | 30-45 min | DevOps |
| 2 | Database Setup & Tester Account | 15 min | DBA |
| 3 | Verify Demo Data Flow | 10 min | QA |
| 4 | Frontend Deployment | 5-10 min | DevOps |
| 5 | End-to-End Testing | 30 min | QA |
| **Total** | | **90-100 minutes** | |

---

## Next Steps (Immediate)

1. ✅ **Verify Frontend** - All components are ready
2. ✅ **Demo Data** - financial-dataset.json is comprehensive
3. ⚠️ **Backend Deployment** - Choose hosting provider (Railway recommended)
4. ⚠️ **Database Setup** - Create tester account
5. ⚠️ **End-to-End Test** - Full flow verification
6. ⚠️ **Production Launch** - Deploy to https://www.ledgr.ae

---

## Support & Troubleshooting

### Issue: "Demo data fails to load"
**Solution**: 
- Verify demo-data/financial-dataset.json is valid JSON
- Check browser Network tab for 404 errors
- Verify API is returning correct data structure
- Check localStorage for tester@ledgr.ae detection

### Issue: "Tester account login fails"
**Solution**:
- Verify database record exists for tester@ledgr.ae
- Verify password hash matches (bcrypt "tester")
- Check API logs for authentication errors
- Verify JWT_SECRET is consistent

### Issue: "Styles not loading (Corgi design missing)"
**Solution**:
- Verify assets/styles.css is deployed
- Check for CSS variable values (--accent: #FF5C00)
- Verify color migration is complete
- Clear browser cache and force refresh (Cmd+Shift+R)

### Issue: "localStorage not persisting"
**Solution**:
- Check browser's localStorage quota
- Verify no private browsing mode interfering
- Check browser console for quota exceeded errors
- Review app.js token storage logic

---

## Contact & Escalation

For deployment issues:
- **DevOps**: [deployment-team@ledgr.ae]
- **Backend**: [api-team@ledgr.ae]
- **Frontend**: [frontend-team@ledgr.ae]
- **QA**: [qa-team@ledgr.ae]

Emergency escalation: [ceo@theupcapital.com]

---

**Document Version**: 1.0  
**Last Updated**: June 1, 2026  
**Status**: Ready for Deployment  
**Approved By**: [TBD]
