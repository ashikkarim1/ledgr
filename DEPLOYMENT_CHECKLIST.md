# Production Deployment Checklist

**Target Infrastructure:** AWS EKS  
**Estimated Timeline:** 90-120 minutes total (including AWS provisioning)  
**Deployment Windows:** Staging (anytime), Production (weekday business hours recommended)

---

## Phase 1: Prerequisites Verification (15 minutes)

### Local Environment
- [ ] Docker installed and running (`docker --version`)
- [ ] kubectl installed and accessible (`kubectl version --client`)
- [ ] AWS CLI v2 installed (`aws --version`)
- [ ] git installed and configured (`git config user.name`)
- [ ] GitHub CLI installed (optional but recommended: `gh --version`)

### AWS Account Readiness
- [ ] AWS account created with billing enabled
- [ ] IAM user created with AdministratorAccess or equivalent (temporary for setup)
- [ ] AWS credentials configured locally (`aws configure`)
- [ ] AWS region selected (recommend: me-central-1 for UAE, or us-east-1 for US)
- [ ] VPC available with public/private subnets (use default VPC for simplicity)

### GitHub Repository Readiness
- [ ] Repository created and code pushed
- [ ] GitHub repository secrets accessible (Settings > Secrets and variables > Actions)
- [ ] Branch protection rules reviewed (main branch protection optional for staging)

**Checkpoint:** All prerequisites verified before proceeding to Phase 2

---

## Phase 2: AWS Infrastructure Provisioning (45-60 minutes)

### 2.1: Create EKS Cluster
```bash
# Set variables
export AWS_REGION=us-east-1
export CLUSTER_NAME=ledgr-staging
export NODE_COUNT=3
export NODE_TYPE=t3.medium

# Create EKS cluster (eksctl is easiest)
eksctl create cluster \
  --name $CLUSTER_NAME \
  --version 1.29 \
  --region $AWS_REGION \
  --nodegroup-name ledgr-nodes \
  --nodes $NODE_COUNT \
  --nodes-min 2 \
  --nodes-max 10 \
  --node-type $NODE_TYPE \
  --enable-ssm \
  --managed

# Verify cluster creation
kubectl cluster-info
kubectl get nodes
```

**Action Items:**
- [ ] eksctl installed (`curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp && sudo mv /tmp/eksctl /usr/local/bin`)
- [ ] EKS cluster created successfully
- [ ] kubeconfig updated (`aws eks update-kubeconfig --name $CLUSTER_NAME --region $AWS_REGION`)
- [ ] Cluster accessible from kubectl

### 2.2: Create RDS PostgreSQL Database
```bash
# Create RDS security group (allow port 5432 from EKS nodes)
export SG_ID=$(aws ec2 create-security-group \
  --group-name ledgr-rds-sg \
  --description "RDS PostgreSQL for Ledgr" \
  --region $AWS_REGION \
  --query 'GroupId' --output text)

# Create RDS PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier ledgr-postgres-staging \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 16.1 \
  --master-username postgres \
  --master-user-password "$(openssl rand -base64 32)" \
  --allocated-storage 20 \
  --storage-type gp3 \
  --backup-retention-period 7 \
  --multi-az false \
  --publicly-accessible false \
  --region $AWS_REGION \
  --db-name ledgr

# Wait for RDS to be available (5-10 minutes)
aws rds wait db-instance-available \
  --db-instance-identifier ledgr-postgres-staging \
  --region $AWS_REGION

# Get RDS endpoint
export RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier ledgr-postgres-staging \
  --region $AWS_REGION \
  --query 'DBInstances[0].Endpoint.Address' --output text)

echo "RDS Endpoint: $RDS_ENDPOINT"
```

**Action Items:**
- [ ] RDS security group created
- [ ] RDS PostgreSQL instance created (db.t3.micro sufficient for staging)
- [ ] RDS status is "available" (check AWS Console or `aws rds describe-db-instances`)
- [ ] RDS endpoint captured (e.g., ledgr-postgres-staging.xxxxx.us-east-1.rds.amazonaws.com)
- [ ] Master password stored securely (password manager or AWS Secrets Manager)

