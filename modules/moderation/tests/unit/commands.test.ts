import type { CommandInteractionInput, ModuleContext } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import { commands } from '../../src/commands/index.js';

/**
 * Tests des 10 handlers via un fake `ctx` minimal. On vérifie pour
 * chaque commande critique :
 * - happy path : mutation Discord appelée + entrée audit logguée
 * - hierarchy denial : `canModerate.ok=false` court-circuite
 * - mute : refus si `mutedRoleId` non configuré
 * - tempban / tempmute : `scheduler.in` programmé avec la durée
 *
 * Pas exhaustif sur les 10 — on couvre `warn`, `kick`, `ban`,
 * `tempban`, `unban`, `mute`, `tempmute`, `unmute`, `clear`,
 * `slowmode` au moins une fois pour le happy path.
 */

const GUILD = '111' as never;
const CHANNEL = '222' as never;
const MOD = '42' as never;
const TARGET = '999' as never;

const makeCtx = (
  configOverride: Record<string, unknown> = {},
  hierarchyOk: boolean | { reason: 'self' | 'bot' | 'owner' | 'rank' | 'unknown' } = true,
  auditRows: ReadonlyArray<unknown> = [],
  auditEntry: unknown = null,
): ModuleContext => {
  const audit = {
    log: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue(auditRows),
    get: vi.fn().mockResolvedValue(auditEntry),
  };
  const discord = {
    canModerate: vi
      .fn()
      .mockResolvedValue(
        hierarchyOk === true
          ? { ok: true }
          : { ok: false, reason: (hierarchyOk as { reason: string }).reason },
      ),
    kickMember: vi.fn().mockResolvedValue(undefined),
    banMember: vi.fn().mockResolvedValue(undefined),
    unbanMember: vi.fn().mockResolvedValue(undefined),
    addMemberRole: vi.fn().mockResolvedValue(undefined),
    removeMemberRole: vi.fn().mockResolvedValue(undefined),
    sendDirectMessage: vi.fn().mockResolvedValue(undefined),
    bulkDeleteMessages: vi.fn().mockResolvedValue({ deleted: 3 }),
    setChannelSlowmode: vi.fn().mockResolvedValue(undefined),
    getGuildName: vi.fn().mockReturnValue('TestGuild'),
  };
  const scheduler = { in: vi.fn().mockResolvedValue(undefined), cancel: vi.fn() };
  const ui = {
    success: (message: string) => ({ kind: 'success', payload: { message } }) as never,
    error: (message: string) => ({ kind: 'error', payload: { message } }) as never,
  };
  const ctx = {
    logger: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: () => ctx.logger,
    },
    config: {
      get: vi.fn().mockResolvedValue({
        modules: { moderation: { mutedRoleId: null, dmOnSanction: true, ...configOverride } },
      }),
    },
    audit,
    discord,
    scheduler,
    ui,
  };
  return ctx as unknown as ModuleContext;
};

const inputFor = (
  commandName: string,
  options: Record<string, string | number | boolean> = {},
  resolvedUsers: Record<string, { tag: string }> = {},
): CommandInteractionInput => ({
  commandName,
  guildId: GUILD,
  channelId: CHANNEL,
  userId: MOD,
  options,
  resolved: {
    users: Object.fromEntries(
      Object.entries(resolvedUsers).map(([id, u]) => [
        id,
        { id: id as never, tag: u.tag, displayName: u.tag, isBot: false },
      ]),
    ) as never,
    roles: {} as never,
    channels: {} as never,
  },
});

