#!/bin/bash

################################################################################
# AWS Infrastructure Provisioning Script
# Automates creation of EKS cluster, RDS, Redis, ECR, and ALB
# 
# Usage: ./provision-aws-infrastructure.sh [staging|production]
# Example: ./provision-aws-infrastructure.sh staging
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
CLUSTER_NAME="ledgr-${ENVIRONMENT}"
NODE_COUNT=${NODE_COUNT:-3}
NODE_TYPE=${NODE_TYPE:-t3.medium}
POSTGRES_INSTANCE_CLASS="db.t3.micro"
REDIS_NODE_TYPE="cache.t3.micro"

# Validation
validate_environment() {
    echo -e "${BLUE}[*]${NC} Validating prerequisites..."
    
    # Check required commands
    for cmd in aws kubectl eksctl openssl jq; do
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
    
    # Validate environment
    if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        echo -e "${RED}[✗]${NC} Invalid environment. Use 'staging' or 'production'."
        exit 1
    fi
    
    echo -e "${GREEN}[✓]${NC} Prerequisites validated"
    
    # Display configuration
    echo ""
    echo -e "${BLUE}Configuration:${NC}"
    echo "  Environment: $ENVIRONMENT"
    echo "  AWS Region: $AWS_REGION"
    echo "  Cluster Name: $CLUSTER_NAME"
    echo "  Node Count: $NODE_COUNT"
    echo "  Node Type: $NODE_TYPE"
    echo ""
}

# Create EKS cluster
create_eks_cluster() {
    echo -e "${BLUE}[*]${NC} Creating EKS cluster '$CLUSTER_NAME'..."
    
    if eksctl get cluster --name $CLUSTER_NAME --region $AWS_REGION &> /dev/null; then
        echo -e "${YELLOW}[!]${NC} Cluster '$CLUSTER_NAME' already exists. Skipping creation."
        return
    fi
    
    eksctl create cluster \
        --name $CLUSTER_NAME \
        --version 1.34 \
        --region $AWS_REGION \
        --nodegroup-name "${CLUSTER_NAME}-nodes" \
        --nodes $NODE_COUNT \
        --nodes-min 2 \
        --nodes-max 10 \
        --node-type $NODE_TYPE \
        --enable-ssm \
        --managed \
        --tags "Environment=$ENVIRONMENT,Project=Ledgr" \
        --verbose 0
    
    # Update kubeconfig
    aws eks update-kubeconfig --name $CLUSTER_NAME --region $AWS_REGION
    
    echo -e "${GREEN}[✓]${NC} EKS cluster created successfully"
}

