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
    actions: ['delete'],
    enabled: true,
    ...overrides,
  }) as AutomodBlacklistRule;

const makeRegexRule = (overrides: Partial<AutomodRegexRule> = {}): AutomodRegexRule =>
  automodRuleSchema.parse({
    id: 'r-re',
    label: 'regex test',
    kind: 'regex',
    pattern: '\\bspam\\b',
    actions: ['delete'],
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
    actions: ['mute'],
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
    actions: ['delete'],
    enabled: true,
    ...overrides,
  }) as AutomodAiClassifyRule;

const makeAiService = (resolved: string): AIService =>
  ({
    classify: vi.fn().mockResolvedValue(resolved),
    complete: vi.fn(),
    summarize: vi.fn(),
  }) as unknown as AIService;

const evalEvent = (
  content: string,
  channelId: string = CHANNEL,
  attachments: ReadonlyArray<{
    id: string;
    url: string;
    filename?: string;
    contentType?: string | null;
  }> = [],
): GuildMessageCreateEvent =>
  ({
    type: 'guild.messageCreate',
    guildId: GUILD,
    channelId,
    messageId: MESSAGE,
    authorId: AUTHOR,
    content,
    createdAt: Date.now(),
    attachments,
  }) as unknown as GuildMessageCreateEvent;

