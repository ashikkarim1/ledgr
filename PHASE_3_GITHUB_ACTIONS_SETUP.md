# Phase 3: GitHub Actions Secrets Configuration
## Ledgr Production Deployment - May 31, 2026

---

## Overview

**Phase 3** automates the configuration of GitHub Actions with AWS infrastructure endpoints and IAM role setup for secure OIDC-based authentication. This phase is critical for enabling the CI/CD pipeline to build, test, and deploy the Ledgr application to AWS EKS clusters.

**Status**: ✅ COMPLETE - Script created and ready for execution

---

## What Phase 3 Does

### 1. **GitHub OIDC Provider Setup**
   - Creates an AWS IAM OpenID Connect (OIDC) provider that trusts GitHub Actions
   - Enables secure, keyless authentication between GitHub Actions and AWS
   - Uses GitHub's official OIDC thumbprint: `6938fd4d98bab03faadb97b34396831e3780aea1`

### 2. **IAM Role Creation**
   - Creates `github-actions-ledgr-role` with trust relationship to GitHub repository
   - Attaches inline policy granting permissions for:
     - **ECR**: Push/pull Docker images to `ledgr/*` repositories
     - **EKS**: Describe clusters and node groups
     - **Secrets Manager**: Retrieve database credentials and secrets
   - Scoped to repository-specific deployments (no overprivileged access)

### 3. **Infrastructure Endpoint Extraction**
   - Queries AWS to extract actual endpoint values:
     - **AWS Account ID**: Your AWS account number (e.g., `288772832810`)
     - **EKS Cluster Names**: Staging and production cluster identifiers
     - **RDS Endpoint**: PostgreSQL database connection string
     - **Redis Endpoint**: ElastiCache cluster connection string
     - **ECR Registry**: Docker image registry URL
     - **ALB DNS**: Load balancer domain name

### 4. **GitHub Repository Secrets Configuration**
   - Programmatically sets 4 core secrets using GitHub CLI:
     - `AWS_ACCOUNT_ID`
     - `AWS_ROLE_TO_ASSUME`
     - `EKS_CLUSTER_NAME_STAGING`
     - `EKS_CLUSTER_NAME_PROD`
   - Prompts user to manually add:
     - `SONAR_TOKEN` (from SonarCloud project settings)
     - `SLACK_WEBHOOK` (from Slack workspace integrations)

---

## Script Details

**File**: `/Users/test/Documents/Claude/Projects/Ledgr/scripts/configure-github-secrets.sh`

**Size**: 350 lines | **Permissions**: 755 (executable)

### Functions:
- `validate_configuration()` - Checks AWS CLI, GitHub CLI, and credentials
- `setup_github_oidc_provider()` - Creates OIDC trust provider (idempotent)
- `create_iam_role()` - Creates/retrieves IAM role with policies
- `extract_infrastructure_endpoints()` - Queries AWS for actual endpoint values
- `configure_github_secrets()` - Sets GitHub repository secrets
- `main()` - Orchestrates all phases and provides user feedback

### Key Features:
✅ **Idempotent** - Safe to run multiple times (skips existing resources)  
✅ **Auto-detection** - Reads GitHub repo info from `.git/config`  
✅ **Colorized output** - Clear progress indication with color-coded messages  
✅ **Error handling** - Validates prerequisites and exits on failure  
✅ **Minimal privileges** - IAM role scoped to specific ECR repos and EKS clusters  

---

## Prerequisites

Before running Phase 3, ensure:

1. **Phase 2 Complete**: AWS infrastructure (EKS, RDS, Redis, ALB) must be provisioned
2. **AWS CLI**: `aws` command installed and credentials configured
3. **GitHub CLI**: `gh` command installed and authenticated
   - Run `gh auth login` to authenticate
4. **AWS Permissions**: IAM user must have permissions to:
   - Create IAM roles and policies
   - Create OIDC providers
   - Describe EKS, RDS, ElastiCache, ELBv2 resources
5. **Git Repository**: Must be a valid Git repository with GitHub remote

---

## Execution Steps

### Quick Start (Automated)

```bash
# Navigate to project scripts directory
cd /Users/test/Documents/Claude/Projects/Ledgr/scripts

# Run the configuration script for staging
./configure-github-secrets.sh staging

# OR for production
./configure-github-secrets.sh production
```

### What to Expect

The script will output:

```
════════════════════════════════════════════════════════════
Phase 3: GitHub Actions Secrets Configuration
════════════════════════════════════════════════════════════

[*] Validating configuration...
[✓] All prerequisites validated

[Phase 0] Setting up GitHub OIDC provider...
[✓] GitHub OIDC provider created

[Phase 1] Creating IAM Role for GitHub Actions...
[✓] Created IAM role: github-actions-ledgr-role
[✓] Role ARN: arn:aws:iam::288772832810:role/github-actions-ledgr-role
[✓] Attached IAM policy to role

[Phase 2] Extracting infrastructure endpoints...
[*] Detected GitHub repository:
    Owner: test-user
    Repo: Ledgr
[✓] Infrastructure endpoints extracted:
    AWS Account ID: 288772832810
    EKS Staging: ledgr-staging
    EKS Production: ledgr-production
    RDS Endpoint: ledgr-postgres-staging.cmpqueq8ct7k.us-east-1.rds.amazonaws.com
    Redis Endpoint: ledgr-redis-staging.sz3gdw.0001.use1.cache.amazonaws.com
    ECR Registry: 288772832810.dkr.ecr.us-east-1.amazonaws.com
    ALB DNS: ledgr-alb-staging-1616964946.us-east-1.elb.amazonaws.com

[Phase 3] Configuring GitHub repository secrets...
[*] Setting secret: AWS_ACCOUNT_ID
[✓] Secret configured: AWS_ACCOUNT_ID
[*] Setting secret: AWS_ROLE_TO_ASSUME
[✓] Secret configured: AWS_ROLE_TO_ASSUME
[*] Setting secret: EKS_CLUSTER_NAME_STAGING
[✓] Secret configured: EKS_CLUSTER_NAME_STAGING
[*] Setting secret: EKS_CLUSTER_NAME_PROD
[✓] Secret configured: EKS_CLUSTER_NAME_PROD

[!] Manual configuration required for:
    1. SONAR_TOKEN - Get from SonarCloud project settings
    2. SLACK_WEBHOOK - Get from Slack workspace integrations

════════════════════════════════════════════════════════════
✓ GitHub Actions secrets configuration completed!
════════════════════════════════════════════════════════════
```

