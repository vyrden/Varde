import { beforeEach, describe, expect, it, vi } from 'vitest';

/* next/headers n'existe pas dans l'environnement de test : on le mocke
   avant l'import du module testé. */
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (_name: string) => undefined,
    }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

/* fetch global mocké avant chaque test. */
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import type { LogsConfigClient } from '../../../lib/logs-actions';
import { saveLogsConfig } from '../../../lib/logs-actions';

const minimalConfig: LogsConfigClient = {
  version: 1,
  routes: [
    {
      id: 'r1',
      label: 'General',
      events: ['messageDelete'],
      channelId: 'c1',
      verbosity: 'compact',
    },
  ],
  exclusions: {
    userIds: [],
    roleIds: [],
    channelIds: [],
    excludeBots: true,
  },
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe('saveLogsConfig', () => {
  it('renvoie { ok: true } quand API repond 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await saveLogsConfig('guild-1', minimalConfig);
    expect(result).toEqual({ ok: true });
  });

  it('appelle PUT /guilds/:guildId/modules/logs/config avec le bon body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await saveLogsConfig('guild-42', minimalConfig);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/guilds/guild-42/modules/logs/config');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual(minimalConfig);
  });

  it('renvoie { ok: false, issues } quand API repond 400 avec details', async () => {
    const errorBody = {
      message: 'Body refuse',
      details: [{ path: ['routes', '0', 'channelId'], message: 'Champ requis' }],
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(errorBody), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await saveLogsConfig('guild-1', minimalConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.message).toBe('Champ requis');
    }
  });

  it('renvoie { ok: false, issues } quand API repond 400 sans details', async () => {
    const errorBody = { message: 'Erreur de validation generique' };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(errorBody), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await saveLogsConfig('guild-1', minimalConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.message).toBe('Erreur de validation generique');
    }
  });

  it('renvoie { ok: false, issues } quand fetch leve une exception reseau', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const result = await saveLogsConfig('guild-1', minimalConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.message).toBe('Network error');
    }
  });
});