# Create RDS PostgreSQL
create_rds_postgres() {
    echo -e "${BLUE}[*]${NC} Creating RDS PostgreSQL instance..."
    
    local RDS_INSTANCE_ID="ledgr-postgres-${ENVIRONMENT}"
    local RDS_PASSWORD=$(openssl rand -base64 32)
    
    # Check if instance already exists
    if aws rds describe-db-instances --db-instance-identifier $RDS_INSTANCE_ID --region $AWS_REGION &> /dev/null; then
        echo -e "${YELLOW}[!]${NC} RDS instance '$RDS_INSTANCE_ID' already exists. Skipping creation."
        return
    fi
    
    # Get default VPC
    local VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
        --region $AWS_REGION --query 'Vpcs[0].VpcId' --output text)
    
    # Create security group
    local RDS_SG_ID=$(aws ec2 create-security-group \
        --group-name "ledgr-rds-${ENVIRONMENT}" \
        --description "RDS PostgreSQL for Ledgr $ENVIRONMENT" \
        --vpc-id $VPC_ID \
        --region $AWS_REGION \
        --query 'GroupId' --output text 2>/dev/null || echo "")
    
    if [ -z "$RDS_SG_ID" ]; then
        RDS_SG_ID=$(aws ec2 describe-security-groups \
            --filters "Name=group-name,Values=ledgr-rds-${ENVIRONMENT}" \
            --region $AWS_REGION --query 'SecurityGroups[0].GroupId' --output text)
    fi
    
    # Allow inbound PostgreSQL from anywhere (0.0.0.0/0 - adjust for production)
    aws ec2 authorize-security-group-ingress \
        --group-id $RDS_SG_ID \
        --protocol tcp \
        --port 5432 \
        --cidr 0.0.0.0/0 \
        --region $AWS_REGION 2>/dev/null || true
    
    # Create RDS instance
    local MULTI_AZ_FLAG=$([ "$ENVIRONMENT" = "production" ] && echo "--multi-az" || echo "--no-multi-az")
    local BACKUP_RETENTION=$([ "$ENVIRONMENT" = "production" ] && echo 30 || echo 1)
    
    aws rds create-db-instance \
        --db-instance-identifier $RDS_INSTANCE_ID \
        --db-instance-class $POSTGRES_INSTANCE_CLASS \
        --engine postgres \
        --engine-version 16 \
        --master-username postgres \
        --master-user-password "$RDS_PASSWORD" \
        --allocated-storage 20 \
        --storage-type gp3 \
        --backup-retention-period $BACKUP_RETENTION \
        $MULTI_AZ_FLAG \
        --no-publicly-accessible \
        --db-name ledgr \
        --vpc-security-group-ids $RDS_SG_ID \
        --region $AWS_REGION \
        --tags "Key=Environment,Value=$ENVIRONMENT" "Key=Project,Value=Ledgr"
    
    echo -e "${YELLOW}[!]${NC} RDS instance creation initiated. Waiting for availability (5-10 minutes)..."
    
    # Wait for instance to be available
    aws rds wait db-instance-available \
        --db-instance-identifier $RDS_INSTANCE_ID \
        --region $AWS_REGION
    
    # Get RDS endpoint
    local RDS_ENDPOINT=$(aws rds describe-db-instances \
        --db-instance-identifier $RDS_INSTANCE_ID \
        --region $AWS_REGION \
        --query 'DBInstances[0].Endpoint.Address' --output text)
    
    echo -e "${GREEN}[✓]${NC} RDS PostgreSQL created successfully"
    echo "  Instance ID: $RDS_INSTANCE_ID"
    echo "  Endpoint: $RDS_ENDPOINT"
    echo "  Master User: postgres"
    echo "  Password: (stored in AWS Secrets Manager)"
    echo ""
    
    # Store credentials in Secrets Manager
    store_secret "ledgr/${ENVIRONMENT}/postgres" \
        "{\"host\":\"$RDS_ENDPOINT\",\"port\":5432,\"user\":\"postgres\",\"password\":\"$RDS_PASSWORD\"}"
}

