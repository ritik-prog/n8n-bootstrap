# n8nforge

**Tired of ClickOps?** n8nforge bootstraps n8n instances — owner account, encryption keys, and API keys — with zero browser interaction. Point it at a manifest, run one command, and get a fully provisioned n8n instance ready to use.

Production-grade, open-source bootstrap and provisioning platform for n8n. Works on Docker, Kubernetes, AWS ECS/EKS, and GCP Cloud Run/GKE.

> Need hands-on help designing or running n8n workflows? [Hire an n8n automation expert](https://www.ritiktechs.com/hire-n8n-automation-expert).

---

## Table of contents

- [Why n8nforge](#why-n8nforge)
- [How it works](#how-it-works)
- [Quick start (Docker, under 5 minutes)](#quick-start-docker-under-5-minutes)
- [CLI reference](#cli-reference)
- [Manifest reference (`n8nforge.yaml`)](#manifest-reference-n8nforgeyaml)
- [Deployment targets](#deployment-targets)
- [Terraform provider](#terraform-provider)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

---

## Why n8nforge

Setting up n8n by hand means clicking through a signup wizard, hand-copying an encryption key, and manually minting API keys through the UI before any CI pipeline can talk to your instance. n8nforge automates all of that:

- **Owner pre-provisioning** — creates the owner account via n8n 2.17.0+ environment variables, no signup wizard
- **Encryption key & JWT secret generation** — cryptographically random, injected automatically
- **API key bootstrap** — created post-start via the internal login API, no UI clicks
- **Idempotent** — safe to re-run; already-applied steps are skipped
- **Multi-provider** — Docker Compose, Helm/Kubernetes, AWS Terraform, GCP Terraform
- **Terraform provider** — `n8nforge_instance`, `n8nforge_api_key`, `n8nforge_owner`
- **Secret-store native** — AWS Secrets Manager, GCP Secret Manager, file, or stdout output

## How it works

```
n8nforge CLI / Terraform / Helm
        │
        ▼
  @n8nforge/core (bootstrap engine)
        │
   ┌────┴────┐
   ▼         ▼
pre-boot   post-boot
(env vars) (API keys via /rest/login)
   │         │
   └────┬────┘
        ▼
   n8n container + PostgreSQL
```

1. **Pre-boot** — resolves secrets, renders `N8N_INSTANCE_OWNER_*` / `N8N_ENCRYPTION_KEY` / `N8N_USER_MANAGEMENT_JWT_SECRET` into an env file that n8n reads on startup.
2. **Deploy** — your chosen provider (Docker Compose, Helm, or Terraform) starts n8n with that env file.
3. **Post-boot** — once n8n is healthy, n8nforge logs in as the owner and creates the API keys defined in your manifest.

See [docs/architecture.md](docs/architecture.md) for the full breakdown of each phase.

## Quick start (Docker, under 5 minutes)

### Prerequisites

- Node.js 20+ and pnpm 9+
- Docker & Docker Compose
- Port 5678 available

### 1. Clone and build

```bash
git clone https://github.com/n8nforge/n8nforge.git
cd n8nforge
pnpm install && pnpm build
```

### 2. Scaffold a project

```bash
node packages/cli/dist/cli.js init
```

This creates `n8nforge.yaml` (your manifest) and `.env.example`.

### 3. Configure secrets

```bash
cp examples/docker-local/.env.example examples/docker-local/.env
# Edit examples/docker-local/.env and set real passwords
```

### 4. Preview, then bootstrap

```bash
node packages/cli/dist/cli.js plan -f examples/docker-local/n8nforge.yaml   # dry-run, secrets masked
chmod +x examples/docker-local/bootstrap.sh
./examples/docker-local/bootstrap.sh
```

### 5. Log in

Open http://localhost:5678 and sign in with:

| Field | Value |
|---|---|
| Email | `admin@example.com` |
| Password | the value of `N8N_OWNER_PASSWORD` in your `.env` |

Generated API keys are written to `.n8nforge/api-keys/`.

## CLI reference

```bash
n8nforge init                          # Scaffold n8nforge.yaml
n8nforge plan -f n8nforge.yaml         # Dry-run (secrets masked)
n8nforge bootstrap -f n8nforge.yaml    # Full bootstrap (pre-boot + post-boot)
n8nforge bootstrap --phase pre-boot    # Render env vars only
n8nforge bootstrap --phase post-boot   # Create API keys only
n8nforge status -f n8nforge.yaml       # Instance status
n8nforge rotate-key --type encryption  # Rotate encryption key (advanced)
n8nforge doctor                        # Validate config & ports
```

Useful flags:

- `--json` — machine-readable output for CI/Terraform (secrets always redacted)
- `--state-dir <dir>` — override where `.n8nforge/` state is stored (default `.n8nforge`)

Set `N8NFORGE_INSTANCE_URL` when running post-boot from inside Docker/Kubernetes, so n8nforge talks to the instance over the internal network (e.g. `http://n8n:5678`) instead of localhost.

## Manifest reference (`n8nforge.yaml`)

```yaml
apiVersion: n8nforge/v1

instance:
  name: prod
  n8nVersion: "2.17.0"
  host: n8n.example.com
  protocol: https

owner:
  email: admin@example.com
  firstName: Admin
  lastName: User
  password:
    source: env:N8N_OWNER_PASSWORD   # or "generate" / "value:..." / "file:..."

secrets:
  encryptionKey:
    source: generate
  jwtSecret:
    source: generate

database:
  engine: postgres
  host: postgres
  password:
    source: env:POSTGRES_PASSWORD

apiKeys:
  - label: ci-deploy
    scopes: [workflow:read, workflow:update]
    output:
      destination: file
      path: .n8nforge/api-keys/ci-deploy.txt

provider:
  type: docker
```

Every secret field takes a `source`:

| Source | Behavior |
|---|---|
| `generate` | Cryptographically random value, generated once and persisted |
| `env:NAME` | Read from environment variable `NAME` |
| `value:literal` | Inline literal value (not recommended for real secrets) |
| `file:/path` | Read from a file on disk |
| `secret:name` | Resolved by the cloud adapter (AWS/GCP secret managers) |

## Deployment targets

| Target | Path |
|---|---|
| Docker Compose | `packages/adapters/docker/` |
| Kubernetes Helm | `packages/adapters/kubernetes/helm/n8nforge/` |
| AWS ECS | `packages/adapters/aws/terraform/modules/ecs/` |
| AWS EKS | `packages/adapters/aws/terraform/modules/eks/` |
| GCP Cloud Run | `packages/adapters/gcp/terraform/modules/cloudrun/` |
| GCP GKE | `packages/adapters/gcp/terraform/modules/gke/` |

Runnable examples for each target live under [`examples/`](examples/).

## Terraform provider

```hcl
terraform {
  required_providers {
    n8nforge = { source = "n8nforge/n8nforge" }
  }
}

resource "n8nforge_instance" "prod" {
  manifest_path = "${path.module}/n8nforge.yaml"
  phase         = "all"
}

data "n8nforge_version" "current" {}
# min_n8n_version = "2.17.0"
```

Build the provider locally:

```bash
cd terraform-provider-n8nforge
go build -o bin/terraform-provider-n8nforge
```

## Security notes

- Secrets are never logged and are never written to Terraform state.
- Owner passwords are bcrypt-hashed before injection — n8n only ever receives the hash via `N8N_INSTANCE_OWNER_PASSWORD_HASH`.
- Generated secrets are persisted to `.n8nforge/secrets.json` (mode `0600`) — back it up and restrict access; anyone who reads it can decrypt your n8n credentials.
- Pin `n8nVersion` to `2.17.0` or newer — owner env bootstrap requires it (`n8nforge doctor` checks this for you).
- Don't set `owner.password.source: generate` together with a manually supplied `owner.passwordHash` — there is no way to recover a matching plaintext password from a hash, so post-boot login would fail. n8nforge's manifest validation rejects this combination up front.

## Troubleshooting

| Issue | Fix |
|---|---|
| Port 5678 in use | `n8nforge doctor --port 5678`, or stop the conflicting process |
| Login fails post-boot | Confirm the owner password in your manifest/env matches what n8n booted with; check n8n container logs |
| API key creation returns 403 | Ensure the owner account has the global owner role (required for `apiKey:create`) |
| Health check times out | Increase `--timeout`; verify the database is reachable from the n8n container |
| `rotate-key` doesn't seem to apply | Re-run `n8nforge bootstrap --phase pre-boot` after rotating — it regenerates `generated.env` with the new key. Then restart n8n after backing up the database |

See [docs/troubleshooting.md](docs/troubleshooting.md) for more.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Project layout:

```
packages/
  core/       # bootstrap engine — manifest, secrets, env, plan, bootstrap, doctor
  cli/        # n8nforge CLI
  sidecar/    # container sidecar entrypoint for Kubernetes bootstrap jobs
  adapters/   # docker, kubernetes (helm), aws, gcp
terraform-provider-n8nforge/  # Go Terraform provider
examples/     # runnable examples per deployment target
docs/         # architecture and troubleshooting docs
```

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Community

- Issues and feature requests: open a GitHub issue
- Need a hand designing or maintaining n8n workflows? [Hire an n8n automation expert](https://www.ritiktechs.com/hire-n8n-automation-expert)
