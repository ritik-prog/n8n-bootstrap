# Reddit Launch Kit

## r/selfhosted

**Title:** Tired of ClickOps? I built n8nforge — a CLI + Terraform provider to bootstrap n8n owner, encryption keys, and API keys with zero browser interaction

**Body:**

I spent way too long trying to automate n8n setup. The owner signup wizard, manual API key creation, and encryption key management are a pain for CI/CD and multi-environment deployments.

So I built **n8nforge** — an open-source bootstrap tool that:

- Pre-provisions the owner account via env vars (n8n 2.17.0+)
- Generates and injects `N8N_ENCRYPTION_KEY` before first boot
- Creates API keys automatically after startup (no browser)
- Works on Docker, K8s, AWS ECS/EKS, GCP Cloud Run/GKE
- Ships a Terraform provider

**Quick start:**

```bash
git clone https://github.com/n8nforge/n8nforge
cd n8nforge && pnpm install && pnpm build
./examples/docker-local/bootstrap.sh
# n8n ready at http://localhost:5678
```

GitHub: https://github.com/n8nforge/n8nforge
License: Apache 2.0

Would love feedback from fellow self-hosters!

---

## r/devops

**Title:** n8nforge: Programmatic n8n bootstrap CLI + Terraform provider (owner, secrets, API keys)

**Body:**

Sharing a tool we built for teams running n8n in production:

**Problem:** n8n's initial setup is ClickOps — browser signup, manual API keys, encryption key management. Nothing is cleanly provisioned in CI/CD pipelines.

**Solution:** n8nforge bootstrap engine with:
- Declarative `n8nforge.yaml` manifest
- Idempotent 4-phase bootstrap (plan → pre-boot → deploy → post-boot)
- Terraform provider (`n8nforge_instance`, `n8nforge_api_key`)
- AWS/GCP Terraform modules with Secrets Manager integration
- Helm chart with init Job pattern

**Example:**

```bash
n8nforge plan -f n8nforge.yaml
n8nforge bootstrap -f n8nforge.yaml
n8nforge status --json
```

```hcl
resource "n8nforge_instance" "prod" {
  manifest_path = "n8nforge.yaml"
}
```

Apache 2.0, contributions welcome.
