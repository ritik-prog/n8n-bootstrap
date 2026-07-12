terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.12"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.25"
    }
  }
}

variable "name" { type = string }
variable "cluster_name" {
  type        = string
  description = "Existing GKE cluster name"
}
variable "location" { type = string }
variable "project_id" { type = string }
variable "namespace" {
  type    = string
  default = "n8n"
}
variable "owner_email" { type = string }
variable "owner_password" {
  type      = string
  sensitive = true
}
variable "owner_password_hash" {
  type      = string
  sensitive = true
}
variable "n8n_host" { type = string }
variable "encryption_key" {
  type      = string
  sensitive = true
}
variable "jwt_secret" {
  type      = string
  sensitive = true
}
variable "db_password" {
  type      = string
  sensitive = true
}
variable "helm_chart_path" {
  type    = string
  default = "../../../../kubernetes/helm/n8nforge"
}

data "google_container_cluster" "this" {
  name     = var.cluster_name
  location = var.location
  project  = var.project_id
}

data "google_client_config" "default" {}

provider "kubernetes" {
  host  = "https://${data.google_container_cluster.this.endpoint}"
  token = data.google_client_config.default.access_token
  cluster_ca_certificate = base64decode(
    data.google_container_cluster.this.master_auth[0].cluster_ca_certificate,
  )
}

provider "helm" {
  kubernetes {
    host  = "https://${data.google_container_cluster.this.endpoint}"
    token = data.google_client_config.default.access_token
    cluster_ca_certificate = base64decode(
      data.google_container_cluster.this.master_auth[0].cluster_ca_certificate,
    )
  }
}

resource "helm_release" "n8nforge" {
  name             = var.name
  namespace        = var.namespace
  chart            = var.helm_chart_path
  create_namespace = true
  wait             = true
  timeout          = 600

  set_sensitive {
    name  = "owner.password"
    value = var.owner_password
  }

  set_sensitive {
    name  = "owner.passwordHash"
    value = var.owner_password_hash
  }

  set_sensitive {
    name  = "secrets.encryptionKey"
    value = var.encryption_key
  }

  set_sensitive {
    name  = "secrets.jwtSecret"
    value = var.jwt_secret
  }

  set_sensitive {
    name  = "database.password"
    value = var.db_password
  }

  set {
    name  = "owner.email"
    value = var.owner_email
  }

  set {
    name  = "n8n.host"
    value = var.n8n_host
  }

  set {
    name  = "ingress.enabled"
    value = "true"
  }

  set {
    name  = "ingress.hosts[0].host"
    value = var.n8n_host
  }
}

output "release_name" {
  value = helm_release.n8nforge.name
}
