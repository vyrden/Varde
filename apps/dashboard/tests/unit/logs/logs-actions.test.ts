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
import {
  createLogsChannel,
  replayBrokenRoute,
  saveLogsConfig,
  testLogsRoute,
} from '../../../lib/logs-actions';

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

describe('testLogsRoute', () => {
  it('renvoie { ok: true } quand API repond 200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await testLogsRoute('guild-1', '123456789012345678');
    expect(result).toEqual({ ok: true });
  });

  it('appelle POST /guilds/:guildId/modules/logs/test-route avec le bon channelId', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await testLogsRoute('guild-42', '111222333444555666');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/guilds/guild-42/modules/logs/test-route');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ channelId: '111222333444555666' });
  });

  it('renvoie { ok: false, reason } quand API repond 502 avec reason', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ reason: 'channel-not-found' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await testLogsRoute('guild-1', '123456789012345678');
    expect(result).toEqual({ ok: false, reason: 'channel-not-found' });
  });

  it('renvoie { ok: false, reason: unknown } quand fetch leve une exception reseau', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const result = await testLogsRoute('guild-1', '123456789012345678');
    expect(result).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('createLogsChannel', () => {
  it('renvoie { ok: true, channelId, channelName } quand API repond 200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ channelId: '111222333444555666', channelName: 'logs' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await createLogsChannel('guild-1');
    expect(result).toEqual({ ok: true, channelId: '111222333444555666', channelName: 'logs' });
  });

  it('appelle POST /guilds/:guildId/discord/channels avec le bon body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ channelId: '111', channelName: 'logs' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await createLogsChannel('guild-42');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/guilds/guild-42/discord/channels');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { name: string; type: string };
    expect(body.name).toBe('logs');
    expect(body.type).toBe('text');
  });

  it('renvoie { ok: false, reason: discord-unavailable } quand API repond 503', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ reason: 'discord_bridge_unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await createLogsChannel('guild-1');
    expect(result).toEqual({ ok: false, reason: 'discord-unavailable' });
  });

  it('renvoie { ok: false, reason: permission-denied } quand API repond 403', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ reason: 'permission-denied' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await createLogsChannel('guild-1');
    expect(result).toEqual({ ok: false, reason: 'permission-denied' });
  });

  it('renvoie { ok: false, reason: unknown } quand fetch leve une exception reseau', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const result = await createLogsChannel('guild-1');
    expect(result).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('replayBrokenRoute', () => {
  it('POST /guilds/:guildId/modules/logs/broken-routes/:routeId/replay avec le bon cookie', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ replayed: 3, failed: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await replayBrokenRoute('guild-42', 'route-1');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/guilds/guild-42/modules/logs/broken-routes/route-1/replay');
    expect(init.method).toBe('POST');
  });

  it('renvoie { ok: true, replayed, failed: 0 } sur succès total', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ replayed: 7, failed: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await replayBrokenRoute('g1', 'r1');
    expect(result).toEqual({ ok: true, replayed: 7, failed: 0 });
  });

  it('propage le partial avec firstError.reason', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ replayed: 1, failed: 2, firstError: { reason: 'channel-not-found' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await replayBrokenRoute('g1', 'r1');
    expect(result).toEqual({
      ok: true,
      replayed: 1,
      failed: 2,
      firstError: { reason: 'channel-not-found' },
    });
  });

  it('renvoie { ok: false, reason: service-unavailable } quand API répond 503', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ reason: 'service-indisponible' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await replayBrokenRoute('g1', 'r1');
    expect(result).toEqual({ ok: false, reason: 'service-unavailable' });
  });

  it('renvoie { ok: false, reason: permission-denied } quand API répond 403', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const result = await replayBrokenRoute('g1', 'r1');
    expect(result).toEqual({ ok: false, reason: 'permission-denied' });
  });

  it('renvoie { ok: false, reason: unknown } sur exception réseau', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const result = await replayBrokenRoute('g1', 'r1');
    expect(result).toEqual({ ok: false, reason: 'unknown' });
  });
});
