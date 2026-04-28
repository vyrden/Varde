import { describe, expect, it, vi } from 'vitest';

import { runSystemCheck, type SetupFetch } from '../../lib/setup-client';

const okBody = (overrides: Record<string, unknown> = {}): Response =>
  new Response(
    JSON.stringify({
      checks: [
        { name: 'database', ok: true },
        { name: 'master_key', ok: true },
        { name: 'discord_connectivity', ok: true },
      ],
      detectedBaseUrl: 'http://localhost:3000',
      ...overrides,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('runSystemCheck', () => {
  it('appelle POST <apiUrl>/setup/system-check sans cache', async () => {
    const fetchImpl: SetupFetch = vi.fn(async () => okBody());
    await runSystemCheck('http://api.test', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/setup/system-check',
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    );
  });

  it('retourne le payload typé sur 200', async () => {
    const fetchImpl: SetupFetch = vi.fn(async () => okBody());
    const result = await runSystemCheck('http://api', fetchImpl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checks).toHaveLength(3);
      expect(result.detectedBaseUrl).toBe('http://localhost:3000');
    }
  });

  it('retourne ok=false sur 5xx', async () => {
    const fetchImpl: SetupFetch = vi.fn(async () => new Response('ko', { status: 503 }));
    const result = await runSystemCheck('http://api', fetchImpl);
    expect(result.ok).toBe(false);
  });

  it('retourne ok=false si fetch lève', async () => {
    const fetchImpl: SetupFetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await runSystemCheck('http://api', fetchImpl);
    expect(result.ok).toBe(false);
  });
});
