import type { GuildId, Logger, UserId } from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AIInvocationContext,
  type AIProvider,
  AIProviderError,
  createAIService,
  createStubProvider,
} from '../../src/index.js';

/**
 * Le wrapper `AIService` doit :
 * - valider les entrées Zod (invalid_response si schéma faux),
 * - appliquer le timeout (AIProviderError timeout),
 * - logger succès ET échec dans `ai_invocations`,
 * - propager une AIProviderError typée depuis toute erreur
 *   remontée par l adapter.
 */

const silentLogger: Logger = {
  child: () => silentLogger,
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
};

const ctx: AIInvocationContext = {
  guildId: '111' as GuildId,
  actorId: '42' as UserId,
  purpose: 'onboarding.generatePreset',
};

const setupDb = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  await client.db.insert(sqliteSchema.guilds).values({ id: ctx.guildId, name: 'Alpha' }).run();
  return client;
};

const countInvocations = (client: DbClient<'sqlite'>): number =>
  client.db.select().from(sqliteSchema.aiInvocations).all().length;

describe('createAIService — nominal via stub', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupDb();
  });

  afterEach(async () => {
    await client.close();
  });

  it('route generatePreset vers le provider et logge le succès', async () => {
    const service = createAIService({
      provider: createStubProvider(),
      client,
      logger: silentLogger,
    });

    const result = await service.generatePreset(ctx, {
      description: 'commu tech dev',
      locale: 'fr',
      hints: [],
    });

    expect(result.proposal.preset.id).toBe('community-tech-small');
    expect(result.invocationId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(countInvocations(client)).toBe(1);

    const [row] = client.db.select().from(sqliteSchema.aiInvocations).all();
    expect(row?.success).toBe(true);
    expect(row?.provider).toBe('stub');
    expect(row?.purpose).toBe('onboarding.generatePreset');
    expect(row?.promptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('route suggestCompletion vers le provider et logge le succès', async () => {
    const service = createAIService({
      provider: createStubProvider(),
      client,
      logger: silentLogger,
    });

    const result = await service.suggestCompletion(
      { ...ctx, purpose: 'onboarding.suggestRole' },
      { kind: 'role', contextDraft: {} },
    );

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.invocationId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(countInvocations(client)).toBe(1);
  });

  it('testConnection ne logge pas', async () => {
    const service = createAIService({
      provider: createStubProvider(),
      client,
      logger: silentLogger,
    });
    const info = await service.testConnection();
    expect(info.ok).toBe(true);
    expect(countInvocations(client)).toBe(0);
  });
});

describe('createAIService — validation Zod', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupDb();
  });

  afterEach(async () => {
    await client.close();
  });

  it('rejette un generatePreset avec description vide', async () => {
    const service = createAIService({
      provider: createStubProvider(),
      client,
      logger: silentLogger,
    });
    await expect(
      service.generatePreset(ctx, {
        description: '',
        locale: 'fr',
        hints: [],
      }),
    ).rejects.toBeInstanceOf(AIProviderError);
    expect(countInvocations(client)).toBe(0);
  });

  it('rejette un suggestCompletion avec kind invalide', async () => {
    const service = createAIService({
      provider: createStubProvider(),
      client,
      logger: silentLogger,
    });
    await expect(
      service.suggestCompletion(ctx, {
        kind: 'banana' as unknown as 'role',
        contextDraft: {},
      }),
    ).rejects.toBeInstanceOf(AIProviderError);
  });
});

describe('createAIService — erreurs provider', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupDb();
  });

  afterEach(async () => {
    await client.close();
  });

  it('logge l échec quand le provider throw', async () => {
    const provider: AIProvider = {
      id: 'broken',
      model: 'test-model',
      generatePreset: vi.fn(async () => {
        throw new Error('boom');
      }),
      suggestCompletion: vi.fn(async () => []),
      testConnection: vi.fn(async () => ({ id: 'broken', model: 'm', ok: false, latencyMs: 0 })),
    };
    const service = createAIService({ provider, client, logger: silentLogger });

    await expect(
      service.generatePreset(ctx, { description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toBeInstanceOf(AIProviderError);

    const [row] = client.db.select().from(sqliteSchema.aiInvocations).all();
    expect(row?.success).toBe(false);
    expect(row?.error).toContain('boom');
  });

  it('respecte le timeout et propage un AIProviderError code=timeout', async () => {
    const provider: AIProvider = {
      id: 'slow',
      model: 'test-model',
      generatePreset: () =>
        new Promise(() => {
          // jamais résolu
        }),
      suggestCompletion: async () => [],
      testConnection: async () => ({ id: 'slow', model: 'm', ok: true, latencyMs: 0 }),
    };
    const service = createAIService({
      provider,
      client,
      logger: silentLogger,
      timeoutMs: 20,
    });

    await expect(
      service.generatePreset(ctx, { description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toMatchObject({ code: 'timeout' });

    const [row] = client.db.select().from(sqliteSchema.aiInvocations).all();
    expect(row?.success).toBe(false);
  });

  it('propage un AIProviderError déjà typé sans le réemballer', async () => {
    const provider: AIProvider = {
      id: 'auth',
      model: 'test-model',
      generatePreset: async () => {
        throw new AIProviderError('unauthorized', 'clé API invalide');
      },
      suggestCompletion: async () => [],
      testConnection: async () => ({ id: 'auth', model: 'm', ok: false, latencyMs: 0 }),
    };
    const service = createAIService({ provider, client, logger: silentLogger });

    await expect(
      service.generatePreset(ctx, { description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toMatchObject({ code: 'unauthorized', message: 'clé API invalide' });
  });
});
