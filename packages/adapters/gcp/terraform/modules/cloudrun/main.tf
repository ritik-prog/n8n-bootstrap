terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6"
    }
  }
}

variable "name" { type = string }
variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "us-central1"
}
variable "owner_email" { type = string }
variable "owner_password_hash" {
  type      = string
  sensitive = true
}
variable "n8n_host" { type = string }
variable "n8n_version" {
  type    = string
  default = "2.17.0"
}
variable "db_password" {
  type      = string
  sensitive = true
}
variable "encryption_key" {
  type      = string
  sensitive = true
  default   = ""
}
variable "jwt_secret" {
  type      = string
  sensitive = true
  default   = ""
}

locals {
  encryption_key = var.encryption_key != "" ? var.encryption_key : random_password.encryption_key.result
  jwt_secret     = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
}

resource "random_password" "encryption_key" {
  length  = 64
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "google_sql_database_instance" "n8n" {
  name             = "${var.name}-n8n"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier = "db-f1-micro"
    # Cloud Run connects via the Cloud SQL Auth Proxy connector (cloud_sql_instance
    # volume below), which doesn't require a VPC — leave IP config at its default
    # (public IP, access still gated by Cloud SQL IAM/connector, not the public address).
  }

  deletion_protection = false
}

resource "google_sql_database" "n8n" {
  name     = "n8n"
  instance = google_sql_database_instance.n8n.name
}

resource "google_sql_user" "n8n" {
  name     = "n8n"
  instance = google_sql_database_instance.n8n.name
  password = var.db_password
}

resource "google_cloud_run_v2_service" "n8n" {
  name     = "${var.name}-n8n"
  location = var.region
  project  = var.project_id

  template {
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.n8n.connection_name]
      }
    }

    containers {
      image = "docker.n8n.io/n8nio/n8n:${var.n8n_version}"
      ports {
        container_port = 5678
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "N8N_HOST"
        value = var.n8n_host
      }
      env {
        name  = "N8N_PROTOCOL"
        value = "https"
      }
      env {
        name  = "WEBHOOK_URL"
        value = "https://${var.n8n_host}/"
      }
      env {
        name  = "N8N_INSTANCE_OWNER_MANAGED_BY_ENV"
        value = "true"
      }
      env {
        name  = "N8N_INSTANCE_OWNER_EMAIL"
        value = var.owner_email
      }
      env {
        name  = "N8N_INSTANCE_OWNER_FIRST_NAME"
        value = "Admin"
      }
      env {
        name  = "N8N_INSTANCE_OWNER_LAST_NAME"
        value = "User"
      }
      env {
        name  = "N8N_INSTANCE_OWNER_PASSWORD_HASH"
        value = var.owner_password_hash
      }
      env {
        name  = "N8N_ENCRYPTION_KEY"
        value = local.encryption_key
      }
      env {
        name  = "N8N_USER_MANAGEMENT_JWT_SECRET"
        value = local.jwt_secret
      }
      env {
        name  = "DB_TYPE"
        value = "postgresdb"
      }
      env {
        name  = "DB_POSTGRESDB_HOST"
        value = "/cloudsql/${google_sql_database_instance.n8n.connection_name}"
      }
      env {
        name  = "DB_POSTGRESDB_PORT"
        value = "5432"
      }
      env {
        name  = "DB_POSTGRESDB_DATABASE"
        value = "n8n"
      }
      env {
        name  = "DB_POSTGRESDB_USER"
        value = "n8n"
      }
      env {
        name  = "DB_POSTGRESDB_PASSWORD"
        value = var.db_password
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

output "cloud_run_uri" {
  value = google_cloud_run_v2_service.n8n.uri
}

output "sql_connection" {
  value = google_sql_database_instance.n8n.connection_name
}

output "instance_url" {
  value = "https://${var.n8n_host}"
}
