import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest } from './manifest.js';
import { hashState } from './secrets.js';

export type BootstrapPhase = 'pre-boot' | 'deploy' | 'post-boot' | 'complete';

export interface BootstrapState {
  version: 1;
  manifestHash: string;
  phase: BootstrapPhase;
  instanceUrl?: string;
  apiKeyLabels: string[];
  updatedAt: string;
}

export interface StatePaths {
  stateDir: string;
  stateFile: string;
  envFile: string;
  secretsFile: string;
}

export function getStatePaths(baseDir = '.n8nforge'): StatePaths {
  return {
    stateDir: baseDir,
    stateFile: join(baseDir, 'state.json'),
    envFile: join(baseDir, 'generated.env'),
    secretsFile: join(baseDir, 'secrets.json'),
  };
}

export function loadState(paths: StatePaths): BootstrapState | null {
  if (!existsSync(paths.stateFile)) {
    return null;
  }
  return JSON.parse(readFileSync(paths.stateFile, 'utf8')) as BootstrapState;
}

export function saveState(paths: StatePaths, state: BootstrapState): void {
  if (!existsSync(paths.stateDir)) {
    mkdirSync(paths.stateDir, { recursive: true });
  }
  writeFileSync(paths.stateFile, JSON.stringify(state, null, 2), 'utf8');
}

export function computeManifestHash(manifest: Manifest): string {
  return hashState({
    instance: manifest.instance,
    owner: { ...manifest.owner, password: { source: manifest.owner.password.source } },
    secrets: manifest.secrets,
    database: manifest.database,
    apiKeys: manifest.apiKeys.map((k) => ({
      label: k.label,
      scopes: k.scopes,
      expiresInDays: k.expiresInDays,
      output: k.output,
    })),
    provider: manifest.provider,
  });
}

export function isStateCurrent(state: BootstrapState | null, manifest: Manifest): boolean {
  if (!state) return false;
  return state.manifestHash === computeManifestHash(manifest);
}
