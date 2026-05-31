# Deployment Guide: Production-Grade Multi-Tenant Database

**Zero-downtime deployment procedures, security checklist, and operational runbooks**

---

## Pre-Deployment Checklist

### Infrastructure Requirements

- [ ] PostgreSQL 15+ instance (production-grade)
  - [ ] 64GB RAM minimum (for 10k+ organizations)
  - [ ] SSD storage (NVMe preferred)
  - [ ] Automated daily backups configured
  - [ ] WAL archiving enabled (for point-in-time recovery)
  - [ ] Replication enabled (3x read replicas)

- [ ] SSL/TLS certificates
  - [ ] Valid certificate for database hostname
  - [ ] Client certificates generated for applications

- [ ] AWS Secrets Manager configured
  - [ ] Database master password stored
  - [ ] OAuth provider secrets stored
  - [ ] API keys encrypted

- [ ] Monitoring & Alerting
  - [ ] CloudWatch/DataDog agent installed
  - [ ] CPU/Memory/Disk alerts configured
  - [ ] Query performance monitoring enabled
  - [ ] Slow query logging enabled

### Security Review

- [ ] SSL/TLS enforced (reject unencrypted connections)
- [ ] Connection pooling configured (PgBouncer)
- [ ] Superuser password changed from default
- [ ] Public schema permissions restricted
- [ ] pgaudit extension loaded
- [ ] Firewall rules restrict database access
- [ ] Database in VPC (not internet-accessible)

---

## Step 1: Initial Database Setup

### 1.1 Create Database Instance

```bash
#!/bin/bash
# Create PostgreSQL cluster
createdb -U postgres -E UTF8 -l en_US.UTF-8 ledgr

# Connect as superuser
psql -U postgres -d ledgr

# Verify connection
\conninfo
```

### 1.2 Run Security Hardening

```bash
# Apply security baseline
psql -U postgres -d ledgr -f backend/infrastructure/postgres-hardening.sql

# Verify roles created
psql -U postgres -d ledgr -c "
  SELECT rolname, rolsuper, rolinherit 
  FROM pg_roles 
  WHERE rolname LIKE 'ledgr_%' 
  ORDER BY rolname;
"

# Expected output:
# ledgr_app         | false | true
# ledgr_app_admin   | false | false
# ledgr_app_read    | false | false
# ledgr_audit       | false | false
# ledgr_backup      | false | false
```

### 1.3 Load Core Schema

```bash
# Deploy schema (takes ~30 seconds)
time psql -U postgres -d ledgr -f backend/schemas/core-schema.sql

# Verify schema loaded
psql -U postgres -d ledgr -c "
  SELECT count(*) as table_count FROM information_schema.tables
  WHERE table_schema = 'public';
"

# Expected: 14 tables
```

### 1.4 Verify RLS Policies

```bash
# Check RLS enabled on tables
psql -U postgres -d ledgr -c "
  SELECT tablename, rowsecurity 
  FROM pg_tables 
  WHERE schemaname = 'public'
  ORDER BY tablename;
"

# Expected: rowsecurity = true for users, agents, help_tickets, audit_log, etc.
```

---

## Step 2: Initial Data Setup

### 2.1 Create First Organization

```bash
psql -U postgres -d ledgr -c "
INSERT INTO organizations (
  id, name, slug, billing_email, subscription_plan,
  billing_cycle_start, billing_cycle_end, max_users
)
VALUES (
  '550e8400-e29b-41d4-a716-000000000000'::uuid,
  'Ledgr Admin',
  'ledgr',
  'admin@ledgr.ae',
  'enterprise',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  100
);
"
```

### 2.2 Create Admin User

```bash
psql -U postgres -d ledgr -c "
INSERT INTO users (
  organization_id, email, first_name, last_name,
  password_hash, status, mfa_enabled
)
VALUES (
  '550e8400-e29b-41d4-a716-000000000000'::uuid,
  'admin@ledgr.ae',
  'Ledgr',
  'Admin',
  '\$(openssl passwd -6 'change-me-in-production')',
  'active',
  true
);
"
```

### 2.3 Seed System Roles

```bash
# Run role seeding script (creates office_manager, cfo, accountant, etc.)
node backend/scripts/seed-system-roles.js

# Verify roles created
psql -U postgres -d ledgr -c "
  SELECT slug, name, permissions
  FROM roles
  WHERE is_system_role = true
  ORDER BY slug;
"
```

