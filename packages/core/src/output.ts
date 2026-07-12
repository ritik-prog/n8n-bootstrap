import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { OutputDestination } from './manifest.js';

export async function writeOutput(
  destination: OutputDestination,
  value: string | undefined,
  label: string,
): Promise<void> {
  if (!value) {
    return;
  }

  switch (destination.destination) {
    case 'stdout':
      process.stdout.write(`[n8nforge] API key "${label}": ${value}\n`);
      break;

    case 'file': {
      const path = destination.path ?? `.n8nforge/api-keys/${label}.txt`;
      const dir = dirname(path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      writeFileSync(path, value, { mode: 0o600 });
      break;
    }

    case 'aws-secrets-manager':
      await writeAwsSecret(destination.secretId ?? label, value);
      break;

    case 'gcp-secret-manager':
      await writeGcpSecret(destination.secretName ?? label, value);
      break;

    default:
      throw new Error(`Unknown output destination: ${destination.destination}`);
  }
}

async function writeAwsSecret(secretId: string, value: string): Promise<void> {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';

  try {
    // Dynamic import — optional dependency installed in cloud adapter environments
    const awsModule = '@aws-sdk/client-secrets-manager';
    const { SecretsManagerClient, PutSecretValueCommand, CreateSecretCommand } = await import(
      awsModule
    );
    const client = new SecretsManagerClient({ region });
    try {
      await client.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: value }));
    } catch {
      await client.send(
        new CreateSecretCommand({ Name: secretId, SecretString: value }),
      );
    }
  } catch {
    throw new Error(
      `AWS Secrets Manager write for "${secretId}" requires @aws-sdk/client-secrets-manager and AWS credentials`,
    );
  }
}

async function writeGcpSecret(secretName: string, value: string): Promise<void> {
  try {
    const gcpModule = '@google-cloud/secret-manager';
    const { SecretManagerServiceClient } = await import(gcpModule);
    const client = new SecretManagerServiceClient();
    const projectId = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      throw new Error('GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT must be set');
    }
    const parent = `projects/${projectId}`;
    const name = `${parent}/secrets/${secretName}`;

    try {
      await client.createSecret({
        parent,
        secretId: secretName,
        secret: { replication: { automatic: {} } },
      });
    } catch {
      // secret may already exist
    }

    await client.addSecretVersion({
      parent: name,
      payload: { data: Buffer.from(value, 'utf8') },
    });
  } catch {
    throw new Error(
      `GCP Secret Manager write for "${secretName}" requires @google-cloud/secret-manager and GCP credentials`,
    );
  }
}
