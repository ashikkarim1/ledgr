# GitHub Actions + Vercel Deployment Guide for Ledgr

## Overview

This guide walks you through setting up professional CI/CD for Ledgr using GitHub Actions (automated testing and building) and Vercel (frontend hosting), which integrates seamlessly with your existing GitHub/Vercel workflow.

**Current Status:**
- ✅ Frontend deployed to Vercel (www.ledgr.ae)
- ✅ GitHub Actions CI/CD pipeline created
- 🔄 Backend deployment options (choose one below)

---

## Step 1: Configure GitHub Secrets for Vercel Deployment

The GitHub Actions workflow needs your Vercel credentials to deploy automatically.

### Get Your Vercel Credentials

1. Go to [Vercel Account Settings](https://vercel.com/account/settings/tokens)
2. Create a new token:
   - Click "Create Token"
   - Name: `GITHUB_ACTIONS_DEPLOYMENT`
   - Expiration: 90 days
   - Copy the token

3. Get your Organization ID and Project ID:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Project Settings → General → Project ID (copy this)
   - Account Settings → Account ID (this is your Org ID)

### Add Secrets to GitHub

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Create these secrets:

| Secret Name | Value | Where to Find |
|---|---|---|
| `VERCEL_TOKEN` | Your Vercel token | Vercel Account Settings → Tokens |
| `VERCEL_ORG_ID` | Your Vercel organization ID | Vercel Account Settings → Account ID |
| `VERCEL_PROJECT_ID` | Your Ledgr project ID | Vercel Dashboard → Project Settings |

**Command line alternative:**
```bash
# Using GitHub CLI
gh secret set VERCEL_TOKEN --body "your_vercel_token"
gh secret set VERCEL_ORG_ID --body "your_org_id"
gh secret set VERCEL_PROJECT_ID --body "your_project_id"
```

---

## Step 2: Understand the GitHub Actions Pipeline

The automated workflow (`.github/workflows/ci-cd.yml`) does:

1. **Test Frontend** - Runs CSS build and any frontend tests
2. **Test Backend** - Spins up PostgreSQL, runs backend tests
3. **Build Backend Docker Image** - Creates Docker image and pushes to GitHub Container Registry
4. **Deploy Frontend to Vercel** - Automatically deploys to Vercel on main/staging push
5. **Security Scan** - Audits dependencies for vulnerabilities
6. **Notify Status** - Reports success/failure

### How It Works

- **Trigger**: Every push to `main` or `staging` branch
- **Frontend Deploy**: Automatic to Vercel (production on `main`, preview on `staging`)
- **Backend Image**: Built and stored in GitHub Container Registry for manual deployment
- **Tests**: Run on all branches (PRs and pushes)

---

## Step 3: Deploy Backend to Production

You have 3 options. **Railway (Option A) is fastest**, but all three integrate with GitHub.

### Option A: Railway.app (Recommended - 5 minutes)

**Advantages:**
- Fastest setup
- Integrated PostgreSQL
- Native GitHub integration
- $5/month base cost

**Steps:**

1. Go to [Railway.app](https://railway.app)
2. Sign in with GitHub → Authorize
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your Ledgr repository
5. Configure settings:
   - **Service Type**: Node.js
   - **Build Command**: `cd backend && npm install && npm run build`
   - **Start Command**: `cd backend && npm start`
6. Add PostgreSQL plugin:
   - Click "Add Plugin" → "PostgreSQL"
7. Configure Environment Variables:
   ```
   NODE_ENV=production
   DATABASE_URL=<auto-filled by Railway PostgreSQL>
   PORT=3000
   JWT_SECRET=<generate: openssl rand -base64 32>
   SESSION_SECRET=<generate: openssl rand -base64 32>
   CORS_ORIGIN=https://www.ledgr.ae,https://ledgr.ae
   ANTHROPIC_API_KEY=<your key>
   STRIPE_API_KEY=<your key>
   ```
8. Click "Deploy"
9. Once live, copy the deployment URL (e.g., `https://ledgr-backend-production.up.railway.app`)
10. Update frontend API endpoint (see Step 4)

**Optional: Auto-deploy on GitHub push**
- In Railway, go to Project Settings → GitHub
- Enable "Auto Deploy on Push" to main branch

---

### Option B: Render.com (Alternative - 5-10 minutes)

**Advantages:**
- Free tier available
- Simple deployment
- Good uptime

**Steps:**

1. Go to [Render.com](https://render.com)
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Connect your repository
5. Configure:
   - **Name**: ledgr-backend
   - **Environment**: Node
   - **Build Command**: `cd backend && npm install && npm run build`
   - **Start Command**: `cd backend && npm start`
6. Add environment variables (same as above)
7. Click "Create Web Service"
8. Once deployed, copy the URL (e.g., `https://ledgr-backend.onrender.com`)
9. Update frontend API endpoint (see Step 4)

---

### Option C: Docker Image to Self-Hosted Server

**Advantages:**
- Full control
- Lower ongoing costs
- Use your own infrastructure

**Your Docker image is already built** in GitHub Container Registry:
```
ghcr.io/ashikkarim1/ledgr/backend:latest
```

**Steps:**

1. Pull the image from GitHub Container Registry:
   ```bash
   docker pull ghcr.io/ashikkarim1/ledgr/backend:latest
   ```

2. Deploy to your server (AWS, GCP, DigitalOcean, etc.):
   ```bash
   docker run -d \
     -p 3000:3000 \
     -e DATABASE_URL="postgresql://..." \
     -e JWT_SECRET="..." \
     -e NODE_ENV="production" \
     ghcr.io/ashikkarim1/ledgr/backend:latest
   ```

3. Note your server URL and update frontend (see Step 4)

---

## Step 4: Update Frontend API Endpoint

Once your backend is deployed, update the frontend to use the production API:

1. Edit `/assets/app.js`:
```javascript
// Change from:
const API_BASE_URL = 'http://localhost:3000';

// To:
const API_BASE_URL = 'https://ledgr-backend-production.up.railway.app'; // or your URL
```

2. Commit and push:
```bash
git add assets/app.js
git commit -m "Update backend API endpoint to production"
git push origin main
```

3. GitHub Actions will automatically redeploy to Vercel ✅

---

## Step 5: Verify End-to-End Deployment

Test the complete system:

```bash
# 1. Test backend health check
curl https://your-backend-url/health

# 2. Test API connectivity
curl https://www.ledgr.ae
# Check browser console for API calls working

# 3. Test trial signup flow
# Visit https://www.ledgr.ae and sign up for trial

# 4. Verify database persistence
# Check that user data is saved in production database
```

---

## GitHub Actions Secrets Quick Reference

If you need to reset or update secrets:

```bash
# List all secrets
gh secret list

# Update a secret
gh secret set SECRET_NAME --body "new_value"

# Delete a secret
gh secret delete SECRET_NAME
```

---

## Environment Variables for Backend

**Production (.env.production or in deployment platform):**

```env
# Core
NODE_ENV=production
PORT=3000

# Database (auto-filled by Railway/Render PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/ledgr

# Security (generate with: openssl rand -base64 32)
JWT_SECRET=<generate-random-string>
SESSION_SECRET=<generate-random-string>

# CORS (allow your frontend domain)
CORS_ORIGIN=https://www.ledgr.ae,https://ledgr.ae

# Third-party APIs
ANTHROPIC_API_KEY=<your-anthropic-key>
STRIPE_API_KEY=<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<your-webhook-secret>

# Optional: Monitoring
LOG_LEVEL=info
LOG_FORMAT=json
```

---

## Troubleshooting

### GitHub Actions Workflow Failing

1. Go to repository → Actions → Latest workflow
2. Click on the failed job
3. Check the error logs
4. Common issues:
   - Missing secrets: Check Settings → Secrets
   - Node version mismatch: Check Node version in workflow
   - Build failure: Check TypeScript compilation (`npm run build` in backend)

### Frontend Not Updating

1. Check Vercel deployment status
2. Verify GitHub Actions workflow completed
3. Clear browser cache (Cmd+Shift+R)
4. Check Vercel dashboard for deployment logs

### Backend Connection Issues

1. Verify `API_BASE_URL` in `assets/app.js` is correct
2. Check CORS settings in backend (should allow your frontend domain)
3. Test backend health check: `curl https://your-backend-url/health`
4. Check backend environment variables are set correctly

### Database Issues

If using Railway/Render PostgreSQL:
1. Connection should be automatic (DATABASE_URL environment variable)
2. Run migrations on first deployment:
   ```bash
   npm run migrate --prefix backend
   ```
3. Check database logs in Railway/Render dashboard

---

## Next Steps After Deployment

1. **Set up monitoring** (optional):
   - Vercel: Already included in dashboard
   - Railway/Render: Built-in logs and metrics
   - Optional: Sentry for error tracking

2. **Configure custom domain** for backend (optional):
   - Railway: Project Settings → Domains
   - Render: Environment → Custom Domains
   - Point to your deployment URL

3. **Set up webhooks** for Stripe (if accepting payments):
   - Stripe Dashboard → Webhooks
   - Endpoint: `https://your-backend-url/webhooks/stripe`

4. **Enable auto-scaling** (optional):
   - Railway: Billing → Resources
   - Render: Environment Settings → Auto-deploy

---

## One-Command Setup (After Prerequisites)

Once you have Vercel, Railway, and GitHub secrets configured:

```bash
# Push to main - GitHub Actions handles everything
git push origin main

# Monitor deployment
# 1. GitHub Actions: https://github.com/your-org/ledgr/actions
# 2. Vercel Frontend: https://vercel.com/dashboard
# 3. Railway Backend: https://railway.app/dashboard

# Once backend is deployed, update API endpoint
# Then push again to redeploy frontend with new endpoint
```

---

## Support Resources

- **GitHub Actions**: https://docs.github.com/en/actions
- **Vercel Docs**: https://vercel.com/docs
- **Railway Docs**: https://docs.railway.app
- **Render Docs**: https://render.com/docs
- **Ledgr Backend API**: See `/backend/README.md`

---

**Status:** Ready for production deployment! 🚀
