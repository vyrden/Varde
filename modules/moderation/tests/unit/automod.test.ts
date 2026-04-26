import type { AIService, GuildMessageCreateEvent, ModuleContext } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  createAutomodHandler,
  createRateLimitTracker,
  evaluateRulesAgainst,
} from '../../src/automod.js';
import {
  type AutomodAiClassifyRule,
  type AutomodBlacklistRule,
  type AutomodRateLimitRule,
  type AutomodRegexRule,
  type AutomodRule,
  automodConfigSchema,
  automodRuleSchema,
} from '../../src/config.js';

const GUILD = '111' as never;
const CHANNEL = '222' as never;
const AUTHOR = '999' as never;
const MESSAGE = '333' as never;

const makeBlacklistRule = (overrides: Partial<AutomodBlacklistRule> = {}): AutomodBlacklistRule =>
  automodRuleSchema.parse({
    id: 'r1',
    label: 'test',
    kind: 'blacklist',
    pattern: 'spam',
    action: 'delete',
    enabled: true,
    ...overrides,
  }) as AutomodBlacklistRule;

const makeRegexRule = (overrides: Partial<AutomodRegexRule> = {}): AutomodRegexRule =>
  automodRuleSchema.parse({
    id: 'r-re',
    label: 'regex test',
    kind: 'regex',
    pattern: '\\bspam\\b',
    action: 'delete',
    enabled: true,
    ...overrides,
  }) as AutomodRegexRule;

const makeRateLimitRule = (overrides: Partial<AutomodRateLimitRule> = {}): AutomodRateLimitRule =>
  automodRuleSchema.parse({
    id: 'r-rl',
    label: 'rate limit',
    kind: 'rate-limit',
    count: 3,
    windowMs: 5_000,
    scope: 'user-guild',
    action: 'mute',
    durationMs: null,
    enabled: true,
    ...overrides,
  }) as AutomodRateLimitRule;

const makeAiClassifyRule = (
  overrides: Partial<AutomodAiClassifyRule> = {},
): AutomodAiClassifyRule =>
  automodRuleSchema.parse({
    id: 'r-ai',
    label: 'ai classify',
    kind: 'ai-classify',
    categories: ['toxicity', 'harassment'],
    action: 'delete',
    enabled: true,
    ...overrides,
  }) as AutomodAiClassifyRule;

const makeAiService = (resolved: string): AIService =>
  ({
    classify: vi.fn().mockResolvedValue(resolved),
    complete: vi.fn(),
    summarize: vi.fn(),
  }) as unknown as AIService;

const evalEvent = (content: string, channelId: string = CHANNEL): GuildMessageCreateEvent =>
  ({
    type: 'guild.messageCreate',
    guildId: GUILD,
    channelId,
    messageId: MESSAGE,
    authorId: AUTHOR,
    content,
    createdAt: Date.now(),
  }) as unknown as GuildMessageCreateEvent;

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

describe('evaluateRulesAgainst — règles synchrones', () => {
  const baseCtx = (content: string) => ({
    content,
    event: evalEvent(content),
    nowMs: 1_000_000,
    rateLimit: createRateLimitTracker(),
    ai: null,
  });

  it('retourne null si aucune règle ne matche', async () => {
    const rules = [makeBlacklistRule({ pattern: 'spam' })];
    expect(await evaluateRulesAgainst(rules, baseCtx('hello world'))).toBeNull();
  });

  it('blacklist : substring case-insensitive', async () => {
    const rules = [makeBlacklistRule({ pattern: 'SPAM' })];
    const matched = await evaluateRulesAgainst(rules, baseCtx('this is spam content'));
    expect(matched?.rule.id).toBe('r1');
    expect(matched?.kind).toBe('blacklist');
  });

  it('regex : compilation avec flag i', async () => {
    const rules = [makeRegexRule({ pattern: '\\bnsfw\\b' })];
    expect((await evaluateRulesAgainst(rules, baseCtx('check this NSFW link')))?.rule.id).toBe(
      'r-re',
    );
    expect(await evaluateRulesAgainst(rules, baseCtx('chouettes'))).toBeNull();
  });

  it('regex invalide : règle inerte (jamais matche)', async () => {
    const rules = [makeRegexRule({ pattern: '[invalid(' })];
    expect(await evaluateRulesAgainst(rules, baseCtx('anything'))).toBeNull();
  });

  it('skip les règles désactivées', async () => {
    const rules = [
      makeBlacklistRule({ id: 'off', pattern: 'spam', enabled: false }),
      makeBlacklistRule({ id: 'on', pattern: 'evil' }),
    ];
    expect(await evaluateRulesAgainst(rules, baseCtx('spam'))).toBeNull();
    expect((await evaluateRulesAgainst(rules, baseCtx('evil words')))?.rule.id).toBe('on');
  });

  it('renvoie la première règle qui matche (ordre déclaré)', async () => {
    const rules = [
      makeBlacklistRule({ id: 'first', pattern: 'foo' }),
      makeBlacklistRule({ id: 'second', pattern: 'foo' }),
    ];
    expect((await evaluateRulesAgainst(rules, baseCtx('foo bar')))?.rule.id).toBe('first');
  });
});

