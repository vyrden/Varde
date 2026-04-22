import type {
  DiscordCreateChannelPayload,
  GuildId,
  OnboardingActionContext,
  UserId,
} from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  createCategoryAction,
  createChannelAction,
  createRoleAction,
  PERMISSION_PRESET_BITS,
  patchModuleConfigAction,
} from '../../src/onboarding/actions.js';

// ─── Helpers communs pour tester apply() ──────────────────────────

interface FakeCtxArgs {
  readonly map: Readonly<Record<string, string>>;
  readonly guildId?: string;
  readonly onCreateChannel?: (payload: DiscordCreateChannelPayload) => void;
}

const makeCtx = (args: FakeCtxArgs): OnboardingActionContext => ({
  guildId: (args.guildId ?? '999') as GuildId,
  actorId: '42' as UserId,
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  discord: {
    createRole: async (_p) => ({ id: 'fake-role' }),
    deleteRole: async () => undefined,
    createCategory: async (_p) => ({ id: 'fake-cat' }),
    deleteCategory: async () => undefined,
    createChannel: async (p) => {
      args.onCreateChannel?.(p);
      return { id: 'fake-channel' };
    },
    deleteChannel: async () => undefined,
  },
  configPatch: async () => undefined,
  resolveLocalId: (localId) => args.map[localId] ?? null,
});

/**
 * Tests snapshot sur les presets de permissions (R1 : aucune bitfield
 * libre exposée, chaque preset est figé et auditable). Une évolution
 * des bits d'un preset doit casser ces tests volontairement, servant
 * de checkpoint de revue.
 */
describe('PERMISSION_PRESET_BITS', () => {
  it('moderator-full expose les bits attendus (ViewChannel, SendMessages, ManageMessages, ManageChannels, ManageRoles, ModerateMembers, BanMembers, KickMembers, ReadMessageHistory)', () => {
    const expected =
      (1n << 10n) |
      (1n << 11n) |
      (1n << 13n) |
      (1n << 4n) |
      (1n << 28n) |
      (1n << 40n) |
      (1n << 2n) |
      (1n << 1n) |
      (1n << 16n);
    expect(PERMISSION_PRESET_BITS['moderator-full']).toBe(expected);
  });

  it('moderator-minimal = ViewChannel + SendMessages + ManageMessages + ModerateMembers + ReadMessageHistory', () => {
    const expected = (1n << 10n) | (1n << 11n) | (1n << 13n) | (1n << 40n) | (1n << 16n);
    expect(PERMISSION_PRESET_BITS['moderator-minimal']).toBe(expected);
  });

  it('member-default = ViewChannel + SendMessages + ReadMessageHistory + Connect + Speak', () => {
    const expected = (1n << 10n) | (1n << 11n) | (1n << 16n) | (1n << 20n) | (1n << 21n);
    expect(PERMISSION_PRESET_BITS['member-default']).toBe(expected);
  });

  it('member-restricted = ViewChannel + ReadMessageHistory seuls (pas d écriture, pas de voix)', () => {
    const expected = (1n << 10n) | (1n << 16n);
    expect(PERMISSION_PRESET_BITS['member-restricted']).toBe(expected);
  });

  it('aucun preset n inclut Administrator ou ManageGuild (garde-fou)', () => {
    const administratorBit = 1n << 3n;
    const manageGuildBit = 1n << 5n;
    for (const [name, bits] of Object.entries(PERMISSION_PRESET_BITS)) {
      expect(
        (bits & administratorBit) === 0n,
        `preset ${name} ne doit pas avoir Administrator`,
      ).toBe(true);
      expect((bits & manageGuildBit) === 0n, `preset ${name} ne doit pas avoir ManageGuild`).toBe(
        true,
      );
    }
  });
});

describe('Action definitions — contrat R8', () => {
  it('createRole : type, schema, apply, undo, canUndo présents', () => {
    expect(createRoleAction.type).toBe('core.createRole');
    expect(typeof createRoleAction.apply).toBe('function');
    expect(typeof createRoleAction.undo).toBe('function');
    expect(createRoleAction.canUndo).toBe(true);
    expect(createRoleAction.schema).toBeDefined();
  });

  it('createCategory : canUndo=true, schema valide un payload minimum', () => {
    expect(createCategoryAction.canUndo).toBe(true);
    expect(createCategoryAction.schema.parse({ name: 'Général' })).toEqual({
      name: 'Général',
      position: 0,
    });
  });

  it('createChannel : schema accepte text / voice / forum et rejette le reste', () => {
    expect(createChannelAction.schema.parse({ name: 'général' })).toEqual({
      name: 'général',
      type: 'text',
      slowmodeSeconds: 0,
      readableRoleLocalIds: [],
      writableRoleLocalIds: [],
    });
    expect(() => createChannelAction.schema.parse({ name: 'x', type: 'stage' as never })).toThrow();
  });

  it('createChannel : schema accepte parentLocalId + listes de refs', () => {
    const parsed = createChannelAction.schema.parse({
      name: 'help',
      parentLocalId: 'cat-support',
      readableRoleLocalIds: ['role-member'],
      writableRoleLocalIds: ['role-mod'],
    });
    expect(parsed.parentLocalId).toBe('cat-support');
    expect(parsed.readableRoleLocalIds).toEqual(['role-member']);
    expect(parsed.writableRoleLocalIds).toEqual(['role-mod']);
  });

  it('patchModuleConfig : canUndo=false (config snapshot pas implémenté V1)', () => {
    expect(patchModuleConfigAction.canUndo).toBe(false);
    expect(typeof patchModuleConfigAction.undo).toBe('function');
  });
});

