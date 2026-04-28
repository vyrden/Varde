import { describe, expect, it, vi } from 'vitest';

import { decideRedirect, fetchSetupConfigured } from '../../lib/setup-status';

describe('decideRedirect', () => {
  it('non configurée + chemin non-setup → redirect-to-setup', () => {
    expect(decideRedirect({ configured: false, pathname: '/' })).toEqual({
      kind: 'redirect-to-setup',
    });
    expect(decideRedirect({ configured: false, pathname: '/guilds/123' })).toEqual({
      kind: 'redirect-to-setup',
    });
  });

  it('non configurée + chemin /setup/* → pass-through', () => {
    expect(decideRedirect({ configured: false, pathname: '/setup' })).toEqual({
      kind: 'pass-through',
    });
    expect(decideRedirect({ configured: false, pathname: '/setup/welcome' })).toEqual({
      kind: 'pass-through',
    });
    expect(decideRedirect({ configured: false, pathname: '/setup/system-check' })).toEqual({
      kind: 'pass-through',
    });
  });

  it('configurée + chemin /setup/* → redirect-to-home', () => {
    expect(decideRedirect({ configured: true, pathname: '/setup/welcome' })).toEqual({
      kind: 'redirect-to-home',
    });
  });

  it('configurée + chemin non-setup → pass-through', () => {
    expect(decideRedirect({ configured: true, pathname: '/' })).toEqual({
      kind: 'pass-through',
    });
    expect(decideRedirect({ configured: true, pathname: '/guilds/123' })).toEqual({
      kind: 'pass-through',
    });
  });

  it('ne se laisse pas piéger par un chemin qui contient /setup en sous-string', () => {
    // /setup-ish ne doit pas matcher comme une route /setup/*.
    expect(decideRedirect({ configured: false, pathname: '/setup-decoy' })).toEqual({
      kind: 'redirect-to-setup',
    });
    expect(decideRedirect({ configured: true, pathname: '/setup-decoy' })).toEqual({
      kind: 'pass-through',
    });
  });
});

describe('fetchSetupConfigured', () => {
  it('retourne true si l API répond 403 (setup terminée)', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 }));
    expect(await fetchSetupConfigured('http://api', fetchImpl)).toBe(true);
  });

  it('retourne false si l API répond 200 (setup en cours)', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ configured: false, currentStep: 1 }), {
          status: 200,
        }),
    );
    expect(await fetchSetupConfigured('http://api', fetchImpl)).toBe(false);
  });

  it('retourne false si fetch lève (API injoignable)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(await fetchSetupConfigured('http://api', fetchImpl)).toBe(false);
  });

  it('appelle GET <apiUrl>/setup/status sans cache', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 }));
    await fetchSetupConfigured('http://api.test', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/setup/status',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});
