#!/bin/bash

################################################################################
# GitHub Actions Secrets Configuration Script (Phase 3)
# Creates IAM role for GitHub Actions OIDC and configures repository secrets
# 
# Usage: ./configure-github-secrets.sh [staging|production]
# Example: ./configure-github-secrets.sh staging
################################################################################

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-staging}
AWS_REGION=${AWS_REGION:-us-east-1}
GITHUB_OWNER=${GITHUB_OWNER:-test-user}
GITHUB_REPO=${GITHUB_REPO:-Ledgr}
GITHUB_TOKEN=${GITHUB_TOKEN:-}

# Get current directory and AWS account ID
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Phase 3: GitHub Actions Secrets Configuration${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Validation
validate_configuration() {
    echo -e "${BLUE}[*]${NC} Validating configuration..."
    
    # Check required commands
    for cmd in aws gh jq; do
        if ! command -v $cmd &> /dev/null; then
            echo -e "${RED}[✗]${NC} $cmd is not installed. Please install it first."
            exit 1
        fi
    done
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        echo -e "${RED}[✗]${NC} AWS credentials not configured. Run 'aws configure' first."
        exit 1
    fi
    
    # Check GitHub token
    if [ -z "$GITHUB_TOKEN" ]; then
        echo -e "${YELLOW}[!]${NC} GITHUB_TOKEN not set. Using 'gh auth status' for authentication."
        if ! gh auth status &> /dev/null; then
            echo -e "${RED}[✗]${NC} GitHub CLI not authenticated. Run 'gh auth login' first."
            exit 1
        fi
    fi
    
    # Validate environment
    if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        echo -e "${RED}[✗]${NC} Invalid environment. Use 'staging' or 'production'."
        exit 1
    fi
    
    echo -e "${GREEN}[✓]${NC} All prerequisites validated"
    echo ""
}

# Create GitHub Actions IAM Role with OIDC Trust
create_iam_role() {
    echo -e "${BLUE}[Phase 1]${NC} Creating IAM Role for GitHub Actions..."
    
    local role_name="github-actions-ledgr-role"
    local policy_name="github-actions-ledgr-policy"
    
    # Check if role already exists
    if aws iam get-role --role-name "$role_name" &> /dev/null; then
        echo -e "${YELLOW}[!]${NC} IAM role $role_name already exists. Skipping creation."
        ROLE_ARN=$(aws iam get-role --role-name "$role_name" --query 'Role.Arn' --output text)
    else
        # Create trust policy for GitHub OIDC
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
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:GITHUB_OWNER/GITHUB_REPO:*"
        }
      }
    }
  ]
}
EOF
        
        # Replace placeholders
        sed -i.bak "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" /tmp/trust-policy.json
        sed -i.bak "s/GITHUB_OWNER/$GITHUB_OWNER/g" /tmp/trust-policy.json
        sed -i.bak "s/GITHUB_REPO/$GITHUB_REPO/g" /tmp/trust-policy.json
        
        # Create IAM role
        ROLE_ARN=$(aws iam create-role \
            --role-name "$role_name" \
            --assume-role-policy-document file:///tmp/trust-policy.json \
            --query 'Role.Arn' \
            --output text)
        
        echo -e "${GREEN}[✓]${NC} Created IAM role: $role_name"
        echo -e "${GREEN}[✓]${NC} Role ARN: $ROLE_ARN"
    fi
    
    # Create and attach inline policy for GitHub Actions
    cat > /tmp/github-actions-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "arn:aws:ecr:REGION:ACCOUNT_ID:repository/ledgr/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster",
        "eks:ListClusters",
        "eks:DescribeNodegroup"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "*"
    }
  ]
}
EOF
    
    # Replace placeholders
    sed -i.bak "s/REGION/$AWS_REGION/g" /tmp/github-actions-policy.json
    sed -i.bak "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" /tmp/github-actions-policy.json
    
    # Attach policy
    aws iam put-role-policy \
        --role-name "$role_name" \
        --policy-name "$policy_name" \
        --policy-document file:///tmp/github-actions-policy.json
    
    echo -e "${GREEN}[✓]${NC} Attached IAM policy to role"
    echo ""
    
    # Clean up temp files
    rm -f /tmp/trust-policy.json /tmp/trust-policy.json.bak /tmp/github-actions-policy.json /tmp/github-actions-policy.json.bak
    
    echo "$ROLE_ARN"
}

# Extract infrastructure endpoints
extract_infrastructure_endpoints() {
    echo -e "${BLUE}[Phase 2]${NC} Extracting infrastructure endpoints..."
    
    local cluster_name="ledgr-${ENVIRONMENT}"
    
    # Extract EKS cluster names
    EKS_STAGING=$(aws eks list-clusters --region $AWS_REGION --query 'clusters[?contains(@, `staging`)]' --output text)
    EKS_PROD=$(aws eks list-clusters --region $AWS_REGION --query 'clusters[?contains(@, `production`)]' --output text)
    
    # If not found, use default names
    EKS_STAGING=${EKS_STAGING:-ledgr-staging}
    EKS_PROD=${EKS_PROD:-ledgr-production}
    
    # Extract RDS endpoint
    RDS_ENDPOINT=$(aws rds describe-db-instances \
        --region $AWS_REGION \
        --query "DBInstances[?contains(DBInstanceIdentifier, 'ledgr-postgres')].Endpoint.Address" \
        --output text | head -1)
    
    # Extract Redis endpoint
    REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
        --region $AWS_REGION \
        --show-cache-node-info \
        --query "CacheClusters[?contains(CacheClusterId, 'ledgr-redis')].CacheNodes[0].Address" \
        --output text | head -1)
    
    # Extract ECR registry
    ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
    
    # Extract ALB DNS
    ALB_DNS=$(aws elbv2 describe-load-balancers \
        --region $AWS_REGION \
        --query "LoadBalancers[?contains(LoadBalancerName, 'ledgr-alb')].DNSName" \
        --output text | head -1)
    
    echo -e "${GREEN}[✓]${NC} Infrastructure endpoints extracted:"
    echo "    AWS Account ID: $AWS_ACCOUNT_ID"
    echo "    EKS Staging: $EKS_STAGING"
    echo "    EKS Production: $EKS_PROD"
    echo "    RDS Endpoint: ${RDS_ENDPOINT:0:40}..."
    echo "    Redis Endpoint: ${REDIS_ENDPOINT:0:40}..."
    echo "    ECR Registry: $ECR_REGISTRY"
    echo "    ALB DNS: ${ALB_DNS:0:40}..."
    echo ""
}