// ─── createChannel.apply : résolution refs + overwrites ───────────

const BIT_VIEW = 1n << 10n;
const BIT_SEND = 1n << 11n;
const BIT_CONNECT = 1n << 20n;
const BIT_SPEAK = 1n << 21n;

describe('createChannel.apply — résolution refs (PR 3.12a)', () => {
  it('résout parentLocalId via ctx.resolveLocalId', async () => {
    const onCreate = vi.fn();
    const ctx = makeCtx({
      map: { 'cat-general': 'snowflake-cat-42' },
      onCreateChannel: onCreate,
    });

    await createChannelAction.apply(ctx, {
      name: 'général',
      type: 'text',
      parentLocalId: 'cat-general',
      slowmodeSeconds: 0,
      readableRoleLocalIds: [],
      writableRoleLocalIds: [],
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[0]?.parentId).toBe('snowflake-cat-42');
  });

  it('omet parentId quand parentLocalId non résolu (tolérance)', async () => {
    const onCreate = vi.fn();
    const ctx = makeCtx({ map: {}, onCreateChannel: onCreate });

    await createChannelAction.apply(ctx, {
      name: 'orphan',
      type: 'text',
      parentLocalId: 'cat-disparu',
      slowmodeSeconds: 0,
      readableRoleLocalIds: [],
      writableRoleLocalIds: [],
    });

    expect(onCreate.mock.calls[0]?.[0]?.parentId).toBeUndefined();
  });

  it('priorise parentId fourni explicitement sur parentLocalId', async () => {
    const onCreate = vi.fn();
    const ctx = makeCtx({
      map: { 'cat-x': 'via-map' },
      onCreateChannel: onCreate,
    });

    await createChannelAction.apply(ctx, {
      name: 'x',
      type: 'text',
      parentId: 'direct-id',
      parentLocalId: 'cat-x',
      slowmodeSeconds: 0,
      readableRoleLocalIds: [],
      writableRoleLocalIds: [],
    });

    expect(onCreate.mock.calls[0]?.[0]?.parentId).toBe('direct-id');
  });

  it('construit un overwrite @everyone deny=VIEW + rôle allow=VIEW pour readableBy', async () => {
    const onCreate = vi.fn();
    const ctx = makeCtx({
      guildId: '111',
      map: { 'role-member': 'role-snowflake-1' },
      onCreateChannel: onCreate,
    });

    await createChannelAction.apply(ctx, {
      name: 'priv',
      type: 'text',
      slowmodeSeconds: 0,
      readableRoleLocalIds: ['role-member'],
      writableRoleLocalIds: [],
    });

    const ows = onCreate.mock.calls[0]?.[0]?.permissionOverwrites as
      | readonly { roleId: string; allow?: bigint; deny?: bigint }[]
      | undefined;
    expect(ows).toBeDefined();
    const everyone = ows?.find((o) => o.roleId === '111');
    expect(everyone?.deny).toBe(BIT_VIEW);
    const role = ows?.find((o) => o.roleId === 'role-snowflake-1');
    expect(role?.allow).toBe(BIT_VIEW);
  });

  it('writableBy implique read — le rôle obtient VIEW + SEND', async () => {
    const onCreate = vi.fn();
    const ctx = makeCtx({
      map: { 'role-mod': 'mod-1' },
      onCreateChannel: onCreate,
    });

    await createChannelAction.apply(ctx, {
      name: 'mod-only',
      type: 'text',
      slowmodeSeconds: 0,
      readableRoleLocalIds: [],
      writableRoleLocalIds: ['role-mod'],
    });

    const ows = onCreate.mock.calls[0]?.[0]?.permissionOverwrites as
      | readonly { roleId: string; allow?: bigint; deny?: bigint }[]
      | undefined;
    const mod = ows?.find((o) => o.roleId === 'mod-1');
    expect(mod?.allow).toBe(BIT_VIEW | BIT_SEND);
  });

  it('voice : read = VIEW+CONNECT, write = VIEW+CONNECT+SPEAK', async () => {
    const onCreate = vi.fn();
    const ctx = makeCtx({
      map: { speaker: 'sp-1' },
      onCreateChannel: onCreate,
    });

    await createChannelAction.apply(ctx, {
      name: 'stage',
      type: 'voice',
      slowmodeSeconds: 0,
      readableRoleLocalIds: [],
      writableRoleLocalIds: ['speaker'],
    });

    const ows = onCreate.mock.calls[0]?.[0]?.permissionOverwrites as
      | readonly { roleId: string; allow?: bigint; deny?: bigint }[]
      | undefined;
    const sp = ows?.find((o) => o.roleId === 'sp-1');
    expect(sp?.allow).toBe(BIT_VIEW | BIT_CONNECT | BIT_SPEAK);
  });

  it('pas d overwrites quand les deux listes sont vides', async () => {
    const onCreate = vi.fn();
    const ctx = makeCtx({ map: {}, onCreateChannel: onCreate });

    await createChannelAction.apply(ctx, {
      name: 'public',
      type: 'text',
      slowmodeSeconds: 0,
      readableRoleLocalIds: [],
      writableRoleLocalIds: [],
    });

    expect(onCreate.mock.calls[0]?.[0]?.permissionOverwrites).toBeUndefined();
  });
});
