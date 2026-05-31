# Ledgr Production Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying Ledgr to production using AWS EKS, RDS, and other managed services.

**Key Metrics:**
- RTO (Recovery Time Objective): 1 hour
- RPO (Recovery Point Objective): 15 minutes
- Uptime SLA: 99.5%

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Local Development](#local-development)
4. [CI/CD Configuration](#cicd-configuration)
5. [Production Deployment](#production-deployment)
6. [Monitoring & Alerting](#monitoring--alerting)
7. [Disaster Recovery](#disaster-recovery)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

```bash
# AWS CLI
aws --version  # >= 2.13.0

# kubectl
kubectl version --client  # >= 1.27

# Docker
docker --version  # >= 24.0

# Helm (optional but recommended)
helm version  # >= 3.12

# Other tools
terraform --version  # >= 1.5.0 (for IaC)
jq  # JSON processor for AWS CLI parsing
```

### AWS Account Setup

1. **Create AWS Account** with appropriate permissions
2. **Configure AWS CLI:**
   ```bash
   aws configure
   # Enter: AWS Access Key, Secret, Region (us-east-1), Output (json)
   ```

3. **Required IAM Permissions:**
   - EKS cluster management
   - ECR (container registry)
   - RDS (database)
   - S3 (storage)
   - CloudWatch (logging)
   - Route 53 (DNS)
   - Secrets Manager

### GitHub Configuration

1. Create GitHub repository and add these secrets:
   ```
   AWS_ACCESS_KEY_ID
   AWS_SECRET_ACCESS_KEY
   AWS_ACCOUNT_ID
   SLACK_WEBHOOK_URL (optional, for notifications)
   ```

---

## Infrastructure Setup

### Step 1: Create EKS Cluster

```bash
# Set environment variables
export AWS_REGION=us-east-1
export CLUSTER_NAME=ledgr-production
export NODE_COUNT=3
export NODE_TYPE=t3.medium

# Create EKS cluster (takes ~15 minutes)
aws eks create-cluster \
  --name ${CLUSTER_NAME} \
  --version 1.27 \
  --roleArn arn:aws:iam::${AWS_ACCOUNT_ID}:role/eks-service-role \
  --resourcesVpcConfig \
    subnetIds=subnet-12345,subnet-67890,subnet-abcde \
    securityGroupIds=sg-12345 \
  --region ${AWS_REGION}

# Create node group
aws eks create-nodegroup \
  --cluster-name ${CLUSTER_NAME} \
  --nodegroup-name ledgr-nodes \
  --scaling-config minSize=3,maxSize=10,desiredSize=3 \
  --subnets subnet-12345 subnet-67890 subnet-abcde \
  --node-role arn:aws:iam::${AWS_ACCOUNT_ID}:role/NodeInstanceRole \
  --instance-types ${NODE_TYPE} \
  --region ${AWS_REGION}

# Update kubeconfig
aws eks update-kubeconfig \
  --name ${CLUSTER_NAME} \
  --region ${AWS_REGION}

# Verify connection
kubectl get nodes
```

### Step 2: Create RDS PostgreSQL Database

```bash
# Create security group for RDS
aws ec2 create-security-group \
  --group-name ledgr-rds-sg \
  --description "Security group for Ledgr RDS" \
  --vpc-id vpc-12345 \
  --region ${AWS_REGION}

# Allow EKS nodes to connect to RDS
aws ec2 authorize-security-group-ingress \
  --group-id sg-rds-12345 \
  --protocol tcp \
  --port 5432 \
  --source-security-group-id sg-eks-12345 \
  --region ${AWS_REGION}

# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier ledgr-postgres \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 16.0 \
  --master-username postgres \
  --master-user-password $(openssl rand -base64 32) \
  --allocated-storage 100 \
  --storage-type gp3 \
  --vpc-security-group-ids sg-rds-12345 \
  --db-subnet-group-name ledgr-subnet-group \
  --multi-az \
  --backup-retention-period 30 \
  --enable-iam-database-authentication \
  --enable-cloudwatch-logs-exports postgresql \
  --region ${AWS_REGION}

# Store password in Secrets Manager
aws secretsmanager create-secret \
  --name ledgr/rds/password \
  --description "RDS master password for Ledgr" \
  --secret-string "$(openssl rand -base64 32)" \
  --region ${AWS_REGION}

# Wait for RDS to be available (5-10 minutes)
aws rds wait db-instance-available \
  --db-instance-identifier ledgr-postgres \
  --region ${AWS_REGION}

# Get RDS endpoint
aws rds describe-db-instances \
  --db-instance-identifier ledgr-postgres \
  --query 'DBInstances[0].Endpoint.Address' \
  --region ${AWS_REGION}
```

### Step 3: Create ElastiCache Redis Cluster

```bash
# Create ElastiCache security group
CACHE_SG_ID=$(aws ec2 create-security-group \
  --group-name ledgr-cache-sg \
  --description "Security group for Ledgr ElastiCache" \
  --vpc-id vpc-12345 \
  --region ${AWS_REGION} | jq -r '.GroupId')

# Allow EKS to Redis
aws ec2 authorize-security-group-ingress \
  --group-id ${CACHE_SG_ID} \
  --protocol tcp \
  --port 6379 \
  --source-security-group-id sg-eks-12345 \
  --region ${AWS_REGION}

# Create Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id ledgr-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --engine-version 7.0 \
  --num-cache-nodes 1 \
  --cache-subnet-group-name ledgr-subnet-group \
  --security-group-ids ${CACHE_SG_ID} \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled \
  --region ${AWS_REGION}

# Get Redis endpoint
aws elasticache describe-cache-clusters \
  --cache-cluster-id ledgr-redis \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint' \
  --region ${AWS_REGION}
```

### Step 4: Create ECR Repositories

```bash
# Create repositories for frontend and backend
aws ecr create-repository \
  --repository-name ledgr-frontend \
  --region ${AWS_REGION}

aws ecr create-repository \
  --repository-name ledgr-backend \
  --region ${AWS_REGION}

# Enable image scanning
aws ecr put-image-scanning-configuration \
  --repository-name ledgr-frontend \
  --image-scanning-configuration scanOnPush=true \
  --region ${AWS_REGION}

aws ecr put-image-scanning-configuration \
  --repository-name ledgr-backend \
  --image-scanning-configuration scanOnPush=true \
  --region ${AWS_REGION}
```

### Step 5: Create S3 Buckets

```bash
# Create S3 buckets for documents, invoices, exports
aws s3api create-bucket \
  --bucket ledgr-documents-${AWS_ACCOUNT_ID} \
  --region ${AWS_REGION} \
  --create-bucket-configuration LocationConstraint=${AWS_REGION}

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket ledgr-documents-${AWS_ACCOUNT_ID} \
  --versioning-configuration Status=Enabled

# Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket ledgr-documents-${AWS_ACCOUNT_ID} \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket ledgr-documents-${AWS_ACCOUNT_ID} \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### Step 6: Configure Secrets Manager

```bash
# Store database credentials
aws secretsmanager create-secret \
  --name ledgr/database/credentials \
  --description "Database credentials for Ledgr" \
  --secret-string '{
    "username": "postgres",
    "password": "'$(openssl rand -base64 32)'",
    "host": "ledgr-postgres.c9akciq32.us-east-1.rds.amazonaws.com",
    "port": 5432,
    "dbname": "ledgr"
  }' \
  --region ${AWS_REGION}

# Store Redis credentials
aws secretsmanager create-secret \
  --name ledgr/redis/credentials \
  --description "Redis credentials for Ledgr" \
  --secret-string '{
    "password": "'$(openssl rand -base64 32)'",
    "host": "ledgr-redis.abc123.ng.0001.use1.cache.amazonaws.com",
    "port": 6379
  }' \
  --region ${AWS_REGION}

# Store JWT secret
aws secretsmanager create-secret \
  --name ledgr/jwt/secret \
  --description "JWT secret for Ledgr" \
  --secret-string "$(openssl rand -base64 64)" \
  --region ${AWS_REGION}

# Store API keys
aws secretsmanager create-secret \
  --name ledgr/api-keys \
  --description "Third-party API keys for Ledgr" \
  --secret-string '{
    "stripe_secret_key": "sk_live_...",
    "sendgrid_api_key": "SG...",
    "pinecone_api_key": "..."
  }' \
  --region ${AWS_REGION}
```

---

## Local Development

### Using Docker Compose

```bash
# Navigate to project root
cd /Users/test/Documents/Claude/Projects/Ledgr

# Start all services (frontend, backend, postgres, redis, prometheus, grafana)
docker-compose up -d

# View logs
docker-compose logs -f

# Access services
# Frontend: http://localhost:3000
# Backend: http://localhost:3001
# Grafana: http://localhost:3002 (admin/admin)
# Prometheus: http://localhost:9090

# Run database migrations
docker-compose exec postgres psql -U postgres -d ledgr -f /docker-entrypoint-initdb.d/init-db.sql

# Cleanup
docker-compose down -v
```

### Testing Database Connectivity

```bash
# Test PostgreSQL
docker-compose exec backend node -e "
  const pg = require('pg');
  new pg.Client({
    user: 'postgres',
    password: 'postgres',
    host: 'postgres',
    database: 'ledgr'
  }).connect((err, client) => {
    console.log(err ? 'FAILED: ' + err : 'SUCCESS');
  });
"

# Test Redis
docker-compose exec backend redis-cli -h redis -p 6379 ping
```

---

## CI/CD Configuration

### GitHub Actions Setup

1. **Add Repository Secrets:**
   - Go to Settings > Secrets and variables > Actions
   - Add the following secrets:
     ```
     AWS_ACCESS_KEY_ID
     AWS_SECRET_ACCESS_KEY
     AWS_ACCOUNT_ID
     SLACK_WEBHOOK_URL (optional)
     ```

2. **Push to main branch triggers pipeline:**
   ```bash
   git add .
   git commit -m "Setup production infrastructure"
   git push origin main
   ```

3. **Monitor pipeline:**
   - View at: https://github.com/your-org/ledgr/actions
   - Check logs for each stage

### Manual Docker Build

```bash
# Build frontend image
docker build -t ledgr-frontend:latest .

# Build backend image
docker build -f Dockerfile.backend -t ledgr-backend:latest ./server

# Tag for ECR
docker tag ledgr-frontend:latest ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/ledgr-frontend:latest

# Push to ECR
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/ledgr-frontend:latest
```

---

## Production Deployment

### Deploy to Kubernetes

```bash
# Update kubeconfig
aws eks update-kubeconfig --name ledgr-production --region ${AWS_REGION}

# Create namespace
kubectl create namespace ledgr

# Update image references in Kubernetes manifests
sed -i "s|ACCOUNT_ID|${AWS_ACCOUNT_ID}|g" kubernetes/*.yaml
sed -i "s|REGION|${AWS_REGION}|g" kubernetes/*.yaml

# Apply manifests
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/rbac.yaml
kubectl apply -f kubernetes/configmap.yaml
kubectl apply -f kubernetes/secrets.yaml
kubectl apply -f kubernetes/frontend-deployment.yaml
kubectl apply -f kubernetes/backend-deployment.yaml
kubectl apply -f kubernetes/service.yaml
kubectl apply -f kubernetes/ingress.yaml

# Verify deployments
kubectl get deployments -n ledgr
kubectl get pods -n ledgr
kubectl get services -n ledgr

# Check rollout status
kubectl rollout status deployment/frontend -n ledgr
kubectl rollout status deployment/backend -n ledgr
```

### Verify Health

```bash
# Check pod logs
kubectl logs -n ledgr deployment/frontend --tail=50
kubectl logs -n ledgr deployment/backend --tail=50

# Test endpoints
FRONTEND_URL=$(kubectl get svc frontend-service -n ledgr -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
curl -v http://${FRONTEND_URL}/health

# Check metrics
kubectl top nodes
kubectl top pods -n ledgr
```

### Enable HTTPS with Let's Encrypt

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Verify installation
kubectl get pods --namespace cert-manager

# Ingress will automatically get HTTPS certificate
kubectl get certificate -n ledgr
```

---

## Monitoring & Alerting

### Access Grafana

```bash
# Get Grafana service URL
kubectl get svc grafana-service -n ledgr -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Default credentials: admin / admin
# Change password immediately!
```

### Create Custom Dashboards

1. Login to Grafana
2. Create New Dashboard
3. Add panels for:
   - Request rates and latency
   - Error rates
   - Database connections
   - Memory and CPU usage
   - Pod restart counts

### Configure Alertmanager

```bash
# Update AlertManager configuration
kubectl create secret generic alertmanager-config \
  --from-file=alertmanager.yml \
  -n ledgr

# Deploy AlertManager
kubectl apply -f monitoring/alertmanager.yaml
```

### Setup Slack Notifications

```bash
# Get Slack webhook URL from Slack workspace

# Update AlertManager config with webhook
kubectl set env deployment/alertmanager \
  SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL} \
  -n ledgr
```

---

## Disaster Recovery

### Backup Strategy

**Daily Snapshots:**
```bash
# RDS automatic backups (30-day retention)
aws rds describe-db-snapshots \
  --db-instance-identifier ledgr-postgres \
  --region ${AWS_REGION}

# Manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier ledgr-postgres \
  --db-snapshot-identifier ledgr-postgres-manual-$(date +%Y%m%d) \
  --region ${AWS_REGION}

# S3 backup
aws s3 sync s3://ledgr-documents-${AWS_ACCOUNT_ID} \
  s3://ledgr-backups-${AWS_ACCOUNT_ID}/daily/$(date +%Y%m%d)/ \
  --region ${AWS_REGION}
```

### Point-in-Time Recovery

```bash
# Restore from RDS backup
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier ledgr-postgres-restored \
  --db-snapshot-identifier ledgr-postgres-manual-20240131 \
  --region ${AWS_REGION}
```

### Failover Procedure (RTO: 1 hour)

1. **Immediate Actions (5 minutes)**
   - Alert team in Slack
   - Initiate incident post
   - Switch DNS to secondary region (if configured)

2. **Database Recovery (15 minutes)**
   - Restore from latest RDS snapshot
   - Update connection strings in Secrets Manager
   - Run database migrations

3. **Application Recovery (30 minutes)**
   - Redeploy to fresh EKS cluster
   - Verify all health checks
   - Run smoke tests

4. **Validation (10 minutes)**
   - Test all critical paths
   - Verify data integrity
   - Check logs for errors

---

## Troubleshooting

### Common Issues

**Pod not starting:**
```bash
# Check pod events
kubectl describe pod <pod-name> -n ledgr

# Check logs
kubectl logs <pod-name> -n ledgr

# Check resource requests/limits
kubectl top pod <pod-name> -n ledgr
```

**Database connection issues:**
```bash
# Verify RDS is reachable
aws ec2 describe-security-groups \
  --group-ids sg-rds-12345 \
  --region ${AWS_REGION}

# Test connection
psql -h <rds-endpoint> -U postgres -d ledgr
```

**High latency:**
```bash
# Check frontend response times
kubectl exec -n ledgr <frontend-pod> -- \
  curl -w '@curl-format.txt' -o /dev/null -s http://backend-service:3000/health

# Check backend logs for slow queries
kubectl logs -n ledgr <backend-pod> | grep "duration:"
```

### Performance Tuning

1. **Database Query Optimization**
   - Add indexes: `CREATE INDEX idx_user_email ON users(email);`
   - Use EXPLAIN ANALYZE
   - Configure connection pooling (PgBouncer)

2. **Kubernetes Pod Scaling**
   ```bash
   # Check HPA status
   kubectl get hpa -n ledgr
   kubectl describe hpa frontend-hpa -n ledgr
   ```

3. **Cache Optimization**
   - Monitor Redis memory usage
   - Set appropriate TTLs for cache keys
   - Use cache invalidation strategies

---

## Maintenance

### Regular Tasks

- **Daily:** Monitor alerts, check logs
- **Weekly:** Review performance metrics, backup verification
- **Monthly:** Security patches, dependency updates, capacity planning
- **Quarterly:** Disaster recovery drill, performance optimization review

### Upgrade Procedures

```bash
# Update EKS cluster
aws eks update-cluster-version \
  --name ledgr-production \
  --kubernetes-version 1.28 \
  --region ${AWS_REGION}

# Upgrade node groups
aws eks update-nodegroup-version \
  --cluster-name ledgr-production \
  --nodegroup-name ledgr-nodes \
  --kubernetes-version 1.28 \
  --region ${AWS_REGION}
```

---

## Support & Escalation

- **On-Call:** Check PagerDuty schedule
- **Incident:** Create incident post, notify stakeholders
- **Critical:** Initiate war room, document timeline
- **Postmortem:** Conduct within 24 hours, identify root cause

---

## References

- [AWS EKS Documentation](https://docs.aws.amazon.com/eks/)
- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/cluster-administration/manage-deployment/)
- [Prometheus Monitoring](https://prometheus.io/docs/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)

---

**Last Updated:** 2024-05-31  
**Status:** Production Ready
