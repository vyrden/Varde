import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createOAuthCredentialsClient, type OAuthCredentials } from '../../lib/oauth-credentials';

const API_URL = 'http://test.varde.local:4000';
const AUTH_SECRET = 'test-shared-secret';

const okResponse = (body: OAuthCredentials): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const notFoundResponse = (): Response =>
  new Response(JSON.stringify({ error: 'not_configured' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  });

const fakeNow = (): { advance(ms: number): void; current(): number } => {
  let value = 1_000_000;
  return {
    advance(ms) {
      value += ms;
    },
    current() {
      return value;
    },
  };
};

describe('createOAuthCredentialsClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('appelle l API avec Bearer + chemin /internal/oauth-credentials', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse({ clientId: 'app-1', clientSecret: 'secret-1' }));
    const client = createOAuthCredentialsClient({
      apiUrl: API_URL,
      authSecret: AUTH_SECRET,
      fetchImpl,
    });

    const creds = await client.get();

    expect(creds).toEqual({ clientId: 'app-1', clientSecret: 'secret-1' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(`${API_URL}/internal/oauth-credentials`);
    expect((init as RequestInit).headers).toMatchObject({
      authorization: `Bearer ${AUTH_SECRET}`,
    });
  });

  it('cache le résultat pendant le TTL', async () => {
    const clock = fakeNow();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse({ clientId: 'app-1', clientSecret: 'secret-1' }));
    const client = createOAuthCredentialsClient({
      apiUrl: API_URL,
      authSecret: AUTH_SECRET,
      fetchImpl,
      ttlMs: 60_000,
      now: clock.current,
    });

    await client.get();
    clock.advance(30_000);
    await client.get();
    clock.advance(29_999);
    await client.get();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refetch après expiration du TTL', async () => {
    const clock = fakeNow();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ clientId: 'app-1', clientSecret: 'secret-1' }))
      .mockResolvedValueOnce(okResponse({ clientId: 'app-2', clientSecret: 'secret-2' }));
    const client = createOAuthCredentialsClient({
      apiUrl: API_URL,
      authSecret: AUTH_SECRET,
      fetchImpl,
      ttlMs: 60_000,
      now: clock.current,
    });

    const first = await client.get();
    clock.advance(60_001);
    const second = await client.get();

    expect(first).toEqual({ clientId: 'app-1', clientSecret: 'secret-1' });
    expect(second).toEqual({ clientId: 'app-2', clientSecret: 'secret-2' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retourne null sur 404 (instance pas encore configurée) et cache le null', async () => {
    const clock = fakeNow();
    const fetchImpl = vi.fn().mockResolvedValue(notFoundResponse());
    const client = createOAuthCredentialsClient({
      apiUrl: API_URL,
      authSecret: AUTH_SECRET,
      fetchImpl,
      now: clock.current,
    });

    const first = await client.get();
    const second = await client.get();

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throw sur 401 (Bearer invalide — bug de config, pas un état métier)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 }),
      );
    const client = createOAuthCredentialsClient({
      apiUrl: API_URL,
      authSecret: AUTH_SECRET,
      fetchImpl,
    });

    await expect(client.get()).rejects.toThrow(/401/u);
  });

  it('throw sur erreur réseau', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = createOAuthCredentialsClient({
      apiUrl: API_URL,
      authSecret: AUTH_SECRET,
      fetchImpl,
    });

    await expect(client.get()).rejects.toThrow(/ECONNREFUSED/u);
  });

  it('invalidate() force un refetch', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ clientId: 'app-1', clientSecret: 'secret-1' }))
      .mockResolvedValueOnce(okResponse({ clientId: 'app-2', clientSecret: 'secret-2' }));
    const client = createOAuthCredentialsClient({
      apiUrl: API_URL,
      authSecret: AUTH_SECRET,
      fetchImpl,
    });

    const first = await client.get();
    client.invalidate();
    const second = await client.get();

    expect(first).toEqual({ clientId: 'app-1', clientSecret: 'secret-1' });
    expect(second).toEqual({ clientId: 'app-2', clientSecret: 'secret-2' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('inflight de-duplication : deux get() concurrents = 1 fetch', async () => {
    let resolveResp: (r: Response) => void = () => undefined;
    const respPromise = new Promise<Response>((r) => {
      resolveResp = r;
    });
    const fetchImpl = vi.fn().mockReturnValue(respPromise);
    const client = createOAuthCredentialsClient({
      apiUrl: API_URL,
      authSecret: AUTH_SECRET,
      fetchImpl,
    });

    const p1 = client.get();
    const p2 = client.get();
    resolveResp(okResponse({ clientId: 'app-1', clientSecret: 'secret-1' }));
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual(r2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
