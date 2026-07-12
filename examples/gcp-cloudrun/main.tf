module "n8nforge" {
  source = "../../packages/adapters/gcp/terraform/modules/cloudrun"

  name                = var.name
  project_id          = var.project_id
  region              = var.region
  owner_email         = var.owner_email
  owner_password_hash = var.owner_password_hash
  n8n_host            = var.n8n_host
  db_password         = var.db_password
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
variable "db_password" {
  type      = string
  sensitive = true
}

output "cloud_run_uri" {
  value = module.n8nforge.cloud_run_uri
}
