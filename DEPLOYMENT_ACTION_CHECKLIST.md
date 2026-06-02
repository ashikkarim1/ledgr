# Ledgr Production Deployment - Action Checklist

**Status**: Ready for Immediate Deployment  
**Last Updated**: June 1, 2026  
**Estimated Duration**: 90-100 minutes  

---

## ✅ Pre-Flight Verification (5 minutes)

- [ ] **Frontend Files**: All 13 HTML pages present and contain Corgi design colors
- [ ] **Demo Data**: /demo-data/financial-dataset.json exists and is valid JSON
- [ ] **Login Page**: tester@ledgr.ae and "tester" pre-filled in login.html
- [ ] **Config**: assets/config.js routes to https://api.ledgr.ae for production
- [ ] **Assets**: styles.css has orange accent (#FF5C00) and light background (#f9f9f9)

**Verification Command:**
```bash
# Check critical files exist
ls -la /Users/test/Documents/Claude/Projects/Ledgr/login.html
ls -la /Users/test/Documents/Claude/Projects/Ledgr/demo-data/financial-dataset.json
ls -la /Users/test/Documents/Claude/Projects/Ledgr/assets/config.js
```

---

## 🚀 Phase 1: Backend Deployment (30-45 minutes)

### Option A: Railway.app (RECOMMENDED - Fastest)

- [ ] **1.1** Go to https://railway.app and create account (if needed)
- [ ] **1.2** Connect GitHub repository: https://github.com/[your-account]/ledgr
- [ ] **1.3** Create new project → Select "Deploy from GitHub" → Choose Ledgr repo
- [ ] **1.4** Configure environment variables in Railway dashboard:
  - [ ] `DATABASE_URL`: postgresql://user:pass@db-host/ledgr_db
  - [ ] `JWT_SECRET`: [Generate 64-char secret, e.g., openssl rand -base64 48]
  - [ ] `API_PORT`: 3001
  - [ ] `FRONTEND_URL`: https://www.ledgr.ae
  - [ ] `NODE_ENV`: production
- [ ] **1.5** Deploy backend: Railway will auto-deploy on push
- [ ] **1.6** Verify API is live: Curl or browser visit https://api.ledgr.ae/v1/health
- [ ] **1.7** Check logs for any startup errors

### Option B: Render.com

- [ ] **1.1** Go to https://render.com and create account
- [ ] **1.2** Create "New Web Service" → Connect GitHub
- [ ] **1.3** Select Ledgr repository
- [ ] **1.4** Configure:
  - [ ] Name: ledgr-api
  - [ ] Runtime: Node
  - [ ] Build command: npm install
  - [ ] Start command: node dist/server.js
- [ ] **1.5** Add environment variables (same as Railway)
- [ ] **1.6** Deploy and monitor build logs
- [ ] **1.7** Verify API endpoint responds

### Option C: AWS / DigitalOcean (Manual)

- [ ] **1.1** Set up PostgreSQL database
- [ ] **1.2** Provision Node.js server (t2.small or better)
- [ ] **1.3** Clone repository: git clone [repo-url]
- [ ] **1.4** Install dependencies: npm install
- [ ] **1.5** Configure environment variables
- [ ] **1.6** Run migrations: npm run migrate
- [ ] **1.7** Start server: npm start (or use PM2)
- [ ] **1.8** Verify API responding on correct port

**Verification:**
```bash
curl https://api.ledgr.ae/v1/health
# Should return: { "status": "ok" } or similar
```

---

## 🗄️ Phase 2: Database Setup (15 minutes)

### 2.1 Create Tester User

```bash
# SSH into database server or use database client
psql postgresql://user:pass@db-host/ledgr_db

# Insert tester account (Replace bcrypt hash with actual hash of "tester")
INSERT INTO users (
  email,
  password_hash,
  full_name,
  created_at,
  updated_at,
  email_verified,
  phone_verified
) VALUES (
  'tester@ledgr.ae',
  '$2b$10$R9h7cIPsMf09QILLbZJ66OYjuLHtFtHOvIgn.E6dUbtlJ5pJO4yYG',  -- bcrypt hash of "tester"
  'Tester Account',
  NOW(),
  NOW(),
  true,
  true
) RETURNING id as tester_id;

# Save the returned user ID (we'll need it next)
```

### 2.2 Create Organization & Workspace

```sql
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
  [INSERT_TESTER_ID_HERE],
  'demo',
  NOW(),
  NOW(),
  true
) RETURNING id as org_id;

-- Create workspace
INSERT INTO workspaces (
  name,
  organization_id,
  created_at,
  updated_at
) VALUES (
  'Demo Workspace',
  [INSERT_ORG_ID_HERE],
  NOW(),
  NOW()
) RETURNING id;

-- Verify tester can be queried
SELECT id, email, full_name FROM users WHERE email = 'tester@ledgr.ae';
```

### 2.3 Seed Demo Transactions (Optional)

If backend has seeding script:
```bash
npm run seed:demo-data -- --user=tester@ledgr.ae --company="Hilal Trading FZ-LLC"
```

Otherwise, transactions will be created on first dashboard load.

**Verification:**
```bash
# Test login endpoint
curl -X POST https://api.ledgr.ae/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tester@ledgr.ae","password":"tester"}'

# Should return: { "access_token": "...", "refresh_token": "...", ... }
```

---

## 🌐 Phase 3: Frontend Deployment (5-10 minutes)

### Option A: Vercel (RECOMMENDED)

- [ ] **3.1** Go to https://vercel.com and connect GitHub
- [ ] **3.2** Import Ledgr project
- [ ] **3.3** Configure environment variables:
  - [ ] `VITE_API_URL`: https://api.ledgr.ae
  - [ ] (No other vars needed - config.js auto-detects)
- [ ] **3.4** Deploy to production
- [ ] **3.5** Configure custom domain: www.ledgr.ae → Vercel project
- [ ] **3.6** Update DNS: Point ledgr.ae to Vercel nameservers

### Option B: Netlify

- [ ] **3.1** Connect GitHub at https://netlify.com
- [ ] **3.2** Import repository
- [ ] **3.3** Build command: None (static files)
- [ ] **3.4** Publish directory: . (root)
- [ ] **3.5** Deploy and configure custom domain

### Option C: AWS S3 + CloudFront

```bash
# Build static files (if needed)
npm run build

# Deploy to S3
aws s3 sync . s3://ledgr-prod-frontend/ --delete

# CloudFront will serve from CDN
```

**Verification:**
```bash
# Test frontend accessibility
curl -I https://www.ledgr.ae/login.html
# Should return: 200 OK

# Verify pre-filled credentials visible
curl https://www.ledgr.ae/login.html | grep 'tester@ledgr.ae'
```

---

## 🧪 Phase 4: End-to-End Testing (30 minutes)

### 4.1 Local Testing (Before Production)

```bash
# Terminal 1: Start backend locally
cd backend
npm install
npm start
# Should log: "Server running on http://localhost:3001"

# Terminal 2: Serve frontend locally
cd /Users/test/Documents/Claude/Projects/Ledgr
python -m http.server 8000
# Navigate to http://localhost:8000/login.html
```

### 4.2 Testing Checklist

- [ ] **Login Page**
  - [ ] Open http://localhost:8000/login.html (or https://www.ledgr.ae/login.html)
  - [ ] Verify email field shows: tester@ledgr.ae
  - [ ] Verify password field shows: tester
  - [ ] Verify text: "Demo credentials pre-filled for testing" is visible

- [ ] **Authentication**
  - [ ] Click "Sign in to your account" button
  - [ ] Wait for redirect (should take < 2 seconds)
  - [ ] Verify redirect to /dashboard.html

- [ ] **Dashboard**
  - [ ] Verify page loads successfully
  - [ ] Check for "DEMO DATA" badge in header
  - [ ] Verify metrics display:
    - [ ] Cash on hand: AED 482,318
    - [ ] VAT due: AED 41,205
    - [ ] Tax estimate: AED 19,840
    - [ ] Payroll: AED 284,000
  - [ ] Verify transaction table shows sample transactions
  - [ ] Verify agent list shows active agents
  - [ ] Verify compliance status displays

- [ ] **Responsive Design**
  - [ ] Test on mobile (DevTools mobile view: 375px width)
  - [ ] Test on tablet (768px width)
  - [ ] Test on desktop (1440px width)
  - [ ] Verify all elements readable and clickable

- [ ] **Navigation**
  - [ ] Click all navigation links
  - [ ] Verify no 404 errors
  - [ ] Check browser console (should be empty of errors)

- [ ] **localStorage Persistence**
  - [ ] Log in successfully
  - [ ] Refresh page (Cmd/Ctrl + R)
  - [ ] Verify still logged in (dashboard displays demo data)
  - [ ] Open browser DevTools → Application → localStorage
  - [ ] Verify these keys exist:
    - [ ] user_email: tester@ledgr.ae
    - [ ] ledgr_access_token: (should have value)
    - [ ] ledgr_workspace_id: (should have value)

### 4.3 Cross-Browser Testing

- [ ] **Chrome**: https://www.ledgr.ae/login.html → Login → Dashboard works
- [ ] **Safari**: Same flow
- [ ] **Firefox**: Same flow
- [ ] **Mobile Safari (iOS)**: Test on phone or simulator
- [ ] **Chrome Mobile (Android)**: Test on phone or simulator

**All tests should pass without console errors (F12 → Console)**

---

## 📋 Production Validation (10 minutes)

Once deployed to production:

- [ ] **Domain Check**
  - [ ] https://www.ledgr.ae loads landing page
  - [ ] https://ledgr.ae redirects to www.ledgr.ae
  - [ ] https://app.ledgr.ae works (if configured)

- [ ] **API Endpoint Check**
  - [ ] https://api.ledgr.ae/v1/health responds
  - [ ] API logs show activity

- [ ] **Complete Production Flow**
  - [ ] Open https://www.ledgr.ae/login.html in incognito/private window
  - [ ] Verify tester@ledgr.ae is pre-filled
  - [ ] Verify password "tester" is pre-filled
  - [ ] Click "Sign in"
  - [ ] Verify redirect to dashboard
  - [ ] Verify "DEMO DATA" badge displays
  - [ ] Verify all metrics display correctly
  - [ ] Verify no console errors (F12 → Console)

- [ ] **Performance Check**
  - [ ] Page load time < 3 seconds (use DevTools Network tab)
  - [ ] Largest Contentful Paint (LCP) < 2.5 seconds
  - [ ] No network 404 or 500 errors

- [ ] **Security Check**
  - [ ] All resources loaded over HTTPS
  - [ ] No mixed content warnings
  - [ ] Verify CORS headers are correct

---

## ✅ Deployment Complete

When all items checked:

- [ ] **Create Commit**: "Deploy: Production tester account and demo data setup"
  ```bash
  git add .
  git commit -m "Deploy: Production tester account with demo data

  - Backend deployed to https://api.ledgr.ae
  - Tester account created: tester@ledgr.ae / tester
  - Demo data loaded from financial-dataset.json
  - Frontend deployed to https://www.ledgr.ae
  - All 13 pages tested and verified"
  ```

- [ ] **Notify Stakeholders**: Share login credentials and demo data with prospects/stakeholders
  
  Email template:
  ```
  Subject: Ledgr Demo Account Ready - Start Your Free Trial
  
  Hello,
  
  Your Ledgr demo account is ready! You can now experience the platform 
  with a realistic demo company (Hilal Trading FZ-LLC) showing:
  
  ✓ Real-time financial metrics (Cash, VAT, Tax, Payroll)
  ✓ Transaction processing and categorization
  ✓ AI agents in action (Capture, VAT, Payroll, Revenue agents)
  ✓ Compliance status and reporting
  ✓ Dashboard visualizations
  
  Demo Credentials:
  Email: tester@ledgr.ae
  Password: tester
  
  Visit: https://www.ledgr.ae/login.html to start
  
  Questions? Contact us at [support-email]
  ```

- [ ] **Monitor**: Check API logs and frontend error tracking for issues

- [ ] **Schedule Followup**: Plan prospect demos and evaluation sessions

---

## 🆘 Rollback Plan (If Needed)

If critical issues occur during deployment:

```bash
# Option 1: Revert frontend
vercel rollback  # (Vercel)
# OR manually redeploy previous version

# Option 2: Revert backend
railway down  # (Railway)
# OR redeploy to previous version

# Option 3: Restore database from backup
# Contact your DBA to restore from backup snapshot

# Notify all stakeholders of incident
```

---

## 🎯 Success Criteria

**Deployment is successful when:**

✅ Tester account login works  
✅ Dashboard displays demo data with badge  
✅ All 13 pages load without errors  
✅ Mobile design responsive  
✅ No console errors  
✅ localStorage persists  
✅ Cross-browser compatible  
✅ API response time < 200ms  
✅ Page load time < 3 seconds  
✅ Authentication success rate > 99%  

---

## 📞 Support

For issues during deployment:

- **API Issues**: Check https://api.ledgr.ae/v1/health
- **Database Issues**: Check database logs
- **Frontend Issues**: Check browser console (F12)
- **Authentication Issues**: Verify tester account exists in database
- **Demo Data Issues**: Verify financial-dataset.json is accessible

Contact: [deployment-team@ledgr.ae]

---

**Status**: Ready to Deploy  
**Estimated Time**: 90-100 minutes  
**Owner**: [Your Name]  
**Approved**: [TBD]

---

**Next Step**: Start Phase 1 - Backend Deployment
