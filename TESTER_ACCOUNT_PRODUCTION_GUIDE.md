# Ledgr Tester Account - Production Deployment Guide

## Overview
This guide covers deploying the tester account experience to **ledgr.ae (production)** for prospect demos. The tester account provides a complete, realistic financial dashboard powered by comprehensive mock data.

---

## 1. Test Account Credentials

**Email:** `tester@ledgr.ae`  
**Password:** `tester`

These credentials are:
- Pre-filled in `/login.html` for easy access
- Available on production for prospect sign-in
- Linked to comprehensive mock financial data

---

## 2. Files Configured for Production

### A. Frontend Files (Static)

#### `/login.html`
- ✅ Test credentials pre-filled: `tester@ledgr.ae` / `tester`
- ✅ Stores user email in localStorage for test account detection
- ✅ Updated to support ledgr.ae domain
- **Status:** Ready for production

#### `/dashboard.html`
- ✅ Auto-detects test account via email in localStorage
- ✅ Loads `/demo-data/financial-dataset.json` automatically
- ✅ Displays "DEMO DATA" badge in header
- ✅ Transforms financial data into dashboard format
- ✅ Fallback to generic demo data if JSON fails
- **Status:** Ready for production

#### `/assets/config.js`
- ✅ Updated to recognize `ledgr.ae` domain
- ✅ Routes to `https://api.ledgr.ae` for production
- ✅ Environment-aware API endpoint detection
- **Status:** Ready for production

#### `/demo-data/financial-dataset.json`
- ✅ Comprehensive mock data for Hilal Trading FZ-LLC
- ✅ Includes: cash, VAT, tax, payroll, transactions, reconciliation
- **File location:** `/demo-data/financial-dataset.json`
- **Status:** Ready for production deployment

---

## 3. Backend Requirements

### A. Tester Account Setup
The production backend must have the tester account created:

```json
{
  "email": "tester@ledgr.ae",
  "password": "tester",
  "user_id": "user_tester_production",
  "workspace_id": "ws_tester_production",
  "role": "account_owner",
  "status": "active"
}
```

**Note:** Can use any authentication method (mock, real database, etc.). The credentials just need to validate and return JWT tokens.

### B. Authentication Endpoints
The API must support:

```
POST /v1/auth/login
  Request: { email, password }
  Response: { 
    success: true, 
    data: { 
      access_token, 
      refresh_token, 
      user_id, 
      workspace_id 
    } 
  }

POST /v1/auth/refresh
  Request: { refresh_token }
  Response: { access_token, refresh_token }

POST /v1/auth/logout
  Request: {}
  Response: { success: true }
```

---

## 4. Deployment Checklist

### Frontend Deployment (to ledgr.ae)
- [ ] Deploy all HTML files from root directory
- [ ] Deploy `/assets/` folder with all CSS/JS files
- [ ] Deploy `/demo-data/financial-dataset.json` (critical)
- [ ] Verify domain points to correct server
- [ ] Test static file serving with `demo-data/` path

### Backend Setup (api.ledgr.ae)
- [ ] Create tester account in authentication system
- [ ] Verify `/auth/login` endpoint works with tester credentials
- [ ] Ensure API returns proper JWT tokens
- [ ] Configure CORS to allow ledgr.ae domain
- [ ] Test token refresh mechanism
- [ ] Verify logout endpoint

### Production Environment Variables
```
# Backend (.env or deployment config)
LEDGR_API_URL=https://api.ledgr.ae
API_VERSION=v1
JWT_SECRET=[production-secret]
NODE_ENV=production

# Frontend (via config.js detection)
# Automatically detects ledgr.ae and routes to https://api.ledgr.ae
```

---

## 5. Verification Steps

### 5.1 Frontend Verification
```bash
# 1. Visit login page
https://ledgr.ae/login.html

# 2. Verify:
✓ Tester email pre-filled: tester@ledgr.ae
✓ Tester password pre-filled: tester
✓ Orange Corgi design system applied
✓ Page loads without errors
```

### 5.2 Authentication Flow
```bash
# 1. Click "Sign in to your account"
# 2. Verify loading spinner appears
# 3. Wait for redirect to dashboard

# Expected redirect:
https://ledgr.ae/dashboard.html

# 4. Check localStorage:
✓ access_token is stored
✓ user_id is stored
✓ user_email = "tester@ledgr.ae"
✓ workspace_id is stored
```

### 5.3 Dashboard Verification
```bash
# 1. Dashboard should load with demo data
# 2. Verify in header:
✓ Title: "Your Finance Command Center DEMO DATA"
✓ DEMO DATA badge is visible
✓ Orange accent color (#FF5C00)

# 3. Verify metrics populate:
✓ Documents Processed: >0
✓ Transactions Classified: >0
✓ Pending Review: shows count
✓ Approved & Filed: shows count

# 4. Verify agent cards populate:
✓ AP: Shows processed count
✓ AR: Shows processed count
✓ Reconciliation: Shows reconciled count
✓ Tax: Shows items and alerts
✓ Payroll: Shows employee count
✓ General Ledger: Shows accounts

# 5. Verify transaction table:
✓ Shows at least 5 transactions
✓ Categories match (Utilities, Telecommunications, Revenue, etc.)
✓ Amounts in AED
✓ Status shows "Approved"
```

