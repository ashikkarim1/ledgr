# Ledgr Production Deployment - Execution Summary

**Date:** June 1, 2026  
**Status:** Ready to Execute  
**Estimated Time:** 15-20 minutes  
**User GitHub:** ashikkarim1  

---

## What's Ready

✅ **Frontend:** Already live on Vercel at https://ledgr.ai  
✅ **CI/CD Pipeline:** GitHub Actions configured  
✅ **Docker Image:** Built and ready in GitHub Container Registry  
✅ **Trial Page UX:** Hero banner reduced, menu bar is now floating and prominent  

---

## What You Need to Do Now

### Step 1: Deploy Backend to Railway.app (5 min)

**Go to:** https://railway.app

```
1. Sign in with GitHub
2. New Project → Import from GitHub
3. Select: ashikkarim1/ledgr
4. Click Deploy
5. Wait for build (2-3 minutes)
```

Railway will give you a backend URL like:
```
https://ledgr-backend-production.up.railway.app
```

**Then add PostgreSQL:**
```
1. Click + Add Service
2. Select Database → PostgreSQL
3. Railway auto-creates the database
4. Copy the DATABASE_URL from PostgreSQL service
```

**Then set Environment Variables in Railway:**

Go to **Project Settings → Variables** and add these (replace values in brackets):

```
NODE_ENV = production
PORT = 3000
DATABASE_URL = [copy from PostgreSQL service above]
JWT_SECRET = [generate: openssl rand -hex 32, then paste]
SESSION_SECRET = [generate: openssl rand -hex 32, then paste]
CORS_ORIGIN = https://ledgr.ai
ANTHROPIC_API_KEY = [your Anthropic API key]
STRIPE_API_KEY = [your Stripe live key - starts with sk_live_]
STRIPE_WEBHOOK_SECRET = [your Stripe webhook secret]
```

**Result:** Backend is now live. ✅

---

### Step 2: Configure GitHub Secrets (5 min)

**Go to:** https://github.com/ashikkarim1/ledgr/settings/secrets/actions

**Get these from Vercel:**

**VERCEL_TOKEN:**
1. Go to https://vercel.com/account/tokens
2. Click Create Token
3. Name: "GitHub Actions"
4. Copy token
5. Add to GitHub Secrets as `VERCEL_TOKEN`

**VERCEL_PROJECT_ID:**
1. Go to https://vercel.com/dashboard
2. Click your "ledgr" project
3. Settings → General
4. Copy "Project ID"
5. Add to GitHub Secrets as `VERCEL_PROJECT_ID`

**VERCEL_ORG_ID:**
1. Go to https://vercel.com/account/settings
2. Find Team/Organization ID
3. Copy it
4. Add to GitHub Secrets as `VERCEL_ORG_ID`

**In GitHub Settings → Secrets and variables → Actions:**
```
Click "New repository secret" for each:
- VERCEL_TOKEN = [paste token from above]
- VERCEL_PROJECT_ID = [paste project ID]
- VERCEL_ORG_ID = [paste org ID]
```

**Result:** GitHub can now auto-deploy to Vercel. ✅

---

### Step 3: Update Frontend API Endpoint (3 min)

**Railway URL from Step 1:** 
```
https://ledgr-backend-production.up.railway.app
```

**Update file:** `/Users/test/Documents/Claude/Projects/Ledgr/assets/app.js`

Replace any `localhost:3000` references with your Railway URL. 

Or add this near the top of app.js (around line 50):
```javascript
const API_BASE = (() => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  return 'https://ledgr-backend-production.up.railway.app';
})();
```

Then use it in fetch calls:
```javascript
fetch(`${API_BASE}/api/your-endpoint`, { ... })
```

**Result:** Frontend points to production backend. ✅

---

### Step 4: Push to GitHub (2 min)

In your terminal:
```bash
cd /Users/test/Documents/Claude/Projects/Ledgr

git add assets/app.js
git commit -m "Production deployment: Railway backend + Vercel frontend

- Deploy backend to Railway.app with PostgreSQL
- Configure GitHub Secrets for Vercel auto-deployment
- Update frontend API endpoint to Railway URL"

git push origin main
```

**What happens automatically:**
1. GitHub Actions runs tests ✅
2. Builds Docker image ✅
3. Deploys frontend to Vercel ✅
4. Sends deployment notifications ✅

**Result:** Code is in production. ✅

---

## 🔍 What to Check Next (But DON'T do yet)

You said you noticed some errors. Before end-to-end testing:

**Check these error sources:**

1. **Browser Console (F12 → Console)**
   - CORS errors
   - Network errors
   - JavaScript errors

2. **Network Tab (F12 → Network)**
   - Failed API requests
   - Wrong endpoints
   - 404/500 responses

3. **Railway Deployment Logs**
   - Go to Railway dashboard
   - Click your backend service
   - View Deployments → Logs
   - Look for startup errors

4. **GitHub Actions Logs**
   - Go to GitHub → Actions
   - Click the latest workflow
   - View logs for each job
   - Look for build/test failures

**When you're ready to debug:**
- Tell me which errors you found
- I'll help fix them
- Then we'll verify everything works end-to-end

---

## Files Created for Reference

These are in your Ledgr project folder. Refer to them if needed:

| File | Purpose |
|---|---|
| `DEPLOYMENT_MASTER_CHECKLIST.md` | Detailed checklist with all steps |
| `RAILWAY_DEPLOYMENT_GUIDE.md` | Railway.app setup guide |
| `GITHUB_SECRETS_SETUP.md` | GitHub Secrets step-by-step |
| `DEPLOYMENT_LOGS/` | Folder for your deployment notes |

---

## Summary: What's Happening

```
You    →  GitHub (push code)
     ↓
GitHub Actions  →  Test & Build
     ↓
├─ Vercel (frontend)  →  ledgr.ai
└─ Railway (backend)  →  ledgr-backend-production.up.railway.app
           ↓
       PostgreSQL (database)
```

Every time you push to GitHub:
1. Tests run automatically
2. Frontend rebuilds on Vercel
3. Backend rebuilds on Railway
4. You get deployment notifications

---

## Your Next Steps

1. **Execute Steps 1-4 above** (15-20 minutes total)
2. **Push to GitHub** (automatic CI/CD kicks in)
3. **Fix any errors you found** (I'll help)
4. **Test end-to-end trial flow** (when you're ready)

---

**Ready?** Start with Step 1: Go to https://railway.app and deploy! 🚀