### 2.3: Create ElastiCache Redis
```bash
# Create ElastiCache security group (allow port 6379 from EKS nodes)
export REDIS_SG=$(aws ec2 create-security-group \
  --group-name ledgr-redis-sg \
  --description "Redis for Ledgr caching" \
  --region $AWS_REGION \
  --query 'GroupId' --output text)

# Create ElastiCache Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id ledgr-redis-staging \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --engine-version 7.0 \
  --num-cache-nodes 1 \
  --automatic-failover-enabled \
  --port 6379 \
  --region $AWS_REGION

# Wait for Redis to be available (3-5 minutes)
aws elasticache wait cache-cluster-available \
  --cache-cluster-id ledgr-redis-staging \
  --region $AWS_REGION

# Get Redis endpoint
export REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id ledgr-redis-staging \
  --region $AWS_REGION \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Address' --output text)

echo "Redis Endpoint: $REDIS_ENDPOINT"
```

**Action Items:**
- [ ] Redis security group created
- [ ] ElastiCache Redis cluster created (cache.t3.micro sufficient for staging)
- [ ] Redis status is "available"
- [ ] Redis endpoint captured (e.g., ledgr-redis-staging.xxxxx.ng.0001.use1.cache.amazonaws.com)

### 2.4: Create ECR Repositories
```bash
# Create repositories for frontend and backend
aws ecr create-repository \
  --repository-name ledgr-frontend \
  --region $AWS_REGION

aws ecr create-repository \
  --repository-name ledgr-backend \
  --region $AWS_REGION

# Enable image scanning
aws ecr put-image-scanning-configuration \
  --repository-name ledgr-frontend \
  --image-scanning-configuration scanOnPush=true \
  --region $AWS_REGION

aws ecr put-image-scanning-configuration \
  --repository-name ledgr-backend \
  --image-scanning-configuration scanOnPush=true \
  --region $AWS_REGION

# Get ECR registry URI
export ECR_REGISTRY=$(aws ecr describe-repositories \
  --region $AWS_REGION \
  --query 'repositories[0].repositoryUri' --output text | cut -d'/' -f1)

echo "ECR Registry: $ECR_REGISTRY"
```

**Action Items:**
- [ ] ECR repositories created (ledgr-frontend, ledgr-backend)
- [ ] Image scanning enabled on both repositories
- [ ] ECR registry URI captured (e.g., 123456789.dkr.ecr.us-east-1.amazonaws.com)

### 2.5: Create Application Load Balancer
```bash
# Get default VPC and subnets
export VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
  --region $AWS_REGION --query 'Vpcs[0].VpcId' --output text)

export SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --region $AWS_REGION \
  --query 'Subnets[?MapPublicIpOnLaunch==`true`].SubnetId' --output text)

# Create ALB
export ALB_ARN=$(aws elbv2 create-load-balancer \
  --name ledgr-alb-staging \
  --subnets $SUBNET_IDS \
  --scheme internet-facing \
  --type application \
  --region $AWS_REGION \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# Get ALB DNS name
export ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --region $AWS_REGION \
  --query 'LoadBalancers[0].DNSName' --output text)

echo "ALB DNS: $ALB_DNS"

# Create target group for backend (port 8000)
export TG_ARN=$(aws elbv2 create-target-group \
  --name ledgr-backend-tg \
  --protocol HTTP \
  --port 8000 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --region $AWS_REGION \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# Create listener (port 80 -> target group)
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN \
  --region $AWS_REGION
```

**Action Items:**
- [ ] Application Load Balancer created
- [ ] Target group created for backend
- [ ] Listener configured (port 80 → backend)
- [ ] ALB DNS name captured (e.g., ledgr-alb-staging-123456.us-east-1.elb.amazonaws.com)

