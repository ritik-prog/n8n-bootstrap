import { loadManifest, runBootstrap, redactBootstrapResult } from '@n8nforge/core';

async function main(): Promise<void> {
  const manifestPath = process.env.N8NFORGE_MANIFEST ?? '/config/n8nforge.yaml';
  const stateDir = process.env.N8NFORGE_STATE_DIR ?? '/state';
  const phase = process.env.N8NFORGE_PHASE ?? 'pre-boot';
  const timeoutMs = parseInt(process.env.N8NFORGE_TIMEOUT_MS ?? '120000', 10);

  if (!['all', 'pre-boot', 'post-boot'].includes(phase)) {
    throw new Error(`Invalid N8NFORGE_PHASE "${phase}"`);
  }

  console.log(`[n8nforge-sidecar] Loading manifest: ${manifestPath}`);
  console.log(`[n8nforge-sidecar] Phase: ${phase}`);

  const manifest = loadManifest(manifestPath);
  const result = await runBootstrap(manifest, {
    stateDir,
    phase: phase as 'pre-boot' | 'post-boot' | 'all',
    timeoutMs,
    apiKeyLabel: process.env.N8NFORGE_API_KEY_LABEL,
  });

  const safe = redactBootstrapResult(result);
  console.log('[n8nforge-sidecar] Bootstrap complete:', JSON.stringify(safe, null, 2));
}

main().catch((err) => {
  console.error('[n8nforge-sidecar] Fatal error:', err);
  process.exit(1);
});