# Create ElastiCache Redis
create_redis_cache() {
    echo -e "${BLUE}[*]${NC} Creating ElastiCache Redis cluster..."
    
    local REDIS_CLUSTER_ID="ledgr-redis-${ENVIRONMENT}"
    
    # Check if cluster already exists
    if aws elasticache describe-cache-clusters --cache-cluster-id $REDIS_CLUSTER_ID --region $AWS_REGION &> /dev/null; then
        echo -e "${YELLOW}[!]${NC} Redis cluster '$REDIS_CLUSTER_ID' already exists. Skipping creation."
        return
    fi
    
    # Create security group
    local VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
        --region $AWS_REGION --query 'Vpcs[0].VpcId' --output text)
    
    local REDIS_SG_ID=$(aws ec2 create-security-group \
        --group-name "ledgr-redis-${ENVIRONMENT}" \
        --description "Redis for Ledgr $ENVIRONMENT" \
        --vpc-id $VPC_ID \
        --region $AWS_REGION \
        --query 'GroupId' --output text 2>/dev/null || echo "")
    
    if [ -z "$REDIS_SG_ID" ]; then
        REDIS_SG_ID=$(aws ec2 describe-security-groups \
            --filters "Name=group-name,Values=ledgr-redis-${ENVIRONMENT}" \
            --region $AWS_REGION --query 'SecurityGroups[0].GroupId' --output text)
    fi
    
    # Allow inbound Redis
    aws ec2 authorize-security-group-ingress \
        --group-id $REDIS_SG_ID \
        --protocol tcp \
        --port 6379 \
        --cidr 0.0.0.0/0 \
        --region $AWS_REGION 2>/dev/null || true
    
    # Create Redis cluster
    aws elasticache create-cache-cluster \
        --cache-cluster-id $REDIS_CLUSTER_ID \
        --cache-node-type $REDIS_NODE_TYPE \
        --engine redis \
        --engine-version 7.0 \
        --num-cache-nodes 1 \
        --port 6379 \
        --region $AWS_REGION \
        --tags "Key=Environment,Value=$ENVIRONMENT" "Key=Project,Value=Ledgr"
    
    echo -e "${YELLOW}[!]${NC} Redis cluster creation initiated. Waiting for availability (3-5 minutes)..."
    
    # Wait for cluster to be available
    aws elasticache wait cache-cluster-available \
        --cache-cluster-id $REDIS_CLUSTER_ID \
        --region $AWS_REGION
    
    # Get Redis endpoint
    local REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
        --cache-cluster-id $REDIS_CLUSTER_ID \
        --region $AWS_REGION \
        --show-cache-node-info \
        --query 'CacheClusters[0].CacheNodes[0].Address' --output text)
    
    echo -e "${GREEN}[✓]${NC} ElastiCache Redis created successfully"
    echo "  Cluster ID: $REDIS_CLUSTER_ID"
    echo "  Endpoint: $REDIS_ENDPOINT"
    echo ""
    
    # Store endpoint in Secrets Manager
    store_secret "ledgr/${ENVIRONMENT}/redis" \
        "{\"host\":\"$REDIS_ENDPOINT\",\"port\":6379,\"password\":\"\"}"
}

# Create ECR repositories
create_ecr_repositories() {
    echo -e "${BLUE}[*]${NC} Creating ECR repositories..."
    
    for repo in ledgr-frontend ledgr-backend; do
        if aws ecr describe-repositories --repository-names $repo --region $AWS_REGION &> /dev/null; then
            echo -e "${YELLOW}[!]${NC} Repository '$repo' already exists. Skipping creation."
            continue
        fi
        
        aws ecr create-repository \
            --repository-name $repo \
            --region $AWS_REGION \
            --tags "Key=Environment,Value=$ENVIRONMENT" "Key=Project,Value=Ledgr"
        
        # Enable image scanning
        aws ecr put-image-scanning-configuration \
            --repository-name $repo \
            --image-scanning-configuration scanOnPush=true \
            --region $AWS_REGION
        
        echo -e "${GREEN}[✓]${NC} Repository created: $repo"
    done
    
    # Get ECR registry
    local ECR_REGISTRY=$(aws ecr describe-repositories \
        --region $AWS_REGION \
        --query 'repositories[0].repositoryUri' --output text | cut -d'/' -f1)
    
    echo "  ECR Registry: $ECR_REGISTRY"
    echo ""
}

