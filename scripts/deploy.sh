#!/bin/bash
# LEDGR PRODUCTION DEPLOYMENT SCRIPT
# Automates deployment to Kubernetes cluster
# Usage: ./scripts/deploy.sh [staging|production] [frontend|backend|all]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"
COMPONENT="${2:-all}"

AWS_REGION="${AWS_REGION:-me-central-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
ECR_REGISTRY="${ECR_REGISTRY:-}"

KUBE_CLUSTER="${KUBE_CLUSTER:-ledgr-prod}"
KUBE_NAMESPACE="${KUBE_NAMESPACE:-ledgr}"
ROLLOUT_TIMEOUT="10m"

IMAGE_TAG="${IMAGE_TAG:-latest}"
FRONTEND_IMAGE="${ECR_REGISTRY}/ledgr/frontend:${IMAGE_TAG}"
BACKEND_IMAGE="${ECR_REGISTRY}/ledgr/backend:${IMAGE_TAG}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
log_success() { echo -e "${GREEN}✅ $*${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $*${NC}"; }
log_error() { echo -e "${RED}❌ $*${NC}"; }

validate_prerequisites() {
    log_info "Validating prerequisites..."
    for tool in docker kubectl aws git; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool not found: $tool"
            exit 1
        fi
    done
    
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured"
        exit 1
    fi
    
    local current_context=$(kubectl config current-context)
    log_info "Using kubectl context: $current_context"
    
    if ! kubectl get namespace "$KUBE_NAMESPACE" &> /dev/null; then
        log_warning "Creating namespace $KUBE_NAMESPACE..."
        kubectl create namespace "$KUBE_NAMESPACE"
    fi
    
    log_success "Prerequisites validation passed"
}

build_images() {
    log_info "Building Docker images..."
    
    if [[ "$COMPONENT" == "frontend" || "$COMPONENT" == "all" ]]; then
        log_info "Building frontend image..."
        docker build -f Dockerfile -t "$FRONTEND_IMAGE" "$PROJECT_ROOT"
        log_success "Frontend image built"
    fi
    
    if [[ "$COMPONENT" == "backend" || "$COMPONENT" == "all" ]]; then
        log_info "Building backend image..."
        docker build -f Dockerfile.backend -t "$BACKEND_IMAGE" "$PROJECT_ROOT"
        log_success "Backend image built"
    fi
}

push_images() {
    log_info "Pushing images to ECR..."
    
    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin "$ECR_REGISTRY"
    
    if [[ "$COMPONENT" == "frontend" || "$COMPONENT" == "all" ]]; then
        log_info "Pushing frontend image..."
        docker push "$FRONTEND_IMAGE"
        log_success "Frontend image pushed"
    fi
    
    if [[ "$COMPONENT" == "backend" || "$COMPONENT" == "all" ]]; then
        log_info "Pushing backend image..."
        docker push "$BACKEND_IMAGE"
        log_success "Backend image pushed"
    fi
}

update_manifests() {
    log_info "Updating Kubernetes manifests..."
    
    if [[ "$COMPONENT" == "frontend" || "$COMPONENT" == "all" ]]; then
        log_info "Updating frontend deployment..."
        kubectl set image deployment/frontend \
            frontend="$FRONTEND_IMAGE" \
            -n "$KUBE_NAMESPACE" --record
    fi
    
    if [[ "$COMPONENT" == "backend" || "$COMPONENT" == "all" ]]; then
        log_info "Updating backend deployment..."
        kubectl set image deployment/backend \
            backend="$BACKEND_IMAGE" \
            -n "$KUBE_NAMESPACE" --record
    fi
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    if [[ "$COMPONENT" == "frontend" || "$COMPONENT" == "all" ]]; then
        if kubectl rollout status deployment/frontend -n "$KUBE_NAMESPACE" --timeout="$ROLLOUT_TIMEOUT"; then
            log_success "Frontend deployment successful"
        else
            return 1
        fi
    fi
    
    if [[ "$COMPONENT" == "backend" || "$COMPONENT" == "all" ]]; then
        if kubectl rollout status deployment/backend -n "$KUBE_NAMESPACE" --timeout="$ROLLOUT_TIMEOUT"; then
            log_success "Backend deployment successful"
        else
            return 1
        fi
    fi
}

show_summary() {
    log_success "═══════════════════════════════════════════════════════════"
    log_success "DEPLOYMENT SUMMARY"
    log_success "═══════════════════════════════════════════════════════════"
    log_info "Environment:    $ENVIRONMENT"
    log_info "Component:      $COMPONENT"
    log_info "Namespace:      $KUBE_NAMESPACE"
    log_info "Image Tag:      $IMAGE_TAG"
    log_success "═══════════════════════════════════════════════════════════"
}

main() {
    log_info "╔════════════════════════════════════════════════════════════╗"
    log_info "║  LEDGR DEPLOYMENT SCRIPT                                  ║"
    log_info "║  Environment: $ENVIRONMENT                              ║"
    log_info "║  Component:   $COMPONENT                                ║"
    log_info "╚════════════════════════════════════════════════════════════╝"
    
    if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT"
        exit 1
    fi
    
    if [[ ! "$COMPONENT" =~ ^(frontend|backend|all)$ ]]; then
        log_error "Invalid component: $COMPONENT"
        exit 1
    fi
    
    if [[ -z "$AWS_ACCOUNT_ID" ]]; then
        AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    fi
    ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    
    validate_prerequisites
    build_images
    push_images
    update_manifests
    
    if ! verify_deployment; then
        log_error "Deployment verification failed"
        exit 1
    fi
    
    show_summary
    log_success "Deployment completed successfully!"
}

trap 'log_error "Script interrupted"; exit 1' INT TERM

main "$@"
