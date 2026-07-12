# Architecture

## Overview

n8nforge eliminates the "ClickOps nightmare" of n8n self-hosting by automating:

1. **Owner account** — via `N8N_INSTANCE_OWNER_*` env vars (n8n ≥ 2.17.0)
2. **Encryption key** — `N8N_ENCRYPTION_KEY` generated and persisted
3. **API keys** — created post-boot via internal REST API

## Bootstrap Phases

### Phase 1: Plan

- Validate `n8nforge.yaml` against Zod schema
- Resolve secret references (`generate`, `env:`, `file:`, `secret:`)
- Compute manifest hash for idempotency
- Output masked plan

### Phase 2: Pre-boot

- Generate bcrypt password hash for owner
- Render `.n8nforge/generated.env`
- Store non-sensitive state in `.n8nforge/state.json`
- Never log plaintext secrets

### Phase 3: Deploy (provider-specific)

- Docker Compose: postgres → pre-boot job → n8n → post-boot job
- Kubernetes: Helm chart with Secret + Deployment + bootstrap Job
- AWS/GCP: Terraform modules provision infra + Secrets Manager

### Phase 4: Post-boot

1. `GET /healthz` with exponential backoff
2. `POST /rest/login` with owner credentials
3. `POST /rest/api-keys` for each configured key
4. Write raw keys to configured output (file, stdout, secret store)
5. Update state with key labels (never raw keys)

## Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    User Interfaces                       │
│  n8nforge CLI  │  Terraform Provider  │  Helm Chart     │
└────────┬───────────────┬────────────────────┬───────────┘
         │               │                    │
         ▼               ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│                   @n8nforge/core                         │
│  manifest │ secrets │ env │ plan │ bootstrap │ doctor  │
└────────┬────────────────────────────────────────────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼
 Docker    Helm      AWS TF     GCP TF
```

## Secret Flow

| Secret | Source | Injection |
|--------|--------|-----------|
| Owner password | generate / env | bcrypt → `N8N_INSTANCE_OWNER_PASSWORD_HASH` |
| Encryption key | generate / env | `N8N_ENCRYPTION_KEY` |
| JWT secret | generate / env | `N8N_USER_MANAGEMENT_JWT_SECRET` |
| DB password | env / secret store | `DB_POSTGRESDB_PASSWORD` |
| API keys | post-boot | output destination only |

## Idempotency

- Manifest hash stored in `.n8nforge/state.json`
- Pre-boot skipped if hash unchanged and env exists
- API keys skipped if label already in state
- Re-run `n8nforge bootstrap` safely

## Version Requirements

- **n8n ≥ 2.17.0** — owner env bootstrap
- **Node.js ≥ 20** — CLI runtime
- **PostgreSQL 16** — recommended for production

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Port 5678 in use | `n8nforge doctor --port 5678` or kill process |
| Login fails post-boot | Verify owner password matches env; check n8n logs |
| API key creation 403 | Ensure owner has `apiKey:create` scope (global owner role) |
| Health check timeout | Increase `--timeout`; check DB connectivity |