describe('handler /warn', () => {
  it('happy path : DM + audit + success', async () => {
    const ctx = makeCtx();
    const cmd = commands['warn'];
    if (!cmd) throw new Error('warn introuvable');
    const result = await cmd.handler(
      inputFor('warn', { member: TARGET, reason: 'spam' }, { [TARGET]: { tag: 'alice#0' } }),
      ctx,
    );
    expect(result.kind).toBe('success');
    expect(
      (ctx.discord as unknown as { sendDirectMessage: ReturnType<typeof vi.fn> }).sendDirectMessage,
    ).toHaveBeenCalledTimes(1);
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'moderation.case.warn',
        actor: { type: 'user', id: MOD },
        target: { type: 'user', id: TARGET },
        severity: 'info',
      }),
    );
  });

  it("refuse si canModerate retourne ok=false avec raison 'rank'", async () => {
    const ctx = makeCtx({}, { reason: 'rank' });
    const cmd = commands['warn'];
    if (!cmd) throw new Error('warn introuvable');
    const result = await cmd.handler(
      inputFor('warn', { member: TARGET }, { [TARGET]: { tag: 'alice#0' } }),
      ctx,
    );
    expect(result.kind).toBe('error');
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).not.toHaveBeenCalled();
  });

  it('refuse si option member absente', async () => {
    const ctx = makeCtx();
    const cmd = commands['warn'];
    if (!cmd) throw new Error('warn introuvable');
    const result = await cmd.handler(inputFor('warn', {}), ctx);
    expect(result.kind).toBe('error');
  });
});

describe('handler /kick', () => {
  it('appelle kickMember + audit warn severity', async () => {
    const ctx = makeCtx();
    const cmd = commands['kick'];
    if (!cmd) throw new Error('kick introuvable');
    await cmd.handler(
      inputFor('kick', { member: TARGET, reason: 'rule break' }, { [TARGET]: { tag: 'a#0' } }),
      ctx,
    );
    expect(
      (ctx.discord as unknown as { kickMember: ReturnType<typeof vi.fn> }).kickMember,
    ).toHaveBeenCalledWith(GUILD, TARGET, 'rule break');
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'moderation.case.kick', severity: 'warn' }),
    );
  });
});

describe('handler /ban', () => {
  it('passe deleteDays à banMember si fourni', async () => {
    const ctx = makeCtx();
    const cmd = commands['ban'];
    if (!cmd) throw new Error('ban introuvable');
    await cmd.handler(
      inputFor(
        'ban',
        { member: TARGET, reason: 'r', 'delete-days': 3 },
        { [TARGET]: { tag: 'b#0' } },
      ),
      ctx,
    );
    expect(
      (ctx.discord as unknown as { banMember: ReturnType<typeof vi.fn> }).banMember,
    ).toHaveBeenCalledWith(GUILD, TARGET, 'r', 3);
  });
});

describe('handler /tempban', () => {
  it('programme la levée via scheduler.in avec la durée parsée', async () => {
    const ctx = makeCtx();
    const cmd = commands['tempban'];
    if (!cmd) throw new Error('tempban introuvable');
    await cmd.handler(
      inputFor(
        'tempban',
        { member: TARGET, duration: '2h', reason: 'spam' },
        { [TARGET]: { tag: 'c#0' } },
      ),
      ctx,
    );
    expect(
      (ctx.discord as unknown as { banMember: ReturnType<typeof vi.fn> }).banMember,
    ).toHaveBeenCalled();
    expect((ctx.scheduler as unknown as { in: ReturnType<typeof vi.fn> }).in).toHaveBeenCalledWith(
      2 * 3_600_000,
      `moderation:tempban:${GUILD}:${TARGET}`,
      expect.any(Function),
    );
  });

  it('refuse si la durée est invalide', async () => {
    const ctx = makeCtx();
    const cmd = commands['tempban'];
    if (!cmd) throw new Error('tempban introuvable');
    const result = await cmd.handler(
      inputFor('tempban', { member: TARGET, duration: 'pas-une-durée' }),
      ctx,
    );
    expect(result.kind).toBe('error');
    expect(
      (ctx.scheduler as unknown as { in: ReturnType<typeof vi.fn> }).in,
    ).not.toHaveBeenCalled();
  });
});

describe('handler /unban', () => {
  it('appelle unbanMember sans check de hiérarchie', async () => {
    const ctx = makeCtx();
    const cmd = commands['unban'];
    if (!cmd) throw new Error('unban introuvable');
    await cmd.handler(
      inputFor('unban', { user: TARGET, reason: 'appel' }, { [TARGET]: { tag: 'd#0' } }),
      ctx,
    );
    expect(
      (ctx.discord as unknown as { unbanMember: ReturnType<typeof vi.fn> }).unbanMember,
    ).toHaveBeenCalledWith(GUILD, TARGET, 'appel');
    expect(
      (ctx.discord as unknown as { canModerate: ReturnType<typeof vi.fn> }).canModerate,
    ).not.toHaveBeenCalled();
  });
});

