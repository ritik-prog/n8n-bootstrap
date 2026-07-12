import type { PostBootResult, PreBootResult } from './bootstrap.js';
import type { ApiKeyResult } from './postboot.js';

export function redactApiKeyResult(key: ApiKeyResult): ApiKeyResult {
  return {
    ...key,
    rawApiKey: key.rawApiKey ? '[REDACTED]' : undefined,
  };
}

export function redactBootstrapResult(result: {
  preBoot?: PreBootResult;
  postBoot?: PostBootResult;
}): typeof result {
  const redacted = { ...result };
  if (redacted.postBoot) {
    redacted.postBoot = {
      ...redacted.postBoot,
      apiKeys: redacted.postBoot.apiKeys.map(redactApiKeyResult),
    };
  }
  return redacted;
}
