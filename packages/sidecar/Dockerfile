FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/sidecar/package.json packages/sidecar/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install
COPY packages/core packages/core
COPY packages/sidecar packages/sidecar
RUN pnpm --filter @n8nforge/core build && pnpm --filter @n8nforge/sidecar build

FROM node:22-alpine
WORKDIR /app
RUN addgroup -g 1001 n8nforge && adduser -u 1001 -G n8nforge -D n8nforge
COPY --from=builder /app/packages/sidecar/dist ./dist
COPY --from=builder /app/packages/core/dist ../core/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core/node_modules ../core/node_modules
USER n8nforge
ENV N8NFORGE_MANIFEST=/config/n8nforge.yaml
ENV N8NFORGE_STATE_DIR=/state
ENTRYPOINT ["node", "dist/entrypoint.js"]