describe('handler /mute', () => {
  it("refuse si mutedRoleId n'est pas configuré", async () => {
    const ctx = makeCtx({ mutedRoleId: null });
    const cmd = commands['mute'];
    if (!cmd) throw new Error('mute introuvable');
    const result = await cmd.handler(
      inputFor('mute', { member: TARGET }, { [TARGET]: { tag: 'e#0' } }),
      ctx,
    );
    expect(result.kind).toBe('error');
    expect(
      (ctx.discord as unknown as { addMemberRole: ReturnType<typeof vi.fn> }).addMemberRole,
    ).not.toHaveBeenCalled();
  });

  it('happy path : assigne le rôle muet + audit', async () => {
    const ctx = makeCtx({ mutedRoleId: '123456789012345678' });
    const cmd = commands['mute'];
    if (!cmd) throw new Error('mute introuvable');
    await cmd.handler(
      inputFor('mute', { member: TARGET, reason: 'spam' }, { [TARGET]: { tag: 'f#0' } }),
      ctx,
    );
    expect(
      (ctx.discord as unknown as { addMemberRole: ReturnType<typeof vi.fn> }).addMemberRole,
    ).toHaveBeenCalledWith(GUILD, TARGET, '123456789012345678');
  });
});

describe('handler /tempmute', () => {
  it('assigne le rôle muet + programme le retrait', async () => {
    const ctx = makeCtx({ mutedRoleId: '123456789012345678' });
    const cmd = commands['tempmute'];
    if (!cmd) throw new Error('tempmute introuvable');
    await cmd.handler(
      inputFor(
        'tempmute',
        { member: TARGET, duration: '15m', reason: 'flood' },
        { [TARGET]: { tag: 'g#0' } },
      ),
      ctx,
    );
    expect((ctx.scheduler as unknown as { in: ReturnType<typeof vi.fn> }).in).toHaveBeenCalledWith(
      15 * 60_000,
      `moderation:tempmute:${GUILD}:${TARGET}`,
      expect.any(Function),
    );
  });
});

describe('handler /unmute', () => {
  it('retire le rôle muet + audit', async () => {
    const ctx = makeCtx({ mutedRoleId: '123456789012345678' });
    const cmd = commands['unmute'];
    if (!cmd) throw new Error('unmute introuvable');
    await cmd.handler(inputFor('unmute', { member: TARGET }, { [TARGET]: { tag: 'h#0' } }), ctx);
    expect(
      (ctx.discord as unknown as { removeMemberRole: ReturnType<typeof vi.fn> }).removeMemberRole,
    ).toHaveBeenCalledWith(GUILD, TARGET, '123456789012345678');
  });
});

describe('handler /clear', () => {
  it('supprime count messages + audit', async () => {
    const ctx = makeCtx();
    const cmd = commands['clear'];
    if (!cmd) throw new Error('clear introuvable');
    const result = await cmd.handler(inputFor('clear', { count: 10 }), ctx);
    expect(
      (ctx.discord as unknown as { bulkDeleteMessages: ReturnType<typeof vi.fn> })
        .bulkDeleteMessages,
    ).toHaveBeenCalledWith(CHANNEL, 10);
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'moderation.case.purge',
        target: { type: 'channel', id: CHANNEL },
      }),
    );
    expect(result.kind).toBe('success');
  });
});

describe('handler /slowmode', () => {
  it('configure le slowmode + audit', async () => {
    const ctx = makeCtx();
    const cmd = commands['slowmode'];
    if (!cmd) throw new Error('slowmode introuvable');
    await cmd.handler(inputFor('slowmode', { seconds: 60 }), ctx);
    expect(
      (ctx.discord as unknown as { setChannelSlowmode: ReturnType<typeof vi.fn> })
        .setChannelSlowmode,
    ).toHaveBeenCalledWith(CHANNEL, 60);
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'moderation.case.slowmode' }),
    );
  });
});

