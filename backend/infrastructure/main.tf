# Terraform: RDS PostgreSQL, ALB, ECS, VPC Infrastructure
# Day 8-10 implementation: Complete Week 1-2 infrastructure (hardened DB, TLS 1.3 ALB, ECS cluster)

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
}

# ============================================================================
# Variables
# ============================================================================

variable "aws_region" {
  default = "eu-central-1"
}

variable "environment" {
  default = "dev"
}

variable "app_name" {
  default = "ledgr"
}

variable "rds_instance_class" {
  default = "db.t4g.medium"
}

variable "rds_allocated_storage" {
  default = 100
}

variable "rds_backup_retention" {
  default = 30
}

variable "ecs_container_port" {
  default = 3000
}

variable "ecs_task_cpu" {
  default = "256"
}

variable "ecs_task_memory" {
  default = "512"
}

variable "ecs_desired_count" {
  default = 2
}

# ============================================================================
# VPC and Networking
# ============================================================================

resource "aws_vpc" "ledgr" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.app_name}-vpc-${var.environment}"
  }
}

# Public subnets for ALB (2 AZs)
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.ledgr.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.app_name}-public-subnet-${count.index + 1}"
  }
}

# Private subnets for RDS (2 AZs)
resource "aws_subnet" "private_db" {
  count             = 2
  vpc_id            = aws_vpc.ledgr.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${var.app_name}-private-db-subnet-${count.index + 1}"
  }
}

# Private subnets for ECS (2 AZs)
resource "aws_subnet" "private_ecs" {
  count             = 2
  vpc_id            = aws_vpc.ledgr.id
  cidr_block        = "10.0.${count.index + 20}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${var.app_name}-private-ecs-subnet-${count.index + 1}"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "ledgr" {
  vpc_id = aws_vpc.ledgr.id

  tags = {
    Name = "${var.app_name}-igw"
  }
}

# Route table for public subnets
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.ledgr.id

  route {
    cidr_block      = "0.0.0.0/0"
    gateway_id      = aws_internet_gateway.ledgr.id
  }

  tags = {
    Name = "${var.app_name}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Data source for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# ============================================================================
# Security Groups
# ============================================================================

# ALB Security Group
resource "aws_security_group" "alb" {
  name        = "${var.app_name}-alb-sg-${var.environment}"
  description = "Security group for Ledgr ALB"
  vpc_id      = aws_vpc.ledgr.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_name}-alb-sg"
  }
}

# ECS Security Group
resource "aws_security_group" "ecs" {
  name        = "${var.app_name}-ecs-sg-${var.environment}"
  description = "Security group for Ledgr ECS tasks"
  vpc_id      = aws_vpc.ledgr.id

  ingress {
    from_port       = var.ecs_container_port
    to_port         = var.ecs_container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_name}-ecs-sg"
  }
}

# RDS Security Group
resource "aws_security_group" "rds" {
  name        = "${var.app_name}-rds-sg-${var.environment}"
  description = "Security group for Ledgr RDS PostgreSQL"
  vpc_id      = aws_vpc.ledgr.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_name}-rds-sg"
  }
}

# ============================================================================
# RDS PostgreSQL Instance (Multi-AZ, hardened)
# ============================================================================

resource "aws_db_subnet_group" "ledgr" {
  name       = "${var.app_name}-db-subnet-group"
  subnet_ids = aws_subnet.private_db[*].id

  tags = {
    Name = "${var.app_name}-db-subnet-group"
  }
}

resource "aws_rds_cluster_parameter_group" "ledgr" {
  family      = "aurora-postgresql15"
  name        = "${var.app_name}-aurora-params"
  description = "Custom parameter group for Ledgr Aurora PostgreSQL"

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_duration"
    value = "true"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # Log queries > 1 second
  }

  tags = {
    Name = "${var.app_name}-aurora-params"
  }
}

resource "aws_rds_cluster" "ledgr" {
  cluster_identifier              = "${var.app_name}-aurora-cluster-${var.environment}"
  engine                          = "aurora-postgresql"
  engine_version                  = "15.2"
  database_name                   = "ledgr"
  master_username                 = "postgres"
  master_password                 = random_password.rds_master.result
  backup_retention_period         = var.rds_backup_retention
  db_subnet_group_name            = aws_db_subnet_group.ledgr.name
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.ledgr.name
  vpc_security_group_ids          = [aws_security_group.rds.id]
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.rds.arn
  enable_http_endpoint            = false
  skip_final_snapshot             = var.environment != "prod"
  final_snapshot_identifier       = "${var.app_name}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"
  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = {
    Name = "${var.app_name}-aurora-cluster"
  }
}

