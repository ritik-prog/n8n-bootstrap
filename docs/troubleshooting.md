# Troubleshooting

## Pre-boot Issues

### `Environment variable POSTGRES_PASSWORD is not set`

Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`.

### `n8n version X is below 2.17.0`

Update `instance.n8nVersion` in `n8nforge.yaml` to `2.17.0` or later.

## Post-boot Issues

### Health check timeout

```bash
# Check n8n logs
docker logs <n8n-container>

# Increase timeout
n8nforge bootstrap --phase post-boot --timeout 300000
```

### Login failed (401)

- Verify `N8N_OWNER_PASSWORD` matches what was used during pre-boot
- If password was auto-generated, check `.n8nforge/secrets.json`
- Restart n8n after changing owner env vars

### API key creation failed

- Ensure n8n is fully started (not just healthz)
- Check n8n version supports `/rest/api-keys`
- Verify scopes are valid for owner role

## Docker Issues

### Port 5678 in use

```bash
lsof -ti :5678 | xargs kill -9
n8nforge doctor --port 5678
```

### Permission denied on `.n8nforge/`

```bash
chmod 700 .n8nforge
chmod 600 .n8nforge/secrets.json
```

## Terraform Provider

### `n8nforge: command not found`

Set `cli_path` in provider config:

```hcl
provider "n8nforge" {
  cli_path = "/path/to/n8nforge"
}
```

Or add `packages/cli/dist/cli.js` to PATH as `n8nforge`.
