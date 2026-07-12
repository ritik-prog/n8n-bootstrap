import { readFileSync, existsSync } from 'node:fs';
import type { Manifest } from './manifest.js';
import {
  resolveSecret,
  resolvePasswordSecret,
  resolveJwtSecret,
  hashPassword,
} from './secrets.js';
import { getStatePaths, type StatePaths } from './state.js';

export interface ResolvedSecrets {
  ownerPassword: string;
  ownerPasswordHash: string;
  encryptionKey: string;
  jwtSecret: string;
  databasePassword: string;
}

export interface PersistedSecrets {
  ownerPassword?: string;
  ownerPasswordHash?: string;
  encryptionKey: string;
  jwtSecret: string;
  databasePassword: string;
}

export interface ResolveSecretsOptions {
  stateDir?: string;
  env?: Record<string, string | undefined>;
}

export function loadPersistedSecrets(paths: StatePaths): PersistedSecrets | null {
  if (!existsSync(paths.secretsFile)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(paths.secretsFile, 'utf8')) as PersistedSecrets;
  } catch {
    return null;
  }
}

function loadPasswordHashFromEnvFile(paths: StatePaths): string | undefined {
  if (!existsSync(paths.envFile)) {
    return undefined;
  }
  const content = readFileSync(paths.envFile, 'utf8');
  const match = content.match(/^N8N_INSTANCE_OWNER_PASSWORD_HASH=(.+)$/m);
  if (!match?.[1]) {
    return undefined;
  }
  return match[1].replace(/^"|"$/g, '').replace(/\\"/g, '"');
}

export async function resolveAllSecrets(
  manifest: Manifest,
  options: ResolveSecretsOptions = {},
): Promise<ResolvedSecrets> {
  const env = options.env ?? process.env;
  const paths = options.stateDir ? getStatePaths(options.stateDir) : null;

  if (paths) {
    const persisted = loadPersistedSecrets(paths);
    if (persisted) {
      const ownerPassword =
        persisted.ownerPassword ??
        (await resolvePasswordSecret(manifest.owner.password.source, { env, generated: {} }));
      const ownerPasswordHash =
        persisted.ownerPasswordHash ??
        (manifest.owner.passwordHash
          ? await resolveSecret(manifest.owner.passwordHash.source, { env, generated: {} })
          : loadPasswordHashFromEnvFile(paths)) ??
        (await hashPassword(ownerPassword));

      return {
        ownerPassword,
        ownerPasswordHash,
        encryptionKey: persisted.encryptionKey,
        jwtSecret: persisted.jwtSecret,
        databasePassword: persisted.databasePassword,
      };
    }
  }

  const generated: Record<string, string> = {};
  const ctx = { env, generated };

  if (manifest.owner.passwordHash) {
    const ownerPasswordHash = await resolveSecret(manifest.owner.passwordHash.source, ctx);
    const ownerPassword = await resolvePasswordSecret(manifest.owner.password.source, ctx);
    return {
      ownerPassword,
      ownerPasswordHash,
      encryptionKey: await resolveSecret(manifest.secrets.encryptionKey.source, ctx, 'encryptionKey'),
      jwtSecret: await resolveJwtSecret(manifest.secrets.jwtSecret.source, ctx),
      databasePassword: await resolveSecret(manifest.database.password.source, ctx, 'databasePassword'),
    };
  }

  const ownerPassword = await resolvePasswordSecret(manifest.owner.password.source, ctx);
  const ownerPasswordHash = await hashPassword(ownerPassword);

  return {
    ownerPassword,
    ownerPasswordHash,
    encryptionKey: await resolveSecret(manifest.secrets.encryptionKey.source, ctx, 'encryptionKey'),
    jwtSecret: await resolveJwtSecret(manifest.secrets.jwtSecret.source, ctx),
    databasePassword: await resolveSecret(manifest.database.password.source, ctx, 'databasePassword'),
  };
}

export function buildN8nEnv(
  manifest: Manifest,
  secrets: ResolvedSecrets,
): Record<string, string> {
  const env: Record<string, string> = {
    GENERIC_TIMEZONE: manifest.instance.timezone,
    TZ: manifest.instance.timezone,
    N8N_HOST: manifest.instance.host,
    N8N_PORT: String(manifest.instance.port),
    N8N_PROTOCOL: manifest.instance.protocol,
    N8N_ENCRYPTION_KEY: secrets.encryptionKey,
    N8N_USER_MANAGEMENT_JWT_SECRET: secrets.jwtSecret,
    N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true',
    N8N_RUNNERS_ENABLED: 'true',
    N8N_DIAGNOSTICS_ENABLED: 'false',
    N8N_PERSONALIZATION_ENABLED: 'false',
    N8N_INSTANCE_OWNER_MANAGED_BY_ENV: 'true',
    N8N_INSTANCE_OWNER_EMAIL: manifest.owner.email,
    N8N_INSTANCE_OWNER_FIRST_NAME: manifest.owner.firstName,
    N8N_INSTANCE_OWNER_LAST_NAME: manifest.owner.lastName,
    N8N_INSTANCE_OWNER_PASSWORD_HASH: secrets.ownerPasswordHash,
  };

  if (manifest.instance.basePath) {
    env.N8N_PATH = manifest.instance.basePath;
  }

  const webhookBase = `${manifest.instance.protocol}://${manifest.instance.host}${
    manifest.instance.port === 80 || manifest.instance.port === 443
      ? ''
      : `:${manifest.instance.port}`
  }${manifest.instance.basePath}`;
  env.WEBHOOK_URL = `${webhookBase}/`;

  if (manifest.database.engine === 'postgres') {
    env.DB_TYPE = 'postgresdb';
    env.DB_POSTGRESDB_HOST = manifest.database.host;
    env.DB_POSTGRESDB_PORT = String(manifest.database.port);
    env.DB_POSTGRESDB_DATABASE = manifest.database.database;
    env.DB_POSTGRESDB_USER = manifest.database.user;
    env.DB_POSTGRESDB_SCHEMA = manifest.database.schema;
    env.DB_POSTGRESDB_PASSWORD = secrets.databasePassword;
  }

  return env;
}

export function renderEnvFile(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${escapeEnvValue(value)}`)
    .join('\n')
    .concat('\n');
}

function escapeEnvValue(value: string): string {
  if (/[\s"'#\\$`]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  return value;
}

export function getInstanceUrl(manifest: Manifest): string {
  const defaultPort = manifest.instance.protocol === 'https' ? 443 : 80;
  const portSuffix =
    manifest.instance.port === defaultPort ? '' : `:${manifest.instance.port}`;
  return `${manifest.instance.protocol}://${manifest.instance.host}${portSuffix}${manifest.instance.basePath}`;
}

/** Bootstrap/post-boot URL: env override for in-cluster or container networking. */
export function getBootstrapInstanceUrl(
  manifest: Manifest,
  env: Record<string, string | undefined> = process.env,
): string {
  const override =
    env.N8NFORGE_INSTANCE_URL ?? env.N8NFORGE_N8N_URL ?? env.N8NFORGE_INSTANCE_URL_OVERRIDE;
  if (override) {
    return override.endsWith('/') ? override.slice(0, -1) : override;
  }
  return getInstanceUrl(manifest);
}