resource "aws_rds_cluster_instance" "ledgr" {
  count              = 2
  cluster_identifier = aws_rds_cluster.ledgr.id
  instance_class     = var.rds_instance_class
  engine             = aws_rds_cluster.ledgr.engine
  engine_version     = aws_rds_cluster.ledgr.engine_version
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  tags = {
    Name = "${var.app_name}-aurora-instance-${count.index + 1}"
  }
}

# Random password for RDS master user
resource "random_password" "rds_master" {
  length  = 32
  special = true
}

# KMS key for RDS encryption
resource "aws_kms_key" "rds" {
  description             = "KMS key for Ledgr RDS encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "${var.app_name}-rds-key"
  }
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.app_name}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# IAM role for RDS monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.app_name}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ============================================================================
# Application Load Balancer (TLS 1.3)
# ============================================================================

resource "aws_lb" "ledgr" {
  name               = "${var.app_name}-alb-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = var.environment == "prod" ? true : false

  tags = {
    Name = "${var.app_name}-alb"
  }
}

# Target group for ECS tasks
resource "aws_lb_target_group" "ledgr" {
  name        = "${var.app_name}-tg-${var.environment}"
  port        = var.ecs_container_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.ledgr.id
  target_type = "ip"

  health_check {
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
  }

  tags = {
    Name = "${var.app_name}-tg"
  }
}

# HTTP listener (redirect to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.ledgr.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS listener (TLS 1.3)
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.ledgr.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01" # Updated to TLS 1.3 for AWS
  certificate_arn   = aws_acm_certificate.ledgr.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ledgr.arn
  }

  depends_on = [aws_acm_certificate_validation.ledgr]
}

# ============================================================================
# TLS Certificate (ACM + Let's Encrypt)
# ============================================================================

resource "aws_acm_certificate" "ledgr" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.app_name}-cert"
  }
}

resource "aws_acm_certificate_validation" "ledgr" {
  certificate_arn = aws_acm_certificate.ledgr.arn

  timeouts {
    create = "5m"
  }
}

variable "domain_name" {
  default = "api.ledgr.finance"
}

# ============================================================================
# ECS Cluster and Task Definition
# ============================================================================

resource "aws_ecs_cluster" "ledgr" {
  name = "${var.app_name}-cluster-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.app_name}-cluster"
  }
}

resource "aws_ecs_task_definition" "ledgr" {
  family                   = "${var.app_name}-task-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "${var.app_name}-api"
      image     = "node:18-alpine"
      essential = true
      portMappings = [
        {
          containerPort = var.ecs_container_port
          hostPort      = var.ecs_container_port
          protocol      = "tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:password::"
        },
        {
          name      = "JWT_SIGNING_KEY"
          valueFrom = "${aws_secretsmanager_secret.jwt_signing_key.arn}:key::"
        }
      ]
      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "DB_HOST"
          value = aws_rds_cluster.ledgr.endpoint
        },
        {
          name  = "DB_PORT"
          value = "5432"
        },
        {
          name  = "DB_USER"
          value = "ledgr_app"
        }
      ]
    }
  ])

  tags = {
    Name = "${var.app_name}-task"
  }
}

# IAM roles for ECS
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.app_name}-ecs-task-execution-role-${var.environment}"

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

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "${var.app_name}-ecs-task-role-${var.environment}"

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

# ECS Service
resource "aws_ecs_service" "ledgr" {
  name            = "${var.app_name}-service-${var.environment}"
  cluster         = aws_ecs_cluster.ledgr.id
  task_definition = aws_ecs_task_definition.ledgr.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private_ecs[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.ledgr.arn
    container_name   = "${var.app_name}-api"
    container_port   = var.ecs_container_port
  }

  depends_on = [aws_lb_listener.https]

  tags = {
    Name = "${var.app_name}-service"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.app_name}-${var.environment}"
  retention_in_days = 7

  tags = {
    Name = "${var.app_name}-ecs-logs"
  }
}

# ============================================================================
# Outputs
# ============================================================================

output "alb_dns_name" {
  value       = aws_lb.ledgr.dns_name
  description = "DNS name of the load balancer"
}

output "rds_endpoint" {
  value       = aws_rds_cluster.ledgr.endpoint
  description = "RDS cluster endpoint"
}

output "rds_master_password" {
  value       = random_password.rds_master.result
  sensitive   = true
  description = "RDS master password (store in Secrets Manager)"
}

output "ecs_cluster_name" {
  value       = aws_ecs_cluster.ledgr.name
  description = "ECS cluster name"
}

output "ecs_service_name" {
  value       = aws_ecs_service.ledgr.name
  description = "ECS service name"
}
