# Ledgr MVP - Complete Deployment Checklist

## ✅ Status: Ready for Production Deployment

**Frontend:** ✅ Live at https://www.ledgr.ae  
**Backend:** 🔄 Ready to deploy (choose one option below)  
**CI/CD:** ✅ GitHub Actions configured  

---

## Pre-Deployment Checklist

- [x] Frontend deployed to Vercel and live
- [x] Backend compiled and ready (`/backend/dist`)
- [x] Dockerfile created for backend containerization
- [x] GitHub Actions workflow configured for CI/CD
- [x] All tests passing (run locally: `cd backend && npm test`)
- [ ] Vercel GitHub secrets configured (VERCEL_TOKEN, ORG_ID, PROJECT_ID)
- [ ] Backend API endpoint chosen (Railway, Render, or self-hosted)

---

## Required: Configure GitHub Secrets (5 minutes)

**What you need to do:**

1. Get Vercel Token from: https://vercel.com/account/settings/tokens
2. Get Vercel IDs from: https://vercel.com/dashboard
3. Go to: GitHub Repo → Settings → Secrets and variables → Actions
4. Add three secrets:
   - `VERCEL_TOKEN` = your Vercel token
   - `VERCEL_ORG_ID` = your organization ID
   - `VERCEL_PROJECT_ID` = your Ledgr project ID

```bash
# Alternative: Use GitHub CLI
gh secret set VERCEL_TOKEN --body "token_here"
gh secret set VERCEL_ORG_ID --body "org_id_here"
gh secret set VERCEL_PROJECT_ID --body "project_id_here"
```

---

## Choose & Deploy Backend (One Option - 5-10 minutes each)

### Option A: Railway.app ⭐ Recommended (Fastest)

**Time: ~5 minutes**

```
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Select Ledgr repo
4. Build: cd backend && npm install && npm run build
5. Start: cd backend && npm start
6. Add PostgreSQL plugin
7. Set environment variables (see GITHUB_ACTIONS_DEPLOYMENT_GUIDE.md)
8. Deploy
9. Copy backend URL
10. Update /assets/app.js with new API_BASE_URL
11. Commit & push (GitHub Actions handles frontend redeploy)
```

✅ **After this, your system is live!**

---

### Option B: Render.com (Alternative)

**Time: ~5-10 minutes**

```
1. Go to https://render.com
2. Sign up with GitHub
3. "New Web Service"
4. Connect Ledgr repo
5. Build: cd backend && npm install && npm run build
6. Start: cd backend && npm start
7. Set environment variables
8. Create service
9. Copy backend URL
10. Update /assets/app.js
11. Commit & push
```

✅ **After this, your system is live!**

---

### Option C: Docker to Own Server

**Time: ~10-15 minutes**

```
Docker image available:
ghcr.io/<your-username>/ledgr/backend:latest

1. Deploy image to your server
2. Set environment variables
3. Expose port 3000
4. Get public URL
5. Update /assets/app.js
6. Commit & push
```

✅ **After this, your system is live!**

---

## Post-Backend-Deployment Steps

### 1. Update Frontend API Endpoint (2 minutes)

Edit `/assets/app.js`:
```javascript
// Line ~15, change:
const API_BASE_URL = 'http://localhost:3000';

// To your production backend URL:
const API_BASE_URL = 'https://ledgr-backend-production.up.railway.app';
```

Push to trigger automatic frontend redeploy:
```bash
git add assets/app.js
git commit -m "Update backend API endpoint to production"
git push origin main
```

Monitor: GitHub Actions → check workflow completes

### 2. Verify End-to-End (5 minutes)

Test each component:

```bash
# 1. Backend health check
curl https://your-backend-url/health
# Should return: {"status":"healthy","timestamp":"..."}

# 2. Frontend loads
curl https://www.ledgr.ae | grep "Ledgr"
# Should return HTML with page content

# 3. API connectivity (in browser)
# Open https://www.ledgr.ae
# Open DevTools → Network tab
# Click "Sign Up"
# Should see API calls to /api/* endpoints
```

### 3. Test Trial System (10 minutes)

```
1. Visit https://www.ledgr.ae
2. Click "Get Started" → Sign up with email
3. Verify:
   - Email confirmation received
   - Can log in
   - Trial countdown shows (14 days)
   - Feature limits enforced (5 docs, 10 executions)
4. Try feature-gated action (should be blocked until upgrade)
5. Click "Upgrade" → Stripe test payment
   - Use card: 4242 4242 4242 4242
   - Any future date
   - Any CVC
6. Verify upgrade successful
```

