# Ledgr DevOps Quick Reference

## Common Commands

### Docker Compose (Local Development)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f <service>
docker-compose logs -f frontend
docker-compose logs -f backend

# Stop all services
docker-compose down

# Rebuild images
docker-compose build

# Run database migration
docker-compose exec backend npm run migrate

# Access database
docker-compose exec postgres psql -U postgres -d ledgr

# Access Redis
docker-compose exec redis redis-cli
```

### Kubernetes Cluster Management

```bash
# Set context
aws eks update-kubeconfig --name ledgr-production --region us-east-1

# Get cluster info
kubectl cluster-info
kubectl get nodes
kubectl get namespaces

# Create namespace
kubectl create namespace ledgr

# Apply manifests
kubectl apply -f kubernetes/

# Get resources
kubectl get pods -n ledgr
kubectl get deployments -n ledgr
kubectl get services -n ledgr
kubectl get ingress -n ledgr

# Describe resource
kubectl describe pod <pod-name> -n ledgr
kubectl describe deployment frontend -n ledgr

# Get logs
kubectl logs <pod-name> -n ledgr
kubectl logs deployment/frontend -n ledgr --tail=100
kubectl logs deployment/backend -n ledgr -f

# Port forward
kubectl port-forward svc/frontend-service 3000:80 -n ledgr
kubectl port-forward svc/backend-service 3001:3000 -n ledgr

# Exec into pod
kubectl exec -it <pod-name> -n ledgr -- /bin/sh
kubectl exec -it $(kubectl get pods -n ledgr -l app=ledgr,component=frontend -o jsonpath='{.items[0].metadata.name}') -n ledgr -- /bin/sh
```

### Deployment & Scaling

```bash
# Check deployment status
kubectl rollout status deployment/frontend -n ledgr
kubectl rollout status deployment/backend -n ledgr

# View rollout history
kubectl rollout history deployment/frontend -n ledgr

# Rollback to previous version
kubectl rollout undo deployment/frontend -n ledgr
kubectl rollout undo deployment/backend -n ledgr

# Scale deployment manually
kubectl scale deployment frontend --replicas=5 -n ledgr
kubectl scale deployment backend --replicas=5 -n ledgr

# Check HPA status
kubectl get hpa -n ledgr
kubectl describe hpa frontend-hpa -n ledgr

# Restart deployment
kubectl rollout restart deployment/frontend -n ledgr
kubectl rollout restart deployment/backend -n ledgr
```

### Secrets & Configuration

```bash
# Create secret
kubectl create secret generic ledgr-secrets \
  --from-literal=db-password=xxx \
  --from-literal=jwt-secret=yyy \
  -n ledgr --dry-run=client -o yaml | kubectl apply -f -

# Update secret
kubectl delete secret ledgr-secrets -n ledgr
kubectl create secret generic ledgr-secrets \
  --from-literal=db-password=xxx \
  -n ledgr

# Get secret (decoded)
kubectl get secret ledgr-secrets -n ledgr -o jsonpath='{.data.password}' | base64 -d

# Create ConfigMap
kubectl create configmap ledgr-config \
  --from-literal=NODE_ENV=production \
  -n ledgr --dry-run=client -o yaml | kubectl apply -f -

# Update ConfigMap
kubectl set env deployment/backend \
  NODE_ENV=production \
  LOG_LEVEL=info \
  -n ledgr
```

### Monitoring & Debugging

```bash
# Check pod events
kubectl describe pod <pod-name> -n ledgr

# Check resource usage
kubectl top nodes
kubectl top pods -n ledgr

# Check disk usage
kubectl exec <pod-name> -n ledgr -- df -h

# View application metrics
kubectl get --raw /metrics | head -20

# Port forward to Prometheus
kubectl port-forward svc/prometheus-service 9090:9090 -n ledgr

# Port forward to Grafana
kubectl port-forward svc/grafana-service 3002:3000 -n ledgr

# Stream logs from multiple pods
kubectl logs -f deployment/frontend -n ledgr &
kubectl logs -f deployment/backend -n ledgr &
```

### AWS Commands

```bash
# Authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Push image to ECR
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/ledgr-frontend:latest

# Get RDS endpoint
aws rds describe-db-instances \
  --db-instance-identifier ledgr-postgres \
  --query 'DBInstances[0].Endpoint.Address'

# Get ElastiCache endpoint
aws elasticache describe-cache-clusters \
  --cache-cluster-id ledgr-redis \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint'

# Get secret from Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id ledgr/database/credentials \
  --query SecretString --output text | jq .

# Create RDS snapshot
aws rds create-db-snapshot \
  --db-instance-identifier ledgr-postgres \
  --db-snapshot-identifier ledgr-backup-$(date +%Y%m%d)

# Restore from RDS snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier ledgr-postgres-restored \
  --db-snapshot-identifier ledgr-backup-20240131
```

---

## Quick Troubleshooting

### Pod Not Starting

```bash
# Check pod events
kubectl describe pod <pod-name> -n ledgr

