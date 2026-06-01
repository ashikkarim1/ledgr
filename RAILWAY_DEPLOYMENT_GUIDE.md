# Railway.app Deployment Guide for Ledgr Backend

## Quick Start (5 Minutes)

### Step 1: Connect GitHub to Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project** → **Import from GitHub**
3. Select repository: **ashikkarim1/ledgr**
4. Railway auto-detects the Node.js backend (Dockerfile)
5. Click **Deploy**

### Step 2: Add PostgreSQL Database

1. In your Railway project, click **+ Add Service**
2. Select **Database** → **PostgreSQL**
3. Railway creates a `DATABASE_URL` automatically
4. Configure:
   - **Username**: postgres
   - **Password**: (auto-generated, copy for later)
   - **Database**: ledgr_production

**Railway creates this URL automatically:**
```
postgresql://postgres:[password]@[host]:5432/ledgr_production
```

### Step 3: Set Environment Variables

In Railway dashboard → Project Settings → Variables, add:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://postgres:PASSWORD@HOST:5432/ledgr_production
JWT_SECRET=your-jwt-secret-key-minimum-32-chars
SESSION_SECRET=your-session-secret-minimum-32-chars
CORS_ORIGIN=https://ledgr.ai
ANTHROPIC_API_KEY=your-anthropic-key
STRIPE_API_KEY=your-stripe-live-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret
```

**⚠️ IMPORTANT:** 
- `DATABASE_URL` is provided by Railway's PostgreSQL service
- Copy the URL from Railway → PostgreSQL service → Connection
- Replace PASSWORD and HOST with actual values

### Step 4: Verify Deployment

1. Railway shows deployment logs in real-time
2. Wait for "Deployment Complete" status (usually 2-3 minutes)
3. Your backend URL is automatically generated: `https://ledgr-backend-production.up.railway.app`
4. Test health endpoint: `curl https://ledgr-backend-production.up.railway.app/health`

---

## GitHub Secrets Configuration

To enable automatic Vercel deployment of frontend, configure these GitHub secrets:

### In GitHub Repository Settings:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** and add:

| Secret Name | Value | Description |
|---|---|---|
| `VERCEL_TOKEN` | Your Vercel API token | From vercel.com/account/tokens |
| `VERCEL_ORG_ID` | Your Vercel organization ID | From vercel.com/account/settings |
| `VERCEL_PROJECT_ID` | Your Vercel project ID | From Vercel project settings |
| `RAILWAY_API_TOKEN` | Your Railway API token | From railway.app/account/api-tokens |

### How to Get These Values:

**Vercel Token:**
```
1. Go to vercel.com/account/tokens
2. Click "Create Token"
3. Name: "GitHub Actions"
4. Copy token and paste into GitHub secret VERCEL_TOKEN
```

**Vercel Organization & Project IDs:**
```
1. Go to vercel.com/dashboard
2. Click your project
3. Go to Settings → General
4. Copy "Project ID"
5. Go to Settings → Team (find Org ID)
```

**Railway API Token:**
```
1. Go to railway.app/account/api-tokens
2. Click "Create Token"
3. Copy and paste into GitHub secret RAILWAY_API_TOKEN
```

---

## Update Frontend API Endpoint

Once Railway provides your backend URL, update `assets/app.js`:

```javascript
// Line ~50-60, find:
const API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://ledgr-api.production.com'
  : 'http://localhost:3000';

// Change to your Railway URL:
const API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://ledgr-backend-production.up.railway.app'
  : 'http://localhost:3000';
```

---

## Troubleshooting

### Deployment Failed / Build Error
- Check Railway logs: Project → Deployments → View Logs
- Most common: Missing environment variables
- Solution: Add all required env vars from Step 3

### DATABASE_URL Connection Error
- Verify PostgreSQL service is running (Railway → PostgreSQL service)
- Check password contains no special characters, or is properly URL-encoded
- Test locally: `psql postgresql://postgres:PASSWORD@HOST:5432/ledgr_production`

### CORS / 403 Error on Frontend
- Verify `CORS_ORIGIN` environment variable matches frontend URL
- If frontend is https://ledgr.ai, set: `CORS_ORIGIN=https://ledgr.ai`
- Railway redeploys when env vars change

### Health Check Failing
- Ensure backend has `/health` endpoint in `backend/routes/health.ts`
- Should return: `{ status: 'ok', timestamp: new Date() }`

---

## Next Steps

1. ✅ Backend deployed to Railway
2. ⬜ Update assets/app.js with Railway URL
3. ⬜ Configure GitHub Secrets (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID)
4. ⬜ Push to GitHub to trigger CI/CD pipeline
5. ⬜ Verify Vercel frontend deployment completes
6. ⬜ Test end-to-end trial flow

