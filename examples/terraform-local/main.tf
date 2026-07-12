terraform {
  required_providers {
    n8nforge = {
      source = "n8nforge/n8nforge"
    }
  }
}

provider "n8nforge" {
  cli_path = var.n8nforge_cli_path
}

variable "n8nforge_cli_path" {
  type    = string
  default = "n8nforge"
}

resource "n8nforge_instance" "local" {
  manifest_path = "${path.module}/../../examples/docker-local/n8nforge.yaml"
  phase         = "pre-boot"
}

data "n8nforge_instance" "local" {
  manifest_path = "${path.module}/../../examples/docker-local/n8nforge.yaml"
}

data "n8nforge_version" "current" {}

output "instance_url" {
  value = n8nforge_instance.local.instance_url
}

output "min_n8n_version" {
  value = data.n8nforge_version.current.min_n8n_version
}
