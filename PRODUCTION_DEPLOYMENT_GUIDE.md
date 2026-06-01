# LEDGR PRODUCTION DEPLOYMENT GUIDE

**Last Updated**: May 31, 2026  
**Status**: Production Ready  
**Version**: 1.0.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites](#prerequisites)
4. [Local Development Setup](#local-development-setup)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Staging Deployment](#staging-deployment)
7. [Production Deployment](#production-deployment)
8. [Post-Deployment Verification](#post-deployment-verification)
9. [Monitoring & Alerting](#monitoring--alerting)
10. [Rollback Procedures](#rollback-procedures)
11. [Troubleshooting](#troubleshooting)

---

## Executive Summary

Ledgr is a production-ready autonomous finance platform built with:
- **Frontend**: Static HTML/CSS/JavaScript (0 dependencies)
- **Backend**: Node.js/TypeScript with Express.js
- **Database**: PostgreSQL with Row-Level Security
- **Cache**: Redis
- **Vector DB**: Pinecone/Weaviate for RAG
- **Container Runtime**: Docker + Kubernetes
- **Cloud**: AWS (ECS/EKS)

**Deployment Time**: 15-20 minutes  
**Expected Downtime**: ~2 minutes (rolling update)  
**Rollback Time**: <5 minutes

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet (HTTPS)                     │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────▼─────────┐
        │   CloudFront CDN  │
        │  (Cache + WAF)    │
        └─────────┬─────────┘
                  │
        ┌─────────▼──────────────┐
        │  Application Load      │
        │  Balancer (ALB/NLB)    │
        └─────────┬──────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼──┐      ┌──▼───┐     ┌──▼───┐
│Front │      │Front │     │Front │
│end-1 │      │end-2 │ ... │end-N │
└──────┘      └──────┘     └──────┘
    │             │             │
    │   ┌─────────┼─────────┐   │
    │   │         │         │   │
    └───┼─────┬───┴───┬─────┼───┘
        │     │       │     │
    ┌───▼─────▼─┐  ┌──▼─────▼──┐
    │  Backend  │  │  Backend   │
    │  Pod 1-N  │  │  Pod N+1-M │
    └───┬─────┬─┘  └──┬─────┬──┘
        │     │       │     │
    ┌───▼─────▼───────▼─────▼──┐
    │    PostgreSQL RDS Cluster │
    │   (Master + Read Replicas)│
    └────────────────────────────┘
        │     ┌────────────┐
        │     │    Redis   │
        │     │  ElastiCache
        │     └────────────┘
        │
    ┌───▼─────────────────┐
    │  Vector DB          │
    │  (Pinecone/Weaviate)│
    └─────────────────────┘

External Services:
- QuickBooks Online (OAuth)
- Xero (OAuth)
- Plaid (Banking)
- Stripe (Payments)
- SendGrid/AWS SES (Email)
- WhatsApp Business (Messaging)
- OpenAI/Anthropic (LLM)
```

---

## Prerequisites

### Required Software
- Docker 24.0+
- Docker Compose 2.20+
- kubectl 1.27+
- Helm 3.12+ (optional, for advanced deployments)
- AWS CLI v2
- Git

### AWS Account Requirements
- ECS cluster or EKS cluster (kubernetes preferred)
- RDS PostgreSQL instance (Multi-AZ)
- ElastiCache Redis cluster
- ECR repositories (frontend, backend)
- S3 buckets (for file storage)
- ALB or NLB load balancer
- CloudFront distribution
- IAM roles and policies
- CloudWatch for logging
- Secrets Manager for credentials

### Third-Party Integrations
- Pinecone API key (vector database)
- Stripe API key (payments)
- OpenAI API key (LLM)
- SendGrid API key (email)
- WhatsApp Business API credentials
- QuickBooks developer app credentials
- Xero developer app credentials
- Plaid developer credentials

---

## Local Development Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-org/ledgr.git
cd ledgr
```

### 2. Create Environment File
```bash
cp .env.example .env
# Edit .env with your local development values
```

### 3. Start Development Environment
```bash
docker-compose up -d
```

This will start:
- Frontend (http://localhost:3000)
- Backend API (http://localhost:3001)
- PostgreSQL (localhost:5432)
- Redis (localhost:6379)
- Milvus Vector DB (localhost:19530)
- Prometheus (http://localhost:9090)
- Grafana (http://localhost:3002)

### 4. Initialize Database
```bash
docker-compose exec postgres psql -U postgres -d ledgr \
  -f /docker-entrypoint-initdb.d/init-db.sql
```

### 5. Run Tests
```bash
docker-compose exec backend npm test
docker-compose exec backend npm run test:integration
```

### 6. Verify Setup
```bash
# Check health
curl http://localhost:3001/api/v1/health

# Check database
docker-compose exec postgres psql -U postgres -d ledgr \
  -c "SELECT COUNT(*) FROM organizations;"

# Check cache
docker-compose exec redis redis-cli ping

# Check vector DB
curl http://localhost:19530/healthz
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

**File**: `.github/workflows/deploy.yml`

The CI/CD pipeline:
1. **Trigger**: On push to `main` branch
2. **Build**: Docker images for frontend and backend
3. **Test**: Unit tests, integration tests, security scanning
4. **Push**: Images to ECR
5. **Deploy Staging**: Apply K8s manifests to staging cluster
6. **Smoke Tests**: Verify staging deployment
7. **Deploy Production**: Apply K8s manifests to production (manual approval)

### Push to Trigger Deploy
```bash
git add .
git commit -m "feat: update features"
git push origin main
```

This automatically:
- Builds Docker images
- Pushes to ECR
- Runs tests
- Deploys to staging
- Awaits manual approval for production

---

## Staging Deployment

### 1. Verify Staging Environment
```bash
# Check pod status
kubectl get pods -n ledgr-staging

# Check logs
kubectl logs -n ledgr-staging deployment/frontend

# Run smoke tests
kubectl exec -n ledgr-staging -it deployment/backend -- npm run test:smoke

# Check health endpoints
kubectl port-forward -n ledgr-staging service/backend 3001:3000
curl http://localhost:3001/api/v1/health
```

### 2. Test Key Features
- [ ] Login with test account
- [ ] Chat with help centre AI
- [ ] Run agent task
- [ ] Create invoice via AP agent
- [ ] View financial dashboard
- [ ] Test integrations (QuickBooks sync)
- [ ] Process payment via Stripe
- [ ] Check error alerts

### 3. Performance Test
```bash
# Load testing with k6
k6 run load-test.js --vus 100 --duration 5m
```

### 4. Security Scan
```bash
# Container image scanning
aws ecr describe-image-scan-findings \
  --repository-name ledgr/frontend \
  --image-id imageTag=latest

# Penetration testing
# Run OWASP ZAP or similar
```

---

## Production Deployment

### Pre-Deployment Checklist
- [ ] All tests passing in staging
- [ ] No critical security vulnerabilities
- [ ] Database backup completed
- [ ] Rollback plan documented
- [ ] Team members on standby
- [ ] Maintenance window scheduled (off-peak)
- [ ] Stakeholders notified

### 1. Create Production Secret
```bash
# Create .env for production
cp .env.example .env.prod

# Edit with production credentials
vim .env.prod

# Create Kubernetes secret
kubectl create secret generic ledgr-secrets \
  --from-env-file=.env.prod \
  -n ledgr \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 2. Deploy to Production
```bash
# Option 1: Via GitHub Actions
# Push to main + approve deployment in GitHub Actions UI

# Option 2: Manual kubectl apply
kubectl apply -f kubernetes/namespaces.yaml
kubectl apply -f kubernetes/config-maps.yaml
kubectl apply -f kubernetes/secrets.yaml
kubectl apply -f kubernetes/deployments.yaml
kubectl apply -f kubernetes/services.yaml
kubectl apply -f kubernetes/ingress.yaml
```

### 3. Monitor Rollout
```bash
# Watch deployment progress
kubectl rollout status deployment/frontend -n ledgr
kubectl rollout status deployment/backend -n ledgr

# Check pod events
kubectl describe pod <pod-name> -n ledgr

# Tail logs
kubectl logs -f deployment/frontend -n ledgr
kubectl logs -f deployment/backend -n ledgr
```

### 4. Verify Deployment
```bash
# Port forward to test
kubectl port-forward -n ledgr service/frontend 3000:80
kubectl port-forward -n ledgr service/backend 3001:3000

# Verify endpoints
curl http://localhost:3000
curl http://localhost:3001/api/v1/health
```

---

## Post-Deployment Verification

### Automated Checks
```bash
#!/bin/bash
set -e

echo "🔍 Running post-deployment verification..."

# 1. Check pod status
echo "✓ Checking pod status..."
kubectl get pods -n ledgr | grep -i running

# 2. Check health endpoints
echo "✓ Checking health endpoints..."
curl -f http://api.ledgr.ai/health || exit 1

# 3. Check database connectivity
echo "✓ Checking database..."
kubectl exec -n ledgr deployment/backend -- \
  npm run check-db || exit 1

# 4. Check Redis
echo "✓ Checking Redis..."
kubectl exec -n ledgr deployment/backend -- \
  npm run check-cache || exit 1

# 5. Check integrations
echo "✓ Checking integrations..."
curl -f http://api.ledgr.ai/api/v1/integrations/status || exit 1

# 6. Check metrics
echo "✓ Checking metrics..."
curl -f http://prometheus.ledgr.ai/metrics || exit 1

echo "✅ All checks passed!"
```

### Manual Verification Checklist
- [ ] Frontend loads without errors
- [ ] Dashboard displays correctly
- [ ] Chat widget appears and functions
- [ ] Login/authentication works
- [ ] Can create new workspace
- [ ] Agents appear online
- [ ] Real-time activity feed updates
- [ ] Integration status shows connected services
- [ ] Can initiate payment flow
- [ ] Error alerts appear in monitoring

### Metrics to Monitor (First 1 Hour)
```
Error Rate: < 1%
P95 Latency: < 500ms
P99 Latency: < 2000ms
HTTP 5xx Rate: < 0.1%
Pod Restart Count: 0
CPU Usage: 30-60%
Memory Usage: 50-70%
Database Connections: Normal
Redis Memory: Normal
```

---

## Monitoring & Alerting

### Prometheus Scrape Targets
```yaml
# kubernetes/prometheus-config.yaml
global:
  scrape_interval: 15s
  
scrape_configs:
  - job_name: 'frontend'
    static_configs:
      - targets: ['localhost:9090']
  
  - job_name: 'backend'
    static_configs:
      - targets: ['localhost:9091']
  
  - job_name: 'database'
    static_configs:
      - targets: ['localhost:9187']
  
  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']
```

### Alert Rules
```yaml
groups:
  - name: ledgr.rules
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
      
      - alert: HighLatency
        expr: histogram_quantile(0.95, http_request_duration_seconds) > 0.5
        for: 5m
        labels:
          severity: warning
      
      - alert: PodRestartingTooOften
        expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
        for: 5m
        labels:
          severity: warning
      
      - alert: DatabaseConnectionPoolExhausted
        expr: pg_stat_activity_count > 95
        for: 2m
        labels:
          severity: critical
```

### Grafana Dashboards
- System Overview (CPU, Memory, Disk)
- API Performance (Latency, Throughput, Errors)
- Database Performance (Connections, Queries, Lock Time)
- Agent Activity (Tasks, Success Rate, Avg Duration)
- User Activity (Active Users, Login Attempts, Session Duration)

---

## Rollback Procedures

### Immediate Rollback (if critical issue)
```bash
# Option 1: Kubernetes automatic rollback
kubectl rollout undo deployment/frontend -n ledgr
kubectl rollout undo deployment/backend -n ledgr

# Option 2: Manual rollback to specific revision
kubectl rollout history deployment/frontend -n ledgr
kubectl rollout undo deployment/frontend -n ledgr --to-revision=2

# Verify rollback
kubectl rollout status deployment/frontend -n ledgr
```

### Database Rollback (if migration failed)
```bash
# List available backups
aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier ledgr-db

# Restore from backup
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier ledgr-db-restored \
  --snapshot-identifier ledgr-db-backup-2024-05-31
```

### Full Rollback Documentation
See DEPLOYMENT_CHECKLIST.md section "Rollback Procedure"

---

## Troubleshooting

### Pod Not Starting
```bash
# Check pod events
kubectl describe pod <pod-name> -n ledgr

# Check logs
kubectl logs <pod-name> -n ledgr
kubectl logs <pod-name> -n ledgr --previous

# Check resources
kubectl top pods -n ledgr
```

### Database Connection Failed
```bash
# Check database endpoint
kubectl get secret ledgr-secrets -n ledgr -o jsonpath='{.data.DATABASE_URL}' | base64 -d

# Test connection
kubectl run -it --rm debug --image=postgres:16 --restart=Never -- \
  psql postgresql://user:password@db.example.com:5432/ledgr

# Check RDS status
aws rds describe-db-instances --db-instance-identifier ledgr-db
```

### High Memory/CPU Usage
```bash
# Get resource metrics
kubectl top pods -n ledgr

# Check for memory leaks
kubectl logs deployment/backend -n ledgr | grep -i "memory\|oom"

# Increase resource limits
kubectl set resources deployment/backend \
  --limits=memory=2Gi,cpu=1000m \
  -n ledgr
```

### API Latency Increasing
```bash
# Check database slow queries
psql postgresql://... -c "SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check Redis memory
kubectl exec -n ledgr deployment/backend -- redis-cli info memory

# Check network latency
kubectl exec -n ledgr deployment/backend -- \
  ping <rds-endpoint>
```

### Monitoring Alert Triggered
```bash
# 1. Check metrics in Grafana
# 2. Check logs for errors
# 3. Check pod restart count
kubectl get pods -n ledgr --sort-by=.status.containerStatuses[0].restartCount

# 4. Check events
kubectl get events -n ledgr --sort-by='.lastTimestamp'

# 5. If persistent, initiate rollback
kubectl rollout undo deployment/backend -n ledgr
```

---

## Production Support Contacts

**On-Call Engineer**: [Contact Info]  
**DevOps Lead**: [Contact Info]  
**Infrastructure Team**: [Slack Channel]  
**Incident Response**: [PagerDuty / On-Call Schedule]  

---

## Additional Resources

- **Architecture Docs**: See ARCHITECTURE.md
- **Database Schema**: See DATABASE_SUMMARY.txt
- **API Documentation**: See API_SPEC.md
- **Security Guidelines**: See SECURITY_ARCHITECTURE.md
- **Monitoring Setup**: See INFRASTRUCTURE.md
- **Integration Guides**: See INTEGRATIONS_GUIDE.md

---

**Last Updated**: 2024-05-31  
**Next Review**: Post-launch evaluation