---

## Step 3: Connection Pool Setup

### 3.1 Configure PgBouncer

```bash
# Create pgbouncer config
cat > /etc/pgbouncer/pgbouncer.ini << 'EOF'
[databases]
ledgr = host=localhost port=5432 dbname=ledgr

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
reserve_pool_timeout = 3

# Apply defaults to all
ignore_startup_parameters = extra_float_digits

# TLS mode
client_tls_sslmode = require
server_tls_sslmode = require
server_tls_ca_file = /etc/ssl/certs/ca-bundle.crt

# Performance
max_db_connections = 100
max_user_connections = 50
EOF

# Start PgBouncer
systemctl restart pgbouncer
systemctl enable pgbouncer

# Verify connection pooling
psql -h localhost -p 6432 -U ledgr_app -d ledgr -c "SELECT version();"
```

### 3.2 Application Connection Pool

```javascript
// In Node.js application
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'ledgr_app',
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 6432,  // PgBouncer port
  database: 'ledgr',
  
  // Connection pool settings
  max: 20,  // Max connections in app pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 30000,  // 30 second timeout per query
  
  // SSL configuration
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('/etc/ssl/certs/ca-bundle.crt'),
    cert: fs.readFileSync('/etc/ssl/certs/client-cert.pem'),
    key: fs.readFileSync('/etc/ssl/private/client-key.pem'),
  }
});

module.exports = pool;
```

---

## Step 4: Backup Configuration

### 4.1 Configure WAL Archiving

```bash
# Edit postgresql.conf
cat >> /etc/postgresql/15/main/postgresql.conf << 'EOF'
# WAL Archiving
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://ledgr-backups/wal/%f && exit 0'
archive_timeout = 300

# Replication (for standby)
max_wal_senders = 10
max_replication_slots = 10
wal_keep_size = 1GB
EOF

# Reload configuration
psql -U postgres -c "SELECT pg_reload_conf();"
```

### 4.2 Schedule Daily Full Backups

```bash
#!/bin/bash
# /usr/local/bin/backup-ledgr.sh

BACKUP_DATE=$(date +%Y-%m-%d)
BACKUP_TIME=$(date +%H%M%S)
BACKUP_DIR="/var/backups/ledgr"
S3_BUCKET="s3://ledgr-backups"

mkdir -p $BACKUP_DIR

# Full backup (with compression)
pg_dump \
  --format=directory \
  --jobs=4 \
  --compress=9 \
  --username=ledgr_backup \
  ledgr > $BACKUP_DIR/ledgr-$BACKUP_DATE-$BACKUP_TIME.dump

# Upload to S3
aws s3 cp $BACKUP_DIR/ledgr-$BACKUP_DATE-$BACKUP_TIME.dump \
  $S3_BUCKET/daily-backups/

# Verify backup integrity
pg_restore --list $BACKUP_DIR/ledgr-$BACKUP_DATE-$BACKUP_TIME.dump | head

# Keep only last 30 days locally
find $BACKUP_DIR -name "ledgr-*.dump" -mtime +30 -delete

# Log backup
echo "Backup completed: $BACKUP_DATE-$BACKUP_TIME" >> /var/log/ledgr-backup.log
```

Add to crontab:
```bash
# Run daily at 2am
0 2 * * * /usr/local/bin/backup-ledgr.sh >> /var/log/ledgr-backup.log 2>&1
```

### 4.3 Test Backup Restoration

```bash
#!/bin/bash
# Test restore on weekly basis

# Create test database
createdb -U postgres ledgr_test

# Restore from latest backup
LATEST_BACKUP=$(aws s3 ls s3://ledgr-backups/daily-backups/ | tail -1 | awk '{print $4}')
aws s3 cp s3://ledgr-backups/daily-backups/$LATEST_BACKUP /tmp/

pg_restore \
  --username=ledgr_backup \
  --dbname=ledgr_test \
  /tmp/$LATEST_BACKUP

# Verify data
psql -U postgres -d ledgr_test -c "SELECT count(*) FROM organizations;"

# Cleanup
dropdb -U postgres ledgr_test
```

---

## Step 5: Monitoring & Alerting

### 5.1 CloudWatch Metrics

