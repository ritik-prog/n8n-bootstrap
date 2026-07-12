import type { Manifest } from './manifest.js';
import { resolveAllSecrets } from './env.js';
import { maskSecret } from './secrets.js';
import { getInstanceUrl } from './env.js';
import { computeManifestHash, loadState, getStatePaths, isStateCurrent } from './state.js';
import { existsSync } from 'node:fs';

export interface PlanAction {
  phase: 'pre-boot' | 'deploy' | 'post-boot';
  action: string;
  details?: Record<string, string>;
}

export interface PlanResult {
  manifestHash: string;
  instanceUrl: string;
  provider: string;
  n8nVersion: string;
  actions: PlanAction[];
  warnings: string[];
  currentPhase?: string;
}

export async function createPlan(
  manifest: Manifest,
  stateDir = '.n8nforge',
): Promise<PlanResult> {
  const paths = getStatePaths(stateDir);
  const state = loadState(paths);
  const manifestHash = computeManifestHash(manifest);
  const actions: PlanAction[] = [];
  const warnings: string[] = [];

  const preBootCurrent =
    isStateCurrent(state, manifest) &&
    existsSync(paths.envFile) &&
    existsSync(paths.secretsFile);

  let secrets: Awaited<ReturnType<typeof resolveAllSecrets>> | undefined;
  if (!preBootCurrent) {
    try {
      secrets = await resolveAllSecrets(manifest, { stateDir });
    } catch (err) {
      warnings.push(
        `Could not resolve all secrets for plan preview: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const versionParts = manifest.instance.n8nVersion.split('.').map(Number);
  const minVersion = [2, 17, 0];
  if (
    versionParts[0]! < minVersion[0]! ||
    (versionParts[0] === minVersion[0] && versionParts[1]! < minVersion[1]!) ||
    (versionParts[0] === minVersion[0] &&
      versionParts[1] === minVersion[1] &&
      (versionParts[2] ?? 0) < minVersion[2]!)
  ) {
    warnings.push(
      `n8n version ${manifest.instance.n8nVersion} is below 2.17.0 — owner env bootstrap may not work`,
    );
  }

  if (!preBootCurrent && secrets) {
    actions.push({
      phase: 'pre-boot',
      action: 'generate_secrets',
      details: {
        encryptionKey: maskSecret(secrets.encryptionKey),
        jwtSecret: maskSecret(secrets.jwtSecret),
        ownerEmail: manifest.owner.email,
      },
    });
    actions.push({
      phase: 'pre-boot',
      action: 'render_env_file',
      details: { path: `${stateDir}/generated.env` },
    });
  } else {
    actions.push({
      phase: 'pre-boot',
      action: 'skip',
      details: { reason: 'manifest unchanged, env already rendered' },
    });
  }

  actions.push({
    phase: 'deploy',
    action: `deploy_${manifest.provider.type}`,
    details: { target: manifest.provider.type },
  });

  for (const apiKey of manifest.apiKeys) {
    const exists = state?.apiKeyLabels.includes(apiKey.label);
    actions.push({
      phase: 'post-boot',
      action: exists ? 'skip_api_key' : 'create_api_key',
      details: {
        label: apiKey.label,
        scopes: apiKey.scopes.join(','),
        output: apiKey.output.destination,
      },
    });
  }

  return {
    manifestHash,
    instanceUrl: getInstanceUrl(manifest),
    provider: manifest.provider.type,
    n8nVersion: manifest.instance.n8nVersion,
    actions,
    warnings,
    currentPhase: state?.phase,
  };
}
