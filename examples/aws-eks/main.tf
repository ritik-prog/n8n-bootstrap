module "n8nforge" {
  source = "../../packages/adapters/aws/terraform/modules/eks"

  name                = var.name
  cluster_name        = var.cluster_name
  namespace           = var.namespace
  owner_email         = var.owner_email
  owner_password      = var.owner_password
  owner_password_hash = var.owner_password_hash
  n8n_host            = var.n8n_host
  encryption_key      = var.encryption_key
  jwt_secret          = var.jwt_secret
  db_password         = var.db_password
}

variable "name" { type = string }
variable "cluster_name" { type = string }
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

output "release_name" {
  value = module.n8nforge.release_name
}
