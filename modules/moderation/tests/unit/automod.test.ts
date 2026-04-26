import type { GuildMessageCreateEvent, ModuleContext } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createAutomodHandler, evaluateRules } from '../../src/automod.js';
import { type AutomodRule, automodConfigSchema, automodRuleSchema } from '../../src/config.js';

const GUILD = '111' as never;
const CHANNEL = '222' as never;
const AUTHOR = '999' as never;
const MESSAGE = '333' as never;

const makeRule = (overrides: Partial<AutomodRule> = {}): AutomodRule =>
  automodRuleSchema.parse({
    id: 'r1',
    label: 'test',
    kind: 'blacklist',
    pattern: 'spam',
    action: 'delete',
    enabled: true,
    ...overrides,
  });

describe('automodConfigSchema', () => {
  it('defaults : rules vides + bypass vides', () => {
    expect(automodConfigSchema.parse({})).toEqual({ rules: [], bypassRoleIds: [] });
  });

  it('rejette un bypass roleId non snowflake', () => {
    expect(() => automodConfigSchema.parse({ bypassRoleIds: ['pas-un-id'] })).toThrow();
  });

  it('rejette une règle avec kind inconnu', () => {
    expect(() =>
      automodConfigSchema.parse({
        rules: [{ id: 'a', label: 'l', kind: 'unknown', pattern: 'x', action: 'delete' }],
      }),
    ).toThrow();
  });
});

describe('evaluateRules', () => {
  it('retourne null si aucune règle ne matche', () => {
    const rules = [makeRule({ pattern: 'spam' })];
    expect(evaluateRules('hello world', rules)).toBeNull();
  });

  it('blacklist : substring case-insensitive', () => {
    const rules = [makeRule({ pattern: 'SPAM', kind: 'blacklist' })];
    const matched = evaluateRules('this is spam content', rules);
    expect(matched?.id).toBe('r1');
  });

  it('regex : compilation avec flag i', () => {
    const rules = [makeRule({ pattern: '\\bnsfw\\b', kind: 'regex' })];
    expect(evaluateRules('check this NSFW link', rules)?.id).toBe('r1');
    expect(evaluateRules('chouettes', rules)).toBeNull();
  });

  it('regex invalide : règle inerte (jamais matche)', () => {
    const rules = [makeRule({ id: 'bad', pattern: '[invalid(', kind: 'regex' })];
    expect(evaluateRules('anything', rules)).toBeNull();
  });

  it('skip les règles désactivées', () => {
    const rules = [
      makeRule({ id: 'off', pattern: 'spam', enabled: false }),
      makeRule({ id: 'on', pattern: 'evil' }),
    ];
    expect(evaluateRules('spam', rules)).toBeNull();
    expect(evaluateRules('evil words', rules)?.id).toBe('on');
  });

  it('renvoie la première règle qui matche (ordre déclaré)', () => {
    const rules = [
      makeRule({ id: 'first', pattern: 'foo' }),
      makeRule({ id: 'second', pattern: 'foo' }),
    ];
    expect(evaluateRules('foo bar', rules)?.id).toBe('first');
  });
});

