export interface LoginSession {
  cookie: string;
}

export interface ApiKeyResult {
  label: string;
  id?: string;
  rawApiKey?: string;
  skipped?: boolean;
}

export interface CreateApiKeyOptions {
  label: string;
  scopes: string[];
  expiresAt?: number;
}

const DEFAULT_RETRY_DELAY_MS = 2000;

function unwrapApiResponse<T>(json: unknown): T {
  if (json && typeof json === 'object' && json !== null && 'data' in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export async function waitForHealth(baseUrl: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    try {
      const response = await fetch(`${normalizeUrl(baseUrl)}/healthz`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    const delay = Math.min(DEFAULT_RETRY_DELAY_MS * Math.pow(1.5, attempt - 1), 10_000);
    await sleep(delay);
  }

  throw new Error(`n8n health check timed out after ${timeoutMs}ms at ${baseUrl}/healthz`);
}

export async function login(
  baseUrl: string,
  email: string,
  password: string,
): Promise<LoginSession> {
  const response = await fetch(`${normalizeUrl(baseUrl)}/rest/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ emailOrLdapLoginId: email, password }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Login failed (${response.status}): ${body}`);
  }

  const setCookie = response.headers.getSetCookie?.() ?? [];
  const cookieHeader =
    setCookie.length > 0
      ? setCookie.map((c) => c.split(';')[0]).join('; ')
      : response.headers.get('set-cookie') ?? '';

  if (!cookieHeader) {
    throw new Error('Login succeeded but no session cookie returned');
  }

  return { cookie: cookieHeader };
}

export async function createApiKey(
  session: LoginSession,
  baseUrl: string,
  options: CreateApiKeyOptions,
): Promise<ApiKeyResult> {
  const body: Record<string, unknown> = {
    label: options.label,
    scopes: options.scopes,
  };
  if (options.expiresAt) {
    body.expiresAt = options.expiresAt;
  }

  const response = await fetch(`${normalizeUrl(baseUrl)}/rest/api-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: session.cookie,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API key creation failed (${response.status}): ${text}`);
  }

  const data = unwrapApiResponse<{
    id?: string;
    rawApiKey?: string;
    apiKey?: string;
  }>(await response.json());

  const rawApiKey = data.rawApiKey ?? data.apiKey;
  if (!rawApiKey) {
    throw new Error(`API key "${options.label}" created but rawApiKey missing from response`);
  }

  return {
    label: options.label,
    id: data.id,
    rawApiKey,
  };
}

export async function listApiKeys(
  session: LoginSession,
  baseUrl: string,
): Promise<Array<{ id: string; label: string }>> {
  const response = await fetch(`${normalizeUrl(baseUrl)}/rest/api-keys`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Cookie: session.cookie,
    },
  });

  if (!response.ok) {
    return [];
  }

  const payload = unwrapApiResponse<
    | Array<{ id: string; label: string }>
    | { items?: Array<{ id: string; label: string }> }
  >(await response.json());

  if (Array.isArray(payload)) {
    return payload;
  }
  return payload.items ?? [];
}

function normalizeUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