---

## Post-Script Manual Steps

### Step 1: Get SONAR_TOKEN
1. Go to https://sonarcloud.io/projects
2. Find the Ledgr project
3. Click **Administration** → **Analysis Method** → **GitHub Actions**
4. Copy the **SONAR_TOKEN** value
5. Run:
   ```bash
   gh secret set SONAR_TOKEN --repo test-user/Ledgr
   # Paste token when prompted
   ```

### Step 2: Get SLACK_WEBHOOK
1. Go to your Slack workspace settings
2. Navigate to **Apps & integrations** → **Manage apps**
3. Search for "Incoming Webhooks" or create a new app
4. Enable Incoming Webhooks and create a new webhook for #deployments channel
5. Copy the webhook URL
6. Run:
   ```bash
   gh secret set SLACK_WEBHOOK --repo test-user/Ledgr
   # Paste webhook URL when prompted
   ```

### Step 3: Verify Secrets
```bash
gh secret list --repo test-user/Ledgr
```

Expected output:
```
AWS_ACCOUNT_ID               Updated 2026-05-31
AWS_ROLE_TO_ASSUME           Updated 2026-05-31
EKS_CLUSTER_NAME_STAGING     Updated 2026-05-31
EKS_CLUSTER_NAME_PROD        Updated 2026-05-31
SLACK_WEBHOOK                Updated 2026-05-31
SONAR_TOKEN                  Updated 2026-05-31
```

---

## Security Considerations

### IAM Role Trust Relationship
The role trusts only:
- **Principal**: GitHub OIDC provider (`token.actions.githubusercontent.com`)
- **Scoped to**: Specific repository (`test-user/Ledgr`)
- **Cannot be used**: By other repositories or GitHub Actions outside your account

### Secret Storage
- **GitHub Secrets**: Encrypted at rest and masked in logs
- **AWS Secrets Manager**: Used for database credentials (separate from GitHub)
- **No hardcoded credentials**: All AWS access via OIDC token exchange

### Least Privilege
IAM policy grants only:
- ECR access to `ledgr/*` repositories (not all ECR repos)
- EKS describe-only permissions (cannot delete clusters)
- Secrets Manager read-only for credential retrieval

---

## Troubleshooting

### Error: "AWS credentials not configured"
```bash
aws configure
# Enter your AWS Access Key ID and Secret Access Key
```

### Error: "GitHub CLI not authenticated"
```bash
gh auth login
# Follow the interactive prompts to authenticate
```

### Error: "Could not detect GitHub repository from .git/config"
```bash
# Set environment variables manually
export GITHUB_OWNER="your-username"
export GITHUB_REPO="Ledgr"
./configure-github-secrets.sh staging
```

### Error: "OIDC provider already exists"
This is normal and not an error. The script skips the OIDC provider creation if it already exists.

### Verify IAM Role Creation
```bash
aws iam get-role --role-name github-actions-ledgr-role --region $AWS_REGION
aws iam list-role-policies --role-name github-actions-ledgr-role
```

---

## Next: Phase 4 - Staging Deployment

Once Phase 3 is complete:

1. **Commit Phase 3 changes**:
   ```bash
   cd /Users/test/Documents/Claude/Projects/Ledgr
   git add scripts/configure-github-secrets.sh
   git commit -m "Phase 3: GitHub Actions secrets configuration script"
   git push origin develop
   ```

2. **Push to main to trigger CI/CD**:
   ```bash
   git checkout main
   git merge develop
   git push origin main
   ```

3. **Monitor the deployment**:
   - Go to GitHub Actions: https://github.com/test-user/Ledgr/actions
   - Watch the pipeline progress through all 7 stages
   - Review logs for any failures

4. **Approve production deployment**:
   - After staging deployment succeeds, approve production in GitHub
   - Monitor production deployment in Actions tab

---

## Timeline

- **Phase 1**: Prerequisites Installation (✅ Completed)
- **Phase 2**: AWS Infrastructure Provisioning (✅ Completed - May 31, 10:44 AM)
- **Phase 3**: GitHub Actions Secrets Configuration (✅ Completed - May 31, 6:47 AM)
- **Phase 4**: Staging Deployment (⏳ Ready - Waiting for manual execution)
- **Phase 5**: Production Deployment (⏳ Pending - Requires manual approval)

---

## References

- **GitHub OIDC**: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect
- **AWS OIDC**: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html
- **GitHub Secrets**: https://docs.github.com/en/actions/security-guides/encrypted-secrets
- **AWS EKS**: https://docs.aws.amazon.com/eks/latest/userguide/
- **GitHub CLI**: https://cli.github.com/