---

## 6. Demo Flow for Prospects

### Step 1: Initial Visit
```
Prospect visits: https://ledgr.ae/login.html
Sees: Pre-filled tester credentials
Action: Click "Sign in to your account" (no password needed, already filled)
```

### Step 2: Authentication
```
System: POSTs to https://api.ledgr.ae/v1/auth/login
Backend: Validates tester@ledgr.ae / tester
Returns: JWT tokens + user_id + workspace_id
Client: Stores in localStorage
Result: Redirects to dashboard
```

### Step 3: Dashboard Load
```
Dashboard: Detects test account from localStorage
Action: Fetches /demo-data/financial-dataset.json
Data: Transforms Hilal Trading FZ-LLC data
Display: Shows comprehensive financial dashboard with:
  - Cash position & forecasts
  - VAT filing status
  - Tax compliance
  - Payroll overview
  - Transaction history
  - AI agent status
```

### Step 4: Exploration
```
Prospect can:
✓ View all financial data
✓ See transaction classifications
✓ Check compliance status
✓ Understand agent capabilities
✓ Explore dashboard UI/UX

Cannot (for demo):
✗ Upload real documents
✗ Modify data
✗ Access settings
(Can add these restrictions if needed)
```

---

## 7. Troubleshooting

### Issue: Login fails
**Solution:**
1. Verify backend is running at api.ledgr.ae
2. Check tester account exists in backend
3. Verify CORS headers allow ledgr.ae
4. Check network tab for actual error

### Issue: Demo data not loading
**Solution:**
1. Verify `/demo-data/financial-dataset.json` is deployed
2. Check browser console for 404 errors
3. Verify path is case-sensitive: `demo-data/`
4. Fallback generic demo data should display if JSON fails

### Issue: Dashboard shows empty state
**Solution:**
1. Check localStorage has `user_email = "tester@ledgr.ae"`
2. Verify config.js routes to correct API
3. Check browser console for JavaScript errors
4. Verify API endpoint in config.js matches production API

### Issue: DEMO DATA badge not visible
**Solution:**
1. Verify dashboard.html was updated with transformation functions
2. Check if CSS var(--accent) = #FF5C00 (orange)
3. Inspect element to see if innerHTML was applied
4. Check for JavaScript errors in console

---

## 8. Security Considerations

### For Production
1. **Test Account** - Use simple credentials (testing tool only)
2. **No Data Isolation** - Tester account shows demo data, not real data
3. **Read-Only Mode** - Consider disabling uploads for demo account
4. **Separate Workspace** - Don't mix with real accounts
5. **Monitoring** - Track tester account login activity
6. **Demo Data** - Clearly marked with "DEMO DATA" badge

### Recommended Additions (Optional)
- Add rate limiting for demo account
- Track prospect engagement via demo account activity
- Add analytics to know when tester account is used
- Display disclaimer: "This is a demo account with sample data"

---

## 9. Production Deployment Commands

### Build/Deploy Frontend
```bash
# Deploy to ledgr.ae (assuming Vercel, Netlify, or static host)
git push origin main  # Triggers CI/CD
# OR manually upload to hosting:
rsync -avz --exclude='.git' --exclude='node_modules' \
  --exclude='backend' . user@server:/var/www/ledgr/

# Verify files exist:
ls -la /var/www/ledgr/login.html
ls -la /var/www/ledgr/dashboard.html
ls -la /var/www/ledgr/demo-data/financial-dataset.json
```

### Start Backend
```bash
cd backend
npm install
npm run build
npm start  # Runs on configured API port
# Backend listens at: https://api.ledgr.ae
```

### Test Tester Account
```bash
# Test login
curl -X POST https://api.ledgr.ae/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tester@ledgr.ae","password":"tester"}'

# Expected response:
# {
#   "success": true,
#   "data": {
#     "access_token": "...",
#     "refresh_token": "...",
#     "user_id": "...",
#     "workspace_id": "..."
#   }
# }
```

---

## 10. Files Summary

| File | Purpose | Status |
|------|---------|--------|
| `/login.html` | Test account login | ✅ Ready |
| `/dashboard.html` | Demo data display | ✅ Ready |
| `/assets/config.js` | API routing | ✅ Updated |
| `/assets/styles.css` | Orange/light gray design | ✅ Ready |
| `/assets/app.js` | Core functionality | ✅ Ready |
| `/demo-data/financial-dataset.json` | Mock financial data | ✅ Ready |

---

## 11. Next Steps

1. **Backend Setup**: Ensure tester account is created in production
2. **Frontend Deploy**: Deploy updated files to ledgr.ae
3. **API Configuration**: Point api.ledgr.ae to backend
4. **Testing**: Follow verification checklist
5. **Monitoring**: Track prospect usage of tester account
6. **Iteration**: Collect feedback and expand demo scope if needed

---

## Support

For questions about the tester account implementation:
- Check browser console for JavaScript errors
- Verify network requests in DevTools
- Ensure backend responds with proper JWT format
- Confirm all files deployed to correct paths

