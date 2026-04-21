import { DependencyFailureError } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  hasManageGuild,
} from '../../src/discord-client.js';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const guildFixture = (id: string, permissions = '0x20'): DiscordGuild => ({
  id,
  name: `Guild ${id}`,
  icon: null,
  permissions,
});

describe('createDiscordClient', () => {
  it('appelle /users/@me/guilds et renvoie la liste', async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockImplementation(async () => jsonResponse([guildFixture('111')]));
    const client = createDiscordClient({ fetch });
    const guilds = await client.fetchUserGuilds('token');
    expect(guilds).toEqual([guildFixture('111')]);
    expect(fetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/users/@me/guilds',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer token' }),
      }),
    );
  });

  it('sert le cache tant que TTL n est pas expiré', async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockImplementation(async () => jsonResponse([guildFixture('111')]));
    let now = 1_000;
    const client = createDiscordClient({ fetch, now: () => now, cacheTtlMs: 500 });
    await client.fetchUserGuilds('token');
    await client.fetchUserGuilds('token');
    expect(fetch).toHaveBeenCalledTimes(1);

    now += 300;
    await client.fetchUserGuilds('token');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('ré-interroge après expiration TTL', async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockImplementation(async () => jsonResponse([guildFixture('111')]));
    let now = 1_000;
    const client = createDiscordClient({ fetch, now: () => now, cacheTtlMs: 500 });
    await client.fetchUserGuilds('token');
    now += 600;
    await client.fetchUserGuilds('token');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('cloisonne le cache par access_token', async () => {
    const fetch = vi.fn<FetchLike>().mockImplementation(async () => jsonResponse([]));
    const client = createDiscordClient({ fetch });
    await client.fetchUserGuilds('token-a');
    await client.fetchUserGuilds('token-b');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("invalidate(token) vide juste l'entrée ciblée", async () => {
    const fetch = vi.fn<FetchLike>().mockImplementation(async () => jsonResponse([]));
    const client = createDiscordClient({ fetch });
    await client.fetchUserGuilds('token-a');
    await client.fetchUserGuilds('token-b');
    client.invalidate('token-a');
    await client.fetchUserGuilds('token-a');
    await client.fetchUserGuilds('token-b');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('invalidate() vide tout le cache', async () => {
    const fetch = vi.fn<FetchLike>().mockImplementation(async () => jsonResponse([]));
    const client = createDiscordClient({ fetch });
    await client.fetchUserGuilds('token-a');
    await client.fetchUserGuilds('token-b');
    client.invalidate();
    await client.fetchUserGuilds('token-a');
    await client.fetchUserGuilds('token-b');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('lève DependencyFailureError sur réponse non-OK', async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response('rate limited', { status: 429 }));
    const client = createDiscordClient({ fetch });
    await expect(client.fetchUserGuilds('token')).rejects.toBeInstanceOf(DependencyFailureError);
  });
});

describe('hasManageGuild', () => {
  it('reconnaît le bit 0x20', () => {
    expect(hasManageGuild('0x20')).toBe(true);
    expect(hasManageGuild('32')).toBe(true);
    expect(hasManageGuild('0x8')).toBe(false);
  });

  it('tolère une chaîne vide ou invalide', () => {
    expect(hasManageGuild('')).toBe(false);
    expect(hasManageGuild('garbage')).toBe(false);
  });

  it('détecte le bit dans une permission composée (admin = 0x8 | manage = 0x20)', () => {
    expect(hasManageGuild('40')).toBe(true);
    expect(hasManageGuild('0x28')).toBe(true);
  });
});