describe('evaluateRulesAgainst — rate-limit', () => {
  it('déclenche au-delà du seuil sur la fenêtre glissante', async () => {
    const tracker = createRateLimitTracker();
    const rule = makeRateLimitRule({ count: 3, windowMs: 5_000 });
    const make = (nowMs: number) => ({
      content: 'message',
      event: evalEvent('message'),
      nowMs,
      rateLimit: tracker,
      ai: null as AIService | null,
    });
    expect(await evaluateRulesAgainst([rule], make(1_000))).toBeNull();
    expect(await evaluateRulesAgainst([rule], make(1_500))).toBeNull();
    expect(await evaluateRulesAgainst([rule], make(2_000))).toBeNull();
    const fourth = await evaluateRulesAgainst([rule], make(2_500));
    expect(fourth?.kind).toBe('rate-limit');
    expect(fourth?.rule.id).toBe('r-rl');
  });

  it('purge les timestamps hors fenêtre (pas de déclenchement après pause)', async () => {
    const tracker = createRateLimitTracker();
    const rule = makeRateLimitRule({ count: 2, windowMs: 1_000 });
    const make = (nowMs: number) => ({
      content: 'm',
      event: evalEvent('m'),
      nowMs,
      rateLimit: tracker,
      ai: null as AIService | null,
    });
    await evaluateRulesAgainst([rule], make(1_000));
    await evaluateRulesAgainst([rule], make(1_400));
    // 3e message après expiration de la fenêtre du 1er → ne doit pas déclencher
    expect(await evaluateRulesAgainst([rule], make(2_500))).toBeNull();
  });

  it("scope: 'user-channel' isole les compteurs par salon", async () => {
    const tracker = createRateLimitTracker();
    const rule = makeRateLimitRule({ count: 2, windowMs: 5_000, scope: 'user-channel' });
    const make = (channelId: string, nowMs: number) => ({
      content: 'm',
      event: evalEvent('m', channelId),
      nowMs,
      rateLimit: tracker,
      ai: null as AIService | null,
    });
    await evaluateRulesAgainst([rule], make('chan-a', 1_000));
    await evaluateRulesAgainst([rule], make('chan-a', 1_100));
    // Salon différent : le compteur recommence à 0
    expect(await evaluateRulesAgainst([rule], make('chan-b', 1_200))).toBeNull();
    expect(await evaluateRulesAgainst([rule], make('chan-b', 1_300))).toBeNull();
  });
});

