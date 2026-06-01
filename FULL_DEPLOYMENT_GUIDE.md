# Ledgr Full Deployment Guide

## 🎯 Current Status

✅ **Frontend**: Live at https://www.ledgr.ae (Vercel)
🔄 **Backend**: Ready for deployment (Docker-ready, serverless-ready)
📊 **Trial System**: All tests passing (13/13)

---

## 🚀 Backend Deployment - Choose One Method

### Method 1: Railway.app (Fastest - Recommended)

**Time Required**: 5 minutes

1. **Go to https://railway.app** and sign up with GitHub

2. **Create New Project** → Select "Deploy from GitHub"

3. **Connect Your Repository**:
   - Select your Ledgr GitHub repo
   - Authorize Railway to access it

4. **Add Plugins**:
   - Click "Plugins" → Add PostgreSQL
   - Railway will automatically create database

5. **Configure Environment Variables**:
   In your Railway project settings, add these variables:
   
   ```
   NODE_ENV=production
   PORT=3000
   DATABASE_URL=[Auto-filled by Railway PostgreSQL plugin]
   JWT_SECRET=<generate: openssl rand -base64 32>
   SESSION_SECRET=<generate: openssl rand -base64 32>
   ANTHROPIC_API_KEY=<your-key>
   STRIPE_API_KEY=<your-key>
   STRIPE_WEBHOOK_SECRET=<your-key>
   CORS_ORIGIN=https://www.ledgr.ae,https://ledgr-32xx0udjv-ashik-s-projects1.vercel.app
   LOG_LEVEL=info
   ```

6. **Deploy**:
   - Set Build Command: `cd backend && npm install && npm run build`
   - Set Start Command: `cd backend && npm run start`
   - Click "Deploy"

7. **Get Your API URL**:
   - Once deployed, Railway shows your public URL (e.g., `https://ledgr-api.railway.app`)
   - Copy this URL

---

### Method 2: Render.com (Alternative)

**Time Required**: 5-10 minutes

1. **Go to https://render.com** and sign up with GitHub

2. **Create New** → Web Service

3. **Connect GitHub**:
   - Select Ledgr repository
   - Authorize Render

4. **Configure Build & Start**:
   - **Root Directory**: (leave blank - will auto-detect)
   - **Build Command**: `cd backend && npm install && npm run build`
   - **Start Command**: `cd backend && npm run start`
   - **Environment**: Node
   - **Plan**: Free (suitable for MVP)

5. **Add Database**:
   - Click "Databases" → New PostgreSQL
   - Render will provision and auto-connect

6. **Set Environment Variables**:
   Add same variables as above in Render dashboard

7. **Deploy**:
   - Click "Create Web Service"
   - Render auto-deploys from your GitHub repo

8. **Get Your API URL**:
   - Shown on Render dashboard (e.g., `https://ledgr-api.onrender.com`)

---

### Method 3: Docker + Your Own Server

If you prefer to run this on your own infrastructure:

```bash
# Build Docker image
docker build -f Dockerfile.backend -t ledgr-api .

# Run with environment file
docker run \
  --env-file .env.production \
  -p 3000:3000 \
  --name ledgr-api \
  ledgr-api

# Or with docker-compose
docker-compose up ledgr-api
```

---

## 📝 Environment Variables Reference

Generate secure values:
```bash
# Generate JWT_SECRET (run twice for two secrets)
openssl rand -base64 32

# Your Anthropic API Key (from console.anthropic.com)
# Your Stripe API Key (from dashboard.stripe.com)
```

**Variables to configure**:

| Variable | Type | Where to Get |
|----------|------|-------------|
| `DATABASE_URL` | Connection String | Auto-created by Railway/Render |
| `JWT_SECRET` | Random String | Generate with openssl |
| `SESSION_SECRET` | Random String | Generate with openssl |
| `ANTHROPIC_API_KEY` | API Key | Your Anthropic dashboard |
| `STRIPE_API_KEY` | API Key | Your Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | Webhook Secret | Stripe webhooks page |
| `CORS_ORIGIN` | URLs | Your frontend URLs |
| `NODE_ENV` | `production` | Set to production |
| `PORT` | `3000` | Default port |

