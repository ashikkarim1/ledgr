# Ledgr Production Infrastructure

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CloudFront/CDN                        │
│                    (Static Assets Cache)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    Route 53 (DNS)                           │
│            (Health checks & failover routing)               │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Network Load Balancer (NLB)                    │
│         (High performance, low latency routing)             │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│          AWS EKS Kubernetes Cluster (Production)            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Kubernetes Namespace: ledgr             │  │
│  │                                                       │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │   Frontend (Nginx - Static Files)            │   │  │
│  │  │   • 3 replicas (min), 10 (max)               │   │  │
│  │  │   • Auto-scaling by CPU/Memory               │   │  │
│  │  │   • Health checks every 30s                  │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │   Backend (Node.js/Express API)              │   │  │
│  │  │   • 3 replicas (min), 15 (max)               │   │  │
│  │  │   • Auto-scaling by CPU/Memory               │   │  │
│  │  │   • Liveness & readiness probes              │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │   Prometheus (Metrics Collection)            │   │  │
│  │  │   • 2 replicas for HA                        │   │  │
│  │  │   • 30-day retention                         │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │   Grafana (Dashboards & Alerting)            │   │  │
│  │  │   • 2 replicas for HA                        │   │  │
│  │  │   • Pre-configured datasources               │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────┬──────────────┬──────────────┬──────────────────┘
           │              │              │
    ┌──────▼──┐    ┌──────▼──┐   ┌──────▼──┐
    │   RDS   │    │ Redis   │   │   S3    │
    │PostgreSQL   │ElastiCache  │Bucket  │
    │ (Multi-AZ) │  (Cluster)  │(Documents)│
    │ (30d backup)│(6GB Cache) │(Versioned)│
    └─────────┘    └─────────┘   └─────────┘
```

## Technology Stack

### Compute
- **Container Orchestration:** Kubernetes (AWS EKS) 1.27+
- **Container Runtime:** containerd
- **Load Balancing:** Network Load Balancer (NLB)
- **Ingress:** nginx-ingress-controller with cert-manager

### Storage
- **Database:** PostgreSQL 16 (AWS RDS, Multi-AZ)
- **Cache:** Redis 7 (AWS ElastiCache)
- **Object Storage:** S3 (versioning, encryption)
- **Vector DB:** Pinecone (managed) or Weaviate

### Monitoring & Logging
- **Metrics:** Prometheus
- **Visualization:** Grafana
- **Logs:** CloudWatch / ELK (optional)
- **Alerting:** AlertManager
- **APM:** Optional (Datadog, New Relic, etc.)

### CI/CD
- **Version Control:** GitHub
- **CI/CD Platform:** GitHub Actions
- **Image Registry:** ECR (Elastic Container Registry)
- **Infrastructure as Code:** Terraform (optional)

### Security
- **Container Scanning:** Trivy
- **Secrets Management:** AWS Secrets Manager
- **TLS Certificates:** Let's Encrypt (via cert-manager)
- **Network Policy:** Kubernetes NetworkPolicy
- **RBAC:** Service accounts with minimal permissions

---

## Deployment Pipeline

### Stage 1: Lint & Test
- Code linting (ESLint, Prettier)
- Unit tests (Jest)
- Security audit (npm audit)
- Dependency vulnerability scan

### Stage 2: Build
- Multi-stage Docker builds (optimized, ~150MB frontend, ~300MB backend)
- Image scanning with Trivy
- Push to ECR with git commit hash tag

### Stage 3: Deploy to Staging
- Update EKS kubeconfig
- Create/update Kubernetes namespace
- Apply ConfigMaps and Secrets
- Deploy to staging cluster
- Run smoke tests

### Stage 4: Integration Tests
- E2E tests against staging
- Load testing (k6 with 1000 concurrent users)
- Performance benchmarking

### Stage 5: Deploy to Production
- Backup current deployment
- Apply manifests to production cluster
- Wait for rollout (10 minute timeout)
- Verify health checks
- Automatic rollback on failure

---

## File Structure

```
.
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions CI/CD pipeline
├── kubernetes/
│   ├── namespace.yaml              # K8s namespace definition
│   ├── rbac.yaml                   # Service accounts & roles
│   ├── configmap.yaml              # ConfigMaps & configs
│   ├── secrets.yaml                # K8s Secrets (template)
│   ├── frontend-deployment.yaml    # Frontend deployment & HPA
│   ├── backend-deployment.yaml     # Backend deployment & HPA
│   ├── service.yaml                # K8s Services
│   ├── ingress.yaml                # Ingress & TLS config
│   └── monitoring-deployment.yaml  # Prometheus & Grafana
├── monitoring/
│   ├── prometheus.yml              # Prometheus config
│   ├── alert-rules.yml             # Alert rules
│   ├── grafana-datasources.yml     # Grafana datasources
│   └── grafana-dashboards.yml      # Dashboard provisioning
├── Dockerfile                       # Frontend container (nginx)
├── Dockerfile.backend               # Backend container (Node.js)
├── .dockerignore                    # Docker ignore file
├── docker-compose.yml               # Local dev environment
├── nginx.conf                       # Nginx configuration
├── DEPLOYMENT_GUIDE.md              # Step-by-step deployment
├── INFRASTRUCTURE.md                # This file
└── .gitignore.deployment           # Deployment-specific ignores
```

---

## Quick Start

### 1. Local Development (Docker Compose)

```bash
# Start all services
docker-compose up -d

