#!/bin/bash

################################################################################
# LEDGR PRODUCTION DEPLOYMENT - QUICK START INSTALLATION
# 
# This script installs all missing prerequisites for AWS EKS deployment
# Estimated time: 20-30 minutes
# Platform: macOS with Homebrew
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}LEDGR AWS EKS DEPLOYMENT - PREREQUISITES INSTALLATION${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo ""

################################################################################
# STEP 0: Check for Homebrew
################################################################################

echo -e "${BLUE}[STEP 0/5]${NC} Checking Homebrew..."
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}⚠️  Homebrew not found. Installing Homebrew...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo -e "${GREEN}✓ Homebrew installed${NC}"
else
    echo -e "${GREEN}✓ Homebrew already installed${NC}"
fi
echo ""

################################################################################
# STEP 1: Install Docker Desktop
################################################################################

echo -e "${BLUE}[STEP 1/5]${NC} Installing Docker Desktop..."
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓ Docker already installed: $(docker --version)${NC}"
else
    echo -e "${YELLOW}Installing Docker Desktop (this may take 2-3 minutes)...${NC}"
    brew install --cask docker
    echo -e "${YELLOW}⚠️  Please start Docker Desktop from Applications${NC}"
    echo -e "${YELLOW}   Press Enter once Docker is running...${NC}"
    read -p ""
    
    # Wait for Docker to be ready
    echo -e "${YELLOW}Waiting for Docker to be ready...${NC}"
    until docker ps > /dev/null 2>&1; do
        echo -e "${YELLOW}.${NC}" | tr -d '\n'
        sleep 2
    done
    echo -e "${GREEN}✓ Docker is running: $(docker --version)${NC}"
fi
echo ""

################################################################################
# STEP 2: Install kubectl
################################################################################

echo -e "${BLUE}[STEP 2/5]${NC} Installing kubectl..."
if command -v kubectl &> /dev/null; then
    echo -e "${GREEN}✓ kubectl already installed: $(kubectl version --client --short)${NC}"
else
    echo -e "${YELLOW}Installing kubectl...${NC}"
    brew install kubectl
    echo -e "${GREEN}✓ kubectl installed: $(kubectl version --client --short)${NC}"
fi
echo ""

################################################################################
# STEP 3: Install AWS CLI v2
################################################################################

echo -e "${BLUE}[STEP 3/5]${NC} Installing AWS CLI v2..."
if command -v aws &> /dev/null; then
    echo -e "${GREEN}✓ AWS CLI already installed: $(aws --version)${NC}"
else
    echo -e "${YELLOW}Installing AWS CLI v2...${NC}"
    brew install awscliv2
    echo -e "${GREEN}✓ AWS CLI installed: $(aws --version)${NC}"
fi
echo ""

################################################################################
# STEP 4: Install eksctl
################################################################################

echo -e "${BLUE}[STEP 4/5]${NC} Installing eksctl..."
if command -v eksctl &> /dev/null; then
    echo -e "${GREEN}✓ eksctl already installed: $(eksctl version)${NC}"
else
    echo -e "${YELLOW}Installing eksctl...${NC}"
    brew tap weaveworks/tap
    brew install weaveworks/tap/eksctl
    echo -e "${GREEN}✓ eksctl installed: $(eksctl version)${NC}"
fi
echo ""

################################################################################
# STEP 5: Configure AWS Credentials
################################################################################

echo -e "${BLUE}[STEP 5/5]${NC} Configuring AWS Credentials..."

if aws sts get-caller-identity &> /dev/null; then
    echo -e "${GREEN}✓ AWS credentials already configured${NC}"
    echo -e "${GREEN}  Account: $(aws sts get-caller-identity | grep Account | cut -d'"' -f4)${NC}"
else
    echo -e "${YELLOW}AWS credentials not configured. Running 'aws configure'...${NC}"
    echo ""
    echo -e "${YELLOW}Please enter your AWS credentials:${NC}"
    echo -e "${YELLOW}  1. AWS Access Key ID: [paste your access key]${NC}"
    echo -e "${YELLOW}  2. AWS Secret Access Key: [paste your secret key]${NC}"
    echo -e "${YELLOW}  3. Default region: ${BLUE}us-east-1${NC}${YELLOW} (recommended)${NC}"
    echo -e "${YELLOW}  4. Default output format: ${BLUE}json${NC}"
    echo ""
    
    aws configure
    
    # Verify credentials
    if aws sts get-caller-identity &> /dev/null; then
        echo -e "${GREEN}✓ AWS credentials configured successfully${NC}"
        echo -e "${GREEN}  Account: $(aws sts get-caller-identity | grep Account | cut -d'"' -f4)${NC}"
    else
        echo -e "${RED}✗ AWS credentials failed verification${NC}"
        exit 1
    fi
fi
echo ""

################################################################################
# FINAL VERIFICATION
################################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}PREREQUISITES VERIFICATION${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo ""

FAILED=0

# Check Docker
if docker --version &> /dev/null && docker ps &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker: $(docker --version)"
else
    echo -e "${RED}✗${NC} Docker: Failed"
    FAILED=1
fi

# Check kubectl
if kubectl version --client &> /dev/null; then
    echo -e "${GREEN}✓${NC} kubectl: $(kubectl version --client --short)"
else
    echo -e "${RED}✗${NC} kubectl: Failed"
    FAILED=1
fi

# Check AWS CLI
if aws --version &> /dev/null; then
    echo -e "${GREEN}✓${NC} AWS CLI: $(aws --version)"
else
    echo -e "${RED}✗${NC} AWS CLI: Failed"
    FAILED=1
fi

# Check eksctl
if eksctl version &> /dev/null; then
    echo -e "${GREEN}✓${NC} eksctl: $(eksctl version)"
else
    echo -e "${RED}✗${NC} eksctl: Failed"
    FAILED=1
fi

# Check AWS credentials
if aws sts get-caller-identity &> /dev/null; then
    ACCOUNT=$(aws sts get-caller-identity | grep Account | cut -d'"' -f4)
    ARN=$(aws sts get-caller-identity | grep Arn | cut -d'"' -f4)
    echo -e "${GREEN}✓${NC} AWS Credentials: Account $ACCOUNT"
else
    echo -e "${RED}✗${NC} AWS Credentials: Failed"
    FAILED=1
fi

# Check git
if git --version &> /dev/null; then
    echo -e "${GREEN}✓${NC} git: $(git --version)"
else
    echo -e "${RED}✗${NC} git: Failed"
fi

# Check GitHub CLI
if gh --version &> /dev/null; then
    echo -e "${GREEN}✓${NC} GitHub CLI: $(gh --version)"
else
    echo -e "${RED}✗${NC} GitHub CLI: Failed"
fi

echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ ALL PREREQUISITES INSTALLED AND VERIFIED!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo -e "  1. Review AWS account configuration"
    echo -e "  2. Proceed to Phase 2: AWS Infrastructure Provisioning"
    echo ""
    echo -e "  Run: ${YELLOW}cd /Users/test/Documents/Claude/Projects/Ledgr/scripts${NC}"
    echo -e "  Then: ${YELLOW}./provision-aws-infrastructure.sh staging${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}✗ SOME PREREQUISITES FAILED${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  - Docker: See PREREQUISITES_INSTALLATION.md > Docker troubleshooting"
    echo "  - AWS Credentials: Run 'aws configure' again with correct keys"
    echo "  - Other: Check PREREQUISITES_INSTALLATION.md for detailed steps"
    echo ""
    exit 1
fi
