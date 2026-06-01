# Ledgr Environment Configuration Guide

This guide explains how to set up and run Ledgr in different environments (development, staging, production).

## Overview

Ledgr now supports multi-environment configuration with automatic API endpoint detection on the frontend.

### Key Components

1. **Backend** (`backend/`) - Express.js REST API server
   - Port: 3001 (configurable via `PORT` env var)
   - Host: 127.0.0.1 for dev (IPv4 localhost), 0.0.0.0 for prod (all interfaces)

2. **Frontend** (`assets/config.js`) - Automatically detects environment
   - Dev: http://localhost:3001
   - Staging: https://api-staging.ledgr.com
   - Production: https://api.ledgr.com

3. **Static Server** (Python `http.server`)
   - Port: 3004 (serves HTML/CSS/JS files)

---

## Development Environment

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 12+
- Python 3.6+ (for static file server)

### Setup

1. **Copy development config:**
   ```bash
   cp .env.development .env
   ```

2. **Install dependencies:**
   ```bash
   npm install
   cd backend && npm install
   ```

3. **Create PostgreSQL database:**
   ```bash
   createdb ledgr
   ```

4. **Start backend server** (in `backend/` directory):
   ```bash
   PORT=3001 HOST=127.0.0.1 npm run dev
   # Or with tsx watch:
   PORT=3001 npx tsx watch main.ts
   ```

5. **Start frontend server** (in project root, new terminal):
   ```bash
   python3 -m http.server 3004 -d .
   ```

6. **Access the application:**
   - Open browser: http://localhost:3004/login.html
   - Backend API: http://localhost:3001
   - Test credentials: `tester@ledgr.ae` / `tester`

### Troubleshooting Dev Environment

**Issue:** "Cannot reach backend server at localhost:3001"
- Verify backend is running: `curl http://127.0.0.1:3001/v1/health`
- Check `PORT` and `HOST` environment variables
- Ensure no other process is using port 3001: `lsof -i :3001`

**Issue:** CORS errors
- Verify `CORS_ORIGIN` in `.env` includes `http://localhost:3004`
- Restart backend after changing CORS settings

---

## Staging Environment

### Prerequisites

- AWS/VPS instance with Node.js
- PostgreSQL database (AWS RDS or self-hosted)
- Domain: staging.ledgr.com

### Setup

1. **Copy staging config:**
   ```bash
   cp .env.staging .env
   ```

2. **Update staging credentials in `.env`:**
   - `DATABASE_URL`: Point to staging database
   - `JWT_SECRET`: Use strong random secret
   - `SMTP_PASSWORD`: SendGrid or SMTP credentials
   - `WEBHOOK_SECRET`: Random webhook secret

3. **Install dependencies:**
   ```bash
   npm install
   cd backend && npm install
   ```

4. **Start services:**
   ```bash
   # Backend (binds to 0.0.0.0 for all interfaces)
   npm run prod &
   
   # Alternatively with pm2 (recommended for production)
   pm2 start "npm run prod" --name "ledgr-backend"
   ```

5. **Configure reverse proxy** (nginx):
   ```nginx
   upstream ledgr_backend {
     server localhost:3001;
   }
   
   server {
     server_name api-staging.ledgr.com;
     listen 443 ssl http2;
     
     location / {
       proxy_pass http://ledgr_backend;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```

6. **Frontend auto-detects API:**
   - Access: https://staging.ledgr.com
   - `config.js` automatically routes to https://api-staging.ledgr.com

---

## Production Environment

### Prerequisites

- Production-grade VPS/AWS instance
- PostgreSQL database (managed service recommended)
- Domain: ledgr.com with CDN
- SSL certificates

### Setup

1. **Environment variables** (use secure vault):
   ```bash
   export NODE_ENV=production
   export PORT=3001
   export HOST=0.0.0.0
   export DATABASE_URL=postgresql://...
   export JWT_SECRET=... (strong random string)
   export SESSION_SECRET=... (strong random string)
   export SMTP_PASSWORD=... (sendgrid api key)
   export WEBHOOK_SECRET=... (strong random string)
   ```