describe('createAutomodHandler', () => {
  const makeEvent = (content: string): GuildMessageCreateEvent =>
    ({
      type: 'guild.messageCreate',
      guildId: GUILD,
      channelId: CHANNEL,
      messageId: MESSAGE,
      authorId: AUTHOR,
      content,
      createdAt: new Date().toISOString(),
    }) as unknown as GuildMessageCreateEvent;

  const makeCtx = (
    cfg: { rules?: AutomodRule[]; bypassRoleIds?: string[]; mutedRoleId?: string | null } = {},
  ): ModuleContext => {
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
          modules: {
            moderation: {
              version: 1,
              mutedRoleId: cfg.mutedRoleId ?? null,
              dmOnSanction: true,
              automod: {
                rules: cfg.rules ?? [],
                bypassRoleIds: cfg.bypassRoleIds ?? [],
              },
            },
          },
        }),
      },
      audit: { log: vi.fn().mockResolvedValue(undefined) },
      discord: {
        deleteMessage: vi.fn().mockResolvedValue(undefined),
        addMemberRole: vi.fn().mockResolvedValue(undefined),
        removeMemberRole: vi.fn().mockResolvedValue(undefined),
        memberHasRole: vi.fn().mockResolvedValue(false),
      },
      scheduler: { in: vi.fn().mockResolvedValue(undefined) },
    };
    return ctx as unknown as ModuleContext;
  };

  it('ignore les messages vides', async () => {
    const ctx = makeCtx({ rules: [makeRule({ pattern: 'x' })] });
    await createAutomodHandler(ctx)(makeEvent(''));
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).not.toHaveBeenCalled();
  });

  it('no-op quand la config est vide', async () => {
    const ctx = makeCtx({ rules: [] });
    await createAutomodHandler(ctx)(makeEvent('blabla'));
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).not.toHaveBeenCalled();
  });

  it("delete : supprime + audit avec applied='delete'", async () => {
    const ctx = makeCtx({ rules: [makeRule({ pattern: 'spam', action: 'delete' })] });
    await createAutomodHandler(ctx)(makeEvent('this is spam'));
    expect(
      (ctx.discord as unknown as { deleteMessage: ReturnType<typeof vi.fn> }).deleteMessage,
    ).toHaveBeenCalledWith(CHANNEL, MESSAGE);
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'moderation.automod.triggered',
        metadata: expect.objectContaining({ applied: 'delete', action: 'delete' }),
      }),
    );
  });

  it('warn : audit seulement, pas de delete', async () => {
    const ctx = makeCtx({ rules: [makeRule({ pattern: 'spam', action: 'warn' })] });
    await createAutomodHandler(ctx)(makeEvent('SPAM here'));
    expect(
      (ctx.discord as unknown as { deleteMessage: ReturnType<typeof vi.fn> }).deleteMessage,
    ).not.toHaveBeenCalled();
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'info',
        metadata: expect.objectContaining({ applied: 'warn' }),
      }),
    );
  });

  it("mute sans rôle muet : delete + audit applied='mute-no-role'", async () => {
    const ctx = makeCtx({
      rules: [makeRule({ pattern: 'spam', action: 'mute' })],
      mutedRoleId: null,
    });
    await createAutomodHandler(ctx)(makeEvent('spam'));
    expect(
      (ctx.discord as unknown as { addMemberRole: ReturnType<typeof vi.fn> }).addMemberRole,
    ).not.toHaveBeenCalled();
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ applied: 'mute-no-role' }),
      }),
    );
  });

  it('mute avec rôle : delete + addMemberRole + audit', async () => {
    const ctx = makeCtx({
      rules: [makeRule({ pattern: 'spam', action: 'mute' })],
      mutedRoleId: '123456789012345678',
    });
    await createAutomodHandler(ctx)(makeEvent('spam'));
    expect(
      (ctx.discord as unknown as { addMemberRole: ReturnType<typeof vi.fn> }).addMemberRole,
    ).toHaveBeenCalledWith(GUILD, AUTHOR, '123456789012345678');
  });

  it('mute avec durationMs : programme le retrait via scheduler', async () => {
    const ctx = makeCtx({
      rules: [makeRule({ pattern: 'spam', action: 'mute', durationMs: 600_000 })],
      mutedRoleId: '123456789012345678',
    });
    await createAutomodHandler(ctx)(makeEvent('spam'));
    expect((ctx.scheduler as unknown as { in: ReturnType<typeof vi.fn> }).in).toHaveBeenCalledWith(
      600_000,
      `moderation:automod-mute:${GUILD}:${AUTHOR}:r1`,
      expect.any(Function),
    );
  });

  it("bypass : auteur avec rôle bypass n'est pas évalué", async () => {
    const ctx = makeCtx({
      rules: [makeRule({ pattern: 'spam', action: 'delete' })],
      bypassRoleIds: ['111111111111111111'],
    });
    (
      ctx.discord as unknown as { memberHasRole: ReturnType<typeof vi.fn> }
    ).memberHasRole.mockResolvedValueOnce(true);
    await createAutomodHandler(ctx)(makeEvent('spam'));
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).not.toHaveBeenCalled();
  });
});
