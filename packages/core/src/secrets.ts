import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import type { SecretSource } from './manifest.js';

const BCRYPT_ROUNDS = 10;

export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}

export function generateJwtSecret(): string {
  return randomBytes(48).toString('base64url');
}

export function generatePassword(length = 24): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const bytes = randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i]! % chars.length];
  }
  return password;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function hashState(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export interface SecretResolverContext {
  env?: Record<string, string | undefined>;
  generated?: Record<string, string>;
}

export async function resolveSecret(
  source: SecretSource,
  ctx: SecretResolverContext = {},
  cacheKey?: string,
): Promise<string> {
  const env = ctx.env ?? process.env;

  if (source === 'generate') {
    const key = cacheKey ?? 'gen:default';
    if (ctx.generated?.[key]) {
      return ctx.generated[key]!;
    }
    const value = generateEncryptionKey();
    if (ctx.generated) {
      ctx.generated[key] = value;
    }
    return value;
  }

  if (source.startsWith('env:')) {
    const name = source.slice(4);
    const value = env[name];
    if (!value) {
      throw new Error(`Environment variable ${name} is not set`);
    }
    return value;
  }

  if (source.startsWith('file:')) {
    const path = source.slice(5);
    return readFileSync(path, 'utf8').trim();
  }

  if (source.startsWith('value:')) {
    return source.slice(6);
  }

  if (source.startsWith('secret:')) {
    // Placeholder for cloud secret managers — resolved at adapter layer
    const name = source.slice(7);
    const value = env[`N8NFORGE_SECRET_${name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`];
    if (!value) {
      throw new Error(`Secret reference ${source} not resolved. Set via adapter or N8NFORGE_SECRET_* env.`);
    }
    return value;
  }

  throw new Error(`Unknown secret source: ${source}`);
}

export async function resolvePasswordSecret(
  source: SecretSource,
  ctx: SecretResolverContext = {},
): Promise<string> {
  if (source === 'generate') {
    const key = 'gen:password';
    if (ctx.generated?.[key]) {
      return ctx.generated[key]!;
    }
    const value = generatePassword();
    if (ctx.generated) {
      ctx.generated[key] = value;
    }
    return value;
  }
  return resolveSecret(source, ctx);
}

export async function resolveJwtSecret(
  source: SecretSource,
  ctx: SecretResolverContext = {},
): Promise<string> {
  if (source === 'generate') {
    const key = 'gen:jwt';
    if (ctx.generated?.[key]) {
      return ctx.generated[key]!;
    }
    const value = generateJwtSecret();
    if (ctx.generated) {
      ctx.generated[key] = value;
    }
    return value;
  }
  return resolveSecret(source, ctx);
}

export function maskSecret(value: string, visible = 4): string {
  if (value.length <= visible * 2) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, visible)}${'*'.repeat(value.length - visible * 2)}${value.slice(-visible)}`;
}