describe('evaluateRulesAgainst — ai-classify', () => {
  const baseCtx = (content: string, ai: AIService | null) => ({
    content,
    event: evalEvent(content),
    nowMs: 1_000_000,
    rateLimit: createRateLimitTracker(),
    ai,
  });

  it("appelle ai.classify avec ['safe', ...categories] et matche si retour ∈ categories", async () => {
    const ai = makeAiService('toxicity');
    const matched = await evaluateRulesAgainst([makeAiClassifyRule()], baseCtx('blabla', ai));
    expect(matched?.kind).toBe('ai-classify');
    if (matched?.kind === 'ai-classify') {
      expect(matched.category).toBe('toxicity');
    }
    expect(ai.classify).toHaveBeenCalledWith('blabla', ['safe', 'toxicity', 'harassment']);
  });

  it("retour 'safe' → null (pas de matche)", async () => {
    const ai = makeAiService('safe');
    expect(await evaluateRulesAgainst([makeAiClassifyRule()], baseCtx('hi', ai))).toBeNull();
  });

  it('retour hors-pool → null (fail-open)', async () => {
    const ai = makeAiService('whatever-the-model-said');
    expect(await evaluateRulesAgainst([makeAiClassifyRule()], baseCtx('hi', ai))).toBeNull();
  });

  it('ctx.ai === null : règle ai-classify silencieusement ignorée', async () => {
    expect(
      await evaluateRulesAgainst([makeAiClassifyRule()], baseCtx('toxic content', null)),
    ).toBeNull();
  });

  it('ne paie pas le coût IA si une règle synchrone matche déjà', async () => {
    const ai = makeAiService('toxicity');
    const rules = [
      makeBlacklistRule({ id: 'sync', pattern: 'spam' }),
      makeAiClassifyRule({ id: 'r-ai' }),
    ];
    const matched = await evaluateRulesAgainst(rules, baseCtx('this is spam', ai));
    expect(matched?.rule.id).toBe('sync');
    expect(ai.classify).not.toHaveBeenCalled();
  });

  it('tronque le contenu à maxContentLength avant de l envoyer à l IA', async () => {
    const ai = makeAiService('safe');
    const rule = makeAiClassifyRule({ maxContentLength: 64 });
    const long = 'x'.repeat(200);
    await evaluateRulesAgainst([rule], baseCtx(long, ai));
    const call = (ai.classify as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((call?.[0] as string).length).toBe(64);
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
        sendDirectMessage: vi.fn().mockResolvedValue(true),
        getGuildName: vi.fn().mockReturnValue('Test Guild'),
      },
      scheduler: { in: vi.fn().mockResolvedValue(undefined) },
    };
    return ctx as unknown as ModuleContext;
  };

  it('ignore les messages vides', async () => {
    const ctx = makeCtx({ rules: [makeBlacklistRule({ pattern: 'x' })] });
    await createAutomodHandler(ctx)(makeEvent(''));
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).not.toHaveBeenCalled();
  });

  it('no-op quand la config est vide', async () => {
    const ctx = makeCtx({ rules: [] });
    await createAutomodHandler(ctx)(makeEvent('blabla'));
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).not.toHaveBeenCalled();
  });

  it("delete : supprime + audit avec applied='delete'", async () => {
    const ctx = makeCtx({ rules: [makeBlacklistRule({ pattern: 'spam', action: 'delete' })] });
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
    const ctx = makeCtx({ rules: [makeBlacklistRule({ pattern: 'spam', action: 'warn' })] });
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
      rules: [makeBlacklistRule({ pattern: 'spam', action: 'mute' })],
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
      rules: [makeBlacklistRule({ pattern: 'spam', action: 'mute' })],
      mutedRoleId: '123456789012345678',
    });
    await createAutomodHandler(ctx)(makeEvent('spam'));
    expect(
      (ctx.discord as unknown as { addMemberRole: ReturnType<typeof vi.fn> }).addMemberRole,
    ).toHaveBeenCalledWith(GUILD, AUTHOR, '123456789012345678');
  });

  it('mute avec durationMs : programme le retrait via scheduler', async () => {
    const ctx = makeCtx({
      rules: [makeBlacklistRule({ pattern: 'spam', action: 'mute', durationMs: 600_000 })],
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
      rules: [makeBlacklistRule({ pattern: 'spam', action: 'delete' })],
      bypassRoleIds: ['111111111111111111'],
    });
    (
      ctx.discord as unknown as { memberHasRole: ReturnType<typeof vi.fn> }
    ).memberHasRole.mockResolvedValueOnce(true);
    await createAutomodHandler(ctx)(makeEvent('spam'));
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).not.toHaveBeenCalled();
  });
});
