import { ChannelType, type Client, OverwriteType, PermissionsBitField } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { createOnboardingDiscordBridge } from '../../src/onboarding-bridge.js';

/**
 * Tests unitaires du bridge discord.js → onboarding (PR 3.12d).
 * On fournit un faux Client discord.js avec juste le strict minimum
 * que le bridge touche (`guilds.cache`, `guild.roles.*`,
 * `guild.channels.*`). Les tests valident la traduction des
 * payloads génériques (`DiscordCreate*Payload`) vers les options
 * spécifiques à discord.js v14 (ChannelType, OverwriteType,
 * PermissionsBitField).
 */

const GUILD_ID = '111';

interface FakeRole {
  readonly id: string;
  readonly delete: ReturnType<typeof vi.fn>;
}

interface FakeChannel {
  readonly id: string;
  readonly delete: ReturnType<typeof vi.fn>;
}

const buildFakeClient = (
  opts: {
    readonly rolesCache?: Record<string, FakeRole>;
    readonly channelsCache?: Record<string, FakeChannel>;
    readonly createRole?: ReturnType<typeof vi.fn>;
    readonly createChannel?: ReturnType<typeof vi.fn>;
    readonly fetchRole?: (id: string) => Promise<FakeRole | null>;
    readonly fetchChannel?: (id: string) => Promise<FakeChannel | null>;
    readonly missingGuild?: boolean;
  } = {},
): Client => {
  const rolesCache = new Map(Object.entries(opts.rolesCache ?? {}));
  const channelsCache = new Map(Object.entries(opts.channelsCache ?? {}));

  const createRole = opts.createRole ?? vi.fn(async () => ({ id: 'role-new' }));
  const createChannel =
    opts.createChannel ?? vi.fn(async (p: { name: string }) => ({ id: `chan-${p.name}` }));

  const guild = {
    id: GUILD_ID,
    roles: {
      cache: rolesCache,
      create: createRole,
      fetch: opts.fetchRole ?? (async () => null),
    },
    channels: {
      cache: channelsCache,
      create: createChannel,
      fetch: opts.fetchChannel ?? (async () => null),
    },
  };

  const guildsCache = new Map<string, typeof guild>();
  if (!opts.missingGuild) guildsCache.set(GUILD_ID, guild);

  return { guilds: { cache: guildsCache } } as unknown as Client;
};