```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm

# Configure metrics
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'EOF'
{
  "metrics": {
    "namespace": "Ledgr/Database",
    "metrics_collected": {
      "postgres": {
        "measurement": [
          {
            "name": "connections",
            "rename": "db_connections",
            "unit": "Count"
          },
          {
            "name": "cache_hit_ratio",
            "rename": "db_cache_hit_ratio",
            "unit": "Percent"
          }
        ],
        "metrics_collection_interval": 60
      }
    }
  }
}
EOF

# Start agent
systemctl restart amazon-cloudwatch-agent
```

### 5.2 Slow Query Logging

```sql
-- Enable slow query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- Log queries > 1 second
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_duration = 'on';

SELECT pg_reload_conf();

-- View logs
SELECT query, mean_time, calls
FROM pg_stat_statements
WHERE mean_time > 1000
ORDER BY mean_time DESC;
```

### 5.3 Alerts

```bash
# CPU > 80% for 5 minutes
aws cloudwatch put-metric-alarm \
  --alarm-name ledgr-db-cpu-high \
  --alarm-description "Alert when database CPU is high" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1

# Storage > 80%
aws cloudwatch put-metric-alarm \
  --alarm-name ledgr-db-storage-high \
  --alarm-description "Alert when database storage is high" \
  --metric-name FreeStorageSpace \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 20 \
  --comparison-operator LessThanThreshold
```

---

## Step 6: Replication Setup

### 6.1 Create Read Replicas

```bash
# On primary server, create replication slot
psql -U postgres << 'EOF'
SELECT * FROM pg_create_physical_replication_slot('replica_slot1');
EOF

# On standby server, initialize from primary
pg_basebackup \
  --pgdata=/var/lib/postgresql/15/main \
  --host=primary.example.com \
  --username=ledgr_backup \
  --write-recovery-conf \
  --wal-method=stream

# Start standby
systemctl start postgresql

# Verify replication
psql -U postgres << 'EOF'
SELECT * FROM pg_stat_replication;
EOF
```

### 6.2 Promote Standby to Primary

```bash
# On standby server
pg_ctl promote -D /var/lib/postgresql/15/main

# Update application connection strings
export DATABASE_URL=postgresql://user@new-primary:5432/ledgr

# Verify
psql -c "SELECT version();"
```

---

## Step 7: Security Verification

### 7.1 SSL/TLS Verification

```bash
# Test encrypted connection required
psql -h localhost -d ledgr -c "SHOW ssl;"
# Should output: on

# Verify certificate
openssl s_client -connect localhost:5432 -starttls postgres

# Verify certificate validity
openssl x509 -in /etc/ssl/certs/server.crt -text -noout
```

### 7.2 Role Permissions Verification

```bash
# Verify read-only role cannot write
psql -U ledgr_app_read -d ledgr -c "
  INSERT INTO users (...) VALUES (...);
"
# Should error: permission denied for schema public

# Verify write role can write
psql -U ledgr_app_write -d ledgr -c "
  INSERT INTO organizations (...) VALUES (...);
"
# Should succeed

# Verify audit table is immutable
psql -U ledgr_app_write -d ledgr -c "
  DELETE FROM audit_log;
"
# Should error: permission denied
```

### 7.3 RLS Policy Verification

```bash
# Test as User A (org_a_id)
psql -U ledgr_app -d ledgr << 'EOF'
SELECT set_config('app.current_org_id', 'org_a_id', false);
SELECT count(*) FROM journal_entries;
-- Should return 0 or org A's count only
EOF

# Test as User B (org_b_id) 
psql -U ledgr_app -d ledgr << 'EOF'
SELECT set_config('app.current_org_id', 'org_b_id', false);
SELECT count(*) FROM journal_entries;
-- Should return 0 or org B's count only
EOF

# Verify isolation
# Both users should NOT see each other's data
```

---

## Step 8: Performance Tuning

### 8.1 Optimize for Production

```sql
-- Increase shared_buffers (25% of RAM, max 40GB)
ALTER SYSTEM SET shared_buffers = '16GB';

-- Increase effective_cache_size (50-75% of RAM)
ALTER SYSTEM SET effective_cache_size = '48GB';

-- Increase work_mem for queries
ALTER SYSTEM SET work_mem = '100MB';

-- Enable parallel query execution
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET max_parallel_workers = 8;

-- Connection limits
ALTER SYSTEM SET max_connections = 200;

-- Reload
SELECT pg_reload_conf();

-- Restart PostgreSQL for some settings to take effect
systemctl restart postgresql
```