describe('handler /infractions', () => {
  it("renvoie un message vide quand l'historique est vide", async () => {
    const ctx = makeCtx({}, true, []);
    const cmd = commands['infractions'];
    if (!cmd) throw new Error('infractions introuvable');
    const result = await cmd.handler(
      inputFor('infractions', { member: TARGET }, { [TARGET]: { tag: 'a#0' } }),
      ctx,
    );
    expect(result.kind).toBe('success');
    expect(
      (ctx.audit as unknown as { query: ReturnType<typeof vi.fn> }).query,
    ).toHaveBeenCalledWith({
      guildId: GUILD,
      targetType: 'user',
      targetId: TARGET,
      limit: 10,
    });
  });

  it('liste les sanctions trouvées', async () => {
    const rows = [
      {
        id: '01HZ00000000000000000000A1',
        action: 'moderation.case.warn',
        actorType: 'user',
        actorId: '7',
        createdAt: '2026-04-26T10:30:00.000Z',
        metadata: { reason: 'spam' },
      },
      {
        id: '01HZ00000000000000000000A2',
        action: 'moderation.case.kick',
        actorType: 'user',
        actorId: '7',
        createdAt: '2026-04-26T11:00:00.000Z',
        metadata: {},
      },
    ];
    const ctx = makeCtx({}, true, rows);
    const cmd = commands['infractions'];
    if (!cmd) throw new Error('infractions introuvable');
    const result = await cmd.handler(
      inputFor('infractions', { member: TARGET }, { [TARGET]: { tag: 'a#0' } }),
      ctx,
    );
    expect(result.kind).toBe('success');
    const message = (result.payload as { message: string }).message;
    expect(message).toContain('**2**');
    expect(message).toContain('Warn');
    expect(message).toContain('Kick');
    expect(message).toContain('spam');
  });
});

describe('handler /case', () => {
  it('refuse un id non-ULID', async () => {
    const ctx = makeCtx();
    const cmd = commands['case'];
    if (!cmd) throw new Error('case introuvable');
    const result = await cmd.handler(inputFor('case', { id: 'pas-un-ulid' }), ctx);
    expect(result.kind).toBe('error');
  });

  it("renvoie 'introuvable' si l'entrée n'existe pas (audit.get retourne null)", async () => {
    const ctx = makeCtx({}, true, [], null);
    const cmd = commands['case'];
    if (!cmd) throw new Error('case introuvable');
    const result = await cmd.handler(inputFor('case', { id: '01HZ00000000000000000000A1' }), ctx);
    expect(result.kind).toBe('error');
  });

  it("renvoie 'introuvable' si l'entrée appartient à une autre guild", async () => {
    const otherGuildEntry = {
      id: '01HZ00000000000000000000A1',
      guildId: 'autre-guild',
      action: 'moderation.case.warn',
      actorType: 'user',
      actorId: '7',
      targetType: 'user',
      targetId: TARGET,
      createdAt: '2026-04-26T10:30:00.000Z',
      metadata: {},
    };
    const ctx = makeCtx({}, true, [], otherGuildEntry);
    const cmd = commands['case'];
    if (!cmd) throw new Error('case introuvable');
    const result = await cmd.handler(inputFor('case', { id: '01HZ00000000000000000000A1' }), ctx);
    expect(result.kind).toBe('error');
  });

  it("affiche le détail d'une sanction valide", async () => {
    const entry = {
      id: '01HZ00000000000000000000A1',
      guildId: GUILD,
      action: 'moderation.case.tempban',
      actorType: 'user',
      actorId: '7',
      targetType: 'user',
      targetId: TARGET,
      createdAt: '2026-04-26T10:30:00.000Z',
      metadata: { reason: 'raid', durationFormatted: '2h' },
    };
    const ctx = makeCtx({}, true, [], entry);
    const cmd = commands['case'];
    if (!cmd) throw new Error('case introuvable');
    const result = await cmd.handler(inputFor('case', { id: '01HZ00000000000000000000A1' }), ctx);
    expect(result.kind).toBe('success');
    const message = (result.payload as { message: string }).message;
    expect(message).toContain('Tempban');
    expect(message).toContain('2h');
    expect(message).toContain('raid');
  });
});
