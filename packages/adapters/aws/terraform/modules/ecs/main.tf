terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6"
    }
    null = {
      source  = "hashicorp/null"
      version = ">= 3.2"
    }
  }
}

variable "name" {
  type        = string
  description = "Instance name prefix"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for ECS tasks"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnet IDs for ALB"
}

variable "owner_email" {
  type        = string
  description = "n8n owner email"
}

variable "owner_password_hash" {
  type        = string
  sensitive   = true
  description = "Bcrypt hash of owner password (generate via: n8nforge bootstrap --phase pre-boot)"
}

variable "n8n_host" {
  type        = string
  description = "Public hostname for n8n"
}

variable "n8n_version" {
  type        = string
  default     = "2.17.0"
  description = "n8n Docker image tag"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "RDS PostgreSQL password"
}

variable "encryption_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "N8N_ENCRYPTION_KEY (auto-generated if empty)"
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for the ALB HTTPS listener (required — N8N_PROTOCOL is https)"
}

locals {
  name_prefix    = var.name
  encryption_key = var.encryption_key != "" ? var.encryption_key : random_password.encryption_key.result
}

resource "random_password" "encryption_key" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "n8n_secrets" {
  name = "${local.name_prefix}-n8n-secrets"
}

resource "aws_secretsmanager_secret_version" "n8n_secrets" {
  secret_id = aws_secretsmanager_secret.n8n_secrets.id
  secret_string = jsonencode({
    N8N_ENCRYPTION_KEY               = local.encryption_key
    N8N_USER_MANAGEMENT_JWT_SECRET   = random_password.jwt_secret.result
    N8N_INSTANCE_OWNER_PASSWORD_HASH = var.owner_password_hash
    DB_POSTGRESDB_PASSWORD           = var.db_password
  })
}

resource "aws_db_subnet_group" "n8n" {
  name       = "${local.name_prefix}-db"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds"
  description = "RDS security group for n8n"
  vpc_id      = var.vpc_id

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
}

resource "aws_db_instance" "n8n" {
  identifier             = "${local.name_prefix}-n8n"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  db_name                = "n8n"
  username               = "n8n"
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.n8n.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true
  publicly_accessible    = false
}

resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-ecs"
  description = "ECS tasks for n8n"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5678
    to_port         = 5678
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "ALB for n8n"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "n8n" {
  name               = "${local.name_prefix}-n8n"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
}

resource "aws_lb_target_group" "n8n" {
  name        = "${local.name_prefix}-n8n"
  port        = 5678
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/healthz"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.n8n.arn
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

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.n8n.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.n8n.arn
  }
}

resource "aws_ecs_cluster" "n8n" {
  name = "${local.name_prefix}-n8n"
}

resource "aws_iam_role" "ecs_execution" {
  name = "${local.name_prefix}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${local.name_prefix}-execution-secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.n8n_secrets.arn]
    }]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_policy" {
  name = "${local.name_prefix}-task"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.n8n_secrets.arn]
    }]
  })
}

resource "aws_cloudwatch_log_group" "n8n" {
  name              = "/ecs/${local.name_prefix}-n8n"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "n8n" {
  family                   = "${local.name_prefix}-n8n"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name         = "n8n"
    image        = "docker.n8n.io/n8nio/n8n:${var.n8n_version}"
    portMappings = [{ containerPort = 5678, protocol = "tcp" }]
    environment = [
      { name = "N8N_HOST", value = var.n8n_host },
      { name = "N8N_PROTOCOL", value = "https" },
      { name = "WEBHOOK_URL", value = "https://${var.n8n_host}/" },
      { name = "N8N_INSTANCE_OWNER_MANAGED_BY_ENV", value = "true" },
      { name = "N8N_INSTANCE_OWNER_EMAIL", value = var.owner_email },
      { name = "N8N_INSTANCE_OWNER_FIRST_NAME", value = "Admin" },
      { name = "N8N_INSTANCE_OWNER_LAST_NAME", value = "User" },
      { name = "DB_TYPE", value = "postgresdb" },
      { name = "DB_POSTGRESDB_HOST", value = aws_db_instance.n8n.address },
      { name = "DB_POSTGRESDB_PORT", value = "5432" },
      { name = "DB_POSTGRESDB_DATABASE", value = "n8n" },
      { name = "DB_POSTGRESDB_USER", value = "n8n" },
    ]
    secrets = [
      { name = "N8N_ENCRYPTION_KEY", valueFrom = "${aws_secretsmanager_secret.n8n_secrets.arn}:N8N_ENCRYPTION_KEY::" },
      { name = "N8N_USER_MANAGEMENT_JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.n8n_secrets.arn}:N8N_USER_MANAGEMENT_JWT_SECRET::" },
      { name = "N8N_INSTANCE_OWNER_PASSWORD_HASH", valueFrom = "${aws_secretsmanager_secret.n8n_secrets.arn}:N8N_INSTANCE_OWNER_PASSWORD_HASH::" },
      { name = "DB_POSTGRESDB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.n8n_secrets.arn}:DB_POSTGRESDB_PASSWORD::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.n8n.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "n8n"
      }
    }
  }])
}

data "aws_region" "current" {}

resource "aws_ecs_service" "n8n" {
  name            = "${local.name_prefix}-n8n"
  cluster         = aws_ecs_cluster.n8n.id
  task_definition = aws_ecs_task_definition.n8n.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.n8n.arn
    container_name   = "n8n"
    container_port   = 5678
  }

  depends_on = [aws_lb_listener.http, aws_lb_listener.https]
}

# Run post-boot API key bootstrap after n8n is deployed (requires n8nforge CLI locally)
resource "null_resource" "bootstrap" {
  triggers = {
    service_id = aws_ecs_service.n8n.id
    secrets_id = aws_secretsmanager_secret_version.n8n_secrets.version_id
  }

  provisioner "local-exec" {
    command = "echo 'Run: n8nforge bootstrap --phase post-boot -f n8nforge.yaml' after n8n is healthy at https://${var.n8n_host}"
  }

  depends_on = [aws_ecs_service.n8n]
}

output "alb_dns_name" {
  value       = aws_lb.n8n.dns_name
  description = "ALB DNS name — point your domain here"
}

output "rds_endpoint" {
  value       = aws_db_instance.n8n.endpoint
  description = "RDS endpoint"
}

output "secrets_arn" {
  value       = aws_secretsmanager_secret.n8n_secrets.arn
  description = "Secrets Manager ARN for n8n credentials"
}

output "instance_url" {
  value       = "https://${var.n8n_host}"
  description = "n8n instance URL"
}
