import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadManifest, saveManifest } from '../loader.js';
import { createPlan } from '../plan.js';
import { DEFAULT_MANIFEST } from '../manifest.js';
import { runPreBoot } from '../bootstrap.js';

describe('integration: plan and pre-boot', () => {
  const testDir = join(tmpdir(), `n8nforge-test-${Date.now()}`);
  const manifestPath = join(testDir, 'n8nforge.yaml');
  const stateDir = join(testDir, '.n8nforge');

  it('creates plan from manifest', async () => {
    mkdirSync(testDir, { recursive: true });
    process.env.POSTGRES_PASSWORD = 'test-db-password';
    process.env.N8N_OWNER_PASSWORD = 'TestOwner1!';

    saveManifest(manifestPath, {
      ...DEFAULT_MANIFEST,
      owner: {
        ...DEFAULT_MANIFEST.owner,
        password: { source: 'env:N8N_OWNER_PASSWORD' },
      },
    });

    const manifest = loadManifest(manifestPath);
    const plan = await createPlan(manifest, stateDir);

    expect(plan.instanceUrl).toBe('http://localhost:5678');
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actions.some((a) => a.action === 'generate_secrets')).toBe(true);
  });

  it('generates env file on pre-boot', async () => {
    const manifest = loadManifest(manifestPath);
    const result = await runPreBoot(manifest, { stateDir });

    expect(existsSync(result.envFile)).toBe(true);
    const envContent = readFileSync(result.envFile, 'utf8');
    expect(envContent).toContain('N8N_INSTANCE_OWNER_MANAGED_BY_ENV=true');
    expect(envContent).toContain('N8N_ENCRYPTION_KEY=');
    expect(envContent).toContain('DB_TYPE=postgresdb');

    rmSync(testDir, { recursive: true, force: true });
  });
});