# Create Application Load Balancer
create_alb() {
    echo -e "${BLUE}[*]${NC} Creating Application Load Balancer..."
    
    local ALB_NAME="ledgr-alb-${ENVIRONMENT}"
    
    # Check if ALB already exists
    if aws elbv2 describe-load-balancers \
        --query "LoadBalancers[?LoadBalancerName=='$ALB_NAME']" \
        --region $AWS_REGION | jq -e '.LoadBalancers | length > 0' &> /dev/null; then
        echo -e "${YELLOW}[!]${NC} ALB '$ALB_NAME' already exists. Skipping creation."
        return
    fi
    
    # Get default VPC and subnets
    local VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
        --region $AWS_REGION --query 'Vpcs[0].VpcId' --output text)
    
    # Get subnets in different AZs
    local SUBNET_IDS=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=$VPC_ID" \
        --region $AWS_REGION \
        --query 'Subnets[0:2].SubnetId' --output text)
    
    # Create ALB
    local ALB_ARN=$(aws elbv2 create-load-balancer \
        --name $ALB_NAME \
        --subnets $SUBNET_IDS \
        --scheme internet-facing \
        --type application \
        --region $AWS_REGION \
        --tags "Key=Environment,Value=$ENVIRONMENT" "Key=Project,Value=Ledgr" \
        --query 'LoadBalancers[0].LoadBalancerArn' --output text)
    
    # Get ALB DNS name
    local ALB_DNS=$(aws elbv2 describe-load-balancers \
        --load-balancer-arns $ALB_ARN \
        --region $AWS_REGION \
        --query 'LoadBalancers[0].DNSName' --output text)
    
    # Create target group
    local TG_ARN=$(aws elbv2 create-target-group \
        --name "ledgr-backend-${ENVIRONMENT}" \
        --protocol HTTP \
        --port 8000 \
        --vpc-id $VPC_ID \
        --target-type ip \
        --region $AWS_REGION \
        --health-check-path /api/health \
        --health-check-interval-seconds 30 \
        --health-check-timeout-seconds 5 \
        --healthy-threshold-count 2 \
        --unhealthy-threshold-count 3 \
        --query 'TargetGroups[0].TargetGroupArn' --output text)
    
    # Create listener
    aws elbv2 create-listener \
        --load-balancer-arn $ALB_ARN \
        --protocol HTTP \
        --port 80 \
        --default-actions Type=forward,TargetGroupArn=$TG_ARN \
        --region $AWS_REGION
    
    echo -e "${GREEN}[✓]${NC} Application Load Balancer created successfully"
    echo "  ALB Name: $ALB_NAME"
    echo "  ALB DNS: $ALB_DNS"
    echo "  Target Group ARN: $TG_ARN"
    echo ""
}

# Store secret in AWS Secrets Manager
store_secret() {
    local SECRET_NAME=$1
    local SECRET_VALUE=$2
    
    if aws secretsmanager get-secret-value --secret-id $SECRET_NAME --region $AWS_REGION &> /dev/null; then
        echo -e "${YELLOW}[!]${NC} Secret '$SECRET_NAME' already exists. Updating..."
        aws secretsmanager update-secret \
            --secret-id $SECRET_NAME \
            --secret-string "$SECRET_VALUE" \
            --region $AWS_REGION
    else
        aws secretsmanager create-secret \
            --name $SECRET_NAME \
            --secret-string "$SECRET_VALUE" \
            --region $AWS_REGION \
            --tags "Key=Environment,Value=$ENVIRONMENT" "Key=Project,Value=Ledgr"
    fi
}

# Main execution
main() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}     AWS Infrastructure Provisioning for Ledgr"
    echo -e "${BLUE}║${NC}     Environment: $ENVIRONMENT"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    validate_environment
    
    # Execute provisioning steps
    echo -e "${BLUE}[Phase 1]${NC} Creating EKS Cluster..."
    create_eks_cluster
    echo ""
    
    echo -e "${BLUE}[Phase 2]${NC} Creating RDS PostgreSQL..."
    create_rds_postgres
    echo ""
    
    echo -e "${BLUE}[Phase 3]${NC} Creating ElastiCache Redis..."
    create_redis_cache
    echo ""
    
    echo -e "${BLUE}[Phase 4]${NC} Creating ECR Repositories..."
    create_ecr_repositories
    echo ""
    
    echo -e "${BLUE}[Phase 5]${NC} Creating Application Load Balancer..."
    create_alb
    echo ""
    
    # Final summary
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Infrastructure provisioning completed successfully!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Update GitHub Actions secrets with infrastructure endpoints"
    echo "  2. Update Kubernetes manifests with RDS and Redis endpoints"
    echo "  3. Run: git push to trigger CI/CD pipeline"
    echo "  4. Monitor: kubectl get pods -n ledgr"
    echo ""
}

# Run main function
main "$@"
