# Prerequisites Installation Guide

**Status:** Prerequisites verification shows 4 critical tools missing  
**Target Platform:** macOS  
**Estimated Installation Time:** 20-30 minutes

---

## Current Environment Status

### ✅ Already Installed
- **git** 2.39.5 (Apple Git-154)
- **GitHub CLI** 2.92.0 (authenticated as ashikkarim1)
- **GitHub SSH/HTTPS authentication** ✓ Active

### ❌ Missing - CRITICAL BLOCKERS
- **Docker** (needed for containerization)
- **kubectl** (needed for Kubernetes cluster management)
- **AWS CLI v2** (needed for AWS infrastructure provisioning)
- **eksctl** (needed for EKS cluster creation automation)

---

## Installation Instructions (macOS)

### 1. Install Docker Desktop for Mac

Docker Desktop provides Docker, Docker Compose, and Kubernetes integration.

**Option A: Using Homebrew (Recommended)**
```bash
# Install Docker using Homebrew
brew install --cask docker

# Start Docker Desktop
open /Applications/Docker.app

# Verify installation (wait 30-60 seconds for Docker to start)
docker --version
docker run hello-world
```

**Option B: Direct Download**
- Go to [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)
- Download and install the .dmg file
- Open Applications > Docker
- Verify: `docker --version`

**Verification:**
```bash
docker --version
# Expected: Docker version 24.x.x or later

docker ps
# Expected: Lists running containers (should be empty initially)
```

---

### 2. Install kubectl (Kubernetes CLI)

kubectl can be installed via Homebrew or as part of Docker Desktop.

**Option A: Using Homebrew (Recommended)**
```bash
# Install kubectl
brew install kubectl

# Verify installation
kubectl version --client
# Expected: Client Version: v1.29.x or later
```

**Option B: Using Docker Desktop**
- Docker Desktop includes kubectl
- Enable Kubernetes in Docker Desktop: Settings > Kubernetes > Enable Kubernetes
- Verify: `kubectl version --client`

**Verification:**
```bash
kubectl version --client
# Expected: Client Version: v1.29.x or later

kubectl cluster-info
# May fail if no cluster configured (expected at this stage)
```

---

### 3. Install AWS CLI v2

AWS CLI v2 is required for provisioning infrastructure and managing AWS services.

**Option A: Using Homebrew (Recommended)**
```bash
# Install AWS CLI v2
brew install awscliv2

# Verify installation
aws --version
# Expected: aws-cli/2.x.x or later
```

**Option B: Direct Download**
```bash
# Download the installer
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"

# Install
sudo installer -pkg AWSCLIV2.pkg -target /

# Verify
aws --version
```

**Configuration (Required)**
```bash
# Configure AWS credentials
aws configure

# Prompt sequence:
# AWS Access Key ID: [paste your access key]
# AWS Secret Access Key: [paste your secret key]
# Default region: us-east-1
# Default output format: json

# Verify credentials are working
aws sts get-caller-identity
# Expected: JSON with Account, UserId, Arn
```

