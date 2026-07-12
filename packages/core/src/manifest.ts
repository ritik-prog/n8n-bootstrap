import { z } from 'zod';

export const SecretSourceSchema = z.union([
  z.literal('generate'),
  z.string().regex(/^env:.+$/),
  z.string().regex(/^file:.+$/),
  z.string().regex(/^secret:.+$/),
  z.string().regex(/^value:.+$/),
]);

export const OutputDestinationSchema = z.object({
  destination: z.enum(['stdout', 'file', 'aws-secrets-manager', 'gcp-secret-manager']),
  path: z.string().optional(),
  secretId: z.string().optional(),
  secretName: z.string().optional(),
});

const ManifestObjectSchema = z.object({
  apiVersion: z.literal('n8nforge/v1'),
  instance: z.object({
    name: z.string().min(1),
    n8nVersion: z.string().default('2.17.0'),
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(5678),
    protocol: z.enum(['http', 'https']).default('http'),
    timezone: z.string().default('UTC'),
    basePath: z.string().default(''),
  }),
  owner: z.object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    password: z.object({
      source: SecretSourceSchema,
    }),
    passwordHash: z
      .object({
        source: SecretSourceSchema,
      })
      .optional(),
  }),
  secrets: z.object({
    encryptionKey: z.object({
      source: SecretSourceSchema,
    }),
    jwtSecret: z.object({
      source: SecretSourceSchema,
    }),
  }),
  database: z.object({
    engine: z.enum(['postgres', 'sqlite']).default('postgres'),
    host: z.string().default('postgres'),
    port: z.number().int().positive().default(5432),
    database: z.string().default('n8n'),
    user: z.string().default('n8n'),
    schema: z.string().default('public'),
    password: z.object({
      source: SecretSourceSchema,
    }),
  }),
  apiKeys: z
    .array(
      z.object({
        label: z.string().min(1),
        scopes: z.array(z.string()).default([]),
        expiresInDays: z.number().int().positive().optional(),
        output: OutputDestinationSchema.default({ destination: 'file' }),
      }),
    )
    .default([]),
  provider: z.object({
    type: z.enum([
      'docker',
      'kubernetes',
      'aws-ecs',
      'aws-eks',
      'gcp-cloudrun',
      'gcp-gke',
    ]),
    config: z.record(z.unknown()).optional(),
  }),
});

export const ManifestSchema = ManifestObjectSchema.refine(
  (manifest) =>
    !(manifest.owner.passwordHash && manifest.owner.password.source === 'generate'),
  {
    message:
      'owner.password.source cannot be "generate" when owner.passwordHash is set — a freshly ' +
      'generated password will not match the provided hash, so post-boot login would fail. ' +
      'Supply the matching plaintext via owner.password.source (env:/value:/file:) instead.',
    path: ['owner', 'password', 'source'],
  },
);

export type Manifest = z.infer<typeof ManifestObjectSchema>;
export type SecretSource = z.infer<typeof SecretSourceSchema>;
export type OutputDestination = z.infer<typeof OutputDestinationSchema>;

export const DEFAULT_MANIFEST: Manifest = {
  apiVersion: 'n8nforge/v1',
  instance: {
    name: 'local',
    n8nVersion: '2.17.0',
    host: 'localhost',
    port: 5678,
    protocol: 'http',
    timezone: 'UTC',
    basePath: '',
  },
  owner: {
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    password: { source: 'generate' },
  },
  secrets: {
    encryptionKey: { source: 'generate' },
    jwtSecret: { source: 'generate' },
  },
  database: {
    engine: 'postgres',
    host: 'postgres',
    port: 5432,
    database: 'n8n',
    user: 'n8n',
    schema: 'public',
    password: { source: 'env:POSTGRES_PASSWORD' },
  },
  apiKeys: [
    {
      label: 'ci-deploy',
      scopes: ['workflow:read', 'workflow:update', 'workflow:activate'],
      expiresInDays: 365,
      output: { destination: 'file', path: '.n8nforge/api-keys/ci-deploy.txt' },
    },
  ],
  provider: { type: 'docker' },
};