# Frontend: http://localhost:3000
# Backend: http://localhost:3001
# Grafana: http://localhost:3002 (admin/admin)
# Prometheus: http://localhost:9090

# Cleanup
docker-compose down -v
```

### 2. Deploy to Staging

```bash
# Push to main branch (this triggers CI/CD)
git push origin main

# Monitor at: https://github.com/your-org/ledgr/actions
```

### 3. Deploy to Production

After staging passes all tests, production deployment is automatic on merge to main.

---

## Configuration Management

### ConfigMaps (Non-Sensitive)
- Environment variables (NODE_ENV, LOG_LEVEL)
- Application settings (timeouts, limits)
- Service endpoints
- Nginx configuration

### Secrets (AWS Secrets Manager)
- Database credentials
- Redis password
- JWT secret
- API keys (Pinecone, Stripe, SendGrid)
- AWS credentials

**NEVER commit secrets to Git!** Use `kubernetes/secrets.yaml` as a template.

---

## High Availability

### Frontend
- **3 minimum replicas** across multiple nodes
- **10 maximum replicas** with HPA enabled
- Pod Disruption Budget (PDB): min 2 available
- Health checks: 30s interval, 3s timeout

### Backend
- **3 minimum replicas** across multiple zones
- **15 maximum replicas** with HPA enabled
- Pod Disruption Budget (PDB): min 2 available
- Graceful shutdown: 60s termination grace period

### Database
- **Multi-AZ RDS** with automatic failover
- **30-day backup retention** with point-in-time recovery
- **Read replicas** for reporting queries
- **Connection pooling** with PgBouncer

### Cache
- **Redis Cluster** with 3+ nodes (if production)
- **Automatic persistence** (RDB snapshots)
- **Auto-failover** on node failure

---

## Disaster Recovery

| Metric | Value |
|--------|-------|
| RTO (Recovery Time Objective) | 1 hour |
| RPO (Recovery Point Objective) | 15 minutes |
| Backup Frequency | Daily snapshots + continuous WAL |
| Backup Retention | 30 days |
| Test Frequency | Quarterly |

### Failover Checklist

1. **Detect** - Alert fires when service down
2. **Notify** - Slack message to team
3. **Assess** - 5-minute assessment window
4. **Restore** - Restore from latest backup (15 min)
5. **Deploy** - Redeploy to fresh cluster (30 min)
6. **Verify** - Health checks and smoke tests (10 min)

---

## Performance Targets

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Page Load Time | < 2s | > 3s |
| API Response (p95) | < 500ms | > 1s |
| Error Rate | < 0.1% | > 1% |
| Uptime | 99.5% | < 99% |
| CPU Usage | < 70% | > 80% |
| Memory Usage | < 70% | > 80% |
| DB Connections | < 80% | > 85% |

---

## Maintenance Schedule

| Task | Frequency | Owner |
|------|-----------|-------|
| Monitor alerts | Daily | On-call |
| Review logs | Daily | DevOps |
| Backup verification | Weekly | DevOps |
| Performance tuning | Weekly | Backend |
| Security patches | Monthly | DevOps |
| Capacity planning | Monthly | DevOps |
| Disaster recovery drill | Quarterly | DevOps |
| Cluster upgrade | Quarterly | DevOps |

---

## Scaling Strategy

### Horizontal Pod Autoscaling (HPA)

**Frontend:**
- Min: 3, Max: 10
- Target CPU: 70%
- Target Memory: 80%
- Scale-up: 100% increase per 30s
- Scale-down: 50% decrease per 60s

**Backend:**
- Min: 3, Max: 15
- Target CPU: 70%
- Target Memory: 80%
- Scale-up: 100% increase per 30s
- Scale-down: 50% decrease per 60s

### Database Scaling

- **Read Replicas** for reporting workloads
- **Connection Pooling** (max 100 connections/pod)
- **Query Optimization** (indexes, prepared statements)

---

## Security Considerations

- **Network Policies:** Restrict pod-to-pod communication
- **RBAC:** Service accounts with minimal permissions
- **Image Scanning:** Trivy vulnerability scanning on push
- **Secrets:** Encrypted at rest (AWS KMS)
- **TLS:** All traffic encrypted (Let's Encrypt)
- **Security Context:** Non-root containers, read-only filesystems
- **Pod Security Policy:** Restrict privileged containers

---

## Cost Optimization

- **Reserved Instances:** 1-year commitment (30% savings)
- **Spot Instances:** Non-critical workloads
- **Auto-scaling:** Only pay for used capacity
- **Deletion of unused resources:** Old snapshots, unused volumes
- **Right-sizing:** Monitor and adjust instance types

---

## References

- [AWS EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

---

**Last Updated:** 2024-05-31  
**Version:** 1.0  
**Status:** Production Ready
