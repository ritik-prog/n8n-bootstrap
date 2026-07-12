module "n8nforge" {
  source = "../../packages/adapters/aws/terraform/modules/ecs"

  name                = var.name
  vpc_id              = var.vpc_id
  subnet_ids          = var.subnet_ids
  public_subnet_ids   = var.public_subnet_ids
  owner_email         = var.owner_email
  owner_password_hash = var.owner_password_hash
  n8n_host            = var.n8n_host
  db_password         = var.db_password
  certificate_arn     = var.certificate_arn
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "public_subnet_ids" { type = list(string) }
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
variable "certificate_arn" { type = string }

output "instance_url" {
  value = module.n8nforge.instance_url
}