### 8.2 Analyze Query Plans

```bash
# Identify slow queries
psql -U postgres -d ledgr << 'EOF'
SELECT 
  query,
  calls,
  mean_time,
  max_time,
  stddev_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_time DESC
LIMIT 10;
EOF

# Analyze slow query plan
EXPLAIN ANALYZE
SELECT * FROM journal_entries
WHERE organization_id = 'org_a_id'
AND entry_date >= '2026-01-01';

# Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

---

## Step 9: Operational Runbooks

### 9.1 Password Rotation

```bash
#!/bin/bash
# Rotate database passwords every 90 days

NEW_PASSWORD=$(openssl rand -base64 32)

# Update in AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id ledgr/db/password \
  --secret-string $NEW_PASSWORD

# Update database password
PGPASSWORD=$OLD_PASSWORD psql -U ledgr_app -d ledgr -c \
  "ALTER ROLE ledgr_app WITH PASSWORD '$NEW_PASSWORD';"

# Update application secrets
aws secretsmanager update-secret \
  --secret-id ledgr/app/db-password \
  --secret-string $NEW_PASSWORD

# Restart application to pick up new password
systemctl restart ledgr-api

echo "Password rotated successfully at $(date)"
```

### 9.2 Emergency Recovery

```bash
#!/bin/bash
# Recover database to point-in-time

TARGET_TIME="2026-05-31 14:30:00"

# Stop application
systemctl stop ledgr-api

# Stop database
systemctl stop postgresql

# Restore from backup to specific time
mkdir -p /var/lib/postgresql/15/recovery

# Create recovery configuration
cat > /var/lib/postgresql/15/recovery/recovery.conf << EOF
recovery_target_timeline = 'latest'
recovery_target_time = '$TARGET_TIME'
recovery_target_action = 'pause'
EOF

# Restore base backup
pg_basebackup \
  --pgdata=/var/lib/postgresql/15/recovery \
  --host=backup-server \
  --username=ledgr_backup

# Start recovery
systemctl start postgresql

# Verify recovered state
psql -U postgres << EOF
SELECT now();
SELECT count(*) FROM organizations;
EOF

# Once verified, promote
psql -U postgres -c "SELECT pg_wal_replay_resume();"
```

---

## Pre-Production Checklist

Before going live, verify:

- [ ] Database instance sized correctly (CPU, RAM, storage)
- [ ] SSL/TLS certificates installed and valid
- [ ] Connection pooling configured (PgBouncer)
- [ ] Daily automated backups confirmed
- [ ] WAL archiving confirmed
- [ ] Replication tested (promote standby successfully)
- [ ] Monitoring alerts configured
- [ ] Slow query logging enabled
- [ ] RLS policies verified (no cross-tenant data leakage)
- [ ] Encryption keys stored in KMS
- [ ] Database password stored in Secrets Manager
- [ ] All tables have appropriate indexes
- [ ] Autovacuum configured
- [ ] pg_stat_statements extension enabled
- [ ] pgaudit logging enabled
- [ ] Firewall rules restrict access to VPC only
- [ ] Database username/password changed from defaults
- [ ] Backup restoration tested (weekly)
- [ ] Disaster recovery runbook documented
- [ ] On-call escalation procedure in place

---

## Monitoring Dashboard Queries

```sql
-- Real-time database health
SELECT 
  datname,
  numbackends as connections,
  xact_commit as commits_per_sec,
  xact_rollback as rollbacks_per_sec,
  tup_returned as rows_returned_per_sec,
  tup_inserted as rows_inserted_per_sec
FROM pg_stat_database
WHERE datname = 'ledgr';

-- Replication lag
SELECT 
  client_addr,
  state,
  sync_state,
  write_lag,
  flush_lag,
  replay_lag
FROM pg_stat_replication;

-- Cache hit ratio
SELECT 
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
FROM pg_statio_user_tables;
```

---

**Deployment completed successfully when:**
1. All services are healthy (green in monitoring)
2. Zero errors in application logs
3. RLS policies verified (test queries)
4. Backup/recovery tested successfully
5. Load test completed (1000+ QPS)
6. Security audit passed
