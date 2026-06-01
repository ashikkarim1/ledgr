# GitHub Secrets Configuration Checklist

## Why This Matters

GitHub Secrets enable:
- **Automatic Vercel Deployment**: Push to GitHub → Vercel builds & deploys frontend automatically
- **CI/CD Pipeline**: GitHub Actions tests, builds, and deploys your backend
- **Security**: Secrets never exposed in code or logs

---

## Step-by-Step Setup

### 1. Get Vercel Token

**Where:** https://vercel.com/account/tokens

```
1. Open https://vercel.com/account/tokens
2. Click "Create Token"
3. Name it: "GitHub Actions"
4. Expiration: 90 days (or custom)
5. Copy the token
```

**Secret Name:** `VERCEL_TOKEN`
**Secret Value:** [paste the token]

---

### 2. Get Vercel Project ID

**Where:** https://vercel.com/dashboard

```
1. Go to https://vercel.com/dashboard
2. Click your "ledgr" project
3. Go to Settings → General
4. Find "Project ID" (starts with "prj_")
5. Copy it
```

**Secret Name:** `VERCEL_PROJECT_ID`
**Secret Value:** [paste the project ID]

---

### 3. Get Vercel Organization ID

**Where:** https://vercel.com/account/settings

```
1. Go to https://vercel.com/account/settings
2. Under "Organization Settings" or Team settings
3. Find "Team ID" or "Org ID"
4. Copy it
```

**Secret Name:** `VERCEL_ORG_ID`
**Secret Value:** [paste the org ID]

---

### 4. Get Railway API Token (Optional but Recommended)

**Where:** https://railway.app/account/api-tokens

```
1. Open https://railway.app/account/api-tokens
2. Click "Create Token"
3. Copy the token
```

**Secret Name:** `RAILWAY_API_TOKEN`
**Secret Value:** [paste the token]

---

## Add Secrets to GitHub

### In Your GitHub Repository:

```
1. Go to: https://github.com/ashikkarim1/ledgr
2. Click Settings (top right)
3. Left sidebar → Secrets and variables → Actions
4. Click "New repository secret"
5. For each secret below, click "New repository secret" and add:
```

| Add These Secrets |
|---|
| `VERCEL_TOKEN` = [your token from Step 1] |
| `VERCEL_PROJECT_ID` = [your project ID from Step 2] |
| `VERCEL_ORG_ID` = [your org ID from Step 3] |
| `RAILWAY_API_TOKEN` = [optional, from Step 4] |

### Visual Guide:

```
GitHub Settings
  ↓
Secrets and variables
  ↓
Actions
  ↓
New repository secret (click button)
  ↓
Name: VERCEL_TOKEN
Value: [paste token]
  ↓
Click "Add secret"
```

---

## Verify Secrets are Configured

After adding all secrets:

```
1. Go to GitHub Settings → Secrets and variables → Actions
2. You should see 4 secrets listed:
   ✓ VERCEL_TOKEN
   ✓ VERCEL_PROJECT_ID
   ✓ VERCEL_ORG_ID
   ✓ RAILWAY_API_TOKEN (if added)
```

---

## What Happens Next

Once secrets are configured:

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Update deployment configuration"
   git push origin main
   ```

2. **GitHub Actions pipeline runs automatically:**
   - ✅ Runs tests (frontend & backend)
   - ✅ Builds Docker image
   - ✅ Pushes to GitHub Container Registry
   - ✅ Deploys frontend to Vercel (using VERCEL_TOKEN)
   - ✅ Logs deployment status

3. **View pipeline status:**
   - Go to GitHub → Actions tab
   - See real-time build & deployment logs

---

## Troubleshooting

### "Workflow failed" in GitHub Actions

**Most common cause:** Missing GitHub secret

**Fix:**
1. Check GitHub Settings → Secrets
2. Verify `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID` are present
3. Verify values are correct (no extra spaces)
4. Re-run workflow: GitHub Actions tab → Click workflow → "Re-run jobs"

### Vercel Deployment Not Triggering

**Cause:** GitHub secret name is wrong or missing

**Fix:**
1. Secret must be exactly named: `VERCEL_TOKEN` (case-sensitive)
2. Secret value must be a valid Vercel API token
3. Check `.github/workflows/ci-cd.yml` for correct secret names

### Token Expired

Vercel tokens expire after 90 days by default.

**Fix:**
1. Go to vercel.com/account/tokens
2. Create a new token
3. Go to GitHub Settings → Secrets
4. Click VERCEL_TOKEN → Update → paste new token
5. Click "Update secret"

---

## Security Notes

✅ **Good Practice:**
- Tokens are never exposed in logs
- Secrets are masked in GitHub Actions output
- Each secret is environment-scoped

⚠️ **Never:**
- Paste tokens in code or commits
- Share tokens via email or chat
- Use the same token for multiple services (create separate tokens)

---

## Checklist

- [ ] Got VERCEL_TOKEN from vercel.com/account/tokens
- [ ] Got VERCEL_PROJECT_ID from Vercel project settings
- [ ] Got VERCEL_ORG_ID from Vercel account settings
- [ ] Added all 3 secrets to GitHub (Settings → Secrets and variables → Actions)
- [ ] Verified secrets appear in GitHub secret list
- [ ] Ready to push code to GitHub

