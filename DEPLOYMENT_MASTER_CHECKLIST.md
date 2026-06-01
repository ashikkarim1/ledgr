# Ledgr Deployment Master Checklist

**Status:** Ready for Production Deployment  
**Timeline:** 15-20 minutes total  
**Backend Host:** Railway.app  
**Frontend Host:** Vercel (already live)  

---

## ✅ Phase 1: Railway.app Backend Setup (5 minutes)

### 1.1 Connect GitHub to Railway

- [ ] Go to https://railway.app
- [ ] Sign in with GitHub
- [ ] Click **New Project** → **Import from GitHub**
- [ ] Select repo: **ashikkarim1/ledgr**
- [ ] Railway auto-detects Dockerfile and Node.js backend
- [ ] Click **Deploy**
- [ ] Wait for initial deployment (2-3 minutes)

**Railway provides:**
- ✅ Automatic backend URL (e.g., `https://ledgr-backend-production.up.railway.app`)
- ✅ Deployment logs in real-time
- ✅ Health check monitoring

### 1.2 Add PostgreSQL Database

- [ ] In Railway dashboard, click **+ Add Service**
- [ ] Select **Database** → **PostgreSQL**
- [ ] Railway auto-configures with:
  - Username: `postgres`
  - Database: `ledgr_production`
  - Auto-generated password
  
**Railway provides:**
- ✅ `DATABASE_URL` (in PostgreSQL service settings)
- ✅ Copy this URL for next step

### 1.3 Configure Environment Variables in Railway

In **Railway Dashboard → Project Settings → Variables**, add:

| Variable | Value | Source |
|---|---|---|
| `NODE_ENV` | `production` | Set this |
| `PORT` | `3000` | Set this |
| `DATABASE_URL` | `postgresql://postgres:PASSWORD@HOST:5432/ledgr_production` | From PostgreSQL service |
| `JWT_SECRET` | `[generate: openssl rand -hex 32]` | Generate a random secret |
| `SESSION_SECRET` | `[generate: openssl rand -hex 32]` | Generate a random secret |
| `CORS_ORIGIN` | `https://ledgr.ai` | Your frontend URL |
| `ANTHROPIC_API_KEY` | Your API key | From Anthropic dashboard |
| `STRIPE_API_KEY` | Your live key (starts with `sk_live_`) | From Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | Your webhook secret | From Stripe dashboard |

- [ ] Verify all variables are set
- [ ] Railway auto-redeploys when variables change
- [ ] Wait for redeployment to complete

**Result:**
- ✅ Backend is now live at Railway URL
- ✅ Database is connected
- ✅ All environment variables configured

---

## ✅ Phase 2: GitHub Secrets Configuration (5 minutes)

### 2.1 Get Vercel Token

- [ ] Go to https://vercel.com/account/tokens
- [ ] Click **Create Token**
- [ ] Name: "GitHub Actions"
- [ ] Copy token
- [ ] Secret Name: `VERCEL_TOKEN`
- [ ] Secret Value: [paste token]

### 2.2 Get Vercel Project ID

- [ ] Go to https://vercel.com/dashboard
- [ ] Click your "ledgr" project
- [ ] Go to Settings → General
- [ ] Find and copy "Project ID"
- [ ] Secret Name: `VERCEL_PROJECT_ID`
- [ ] Secret Value: [paste ID]

### 2.3 Get Vercel Organization ID

- [ ] Go to https://vercel.com/account/settings
- [ ] Find Team/Organization ID
- [ ] Copy it
- [ ] Secret Name: `VERCEL_ORG_ID`
- [ ] Secret Value: [paste ID]

### 2.4 Add Secrets to GitHub

- [ ] Go to https://github.com/ashikkarim1/ledgr
- [ ] Settings → Secrets and variables → Actions
- [ ] Click **New repository secret** for each:
  - [ ] `VERCEL_TOKEN` = [from 2.1]
  - [ ] `VERCEL_PROJECT_ID` = [from 2.2]
  - [ ] `VERCEL_ORG_ID` = [from 2.3]

**Result:**
- ✅ GitHub has Vercel deployment credentials
- ✅ CI/CD pipeline can now auto-deploy frontend

---

## ✅ Phase 3: Update Frontend API Endpoint (3 minutes)

### 3.1 Get Railway Backend URL

- [ ] In Railway dashboard → Your backend service
- [ ] Find **Railway Environment** or **Service URL**
- [ ] Copy the full URL (e.g., `https://ledgr-backend-production.up.railway.app`)
- [ ] Test it works: `curl https://ledgr-backend-production.up.railway.app/health`

### 3.2 Update assets/app.js

