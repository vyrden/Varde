import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type AllowedHostsFetch,
  getAllowedHosts,
  isHostAllowed,
  resetAllowedHostsCache,
} from '../../lib/allowed-hosts';

const okResponse = (hosts: string[]): Response =>
  new Response(JSON.stringify({ hosts }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('isHostAllowed', () => {
  it('match exact case-insensitive', () => {
    expect(isHostAllowed('localhost:3000', ['LOCALHOST:3000'])).toBe(true);
    expect(isHostAllowed('Varde.example.com', ['varde.example.com'])).toBe(true);
  });

  it('refuse les hosts hors liste', () => {
    expect(isHostAllowed('evil.com', ['localhost:3000', 'varde.example.com'])).toBe(false);
  });

  it('refuse quand la liste est vide', () => {
    expect(isHostAllowed('localhost:3000', [])).toBe(false);
  });
});

describe('getAllowedHosts', () => {
  afterEach(() => {
    resetAllowedHostsCache();
  });

  it('fetch initial → hosts retournés depuis l API', async () => {
    const fetchImpl: AllowedHostsFetch = vi.fn(async () => okResponse(['localhost:3000']));
    const hosts = await getAllowedHosts('http://api', fetchImpl);
    expect(hosts).toEqual(['localhost:3000']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('cache 30 s : second appel ne retape pas l API', async () => {
    const fetchImpl: AllowedHostsFetch = vi.fn(async () => okResponse(['localhost:3000']));
    const t0 = 1_000_000;
    const now = vi.fn(() => t0);
    await getAllowedHosts('http://api', fetchImpl, now);
    now.mockReturnValue(t0 + 29_000);
    await getAllowedHosts('http://api', fetchImpl, now);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('après 30 s : nouveau fetch', async () => {
    const fetchImpl: AllowedHostsFetch = vi.fn(async () => okResponse(['localhost:3000']));
    const t0 = 1_000_000;
    const now = vi.fn(() => t0);
    await getAllowedHosts('http://api', fetchImpl, now);
    now.mockReturnValue(t0 + 31_000);
    await getAllowedHosts('http://api', fetchImpl, now);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fetch échoue + pas de cache → null (fail open)', async () => {
    const fetchImpl: AllowedHostsFetch = vi.fn(async () => {
      throw new Error('network');
    });
    const hosts = await getAllowedHosts('http://api', fetchImpl);
    expect(hosts).toBeNull();
  });

  it('fetch échoue + cache présent → retombe sur le cache', async () => {
    let calls = 0;
    const fetchImpl: AllowedHostsFetch = vi.fn(async () => {
      calls++;
      if (calls === 1) return okResponse(['cached.example.com']);
      throw new Error('network');
    });
    const t0 = 1_000_000;
    const now = vi.fn(() => t0);
    await getAllowedHosts('http://api', fetchImpl, now);
    now.mockReturnValue(t0 + 31_000);
    const hosts = await getAllowedHosts('http://api', fetchImpl, now);
    expect(hosts).toEqual(['cached.example.com']);
  });

  it('réponse non-200 → cache préservé / null si pas de cache', async () => {
    const fetchImpl: AllowedHostsFetch = vi.fn(async () => new Response('error', { status: 500 }));
    const hosts = await getAllowedHosts('http://api', fetchImpl);
    expect(hosts).toBeNull();
  });

  it('body sans tableau → null', async () => {
    const fetchImpl: AllowedHostsFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ hosts: 'not an array' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const hosts = await getAllowedHosts('http://api', fetchImpl);
    expect(hosts).toBeNull();
  });
});
