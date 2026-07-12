import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import type { Manifest } from './manifest.js';
import {
  resolveAllSecrets,
  buildN8nEnv,
  renderEnvFile,
  getInstanceUrl,
  getBootstrapInstanceUrl,
} from './env.js';
import {
  getStatePaths,
  saveState,
  loadState,
  computeManifestHash,
  isStateCurrent,
  type BootstrapState,
} from './state.js';
import {
  waitForHealth,
  login,
  createApiKey,
  listApiKeys,
  type ApiKeyResult,
} from './postboot.js';
import { writeOutput } from './output.js';

const SECURE_FILE_MODE = 0o600;

export interface PreBootResult {
  envFile: string;
  secretsFile: string;
  instanceUrl: string;
  generatedPassword?: boolean;
  skipped?: boolean;
}

export interface PostBootResult {
  apiKeys: ApiKeyResult[];
  instanceUrl: string;
}

export interface BootstrapOptions {
  stateDir?: string;
  phase?: 'all' | 'pre-boot' | 'post-boot';
  timeoutMs?: number;
  forceDbSeed?: boolean;
  apiKeyLabel?: string;
}

function saveBootstrapState(
  paths: ReturnType<typeof getStatePaths>,
  partial: Partial<BootstrapState> & Pick<BootstrapState, 'manifestHash' | 'phase'>,
): void {
  const existing = loadState(paths);
  const state: BootstrapState = {
    version: 1,
    manifestHash: partial.manifestHash,
    phase: partial.phase,
    instanceUrl: partial.instanceUrl ?? existing?.instanceUrl,
    apiKeyLabels: partial.apiKeyLabels ?? existing?.apiKeyLabels ?? [],
    updatedAt: new Date().toISOString(),
  };
  saveState(paths, state);
}

export async function runPreBoot(
  manifest: Manifest,
  options: BootstrapOptions = {},
): Promise<PreBootResult> {
  const stateDir = options.stateDir ?? '.n8nforge';
  const paths = getStatePaths(stateDir);
  const instanceUrl = getInstanceUrl(manifest);
  const state = loadState(paths);

  if (isStateCurrent(state, manifest) && existsSync(paths.envFile) && existsSync(paths.secretsFile)) {
    return {
      envFile: paths.envFile,
      secretsFile: paths.secretsFile,
      instanceUrl,
      skipped: true,
    };
  }

  const secrets = await resolveAllSecrets(manifest, { stateDir });
  const env = buildN8nEnv(manifest, secrets);

  if (!existsSync(paths.stateDir)) {
    mkdirSync(paths.stateDir, { recursive: true, mode: 0o700 });
  }

  writeFileSync(paths.envFile, renderEnvFile(env), { mode: SECURE_FILE_MODE });

  const secretsPayload = {
    ownerPassword:
      manifest.owner.password.source === 'generate' ? secrets.ownerPassword : undefined,
    ownerPasswordHash: secrets.ownerPasswordHash,
    encryptionKey: secrets.encryptionKey,
    jwtSecret: secrets.jwtSecret,
    databasePassword: secrets.databasePassword,
  };
  writeFileSync(paths.secretsFile, JSON.stringify(secretsPayload, null, 2), {
    mode: SECURE_FILE_MODE,
  });

  saveBootstrapState(paths, {
    manifestHash: computeManifestHash(manifest),
    phase: 'pre-boot',
    instanceUrl,
    apiKeyLabels: state?.apiKeyLabels ?? [],
  });

  return {
    envFile: paths.envFile,
    secretsFile: paths.secretsFile,
    instanceUrl,
    generatedPassword: manifest.owner.password.source === 'generate',
  };
}

export async function runPostBoot(
  manifest: Manifest,
  options: BootstrapOptions = {},
): Promise<PostBootResult> {
  const stateDir = options.stateDir ?? '.n8nforge';
  const paths = getStatePaths(stateDir);
  const secrets = await resolveAllSecrets(manifest, { stateDir });
  const instanceUrl = getBootstrapInstanceUrl(manifest);
  const timeoutMs = options.timeoutMs ?? 120_000;
  const manifestHash = computeManifestHash(manifest);

  await waitForHealth(instanceUrl, timeoutMs);

  const session = await login(instanceUrl, manifest.owner.email, secrets.ownerPassword);

  const serverKeys = await listApiKeys(session, instanceUrl);
  const serverLabels = new Set(serverKeys.map((k) => k.label));
  const existingLabels = new Set([
    ...(loadState(paths)?.apiKeyLabels ?? []),
    ...serverLabels,
  ]);

  const apiKeys: ApiKeyResult[] = [];
  const keysToProcess = options.apiKeyLabel
    ? manifest.apiKeys.filter((k) => k.label === options.apiKeyLabel)
    : manifest.apiKeys;

  if (options.apiKeyLabel && keysToProcess.length === 0) {
    throw new Error(`API key label "${options.apiKeyLabel}" not found in manifest`);
  }

  for (const keyConfig of keysToProcess) {
    if (existingLabels.has(keyConfig.label) && serverLabels.has(keyConfig.label)) {
      apiKeys.push({ label: keyConfig.label, skipped: true });
      continue;
    }

    const expiresAt = keyConfig.expiresInDays
      ? Math.floor(Date.now() / 1000) + keyConfig.expiresInDays * 86400
      : undefined;

    const created = await createApiKey(session, instanceUrl, {
      label: keyConfig.label,
      scopes: keyConfig.scopes,
      expiresAt,
    });

    await writeOutput(keyConfig.output, created.rawApiKey, keyConfig.label);
    apiKeys.push(created);
    existingLabels.add(keyConfig.label);
    serverLabels.add(keyConfig.label);

    saveBootstrapState(paths, {
      manifestHash,
      phase: 'post-boot',
      instanceUrl,
      apiKeyLabels: [...existingLabels],
    });
  }

  saveBootstrapState(paths, {
    manifestHash,
    phase: 'complete',
    instanceUrl,
    apiKeyLabels: [...existingLabels],
  });

  return { apiKeys, instanceUrl };
}

export async function runBootstrap(
  manifest: Manifest,
  options: BootstrapOptions = {},
): Promise<{ preBoot?: PreBootResult; postBoot?: PostBootResult }> {
  const phase = options.phase ?? 'all';
  if (!['all', 'pre-boot', 'post-boot'].includes(phase)) {
    throw new Error(`Invalid phase "${phase}". Use: all, pre-boot, post-boot`);
  }

  const result: { preBoot?: PreBootResult; postBoot?: PostBootResult } = {};

  if (phase === 'all' || phase === 'pre-boot') {
    result.preBoot = await runPreBoot(manifest, options);
  }

  if (phase === 'all' || phase === 'post-boot') {
    result.postBoot = await runPostBoot(manifest, options);
  }

  return result;
}