# Check logs
kubectl logs <pod-name> -n ledgr

# Check resource requests/limits
kubectl top pod <pod-name> -n ledgr

# Check node capacity
kubectl top nodes
kubectl describe nodes
```

### High Memory Usage

```bash
# Identify high-memory pods
kubectl top pods -n ledgr --sort-by=memory

# Check pod limits
kubectl get pods -n ledgr -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].resources.limits.memory}{"\n"}{end}'

# Increase memory limit
kubectl set resources deployment/backend --limits=memory=2Gi -n ledgr
```

### High CPU Usage

```bash
# Identify high-CPU pods
kubectl top pods -n ledgr --sort-by=cpu

# Check CPU throttling
kubectl describe node <node-name> | grep -A 5 "Allocated resources"

# Check HPA status
kubectl get hpa -n ledgr
kubectl describe hpa backend-hpa -n ledgr
```

### Database Connection Issues

```bash
# Test PostgreSQL connectivity
kubectl run -it --rm psql \
  --image=postgres:16 \
  --command -- \
  psql -h postgres-service.ledgr.svc.cluster.local -U postgres -d ledgr

# Check connection pool
kubectl exec <backend-pod> -n ledgr -- curl http://localhost:3000/health/db

# View database connections
psql -c "SELECT count(*) FROM pg_stat_activity;"
```

### Disk Space Issues

```bash
# Check disk usage
kubectl exec <pod-name> -n ledgr -- df -h

# Check volume mounts
kubectl describe pod <pod-name> -n ledgr | grep -A 5 "Mounts"

# Clean up old pods/volumes
kubectl delete pvc --all -n ledgr

# Check storage classes
kubectl get storageclass
```

---

## Useful Links

- **GitHub Repo:** https://github.com/your-org/ledgr
- **AWS Console:** https://console.aws.amazon.com
- **EKS Cluster:** https://console.aws.amazon.com/eks/
- **CloudWatch Logs:** https://console.aws.amazon.com/cloudwatch/
- **ECR Repositories:** https://console.aws.amazon.com/ecr/
- **RDS Database:** https://console.aws.amazon.com/rds/

---

## Monitoring Dashboards

- **Prometheus:** http://localhost:9090 (or port-forward)
- **Grafana:** http://localhost:3002 (or port-forward)
  - Username: admin
  - Password: admin (change immediately!)
- **CloudWatch:** https://console.aws.amazon.com/cloudwatch/

---

## Key Contacts

| Role | Contact |
|------|---------|
| DevOps Lead | __________ |
| On-Call | __________ |
| Platform Team | __________ |
| Security Team | __________ |

---

## Emergency Procedures

### Service Down

1. Check Slack alerts (status channel)
2. Port-forward to check service health: `kubectl port-forward svc/frontend-service 3000:80 -n ledgr`
3. Check pod logs: `kubectl logs deployment/frontend -n ledgr --tail=100`
4. Check node status: `kubectl get nodes`
5. Initiate incident post

### Database Down

1. Check RDS status in AWS console
2. Verify security group allows EKS to connect
3. Check CloudWatch logs
4. Restore from backup if needed
5. Update connection string in Secrets Manager

### Memory Leak

1. Identify high-memory pods: `kubectl top pods -n ledgr --sort-by=memory`
2. Check pod logs for leaks: `kubectl logs <pod> -n ledgr | grep -i leak`
3. Restart pod: `kubectl delete pod <pod-name> -n ledgr`
4. Monitor memory usage going forward
5. Investigate root cause

### High Latency

1. Check backend logs: `kubectl logs deployment/backend -n ledgr --tail=100`
2. Monitor database query times
3. Check cache hit rate: `kubectl exec redis-pod -- redis-cli info stats`
4. Scale up if needed: `kubectl scale deployment backend --replicas=10 -n ledgr`
5. Check load balancer status

---

## Performance Profiling

```bash
# Get CPU profile (if application supports it)
kubectl exec <pod-name> -n ledgr -- curl http://localhost:3000/debug/pprof/profile?seconds=30 > profile.pb.gz

# Get heap profile
kubectl exec <pod-name> -n ledgr -- curl http://localhost:3000/debug/pprof/heap > heap.pb.gz

# Get goroutine profile
kubectl exec <pod-name> -n ledgr -- curl http://localhost:3000/debug/pprof/goroutine > goroutine.pb.gz
```

---

## Backup & Restore

```bash
# Create RDS backup
aws rds create-db-snapshot \
  --db-instance-identifier ledgr-postgres \
  --db-snapshot-identifier ledgr-backup-$(date +%Y%m%d-%H%M%S)

# List RDS backups
aws rds describe-db-snapshots \
  --db-instance-identifier ledgr-postgres

# Backup S3 to local
aws s3 sync s3://ledgr-documents-ACCOUNT_ID/ ./backups/

# Restore S3 from local
aws s3 sync ./backups/ s3://ledgr-documents-ACCOUNT_ID/
```

---

**Last Updated:** 2024-05-31
