# Terraform: AWS Secrets Manager Configuration
# Day 3-4 implementation: Store and rotate database credentials, JWT signing key, OAuth secrets
# All secrets stored with encryption; automatic rotation policies enabled

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "ledgr"
      Environment = var.environment
      ManagedBy   = "Terraform"
      CreatedAt   = timestamp()
    }
  }
}

# ============================================================================
# Variables
# ============================================================================

variable "aws_region" {
  description = "AWS region for Secrets Manager and KMS"
  type        = string
  default     = "eu-central-1"
}

variable "environment" {
  description = "Environment: dev, staging, prod"
  type        = string
  default     = "dev"
}

variable "db_host" {
  description = "RDS PostgreSQL hostname"
  type        = string
  sensitive   = true
}

variable "db_port" {
  description = "RDS PostgreSQL port"
  type        = number
  default     = 5432
}

variable "db_username" {
  description = "RDS PostgreSQL master username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "RDS PostgreSQL master password (generated securely)"
  type        = string
  sensitive   = true
}

# ============================================================================
# KMS Master Key (HSM-backed, for envelope encryption)
# ============================================================================

resource "aws_kms_key" "ledgr_master" {
  description             = "Ledgr master key for envelope encryption and DEK management"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  rotation_period_in_days = 365
  customer_master_key_spec = "SYMMETRIC_DEFAULT"

  tags = {
    Name = "ledgr-master-key"
  }
}

resource "aws_kms_alias" "ledgr_master" {
  name          = "alias/ledgr-master"
  target_key_id = aws_kms_key.ledgr_master.key_id
}

# ============================================================================
# Secret 1: PostgreSQL Database Credentials (90-day rotation)
# ============================================================================

resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "ledgr/db/postgres"
  description             = "RDS PostgreSQL connection credentials for ledgr_app role"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.ledgr_master.id

  tags = {
    Name = "ledgr-db-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = var.db_password
    host     = var.db_host
    port     = var.db_port
    database = "ledgr"
    engine   = "postgres"
  })
}

resource "aws_secretsmanager_secret_rotation" "db_credentials" {
  secret_id           = aws_secretsmanager_secret.db_credentials.id
  rotation_rules {
    automatically_after_days = 90
  }
}

# ============================================================================
# Secret 2: JWT Signing Key (RS256 private key, manual rotation)
# ============================================================================

resource "aws_secretsmanager_secret" "jwt_signing_key" {
  name                    = "ledgr/jwt/signing-key"
  description             = "RS256 private key for JWT token signing (15-min expiry)"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.ledgr_master.id

  tags = {
    Name = "ledgr-jwt-signing-key"
  }
}

# Note: Actual RSA key pair must be generated externally and stored:
# openssl genrsa -out private-key.pem 2048
# openssl rsa -in private-key.pem -pubout -out public-key.pem
# Then manually upload private-key.pem to this secret; rotate annually

resource "aws_secretsmanager_secret_version" "jwt_signing_key" {
  secret_id = aws_secretsmanager_secret.jwt_signing_key.id
  secret_string = file("${path.module}/keys/jwt-private-key.pem")
}

# ============================================================================
# Secret 3: OAuth Client Secret (Google, GitHub, Okta)
# ============================================================================

resource "aws_secretsmanager_secret" "oauth_credentials" {
  name                    = "ledgr/oauth/client-secret"
  description             = "OAuth provider credentials (Google, GitHub, Okta, etc.)"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.ledgr_master.id

  tags = {
    Name = "ledgr-oauth-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "oauth_credentials" {
  secret_id = aws_secretsmanager_secret.oauth_credentials.id
  secret_string = jsonencode({
    google_client_id     = var.oauth_google_client_id
    google_client_secret = var.oauth_google_client_secret
    github_client_id     = var.oauth_github_client_id
    github_client_secret = var.oauth_github_client_secret
    okta_client_id       = var.oauth_okta_client_id
    okta_client_secret   = var.oauth_okta_client_secret
  })
}

# ============================================================================
# Secret 4: Twilio SMS API Credentials
# ============================================================================

resource "aws_secretsmanager_secret" "twilio_credentials" {
  name                    = "ledgr/twilio/credentials"
  description             = "Twilio API credentials for SMS MFA fallback"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.ledgr_master.id

  tags = {
    Name = "ledgr-twilio-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "twilio_credentials" {
  secret_id = aws_secretsmanager_secret.twilio_credentials.id
  secret_string = jsonencode({
    account_sid   = var.twilio_account_sid
    auth_token    = var.twilio_auth_token
    from_phone    = "+971123456789" # UAE phone number for SMS sender
  })
}

# ============================================================================
# IAM Policy: Allow ECS Task Role to Read Secrets
# ============================================================================

resource "aws_iam_role" "ecs_task_role" {
  name = "ledgr-ecs-task-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_secrets_access" {
  name = "ledgr-ecs-secrets-access-${var.environment}"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadSecretsManager"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          aws_secretsmanager_secret.db_credentials.arn,
          aws_secretsmanager_secret.jwt_signing_key.arn,
          aws_secretsmanager_secret.oauth_credentials.arn,
          aws_secretsmanager_secret.twilio_credentials.arn
        ]
      },
      {
        Sid    = "DecryptWithKMS"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = aws_kms_key.ledgr_master.arn
      },
      {
        Sid    = "CloudTrailAudit"
        Effect = "Allow"
        Action = [
          "cloudtrail:PutEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

# ============================================================================
# CloudTrail: Audit All Secrets Manager Access
# ============================================================================

resource "aws_cloudtrail" "ledgr_secrets" {
  name                          = "ledgr-secrets-audit-${var.environment}"
  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  depends_on                    = [aws_s3_bucket_policy.cloudtrail]

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::SecretsManager::Secret"
      values = ["arn:aws:secretsmanager:${var.aws_region}:*:secret:ledgr/*"]
    }
  }

  tags = {
    Name = "ledgr-secrets-audit"
  }
}

resource "aws_s3_bucket" "cloudtrail_logs" {
  bucket = "ledgr-cloudtrail-logs-${data.aws_caller_identity.current.account_id}-${var.aws_region}"

  tags = {
    Name = "ledgr-cloudtrail-logs"
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail_logs.arn
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail_logs.arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      }
    ]
  })
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_caller_identity" "current" {}

# ============================================================================
# Outputs
# ============================================================================

output "secrets_manager_db_arn" {
  value       = aws_secretsmanager_secret.db_credentials.arn
  description = "ARN of database credentials secret"
}

output "secrets_manager_jwt_arn" {
  value       = aws_secretsmanager_secret.jwt_signing_key.arn
  description = "ARN of JWT signing key secret"
}

output "kms_master_key_id" {
  value       = aws_kms_key.ledgr_master.id
  description = "KMS master key ID for envelope encryption"
}

output "ecs_task_role_arn" {
  value       = aws_iam_role.ecs_task_role.arn
  description = "ARN of ECS task role with Secrets Manager access"
}