### 2.6: Create AWS Secrets Manager Entries
```bash
# Create secret for database credentials
aws secretsmanager create-secret \
  --name ledgr/postgres \
  --secret-string '{"host":"'$RDS_ENDPOINT'","port":5432,"user":"postgres","password":"YOUR_SECURE_PASSWORD"}' \
  --region $AWS_REGION

# Create secret for Redis
aws secretsmanager create-secret \
  --name ledgr/redis \
  --secret-string '{"host":"'$REDIS_ENDPOINT'","port":6379,"password":""}' \
  --region $AWS_REGION

# Create secret for third-party integrations (populate as needed)
aws secretsmanager create-secret \
  --name ledgr/integrations \
  --secret-string '{"stripe_key":"","openai_key":"","quickbooks_client_id":"","xero_client_id":""}' \
  --region $AWS_REGION
```

**Action Items:**
- [ ] Secrets created in AWS Secrets Manager
- [ ] All credentials stored securely (never in code or GitHub)

---

## Phase 3: GitHub Actions Secrets Configuration (10 minutes)

### Add Required Secrets to GitHub
Navigate to: **Settings > Secrets and variables > Actions**

Create the following secrets:

| Secret Name | Value | Source |
|---|---|---|
| `AWS_ACCOUNT_ID` | Your AWS account ID (12 digits) | AWS Console > Account |
| `AWS_REGION` | us-east-1 (or your chosen region) | From provisioning above |
| `EKS_CLUSTER_NAME_STAGING` | ledgr-staging | From EKS cluster creation |
| `EKS_CLUSTER_NAME_PROD` | ledgr-production | Create after staging validation |
| `ECR_REGISTRY` | 123456789.dkr.ecr.us-east-1.amazonaws.com | From ECR setup above |
| `AWS_ROLE_TO_ASSUME` | arn:aws:iam::ACCOUNT_ID:role/GitHubActionsRole | See IAM setup below |
| `SLACK_WEBHOOK` | https://hooks.slack.com/services/... | From Slack app configuration |
| `STRIPE_PUBLISHABLE_KEY` | pk_live_xxxxx | From Stripe dashboard |
| `STRIPE_SECRET_KEY` | sk_live_xxxxx | From Stripe dashboard |
| `OPENAI_API_KEY` | sk-xxxxx | From OpenAI dashboard |

**Action Items:**
- [ ] All GitHub Actions secrets added
- [ ] Secrets verified (cannot view after creation; ensure no typos)

### Create GitHub Actions IAM Role
```bash
# Create IAM role for GitHub Actions OIDC
export GITHUB_REPO="YOUR_GITHUB_ORG/ledgr"  # e.g., mycompany/ledgr

# Create trust policy JSON file
cat > /tmp/trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:GITHUB_REPO:*"
        }
      }
    }
  ]
}
EOF

# Update placeholders
sed -i "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" /tmp/trust-policy.json
sed -i "s|GITHUB_REPO|$GITHUB_REPO|g" /tmp/trust-policy.json

# Create role
aws iam create-role \
  --role-name GitHubActionsRole \
  --assume-role-policy-document file:///tmp/trust-policy.json \
  --region $AWS_REGION

# Attach EKS admin policy
aws iam attach-role-policy \
  --role-name GitHubActionsRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy \
  --region $AWS_REGION

aws iam attach-role-policy \
  --role-name GitHubActionsRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser \
  --region $AWS_REGION
```

**Action Items:**
- [ ] IAM OIDC provider configured for GitHub
- [ ] GitHubActionsRole created with appropriate permissions
- [ ] Role ARN stored as `AWS_ROLE_TO_ASSUME` secret

---

## Phase 4: Staging Deployment (20 minutes)