2. **Install dependencies:**
   ```bash
   npm install --production
   cd backend && npm install --production
   ```

3. **Build and start:**
   ```bash
   # Option 1: Using pm2 (recommended)
   pm2 start "npm run prod" --name "ledgr-backend" --instances max
   pm2 save
   pm2 startup
   
   # Option 2: Using systemd service
   # Create /etc/systemd/system/ledgr.service (see example below)
   systemctl start ledgr
   systemctl enable ledgr
   ```

4. **Configure CDN and reverse proxy:**
   - CloudFront/Cloudflare for static assets (HTML/CSS/JS)
   - Nginx/HAProxy for API reverse proxy
   - SSL termination at CDN/load balancer

5. **Frontend auto-detects production:**
   - Access: https://ledgr.com
   - `config.js` automatically routes to https://api.ledgr.com

### Systemd Service Example

Create `/etc/systemd/system/ledgr.service`:

```ini
[Unit]
Description=Ledgr Backend API
After=network.target

[Service]
Type=simple
User=ledgr
WorkingDirectory=/opt/ledgr
EnvironmentFile=/opt/ledgr/.env.production
ExecStart=/usr/bin/npm run prod
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable ledgr
sudo systemctl start ledgr
```

---

## API Endpoint Detection

The frontend (`assets/config.js`) automatically detects the correct API endpoint:

```javascript
// Development (localhost)
http://localhost:3001

// Staging
https://api-staging.ledgr.com

// Production
https://api.ledgr.com

// Custom domains
https://yourdomain.com:3001  // Falls back for custom domains
```

To override the endpoint, add a custom config before loading pages:

```javascript
window.LedgrConfig.apiEndpoint = 'https://custom-api.example.com';
```

---

## Monitoring

### Health Check
```bash
curl http://localhost:3001/v1/health
```

### Logs
- Development: Terminal output
- Staging/Production with pm2: `pm2 logs ledgr-backend`
- Staging/Production with systemd: `journalctl -u ledgr -f`

### Database
```bash
# Connect to database
psql -U postgres -d ledgr

# Check migrations
SELECT * FROM schema_migrations;
```

---

## Switching Environments

### From Development to Staging
```bash
cp .env.staging .env
# Update credentials in .env
npm install --production
```

### From Staging to Production
```bash
cp .env.production .env
# Load environment variables from secure vault
# DO NOT commit production credentials to version control
npm install --production
```

---

## Security Checklist

- [ ] Change all default secrets (JWT_SECRET, SESSION_SECRET, WEBHOOK_SECRET)
- [ ] Use strong, random passwords (30+ characters)
- [ ] Store production secrets in vault (AWS Secrets Manager, HashiCorp Vault, etc.)
- [ ] Enable SSL/TLS on all endpoints
- [ ] Configure CORS to allow only trusted origins
- [ ] Set rate limiting appropriately for environment
- [ ] Enable audit logging in production
- [ ] Regular database backups
- [ ] Monitor logs for suspicious activity

---

## Troubleshooting

### Backend Connection Issues

**Error: "Cannot reach backend server"**
```bash
# Check if backend is running
ps aux | grep "npm run"
ps aux | grep "tsx"

# Check if port is in use
lsof -i :3001

# Test backend directly
curl http://localhost:3001/v1/health
curl http://127.0.0.1:3001/v1/health
```

**Error: CORS policy blocked**
- Check `CORS_ORIGIN` includes frontend domain
- Verify backend is restarted after config change
- Check browser console for exact error

### Environment Variable Issues

**Variables not loading**
```bash
# Source .env file
set -a
source .env
set +a

# Verify variables
echo $PORT
echo $HOST
```

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql -h localhost -U postgres -d ledgr -c "SELECT 1;"

# Check DATABASE_URL format
postgresql://[user]:[password]@[host]:[port]/[database]
```

---

## Support

For issues or questions, refer to the main README.md or contact the development team.