describe('createOnboardingDiscordBridge', () => {
  it('createRole : forwarde name/color/hoist/mentionable/permissions à guild.roles.create', async () => {
    const createRole = vi.fn(async () => ({ id: 'role-created' }));
    const client = buildFakeClient({ createRole });
    const bridge = createOnboardingDiscordBridge(client);

    const bits = (1n << 10n) | (1n << 11n);
    const result = await bridge.createRole(GUILD_ID, {
      name: 'Mod',
      color: 0x3498db,
      hoist: true,
      mentionable: false,
      permissions: bits,
    });
    expect(result.id).toBe('role-created');
    expect(createRole).toHaveBeenCalledTimes(1);
    const passed = createRole.mock.calls[0]?.[0] as {
      name: string;
      colors: { primaryColor: number };
      hoist: boolean;
      mentionable: boolean;
      permissions: PermissionsBitField;
    };
    expect(passed.name).toBe('Mod');
    expect(passed.colors.primaryColor).toBe(0x3498db);
    expect(passed.hoist).toBe(true);
    expect(passed.mentionable).toBe(false);
    expect(passed.permissions).toBeInstanceOf(PermissionsBitField);
    expect(passed.permissions.bitfield).toBe(bits);
  });

  it('deleteRole : appelle role.delete quand présent en cache', async () => {
    const roleDelete = vi.fn(async () => undefined);
    const client = buildFakeClient({
      rolesCache: { 'role-1': { id: 'role-1', delete: roleDelete } },
    });
    const bridge = createOnboardingDiscordBridge(client);
    await bridge.deleteRole(GUILD_ID, 'role-1');
    expect(roleDelete).toHaveBeenCalledTimes(1);
  });

  it('deleteRole : idempotent quand le rôle est absent (cache + fetch → null)', async () => {
    const client = buildFakeClient({ fetchRole: async () => null });
    const bridge = createOnboardingDiscordBridge(client);
    await expect(bridge.deleteRole(GUILD_ID, 'role-gone')).resolves.toBeUndefined();
  });

  it('createCategory : utilise ChannelType.GuildCategory', async () => {
    const createChannel = vi.fn(async () => ({ id: 'cat-1' }));
    const client = buildFakeClient({ createChannel });
    const bridge = createOnboardingDiscordBridge(client);

    const result = await bridge.createCategory(GUILD_ID, { name: 'Général', position: 3 });
    expect(result.id).toBe('cat-1');
    const passed = createChannel.mock.calls[0]?.[0] as {
      type: number;
      name: string;
      position: number;
    };
    expect(passed.type).toBe(ChannelType.GuildCategory);
    expect(passed.name).toBe('Général');
    expect(passed.position).toBe(3);
  });

  it('createChannel text : traduit en GuildText + rateLimitPerUser', async () => {
    const createChannel = vi.fn(async () => ({ id: 'chan-1' }));
    const client = buildFakeClient({ createChannel });
    const bridge = createOnboardingDiscordBridge(client);

    await bridge.createChannel(GUILD_ID, {
      name: 'annonces',
      type: 'text',
      parentId: 'cat-1',
      topic: 'Annonces serveur',
      slowmodeSeconds: 30,
    });
    const passed = createChannel.mock.calls[0]?.[0] as {
      type: number;
      name: string;
      parent: string;
      topic: string;
      rateLimitPerUser: number;
    };
    expect(passed.type).toBe(ChannelType.GuildText);
    expect(passed.parent).toBe('cat-1');
    expect(passed.topic).toBe('Annonces serveur');
    expect(passed.rateLimitPerUser).toBe(30);
  });

  it('createChannel voice : traduit en GuildVoice et omet rateLimitPerUser', async () => {
    const createChannel = vi.fn(async () => ({ id: 'voice-1' }));
    const client = buildFakeClient({ createChannel });
    const bridge = createOnboardingDiscordBridge(client);

    await bridge.createChannel(GUILD_ID, {
      name: 'vocal',
      type: 'voice',
      slowmodeSeconds: 10,
    });
    const passed = createChannel.mock.calls[0]?.[0] as {
      type: number;
      rateLimitPerUser?: number;
    };
    expect(passed.type).toBe(ChannelType.GuildVoice);
    expect(passed.rateLimitPerUser).toBeUndefined();
  });

  it('createChannel avec permissionOverwrites : mappe roleId → id + OverwriteType.Role', async () => {
    const createChannel = vi.fn(async () => ({ id: 'chan-priv' }));
    const client = buildFakeClient({ createChannel });
    const bridge = createOnboardingDiscordBridge(client);

    const view = 1n << 10n;
    const send = 1n << 11n;
    await bridge.createChannel(GUILD_ID, {
      name: 'privé',
      type: 'text',
      slowmodeSeconds: 0,
      permissionOverwrites: [
        { roleId: GUILD_ID, deny: view },
        { roleId: 'role-mod', allow: view | send },
      ],
    });
    const passed = createChannel.mock.calls[0]?.[0] as {
      permissionOverwrites: {
        id: string;
        type: number;
        allow?: PermissionsBitField;
        deny?: PermissionsBitField;
      }[];
    };
    expect(passed.permissionOverwrites).toHaveLength(2);
    expect(passed.permissionOverwrites[0]?.id).toBe(GUILD_ID);
    expect(passed.permissionOverwrites[0]?.type).toBe(OverwriteType.Role);
    expect(passed.permissionOverwrites[0]?.deny?.bitfield).toBe(view);
    expect(passed.permissionOverwrites[1]?.id).toBe('role-mod');
    expect(passed.permissionOverwrites[1]?.allow?.bitfield).toBe(view | send);
  });

  it('deleteChannel : idempotent quand le salon est absent', async () => {
    const client = buildFakeClient({ fetchChannel: async () => null });
    const bridge = createOnboardingDiscordBridge(client);
    await expect(bridge.deleteChannel(GUILD_ID, 'chan-gone')).resolves.toBeUndefined();
  });

  it("lève une erreur explicite si la guild n'est pas dans le cache", async () => {
    const client = buildFakeClient({ missingGuild: true });
    const bridge = createOnboardingDiscordBridge(client);
    await expect(bridge.createRole(GUILD_ID, { name: 'Mod' })).rejects.toThrow(/introuvable/i);
  });
});
