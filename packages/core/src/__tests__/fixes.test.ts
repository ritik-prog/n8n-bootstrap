import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPreBoot } from '../bootstrap.js';
import { loadManifest, saveManifest } from '../loader.js';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getStatePaths } from '../state.js';
import { DEFAULT_MANIFEST } from '../manifest.js';

describe('idempotency', () => {
  const testDir = join(tmpdir(), `n8nforge-idem-${Date.now()}`);
  const manifestPath = join(testDir, 'n8nforge.yaml');
  const stateDir = join(testDir, '.n8nforge');

  beforeEach(() => {
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
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('skips pre-boot when state is current', async () => {
    const manifest = loadManifest(manifestPath);
    const first = await runPreBoot(manifest, { stateDir });
    const envFirst = readFileSync(first.envFile, 'utf8');

    const second = await runPreBoot(manifest, { stateDir });
    expect(second.skipped).toBe(true);
    const envSecond = readFileSync(second.envFile, 'utf8');
    expect(envSecond).toBe(envFirst);
  });

  it('loads secrets from secrets.json on second resolve', async () => {
    const manifest = loadManifest(manifestPath);
    await runPreBoot(manifest, { stateDir });
    const paths = getStatePaths(stateDir);
    const secrets = JSON.parse(readFileSync(paths.secretsFile, 'utf8'));
    expect(secrets.encryptionKey).toBeTruthy();
    expect(secrets.ownerPasswordHash).toBeTruthy();
  });
});

describe('postboot response parsing', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('unwraps data envelope for createApiKey', async () => {
    const { createApiKey } = await import('../postboot.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: 'key-1', rawApiKey: 'n8n_api_testkey123', apiKey: 'n8n_api_••••' },
      }),
    });

    const result = await createApiKey(
      { cookie: 'session=abc' },
      'http://localhost:5678',
      { label: 'test', scopes: ['workflow:read'] },
    );
    expect(result.rawApiKey).toBe('n8n_api_testkey123');
  });

  it('unwraps data.items for listApiKeys', async () => {
    const { listApiKeys } = await import('../postboot.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { items: [{ id: '1', label: 'ci-deploy' }], count: 1 },
      }),
    });

    const keys = await listApiKeys({ cookie: 'session=abc' }, 'http://localhost:5678');
    expect(keys).toHaveLength(1);
    expect(keys[0]?.label).toBe('ci-deploy');
  });
});

describe('getBootstrapInstanceUrl', () => {
  it('prefers N8NFORGE_INSTANCE_URL env override', async () => {
    const { getBootstrapInstanceUrl } = await import('../env.js');
    const url = getBootstrapInstanceUrl(DEFAULT_MANIFEST, {
      N8NFORGE_INSTANCE_URL: 'http://n8n:5678',
    });
    expect(url).toBe('http://n8n:5678');
  });
});
