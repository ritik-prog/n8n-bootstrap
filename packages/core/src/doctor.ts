import type { Manifest } from './manifest.js';
import { getBootstrapInstanceUrl } from './env.js';
import { loadState, getStatePaths } from './state.js';
import { waitForHealth } from './postboot.js';

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  healthy: boolean;
}

export async function runDoctor(
  manifest: Manifest,
  options: { port?: number; stateDir?: string; skipHealth?: boolean } = {},
): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const port = options.port ?? manifest.instance.port;
  const stateDir = options.stateDir ?? '.n8nforge';
  const paths = getStatePaths(stateDir);
  const state = loadState(paths);

  // n8n version check
  const versionParts = manifest.instance.n8nVersion.split('.').map(Number);
  const minVersion = [2, 17, 0];
  const versionOk =
    versionParts[0]! > minVersion[0]! ||
    (versionParts[0] === minVersion[0] &&
      (versionParts[1]! > minVersion[1]! ||
        (versionParts[1] === minVersion[1] && (versionParts[2] ?? 0) >= minVersion[2]!)));

  checks.push({
    name: 'n8n_version',
    status: versionOk ? 'pass' : 'fail',
    message: versionOk
      ? `n8n ${manifest.instance.n8nVersion} supports owner env bootstrap`
      : `n8n ${manifest.instance.n8nVersion} < 2.17.0 — upgrade required for owner env bootstrap`,
  });

  // Port availability (local only)
  if (manifest.provider.type === 'docker') {
    const portFree = await isPortFree(port);
    checks.push({
      name: 'port_available',
      status: portFree ? 'pass' : 'warn',
      message: portFree
        ? `Port ${port} appears available`
        : `Port ${port} may be in use — stop conflicting process before deploy`,
    });
  }

  // State file
  checks.push({
    name: 'bootstrap_state',
    status: state ? 'pass' : 'warn',
    message: state
      ? `Bootstrap state found (phase: ${state.phase})`
      : 'No bootstrap state — run n8nforge bootstrap first',
  });

  // Env file
  const { existsSync } = await import('node:fs');
  const envExists = existsSync(paths.envFile);
  checks.push({
    name: 'env_file',
    status: envExists ? 'pass' : 'warn',
    message: envExists
      ? `Generated env at ${paths.envFile}`
      : `Missing ${paths.envFile} — run bootstrap --phase pre-boot`,
  });

  // Health check
  if (!options.skipHealth) {
    const instanceUrl = getBootstrapInstanceUrl(manifest);
    try {
      await waitForHealth(instanceUrl, 5000);
      checks.push({
        name: 'n8n_health',
        status: 'pass',
        message: `n8n healthy at ${instanceUrl}`,
      });
    } catch {
      checks.push({
        name: 'n8n_health',
        status: 'warn',
        message: `n8n not reachable at ${instanceUrl} (may not be deployed yet)`,
      });
    }
  }

  const healthy = !checks.some((c) => c.status === 'fail');
  return { checks, healthy };
}

async function isPortFree(port: number): Promise<boolean> {
  try {
    const net = await import('node:net');
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });
  } catch {
    return true;
  }
}

export interface StatusResult {
  phase?: string;
  instanceUrl: string;
  manifestHash?: string;
  apiKeyLabels: string[];
  healthy: boolean;
}

export async function getStatus(
  manifest: Manifest,
  stateDir = '.n8nforge',
): Promise<StatusResult> {
  const paths = getStatePaths(stateDir);
  const state = loadState(paths);
  const instanceUrl = getBootstrapInstanceUrl(manifest);
  let healthy = false;

  try {
    await waitForHealth(instanceUrl, 5000);
    healthy = true;
  } catch {
    healthy = false;
  }

  return {
    phase: state?.phase,
    instanceUrl,
    manifestHash: state?.manifestHash,
    apiKeyLabels: state?.apiKeyLabels ?? [],
    healthy,
  };
}