### 4. Database Verification (5 minutes)

Verify production database has data:

```bash
# Railway users can use railway CLI or dashboard
# Render users can use dashboard  
# Own server: access directly via DATABASE_URL

# Should see:
- users table with your test account
- subscriptions table with trial record
- No errors in backend logs
```

---

## Complete Deployment Summary

Once backend is deployed and frontend API updated:

| Component | Status | URL |
|-----------|--------|-----|
| **Frontend** | ✅ Live | https://www.ledgr.ae |
| **Backend API** | 🔄 Select option | Railway/Render/Own server |
| **Database** | 🔄 Created by backend | PostgreSQL |
| **CI/CD** | ✅ Configured | GitHub Actions |

---

## What Happens on Each Push

Once everything is deployed, your workflow is:

```
1. Make code changes locally
2. Commit and push to main
3. GitHub Actions automatically:
   ✅ Runs frontend tests
   ✅ Runs backend tests  
   ✅ Builds Docker image
   ✅ Deploys frontend to Vercel
   ✅ Notifies you of status
4. Changes live in ~2-3 minutes
```

---

## Environment Variables Reference

**Backend needs these in Railway/Render/Own Server:**

```env
# Core
NODE_ENV=production
PORT=3000

# Database (auto-generated by Railway/Render or your own)
DATABASE_URL=postgresql://...

# Security (generate: openssl rand -base64 32)
JWT_SECRET=...
SESSION_SECRET=...

# Frontend domain
CORS_ORIGIN=https://www.ledgr.ae,https://ledgr.ae

# Third-party
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_API_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Troubleshooting During Deployment

### GitHub Actions Not Running
- Check: GitHub Repo → Actions → Latest workflow
- Verify secrets are set correctly (Settings → Secrets)
- Check: No syntax errors in `.github/workflows/ci-cd.yml`

### Backend Not Connecting
- Test backend health: `curl https://backend-url/health`
- Check CORS_ORIGIN includes your frontend domain
- Verify DATABASE_URL is set correctly
- Check backend logs in Railway/Render dashboard

### Frontend Still Calling localhost:3000
- Verify API_BASE_URL updated in `/assets/app.js`
- Check file was committed: `git log -1 --name-only`
- Monitor Vercel redeploy: https://vercel.com/dashboard
- Clear browser cache (Cmd+Shift+R on Mac)

### Database Migration Issues
```bash
# If needed, run migrations:
cd backend
npm run migrate  # Only from your machine, not in Docker
```

---

## Success Criteria

Your deployment is **COMPLETE and SUCCESSFUL** when:

✅ Frontend loads at https://www.ledgr.ae  
✅ Backend health check responds: `curl https://backend-url/health`  
✅ Can sign up for trial on production site  
✅ Can log back in  
✅ Trial countdown and feature limits work  
✅ Can upgrade to paid plan  
✅ No errors in browser console or backend logs  

---

## Client Onboarding Checklist

Once deployed, prepare for client launch:

- [ ] Set up monitoring/error tracking (Sentry recommended)
- [ ] Configure Stripe live keys (replace test keys)
- [ ] Set up email domain for transactional emails
- [ ] Brief support team on trial/upgrade flow
- [ ] Create client onboarding docs
- [ ] Set up backup strategy for production database
- [ ] Configure custom domain (optional: api.ledgr.ae)
- [ ] Document runbooks for common issues
- [ ] Set up monitoring alerts

---

## Next Deploy (After Initial Launch)

Standard workflow once live:

```bash
# 1. Make changes
git checkout -b feature/my-feature
# ... make changes ...

# 2. Test locally
npm test
cd backend && npm test

# 3. Commit and push
git add .
git commit -m "Add feature: ..."
git push origin feature/my-feature

# 4. Create PR (optional, for code review)
gh pr create --title "Add feature: ..."

# 5. Merge to main when ready
# GitHub Actions automatically tests, builds, and deploys!
```

---

## Support & Documentation

- **GitHub Actions**: https://docs.github.com/en/actions
- **Vercel**: https://vercel.com/docs
- **Railway**: https://docs.railway.app
- **Render**: https://render.com/docs
- **Backend API**: See `backend/README.md`
- **Deployment Guide**: See `GITHUB_ACTIONS_DEPLOYMENT_GUIDE.md`

---

**🚀 Ready to ship! Choose a backend deployment option above and your MVP is live.**
