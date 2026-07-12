import { describe, it, expect } from 'vitest';
import { hashPassword, generateEncryptionKey, maskSecret } from '../secrets.js';
import { buildN8nEnv, getInstanceUrl, renderEnvFile } from '../env.js';
import { DEFAULT_MANIFEST } from '../manifest.js';

describe('secrets', () => {
  it('generates 64-char hex encryption key', () => {
    const key = generateEncryptionKey();
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });

  it('hashes password with bcrypt', async () => {
    const hash = await hashPassword('TestPassword1!');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('masks secrets', () => {
    expect(maskSecret('abcdefghijklmnop')).toBe('abcd********mnop');
  });
});

describe('env', () => {
  it('builds n8n env with owner vars', async () => {
    const secrets = {
      ownerPassword: 'TestPassword1!',
      ownerPasswordHash: await hashPassword('TestPassword1!'),
      encryptionKey: generateEncryptionKey(),
      jwtSecret: 'jwt-secret-value',
      databasePassword: 'dbpass',
    };

    const env = buildN8nEnv(DEFAULT_MANIFEST, secrets);
    expect(env.N8N_INSTANCE_OWNER_MANAGED_BY_ENV).toBe('true');
    expect(env.N8N_INSTANCE_OWNER_EMAIL).toBe('admin@example.com');
    expect(env.N8N_ENCRYPTION_KEY).toBe(secrets.encryptionKey);
    expect(env.DB_TYPE).toBe('postgresdb');
  });

  it('renders env file', () => {
    const content = renderEnvFile({ FOO: 'bar', BAZ: 'has spaces' });
    expect(content).toContain('FOO=bar');
    expect(content).toContain('BAZ="has spaces"');
  });

  it('builds instance url', () => {
    expect(getInstanceUrl(DEFAULT_MANIFEST)).toBe('http://localhost:5678');
  });
});