const makeRule = (kind: string, overrides: Record<string, unknown> = {}): AutomodRule =>
  automodRuleSchema.parse({
    id: `r-${kind}`,
    label: `${kind} test`,
    kind,
    actions: ['delete'],
    enabled: true,
    ...overrides,
  }) as AutomodRule;

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
        rules: [{ id: 'a', label: 'l', kind: 'unknown', pattern: 'x', actions: ['delete'] }],
      }),
    ).toThrow();
  });

  it("migre les règles legacy {action: 'X'} vers {actions: ['X']}", () => {
    const parsed = automodConfigSchema.parse({
      rules: [
        {
          id: 'legacy-1',
          label: 'old format',
          kind: 'blacklist',
          pattern: 'badword',
          action: 'warn',
          enabled: true,
        },
      ],
    });
    expect(parsed.rules).toHaveLength(1);
    const rule = parsed.rules[0];
    expect(rule?.actions).toEqual(['warn']);
    expect((rule as Record<string, unknown> | undefined)?.action).toBeUndefined();
  });

  it('rejette une règle avec actions vides', () => {
    expect(() =>
      automodConfigSchema.parse({
        rules: [
          {
            id: 'a',
            label: 'l',
            kind: 'blacklist',
            pattern: 'x',
            actions: [],
          },
        ],
      }),
    ).toThrow();
  });

  it('accepte des actions dupliquées (la dédup est faite côté UI / runtime)', () => {
    // Le runtime `applyActions` utilise `.includes()` — les doublons
    // ne déclenchent pas d'exécution multiple. La dédup est faite au
    // point d'entrée (UI dashboard `normalizeActions`) plutôt qu'avec
    // `z.transform`, qui casse l'export JSON Schema utilisé par Fastify.
    const parsed = automodConfigSchema.parse({
      rules: [
        {
          id: 'dup',
          label: 'l',
          kind: 'blacklist',
          pattern: 'x',
          actions: ['delete', 'warn', 'delete'],
        },
      ],
    });
    expect(parsed.rules[0]?.actions).toEqual(['delete', 'warn', 'delete']);
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

describe('evaluateRulesAgainst — invites', () => {
  const baseCtx = (content: string) => ({
    content,
    event: evalEvent(content),
    nowMs: 1_000_000,
    rateLimit: createRateLimitTracker(),
    ai: null,
  });

  it('matche discord.gg/CODE', async () => {
    const rule = makeRule('invites');
    const matched = await evaluateRulesAgainst([rule], baseCtx('viens https://discord.gg/abc123'));
    expect(matched?.kind).toBe('invites');
  });

  it('matche discord.com/invite/CODE', async () => {
    const rule = makeRule('invites');
    const matched = await evaluateRulesAgainst([rule], baseCtx('https://discord.com/invite/x-y_z'));
    expect(matched?.kind).toBe('invites');
  });

  it('ne matche pas un texte sans invite', async () => {
    const rule = makeRule('invites');
    expect(
      await evaluateRulesAgainst([rule], baseCtx('hello world https://example.com')),
    ).toBeNull();
  });
});

describe('evaluateRulesAgainst — links', () => {
  const baseCtx = (content: string) => ({
    content,
    event: evalEvent(content),
    nowMs: 1_000_000,
    rateLimit: createRateLimitTracker(),
    ai: null,
  });

  it('block-all : matche n importe quel URL', async () => {
    const rule = makeRule('links', { mode: 'block-all', whitelist: [] });
    const matched = await evaluateRulesAgainst([rule], baseCtx('check https://example.com/x'));
    expect(matched?.kind).toBe('links');
  });

  it('whitelist : ne matche PAS un domaine listé', async () => {
    const rule = makeRule('links', { mode: 'whitelist', whitelist: ['github.com'] });
    expect(await evaluateRulesAgainst([rule], baseCtx('see https://github.com/abc'))).toBeNull();
  });

  it('whitelist : matche un domaine non listé', async () => {
    const rule = makeRule('links', { mode: 'whitelist', whitelist: ['github.com'] });
    const matched = await evaluateRulesAgainst([rule], baseCtx('go https://example.com'));
    expect(matched?.kind).toBe('links');
  });

  it('whitelist : autorise les sous-domaines', async () => {
    const rule = makeRule('links', { mode: 'whitelist', whitelist: ['youtube.com'] });
    expect(await evaluateRulesAgainst([rule], baseCtx('https://www.youtube.com/watch'))).toBeNull();
    expect(await evaluateRulesAgainst([rule], baseCtx('https://music.youtube.com/x'))).toBeNull();
  });
});

describe('evaluateRulesAgainst — caps', () => {
  const baseCtx = (content: string) => ({
    content,
    event: evalEvent(content),
    nowMs: 1_000_000,
    rateLimit: createRateLimitTracker(),
    ai: null,
  });

  it('ignore les messages trop courts (<minLength)', async () => {
    const rule = makeRule('caps', { minLength: 8, ratio: 0.7 });
    expect(await evaluateRulesAgainst([rule], baseCtx('LOL'))).toBeNull();
  });

  it('matche un message majoritairement en majuscules', async () => {
    const rule = makeRule('caps', { minLength: 8, ratio: 0.7 });
    const matched = await evaluateRulesAgainst([rule], baseCtx("C'EST INTOLÉRABLE!!!"));
    expect(matched?.kind).toBe('caps');
  });

  it('ne matche pas un texte mixte', async () => {
    const rule = makeRule('caps', { minLength: 8, ratio: 0.7 });
    expect(await evaluateRulesAgainst([rule], baseCtx('Bonjour les amis'))).toBeNull();
  });
});

describe('evaluateRulesAgainst — emojis', () => {
  const baseCtx = (content: string) => ({
    content,
    event: evalEvent(content),
    nowMs: 1_000_000,
    rateLimit: createRateLimitTracker(),
    ai: null,
  });

  it('compte unicode + custom emojis', async () => {
    const rule = makeRule('emojis', { maxCount: 2 });
    const matched = await evaluateRulesAgainst([rule], baseCtx('🔥🎉<:custom:123456789012345678>'));
    expect(matched?.kind).toBe('emojis');
  });

  it('ne matche pas en-dessous du seuil', async () => {
    const rule = makeRule('emojis', { maxCount: 5 });
    expect(await evaluateRulesAgainst([rule], baseCtx('un emoji 🔥'))).toBeNull();
  });
});

describe('evaluateRulesAgainst — spoilers', () => {
  const baseCtx = (content: string) => ({
    content,
    event: evalEvent(content),
    nowMs: 1_000_000,
    rateLimit: createRateLimitTracker(),
    ai: null,
  });

  it('matche au-delà du seuil', async () => {
    const rule = makeRule('spoilers', { maxCount: 2 });
    const matched = await evaluateRulesAgainst([rule], baseCtx('||a|| ||b|| ||c||'));
    expect(matched?.kind).toBe('spoilers');
  });
});

describe('evaluateRulesAgainst — mentions', () => {
  const baseCtx = (content: string) => ({
    content,
    event: evalEvent(content),
    nowMs: 1_000_000,
    rateLimit: createRateLimitTracker(),
    ai: null,
  });

  it('compte les mentions utilisateur', async () => {
    const rule = makeRule('mentions', { maxCount: 2, includeRoles: false });
    const matched = await evaluateRulesAgainst([rule], baseCtx('<@1> <@2> <@3>'));
    expect(matched?.kind).toBe('mentions');
  });

  it('inclut les mentions de rôles si includeRoles=true', async () => {
    const rule = makeRule('mentions', { maxCount: 2, includeRoles: true });
    const matched = await evaluateRulesAgainst([rule], baseCtx('<@1> <@&2> <@&3>'));
    expect(matched?.kind).toBe('mentions');
  });

  it('exclut les mentions de rôles si includeRoles=false', async () => {
    const rule = makeRule('mentions', { maxCount: 2, includeRoles: false });
    expect(await evaluateRulesAgainst([rule], baseCtx('<@1> <@&2> <@&3>'))).toBeNull();
  });
});

describe('evaluateRulesAgainst — zalgo', () => {
  const baseCtx = (content: string) => ({
    content,
    event: evalEvent(content),
    nowMs: 1_000_000,
    rateLimit: createRateLimitTracker(),
    ai: null,
  });

  it('matche du texte chargé en marques combinantes', async () => {
    const rule = makeRule('zalgo', { ratio: 0.3 });
    const matched = await evaluateRulesAgainst([rule], baseCtx('h̷̢̛e̵l̸͝l̴͝o̶'));
    expect(matched?.kind).toBe('zalgo');
  });

  it('ne matche pas du texte normal', async () => {
    const rule = makeRule('zalgo', { ratio: 0.3 });
    expect(await evaluateRulesAgainst([rule], baseCtx('hello world'))).toBeNull();
  });
});

describe('evaluateRulesAgainst — keyword-list', () => {
  const baseCtx = (content: string) => ({
    content,
    event: evalEvent(content),
    nowMs: 1_000_000,
    rateLimit: createRateLimitTracker(),
    ai: null,
  });

  it('matche avec le vocab seedé fr toxicity', async () => {
    const rule = makeRule('keyword-list', {
      language: 'fr',
      categories: ['toxicity'],
    });
    const matched = await evaluateRulesAgainst([rule], baseCtx('quel idiot'));
    expect(matched?.kind).toBe('keyword-list');
  });

  it('matche avec le vocab seedé en sexual', async () => {
    const rule = makeRule('keyword-list', {
      language: 'en',
      categories: ['sexual'],
    });
    const matched = await evaluateRulesAgainst([rule], baseCtx('check this porn link'));
    expect(matched?.kind).toBe('keyword-list');
  });

  it('langue all : matche FR ET EN', async () => {
    const rule = makeRule('keyword-list', {
      language: 'all',
      categories: ['harassment'],
    });
    expect((await evaluateRulesAgainst([rule], baseCtx('shut up')))?.kind).toBe('keyword-list');
    expect((await evaluateRulesAgainst([rule], baseCtx('ta gueule')))?.kind).toBe('keyword-list');
  });

  it('match accent-insensitive', async () => {
    const rule = makeRule('keyword-list', {
      language: 'fr',
      categories: ['toxicity'],
    });
    // « cretin » sans accent doit matcher « crétin » (vocab) — ou
    // l'inverse selon la normalisation ; ici on teste une variante
    // courante qu'on attend de couvrir.
    const matched = await evaluateRulesAgainst([rule], baseCtx('quel cretin tu fais'));
    expect(matched?.kind).toBe('keyword-list');
  });

  it('customWords étend le vocab', async () => {
    const rule = makeRule('keyword-list', {
      language: 'fr',
      categories: ['spam'],
      customWords: ['bad-domain.io'],
    });
    const matched = await evaluateRulesAgainst([rule], baseCtx('check bad-domain.io'));
    expect(matched?.kind).toBe('keyword-list');
  });

  it('ne matche pas un texte propre', async () => {
    const rule = makeRule('keyword-list', {
      language: 'all',
      categories: ['toxicity', 'harassment'],
    });
    expect(await evaluateRulesAgainst([rule], baseCtx('bonjour la team'))).toBeNull();
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
  const makeEvent = (
    content: string,
    overrides: {
      channelId?: string;
      attachments?: ReadonlyArray<{
        id: string;
        url: string;
        filename?: string;
        contentType?: string | null;
      }>;
    } = {},
  ): GuildMessageCreateEvent =>
    ({
      type: 'guild.messageCreate',
      guildId: GUILD,
      channelId: overrides.channelId ?? CHANNEL,
      messageId: MESSAGE,
      authorId: AUTHOR,
      content,
      createdAt: new Date().toISOString(),
      attachments: overrides.attachments ?? [],
    }) as unknown as GuildMessageCreateEvent;

  const makeCtx = (
    cfg: {
      rules?: AutomodRule[];
      bypassRoleIds?: string[];
      mutedRoleId?: string | null;
      restrictedChannels?: ReadonlyArray<{ channelId: string; modes: string[] }>;
    } = {},
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
              restrictedChannels: cfg.restrictedChannels ?? [],
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
      // L'automod résout l'IA par-event via `ctx.aiFor(event.guildId)`.
      // Les tests existants n'utilisent pas l'IA — on retourne `null`.
      // Les tests AI-classify dédiés instancient leur propre ctx.
      aiFor: vi.fn().mockReturnValue(null),
      ai: null,
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

  it("delete : supprime + audit avec applied=['delete']", async () => {
    const ctx = makeCtx({ rules: [makeBlacklistRule({ pattern: 'spam', actions: ['delete'] })] });
    await createAutomodHandler(ctx)(makeEvent('this is spam'));
    expect(
      (ctx.discord as unknown as { deleteMessage: ReturnType<typeof vi.fn> }).deleteMessage,
    ).toHaveBeenCalledWith(CHANNEL, MESSAGE);
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'moderation.automod.triggered',
        metadata: expect.objectContaining({ applied: ['delete'], actions: ['delete'] }),
      }),
    );
  });

  it('warn seul : audit info, pas de delete, DM envoyé', async () => {
    const ctx = makeCtx({ rules: [makeBlacklistRule({ pattern: 'spam', actions: ['warn'] })] });
    await createAutomodHandler(ctx)(makeEvent('SPAM here'));
    expect(
      (ctx.discord as unknown as { deleteMessage: ReturnType<typeof vi.fn> }).deleteMessage,
    ).not.toHaveBeenCalled();
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'info',
        metadata: expect.objectContaining({ applied: ['warn'] }),
      }),
    );
    expect(
      (ctx.discord as unknown as { sendDirectMessage: ReturnType<typeof vi.fn> }).sendDirectMessage,
    ).toHaveBeenCalled();
  });

  it("multi-action delete+warn : delete + DM + audit applied=['delete','warn']", async () => {
    const ctx = makeCtx({
      rules: [makeBlacklistRule({ pattern: 'spam', actions: ['delete', 'warn'] })],
    });
    await createAutomodHandler(ctx)(makeEvent('this is spam'));
    expect(
      (ctx.discord as unknown as { deleteMessage: ReturnType<typeof vi.fn> }).deleteMessage,
    ).toHaveBeenCalledWith(CHANNEL, MESSAGE);
    expect(
      (ctx.discord as unknown as { sendDirectMessage: ReturnType<typeof vi.fn> }).sendDirectMessage,
    ).toHaveBeenCalled();
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warn',
        metadata: expect.objectContaining({ applied: ['delete', 'warn'] }),
      }),
    );
  });

  it("mute sans rôle muet : audit applied=['mute-no-role'], pas de DM", async () => {
    const ctx = makeCtx({
      rules: [makeBlacklistRule({ pattern: 'spam', actions: ['mute'] })],
      mutedRoleId: null,
    });
    await createAutomodHandler(ctx)(makeEvent('spam'));
    expect(
      (ctx.discord as unknown as { addMemberRole: ReturnType<typeof vi.fn> }).addMemberRole,
    ).not.toHaveBeenCalled();
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ applied: ['mute-no-role'] }),
      }),
    );
    expect(
      (ctx.discord as unknown as { sendDirectMessage: ReturnType<typeof vi.fn> }).sendDirectMessage,
    ).not.toHaveBeenCalled();
  });

  it('mute avec rôle : addMemberRole + audit', async () => {
    const ctx = makeCtx({
      rules: [makeBlacklistRule({ pattern: 'spam', actions: ['mute'] })],
      mutedRoleId: '123456789012345678',
    });
    await createAutomodHandler(ctx)(makeEvent('spam'));
    expect(
      (ctx.discord as unknown as { addMemberRole: ReturnType<typeof vi.fn> }).addMemberRole,
    ).toHaveBeenCalledWith(GUILD, AUTHOR, '123456789012345678');
  });

  it('mute avec durationMs : programme le retrait via scheduler', async () => {
    const ctx = makeCtx({
      rules: [makeBlacklistRule({ pattern: 'spam', actions: ['mute'], durationMs: 600_000 })],
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
      rules: [makeBlacklistRule({ pattern: 'spam', actions: ['delete'] })],
      bypassRoleIds: ['111111111111111111'],
    });
    (
      ctx.discord as unknown as { memberHasRole: ReturnType<typeof vi.fn> }
    ).memberHasRole.mockResolvedValueOnce(true);
    await createAutomodHandler(ctx)(makeEvent('spam'));
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).not.toHaveBeenCalled();
  });

  // ─── Restricted channels ─────────────────────────────────────────

  // Le channelId DOIT être un snowflake valide (17-20 chiffres) sinon
  // `resolveConfig` rejette la config et le handler retombe en early-return.
  const RESTRICTED_CHANNEL = '222222222222222222';

  it('restricted-channel images-only : supprime un message texte sans attachement image', async () => {
    const ctx = makeCtx({
      restrictedChannels: [{ channelId: RESTRICTED_CHANNEL, modes: ['images'] }],
    });
    await createAutomodHandler(ctx)(
      makeEvent('hello sans image', { channelId: RESTRICTED_CHANNEL }),
    );
    expect(
      (ctx.discord as unknown as { deleteMessage: ReturnType<typeof vi.fn> }).deleteMessage,
    ).toHaveBeenCalledWith(RESTRICTED_CHANNEL, MESSAGE);
    expect((ctx.audit as unknown as { log: ReturnType<typeof vi.fn> }).log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ restrictedChannel: true, modes: ['images'] }),
      }),
    );
  });

  it('restricted-channel images-only : autorise un message avec attachement image (MIME)', async () => {
    const ctx = makeCtx({
      restrictedChannels: [{ channelId: RESTRICTED_CHANNEL, modes: ['images'] }],
    });
    await createAutomodHandler(ctx)(
      makeEvent('legend', {
        channelId: RESTRICTED_CHANNEL,
        attachments: [{ id: '1', url: 'https://cdn/x.png', contentType: 'image/png' }],
      }),
    );
    expect(
      (ctx.discord as unknown as { deleteMessage: ReturnType<typeof vi.fn> }).deleteMessage,
    ).not.toHaveBeenCalled();
  });

  it('restricted-channel images-only : autorise un attachement image (extension fallback)', async () => {
    const ctx = makeCtx({
      restrictedChannels: [{ channelId: RESTRICTED_CHANNEL, modes: ['images'] }],
    });
    // Pas de contentType — Discord ne l'a pas encore détecté ; on
    // retombe sur l'extension du filename.
    await createAutomodHandler(ctx)(
      makeEvent('', {
        channelId: RESTRICTED_CHANNEL,
        attachments: [{ id: '1', url: 'https://cdn/photo.JPEG', filename: 'photo.JPEG' }],
      }),
    );
    expect(
      (ctx.discord as unknown as { deleteMessage: ReturnType<typeof vi.fn> }).deleteMessage,
    ).not.toHaveBeenCalled();
  });

  it('restricted-channel images+videos : autorise images OU vidéos (OR multi-modes)', async () => {
    const ctx = makeCtx({
      restrictedChannels: [{ channelId: RESTRICTED_CHANNEL, modes: ['images', 'videos'] }],
    });
    await createAutomodHandler(ctx)(
      makeEvent('clip', {
        channelId: RESTRICTED_CHANNEL,
        attachments: [{ id: '1', url: 'https://cdn/v.mp4', contentType: 'video/mp4' }],
      }),
    );
    expect(
      (ctx.discord as unknown as { deleteMessage: ReturnType<typeof vi.fn> }).deleteMessage,
    ).not.toHaveBeenCalled();
  });

  it("restricted-channel ne s'applique pas à un autre salon", async () => {
    const ctx = makeCtx({
      restrictedChannels: [{ channelId: '333333333333333333', modes: ['images'] }],
    });
    await createAutomodHandler(ctx)(makeEvent('hello'));
    expect(
      (ctx.discord as unknown as { deleteMessage: ReturnType<typeof vi.fn> }).deleteMessage,
    ).not.toHaveBeenCalled();
  });

  it("restricted-channel s'applique AVANT les rôles bypass", async () => {
    // Politique de salon — un mod n'est pas exempté.
    const ctx = makeCtx({
      restrictedChannels: [{ channelId: RESTRICTED_CHANNEL, modes: ['images'] }],
      bypassRoleIds: ['111111111111111111'],
    });
    (
      ctx.discord as unknown as { memberHasRole: ReturnType<typeof vi.fn> }
    ).memberHasRole.mockResolvedValueOnce(true);
    await createAutomodHandler(ctx)(makeEvent('hello', { channelId: RESTRICTED_CHANNEL }));
    expect(
      (ctx.discord as unknown as { deleteMessage: ReturnType<typeof vi.fn> }).deleteMessage,
    ).toHaveBeenCalled();
  });
});