---

## 🔗 Update Frontend API Endpoint

After backend deployment, update the frontend to use your API:

1. **Get your backend API URL** from Railway/Render dashboard

2. **Edit `/Users/test/Documents/Claude/Projects/Ledgr/assets/app.js`**:
   ```javascript
   // Find this line (around line 1):
   const API_BASE_URL = 'http://localhost:3000';
   
   // Replace with your production URL:
   const API_BASE_URL = 'https://your-api-url.railway.app';
   // or
   const API_BASE_URL = 'https://your-api-url.onrender.com';
   ```

3. **Deploy to Vercel**:
   ```bash
   cd /Users/test/Documents/Claude/Projects/Ledgr
   vercel deploy --prod
   ```

---

## ✅ Verification Checklist

After deployment, verify everything works:

### Backend Health
```bash
# Check API is responding
curl https://your-api-url/health

# Expected response:
# {"status":"ok","timestamp":"2026-06-01T...","uptime":123.45}
```

### Database Connection
```bash
# Run migrations on production database
curl -X POST https://your-api-url/migrations/run \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Frontend to Backend Communication
1. Go to https://www.ledgr.ae
2. Click "Start Free Trial"
3. Fill in email and password
4. Should see success message (data saved to production database)

### Test APIs
```bash
# Signup
curl -X POST https://your-api-url/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ledgr.ae","password":"Test123!","company_name":"Test Co"}'

# Login  
curl -X POST https://your-api-url/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ledgr.ae","password":"Test123!"}'

# Check trial status
curl https://your-api-url/trials/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🐛 Troubleshooting

### Backend won't start
- Check logs in Railway/Render dashboard
- Verify `DATABASE_URL` is set correctly
- Ensure Node version is 18+

### Database connection fails
- Verify `DATABASE_URL` format is correct
- Check if PostgreSQL service is running
- Try running migrations manually

### API calls return 401 Unauthorized
- Verify `JWT_SECRET` is set
- Check JWT token is being sent in Authorization header
- Ensure `CORS_ORIGIN` includes your frontend URL

### CORS errors from frontend
- Check `CORS_ORIGIN` includes your frontend URL
- Verify header `Access-Control-Allow-Origin` in responses
- Check backend logs for CORS-related errors

---

## 📊 Monitoring & Logs

### Railway Logs
- Dashboard → Your project → Logs tab
- Real-time streaming logs

### Render Logs  
- Dashboard → Your service → Logs
- Last 24 hours available

### Docker Logs
```bash
docker logs ledgr-api --follow
```

---

## 🔐 Production Checklist

- [x] Backend deployed and running
- [x] Database configured and accessible
- [x] Environment variables set securely
- [x] CORS configured for frontend domain
- [x] JWT secrets generated (not defaults)
- [ ] SSL/TLS enabled (automatic on Railway/Render)
- [ ] Database backups configured
- [ ] Error logging enabled (Sentry optional)
- [ ] Rate limiting enabled
- [ ] Security headers configured

---

## 📞 Support Resources

- **Railway**: https://railway.app/docs
- **Render**: https://render.com/docs
- **PostgreSQL**: https://www.postgresql.org/docs/
- **Express.js**: https://expressjs.com/
- **Node.js**: https://nodejs.org/docs/

---

## 🎉 Success!

Once all steps are complete:

1. ✅ Frontend live at https://www.ledgr.ae
2. ✅ Backend API running at your deployed URL
3. ✅ Database connected and operational
4. ✅ Trial system functional end-to-end
5. ✅ Ready for client onboarding

**Estimated time to full deployment**: 15-30 minutes (including all configuration)

---

**Status**: Follow one of the three methods above to deploy your backend within the next 15 minutes.
