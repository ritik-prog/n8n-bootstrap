declare module '@aws-sdk/client-secrets-manager' {
  export class SecretsManagerClient {
    constructor(config: { region: string });
    send(command: unknown): Promise<unknown>;
  }
  export class PutSecretValueCommand {
    constructor(input: { SecretId: string; SecretString: string });
  }
  export class CreateSecretCommand {
    constructor(input: { Name: string; SecretString: string });
  }
}

declare module '@google-cloud/secret-manager' {
  export class SecretManagerServiceClient {
    createSecret(input: unknown): Promise<unknown>;
    addSecretVersion(input: unknown): Promise<unknown>;
  }
}