Currently hardcoded API endpoint may point to localhost. Update it:

**If using environment variable approach (recommended):**
```javascript
// In assets/app.js, around line 50-100:

const API_BASE = (() => {
  // Development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  
  // Production
  return 'https://ledgr-backend-production.up.railway.app';
})();

// Usage in fetch calls:
// fetch(`${API_BASE}/api/submit-trial`, { ... })
```

**If you find hardcoded localhost:**
```javascript
// BEFORE:
await fetch('http://localhost:3000/api/trial', { ... })

// AFTER:
await fetch('https://ledgr-backend-production.up.railway.app/api/trial', { ... })
```

- [ ] Search assets/app.js for any `localhost:3000` references
- [ ] Replace with Railway URL or use environment-aware logic
- [ ] Test in browser console: `console.log(API_BASE)` should show Railway URL

**Result:**
- ✅ Frontend now points to production backend

---

## ✅ Phase 4: Push to GitHub (2 minutes)

### 4.1 Commit Changes

```bash
git add assets/app.js RAILWAY_DEPLOYMENT_GUIDE.md GITHUB_SECRETS_SETUP.md
git commit -m "Configure production deployment: Railway backend + Vercel frontend

- Set up Railway.app PostgreSQL database
- Configure environment variables in Railway
- Add GitHub Secrets for Vercel auto-deployment
- Update frontend API endpoint to Railway URL
- Add comprehensive deployment guides"
git push origin main
```

### 4.2 Monitor GitHub Actions

- [ ] Go to GitHub → Actions tab
- [ ] See CI/CD pipeline running:
  - [ ] Tests running
  - [ ] Backend building
  - [ ] Docker image created
  - [ ] Frontend deploying to Vercel
  - [ ] Deployment notifications

**Result:**
- ✅ Code is now in production branch
- ✅ CI/CD pipeline is auto-deploying

---

## 🧪 Phase 5: Verification (Skip this - you'll do it later)

**DO NOT DO THIS YET** - You mentioned errors to fix first.

When ready later, verify:
- [ ] Trial page loads: https://ledgr.ai/trial.html
- [ ] Menu bar is sticky and prominent (already fixed)
- [ ] Hero banner is reduced size (already fixed)
- [ ] Form submissions work
- [ ] localStorage persists trial data
- [ ] No console errors

---

## 📋 Deployment Summary

### What Just Happened

1. **Backend is now live:**
   - Railway.app hosts Node.js API
   - PostgreSQL database connected
   - Environment variables configured
   - Auto-deploys on GitHub push

2. **Frontend auto-deploys:**
   - GitHub Secrets configured
   - Vercel watches main branch
   - Every push triggers build & deploy
   - CI/CD pipeline handles everything

3. **Production Architecture:**
   ```
   GitHub (code repository)
      ↓ (push to main)
   GitHub Actions (test, build, deploy)
      ↓
   ├─ Vercel (frontend)
   │  └─ ledgr.ai
   │
   └─ Railway (backend)
      └─ ledgr-backend-production.up.railway.app
   ```

### Environment Ready

| Component | Status | URL |
|---|---|---|
| Frontend | ✅ Live | https://ledgr.ai |
| Backend | ✅ Live | https://ledgr-backend-production.up.railway.app |
| Database | ✅ Connected | PostgreSQL on Railway |
| CI/CD | ✅ Active | GitHub Actions |
| Secrets | ✅ Configured | VERCEL_TOKEN, etc. |

---

## 🔧 What to Do With Errors

You mentioned noticing errors. Before end-to-end testing:

1. **Identify error location:**
   - Browser console errors (F12 → Console)
   - Network tab (failed requests)
   - Railway deployment logs
   - GitHub Actions logs

2. **Types of errors to watch for:**
   - CORS errors → Check `CORS_ORIGIN` in Railway
   - API 404 → Check Railway backend is running
   - Database errors → Check `DATABASE_URL` is correct
   - Authentication errors → Check JWT_SECRET is set

3. **When you're ready:**
   - Let me know what errors you found
   - I'll help fix them
   - Then run end-to-end verification

---

## ✅ Completion Checklist

- [ ] Railway.app backend deployed and running
- [ ] PostgreSQL database connected to Railway
- [ ] Environment variables configured in Railway
- [ ] GitHub Secrets added (VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_ORG_ID)
- [ ] assets/app.js updated with Railway backend URL
- [ ] Code pushed to GitHub main branch
- [ ] CI/CD pipeline completed successfully
- [ ] Vercel frontend deployment completed
- [ ] Backend health check passing: `curl [RAILWAY_URL]/health`
- [ ] Ready for error investigation & fixing