**Get AWS Credentials:**
1. Log in to [AWS Console](https://console.aws.amazon.com/)
2. Go to IAM > Users > [Your User] > Security credentials
3. Click "Create access key"
4. Download the .csv file or copy the Access Key and Secret Key
5. **IMPORTANT:** Store these securely; do not commit to git

---

### 4. Install eksctl (EKS Cluster Management)

eksctl simplifies EKS cluster creation and management.

**Option A: Using Homebrew (Recommended)**
```bash
# Install eksctl
brew tap weaveworks/tap
brew install weaveworks/tap/eksctl

# Verify installation
eksctl version
# Expected: version v0.160.x or later
```

**Option B: Direct Installation**
```bash
# Download the binary
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp

# Move to PATH
sudo mv /tmp/eksctl /usr/local/bin

# Verify
eksctl version
```

**Verification:**
```bash
eksctl version
# Expected: version v0.160.x or later

eksctl get clusters
# Expected: (no clusters initially)
```

---

## Installation Checklist

Run this command after all installations to verify everything is ready:

```bash
echo "=== FINAL PREREQUISITES CHECK ===" && \
echo "" && \
echo "✓ Checking Docker..." && docker --version && docker ps > /dev/null 2>&1 && echo "  Docker is running" || echo "  ⚠️  Docker may not be started" && \
echo "" && \
echo "✓ Checking kubectl..." && kubectl version --client && \
echo "" && \
echo "✓ Checking AWS CLI v2..." && aws --version && \
echo "" && \
echo "✓ Checking eksctl..." && eksctl version && \
echo "" && \
echo "✓ Checking AWS credentials..." && aws sts get-caller-identity | jq . && \
echo "" && \
echo "✓ Checking git..." && git --version && \
echo "" && \
echo "✓ Checking GitHub CLI..." && gh --version && \
echo "" && \
echo "✓ Checking GitHub authentication..." && gh auth status && \
echo "" && \
echo "=== ALL PREREQUISITES VERIFIED ==="
```

---

## Quick Installation Script

Copy and run this complete installation script to install all prerequisites at once:

```bash
#!/bin/bash
set -e

echo "Installing prerequisites for Ledgr AWS EKS Deployment..."
echo ""

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    brew install --cask docker
    echo "Please start Docker Desktop from Applications and come back here"
    echo "Press Enter once Docker is running..."
    read
fi

# Install kubectl
if ! command -v kubectl &> /dev/null; then
    echo "Installing kubectl..."
    brew install kubectl
fi

# Install AWS CLI v2
if ! command -v aws &> /dev/null; then
    echo "Installing AWS CLI v2..."
    brew install awscliv2
fi

# Install eksctl
if ! command -v eksctl &> /dev/null; then
    echo "Installing eksctl..."
    brew tap weaveworks/tap
    brew install weaveworks/tap/eksctl
fi

echo ""
echo "Prerequisites installation complete!"
echo ""
echo "Next steps:"
echo "1. Verify all tools are installed: docker --version && kubectl version --client && aws --version && eksctl version"
echo "2. Configure AWS credentials: aws configure"
echo "3. Verify AWS credentials: aws sts get-caller-identity"
echo "4. Proceed to Phase 2: AWS Infrastructure Provisioning"
```

---

## Troubleshooting

### Docker not starting
- Ensure Docker Desktop.app is in /Applications
- Check System Preferences > General > Allow in the Login Items
- Restart your Mac or use `open /Applications/Docker.app`

### AWS CLI credential errors
- Verify credentials in `~/.aws/credentials`: `cat ~/.aws/credentials`
- Verify AWS region in `~/.aws/config`: `cat ~/.aws/config`
- Re-run `aws configure` to update credentials
- Test with: `aws sts get-caller-identity`

### kubectl context errors (will appear when EKS cluster is created)
- After Phase 2 (AWS Infrastructure), kubectl will be configured automatically
- Verify context: `kubectl config get-contexts`
- Switch context: `kubectl config use-context <context-name>`

### eksctl cluster creation timeout
- Ensure AWS credentials have sufficient permissions (AdministratorAccess recommended for initial setup)
- Check CloudFormation stack creation in AWS Console
- Verify VPC has public and private subnets

---

## Phase 2 Prerequisite: AWS Account Setup

Before running Phase 2 (AWS Infrastructure Provisioning), ensure:

1. **AWS Account Created** with billing enabled
2. **IAM User Created** with:
   - Access Key ID and Secret Access Key generated
   - AdministratorAccess policy attached (temporary; can be restricted later)
   - MFA enabled (recommended for security)
3. **AWS Region Selected** (recommend: us-east-1)
4. **VPC Available** (default VPC works fine)
5. **Service Quotas Checked:**
   - EC2: At least 3 instances capacity (t3.medium = 3 vCPU)
   - RDS: At least 1 db.t3.micro instance
   - ElastiCache: At least 1 cache.t3.micro node
   - ALB: No quota limit typically

---

## Next Steps After Installation

Once all prerequisites are installed and verified:

1. ✅ Complete Phase 1: Prerequisites Verification (this document)
2. ▶️ Execute Phase 2: AWS Infrastructure Provisioning
   ```bash
   cd /Users/test/Documents/Claude/Projects/Ledgr/scripts
   ./provision-aws-infrastructure.sh staging
   ```
3. Configure GitHub Actions secrets with AWS credentials
4. Deploy to staging environment
5. Run smoke tests and validation

---

## Installation Status Tracker

Use this table to track installation progress:

| Tool | Status | Command to Verify | Version |
|------|--------|-------------------|---------|
| Docker | ❌ Missing | `docker --version` | (need to install) |
| kubectl | ❌ Missing | `kubectl version --client` | (need to install) |
| AWS CLI v2 | ❌ Missing | `aws --version` | (need to install) |
| eksctl | ❌ Missing | `eksctl version` | (need to install) |
| git | ✅ Installed | `git --version` | 2.39.5 |
| GitHub CLI | ✅ Installed | `gh --version` | 2.92.0 |

---

## Support & Documentation

- **Docker Install:** https://docs.docker.com/desktop/install/mac-install/
- **kubectl Install:** https://kubernetes.io/docs/tasks/tools/install-kubectl-macos/
- **AWS CLI v2 Install:** https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
- **eksctl Install:** https://eksctl.io/installation/
- **AWS Account Setup:** https://docs.aws.amazon.com/account-billing/account-setup-iam-user.html
- **EKS Best Practices:** https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html

