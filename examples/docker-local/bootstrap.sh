#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PORT="${N8N_PORT:-5678}"

echo "==> Checking port ${PORT}..."
if lsof -i ":${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT} is in use. Stopping processes..."
  lsof -ti ":${PORT}" | xargs kill -9 2>/dev/null || true
  sleep 2
fi

cd "$ROOT_DIR"
if [ ! -f examples/docker-local/.env ]; then
  cp examples/docker-local/.env.example examples/docker-local/.env
  echo "Created examples/docker-local/.env — edit passwords before production use"
fi

echo "==> Building n8nforge..."
corepack enable
pnpm install
pnpm build

echo "==> Running pre-boot bootstrap..."
cd examples/docker-local
node ../../packages/cli/dist/cli.js bootstrap --phase pre-boot -f n8nforge.yaml --state-dir "$ROOT_DIR/.n8nforge"

echo "==> Starting Docker Compose stack..."
docker compose -f ../../packages/adapters/docker/docker-compose.yml --env-file .env up -d postgres n8n

echo "==> Waiting for n8n health..."
for i in $(seq 1 60); do
  if curl -sf "http://localhost:${PORT}/healthz" >/dev/null 2>&1; then
    echo "n8n is healthy"
    break
  fi
  sleep 2
done

echo "==> Running post-boot bootstrap..."
node ../../packages/cli/dist/cli.js bootstrap --phase post-boot -f n8nforge.yaml --state-dir "$ROOT_DIR/.n8nforge"

echo "==> Status:"
node ../../packages/cli/dist/cli.js status -f n8nforge.yaml --state-dir "$ROOT_DIR/.n8nforge"

echo ""
echo "n8n is ready at http://localhost:${PORT}"
echo "Owner: admin@example.com (password from .env N8N_OWNER_PASSWORD)"