### 4.1: Update Kubernetes Manifests
Edit `/Users/test/Documents/Claude/Projects/Ledgr/kubernetes/configmap.yaml`:
- Update `API_URL` to staging ALB DNS (e.g., http://ledgr-alb-staging-123456.us-east-1.elb.amazonaws.com)
- Update database and Redis endpoints

### 4.2: Deploy via GitHub Actions
```bash
# Option A: Push code to trigger automatic deployment
git add .
git commit -m "chore: deploy to staging"
git push origin main

# Option B: Manually trigger workflow (if set up as workflow_dispatch)
gh workflow run deploy.yml -f environment=staging
```

**Action Items:**
- [ ] Kubernetes manifests updated with staging endpoints
- [ ] Code pushed to repository (triggers CI/CD pipeline)
- [ ] GitHub Actions workflow executed successfully
- [ ] All stages pass: Code Quality → Tests → Build → Security → Deploy Staging

### 4.3: Verify Staging Deployment
```bash
# Check deployment status
kubectl get deployments -n ledgr

# Check pod status
kubectl get pods -n ledgr

# Check service endpoints
kubectl get svc -n ledgr

# View logs from backend pod
kubectl logs -n ledgr -l app=backend --tail=100

# Port-forward to test locally (optional)
kubectl port-forward -n ledgr svc/backend 8000:8000
```

**Action Items:**
- [ ] All deployments in "Running" state
- [ ] All pods in "Ready" state
- [ ] No errors in pod logs

---

## Phase 5: Staging Validation (15 minutes)

### 5.1: Health Check
```bash
# Get ALB DNS
export STAGING_URL=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --region $AWS_REGION \
  --query 'LoadBalancers[0].DNSName' --output text)

# Test health endpoint
curl -s http://$STAGING_URL/api/health | jq .

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2026-05-31T12:00:00Z",
#   "uptime": 120
# }
```

**Action Items:**
- [ ] Health endpoint returns 200 OK
- [ ] Response contains "status": "healthy"

### 5.2: Database Connectivity
```bash
# Connect to RDS and verify tables
psql -h $RDS_ENDPOINT -U postgres -d ledgr -c "\dt"

# Expected: Tables for users, accounts, transactions, etc.
```

**Action Items:**
- [ ] Database connection successful
- [ ] All required tables created
- [ ] Schema migrations executed

### 5.3: API Endpoints
```bash
# Test authentication endpoint
curl -X POST http://$STAGING_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!","firstName":"Test"}'

# Test accounts endpoint
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://$STAGING_URL/api/accounts

# Test health endpoint
curl http://$STAGING_URL/health
```

**Action Items:**
- [ ] Auth endpoints respond correctly
- [ ] Protected endpoints require valid JWT token
- [ ] Error responses are properly formatted

### 5.4: Form Submission
```bash
# Test waitlist form
curl -X POST http://$STAGING_URL/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","company":"Test Co"}'

# Expected: 201 Created or 200 OK
```

**Action Items:**
- [ ] Waitlist form submission succeeds
- [ ] Email stored in database
- [ ] No JavaScript errors in console

### 5.5: Load Test (Optional but Recommended)
```bash
# Install Apache Bench (if not already installed)
# brew install httpd  (macOS) or apt-get install apache2-utils (Linux)

# Run 100 requests with 10 concurrent
ab -n 100 -c 10 http://$STAGING_URL/

# Expected: Response time < 500ms p95, 0 failed requests
```

**Action Items:**
- [ ] Page responds to concurrent requests
- [ ] No 500 errors under load
- [ ] Average response time acceptable

---

## Phase 6: Production Infrastructure (45-60 minutes)

Repeat Phase 2 steps for production environment:
- Create production EKS cluster (`ledgr-production`)
- Create production RDS instance with Multi-AZ enabled
- Create production Redis cluster with automatic failover
- Create production ECR repositories
- Create production ALB
- Create production Secrets Manager entries

**Key Differences for Production:**
- Multi-AZ enabled for RDS (2+ availability zones)
- At least 3 nodes in EKS cluster (for HA)
- Auto-scaling configured (min 3, max 15 nodes)
- CloudFront CDN in front of ALB
- Enhanced monitoring and alerting

**Action Items:**
- [ ] Production EKS cluster created with 3+ nodes
- [ ] Production RDS configured with Multi-AZ
- [ ] Production Redis cluster created
- [ ] Production ECR repositories created
- [ ] Production ALB created
- [ ] Production endpoints captured
- [ ] GitHub Actions secrets updated with production endpoints

---

## Phase 7: Production Deployment (15 minutes)

### 7.1: Update Production Secrets
```bash
# Create production-specific GitHub Actions secret
gh secret set EKS_CLUSTER_NAME_PROD --body "ledgr-production"
gh secret set PROD_DATABASE_URL --body "postgresql://postgres:password@ledgr-postgres-prod.xxx.us-east-1.rds.amazonaws.com:5432/ledgr"
```

### 7.2: Deploy to Production
```bash
# Trigger production deployment
git tag v1.0.0
git push origin v1.0.0

# OR manually trigger
gh workflow run deploy.yml -f environment=production
```

**Action Items:**
- [ ] Manual approval gate passed (if configured)
- [ ] Production deployment initiated
- [ ] All stages pass in CI/CD pipeline
- [ ] Slack notification received (deployment started)

### 7.3: Monitor Production Rollout
```bash
# Watch rollout status (5-10 minutes typical)
kubectl rollout status deployment/backend -n ledgr --timeout=10m

# Check pod logs
kubectl logs -n ledgr -l app=backend --tail=50

# Get production URL
export PROD_URL=$(aws elbv2 describe-load-balancers \
  --region $AWS_REGION \
  --query 'LoadBalancers[?LoadBalancerName==`ledgr-alb-prod`].DNSName' --output text)

echo "Production URL: $PROD_URL"
```

**Action Items:**
- [ ] Rollout completes successfully (all pods ready)
- [ ] No errors in production logs
- [ ] Production health endpoint responds

### 7.4: Post-Deployment Validation
```bash
# Test production endpoints
curl -s https://$PROD_URL/api/health | jq .

# Verify database connectivity
curl -s https://$PROD_URL/api/accounts -H "Authorization: Bearer YOUR_JWT"

# Test form submission
curl -X POST https://$PROD_URL/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"prod@example.com","company":"Production Co"}'
```

**Action Items:**
- [ ] Production health check passes
- [ ] API endpoints respond correctly
- [ ] Form submissions work
- [ ] No 5xx errors in response

---

## Phase 8: Post-Deployment Monitoring (Ongoing)

### 8.1: Configure Monitoring Alerts
- [ ] Prometheus scraping metrics from /metrics endpoint
- [ ] Grafana dashboards displaying:
  - Request rate and latency
  - Error rate (4xx, 5xx)
  - Database connection pool usage
  - Redis cache hit rate
  - Pod resource utilization (CPU, memory)
- [ ] AlertManager configured with Slack/PagerDuty notifications
  - Alert on error rate > 5%
  - Alert on p95 latency > 1000ms
  - Alert on pod restart loops
  - Alert on disk usage > 80%

### 8.2: Log Aggregation
- [ ] CloudWatch Logs configured for all pod logs
- [ ] Log retention set to 30 days
- [ ] Log insights queries created for:
  - Authentication failures
  - Database errors
  - Unhandled exceptions
  - Slow queries

### 8.3: Runbook Preparation
- [ ] Create incident response runbook
- [ ] Document rollback procedure
- [ ] Create on-call rotation schedule
- [ ] Set up status page (e.g., Statuspage.io)

**Action Items:**
- [ ] Monitoring fully configured and tested
- [ ] Alert channels verified (Slack, PagerDuty, etc.)
- [ ] Team aware of incident response procedure

---

## Phase 9: Third-Party Integrations (Varies by Integration)

### 9.1: Stripe Payment Processing
```bash
# Test Stripe webhook
# 1. Use Stripe CLI to forward webhooks to local instance
stripe listen --forward-to localhost:8000/webhooks/stripe

# 2. In another terminal, trigger test event
stripe trigger payment_intent.succeeded

# 3. Verify webhook received and processed
curl http://localhost:8000/api/webhooks/stripe
```

**Action Items:**
- [ ] Stripe API keys configured (publishable + secret)
- [ ] Webhook endpoints registered in Stripe dashboard
- [ ] Test payment flow end-to-end
- [ ] Webhook signature verification enabled

### 9.2: QuickBooks Integration
```bash
# 1. Configure OAuth credentials in .env
QUICKBOOKS_REALM_ID=123456789
QUICKBOOKS_CLIENT_ID=xxx
QUICKBOOKS_CLIENT_SECRET=xxx
QUICKBOOKS_REDIRECT_URI=https://production-url/integrations/quickbooks/callback

# 2. Test authorization flow
curl "https://appcenter.intuit.com/connect/oauth2?client_id=xxx&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=xxx"

# 3. Verify data sync
curl -H "Authorization: Bearer YOUR_JWT" \
  https://$PROD_URL/api/integrations/quickbooks/sync
```

**Action Items:**
- [ ] QuickBooks OAuth configured
- [ ] Test sync with sample company
- [ ] Error handling for sync failures implemented
- [ ] Audit log entries created for all syncs

### 9.3: Xero Integration
Similar to QuickBooks; follow Xero API documentation for OAuth setup.

### 9.4: Plaid Integration
```bash
# Configure Plaid credentials
PLAID_CLIENT_ID=xxx
PLAID_SECRET=xxx
PLAID_PUBLIC_KEY=xxx

# Test link flow (UI component testing)
# Test account retrieval after successful link
```

**Action Items:**
- [ ] Plaid credentials configured
- [ ] Link token generation working
- [ ] Account data retrieval tested
- [ ] Error handling for invalid credentials

### 9.5: OpenAI Integration
```bash
# Test AI agents
curl -X POST https://$PROD_URL/api/ai/analyze \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"query":"summarize my transactions for Q1"}'

# Expected: Intelligent response based on account data
```

**Action Items:**
- [ ] OpenAI API key configured
- [ ] Prompt templates reviewed and finalized
- [ ] Rate limiting implemented (to control costs)
- [ ] Testing done with realistic prompts

---

## Final Verification Checklist

- [ ] **Design System:** All pages render with Corgi orange accent (#FF5C00)
- [ ] **Performance:** Lighthouse score > 80 on all pages (staging)
- [ ] **Security:** No OWASP Top 10 vulnerabilities in security scan
- [ ] **Availability:** Uptime > 99.9% measured over 24 hours (staging)
- [ ] **Database:** All migrations executed, schema verified
- [ ] **Authentication:** JWT tokens working, RBAC enforced
- [ ] **Forms:** All form submissions working, data persisting
- [ ] **Integrations:** All third-party APIs responding correctly
- [ ] **Monitoring:** All metrics visible in Grafana, alerts configured
- [ ] **Documentation:** Runbooks, architecture diagrams, and procedures documented
- [ ] **Team Readiness:** All team members trained on deployment and incident response

---

## Rollback Procedure (If Needed)

```bash
# Immediate rollback to previous image version
kubectl rollout undo deployment/backend -n ledgr
kubectl rollout undo deployment/frontend -n ledgr

# Verify rollback completed
kubectl rollout status deployment/backend -n ledgr --timeout=5m

# Check metrics returned to normal
# Monitor through Grafana until confidence restored
```

**Action Items (If Rollback Executed):**
- [ ] Rollback completed successfully
- [ ] Services restored to previous version
- [ ] Root cause analysis initiated
- [ ] Deployment paused pending investigation

---

## Sign-Off

**Staging Deployment Completed By:** _______________  
**Date/Time:** _______________  

**Production Deployment Completed By:** _______________  
**Date/Time:** _______________  

**Post-Deployment Monitoring Active:** Yes / No  
**Incident Response Team Notified:** Yes / No  