# Configure GitHub repository secrets
configure_github_secrets() {
    echo -e "${BLUE}[Phase 3]${NC} Configuring GitHub repository secrets..."
    
    local secrets_to_set=(
        "AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID"
        "AWS_ROLE_TO_ASSUME=$ROLE_ARN"
        "EKS_CLUSTER_NAME_STAGING=$EKS_STAGING"
        "EKS_CLUSTER_NAME_PROD=$EKS_PROD"
    )
    
    # Set secrets using GitHub CLI
    for secret in "${secrets_to_set[@]}"; do
        secret_name="${secret%%=*}"
        secret_value="${secret#*=}"
        
        echo -e "${BLUE}[*]${NC} Setting secret: $secret_name"
        
        if [ -n "$GITHUB_TOKEN" ]; then
            # Use GitHub token if provided
            echo "$secret_value" | gh secret set "$secret_name" --repo "$GITHUB_OWNER/$GITHUB_REPO"
        else
            # Use gh auth
            echo "$secret_value" | gh secret set "$secret_name"
        fi
        
        echo -e "${GREEN}[✓]${NC} Secret configured: $secret_name"
    done
    
    echo ""
    echo -e "${YELLOW}[!]${NC} Manual configuration required for:"
    echo "    1. SONAR_TOKEN - Get from SonarCloud project settings"
    echo "    2. SLACK_WEBHOOK - Get from Slack workspace integrations"
    echo ""
    echo "    Run these commands to set them:"
    echo "    gh secret set SONAR_TOKEN --repo $GITHUB_OWNER/$GITHUB_REPO"
    echo "    gh secret set SLACK_WEBHOOK --repo $GITHUB_OWNER/$GITHUB_REPO"
    echo ""
}

# Setup GitHub OIDC provider in AWS
setup_github_oidc_provider() {
    echo -e "${BLUE}[Phase 0]${NC} Setting up GitHub OIDC provider..."
    
    local oidc_provider_arn="arn:aws:iam::$AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
    
    # Check if provider already exists
    if aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?OpenIDConnectProviderArn=='$oidc_provider_arn']" --output text | grep -q token.actions.githubusercontent.com; then
        echo -e "${YELLOW}[!]${NC} OIDC provider already exists. Skipping creation."
    else
        echo -e "${BLUE}[*]${NC} Creating GitHub OIDC provider..."
        
        # Create OIDC provider
        aws iam create-open-id-connect-provider \
            --url https://token.actions.githubusercontent.com \
            --client-id-list sts.amazonaws.com \
            --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
        
        echo -e "${GREEN}[✓]${NC} GitHub OIDC provider created"
    fi
    
    echo ""
}

# Main execution
main() {
    echo ""
    validate_configuration
    
    # Get GitHub repo info from current directory
    if [ -f "$PROJECT_DIR/.git/config" ]; then
        local git_url=$(grep "url = " "$PROJECT_DIR/.git/config" | awk '{print $NF}' | head -1)
        GITHUB_OWNER=$(echo "$git_url" | sed -E 's|.*[:/]([^/]+)/.*|\1|')
        GITHUB_REPO=$(echo "$git_url" | sed -E 's|.*[:/]([^/]+)/([^/]+)(\.git)?$|\2|' | sed 's/\.git//')
        
        echo -e "${BLUE}[*]${NC} Detected GitHub repository:"
        echo "    Owner: $GITHUB_OWNER"
        echo "    Repo: $GITHUB_REPO"
        echo ""
    else
        echo -e "${YELLOW}[!]${NC} Could not detect GitHub repository from .git/config"
        echo "    Please set GITHUB_OWNER and GITHUB_REPO environment variables"
        exit 1
    fi
    
    # Execute phases
    setup_github_oidc_provider
    ROLE_ARN=$(create_iam_role)
    extract_infrastructure_endpoints
    configure_github_secrets
    
    # Final summary
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ GitHub Actions secrets configuration completed!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Add SONAR_TOKEN and SLACK_WEBHOOK secrets (see above)"
    echo "  2. Commit changes: git add . && git commit -m 'Phase 3: GitHub Actions secrets configured'"
    echo "  3. Push to main branch: git push origin main"
    echo "  4. Monitor deployment: https://github.com/$GITHUB_OWNER/$GITHUB_REPO/actions"
    echo ""
    echo "Deployment pipeline will:"
    echo "  1. Run code quality checks (eslint, typescript, security audit)"
    echo "  2. Run unit and integration tests"
    echo "  3. Build Docker images and push to ECR"
    echo "  4. Run security scanning (Trivy)"
    echo "  5. Deploy to staging EKS cluster"
    echo "  6. Wait for manual approval"
    echo "  7. Deploy to production EKS cluster"
    echo ""
}

# Run main function
main "$@"
