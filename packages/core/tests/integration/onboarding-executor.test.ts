import type {
  GuildId,
  OnboardingActionContext,
  OnboardingActionDefinition,
  OnboardingActionRequest,
  OnboardingSessionId,
  UserId,
} from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createLogger } from '../../src/logger.js';
import { createOnboardingExecutor } from '../../src/onboarding/executor.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

/**
 * Fabrique un contexte d'action mocké. Les méthodes `discord.*`
 * peuvent être remplacées au besoin par le test pour simuler des
 * succès / échecs.
 */
interface MockCalls {
  createRole: unknown[];
  deleteRole: unknown[];
  createCategory: unknown[];
  deleteCategory: unknown[];
  createChannel: unknown[];
  deleteChannel: unknown[];
  configPatch: unknown[];
}

const makeContext = (
  overrides: Partial<OnboardingActionContext['discord']> = {},
): { ctx: OnboardingActionContext; calls: MockCalls } => {
  const calls: MockCalls = {
    createRole: [],
    deleteRole: [],
    createCategory: [],
    deleteCategory: [],
    createChannel: [],
    deleteChannel: [],
    configPatch: [],
  };
  const ctx: OnboardingActionContext = {
    guildId: '111' as GuildId,
    actorId: '42' as UserId,
    logger: silentLogger(),
    discord: {
      createRole: overrides.createRole
        ? overrides.createRole
        : async (p) => {
            calls.createRole.push(p);
            return { id: `role-${calls.createRole.length}` };
          },
      deleteRole: overrides.deleteRole
        ? overrides.deleteRole
        : async (id) => {
            calls.deleteRole.push(id);
          },
      createCategory: overrides.createCategory
        ? overrides.createCategory
        : async (p) => {
            calls.createCategory.push(p);
            return { id: `cat-${calls.createCategory.length}` };
          },
      deleteCategory: overrides.deleteCategory
        ? overrides.deleteCategory
        : async (id) => {
            calls.deleteCategory.push(id);
          },
      createChannel: overrides.createChannel
        ? overrides.createChannel
        : async (p) => {
            calls.createChannel.push(p);
            return { id: `chan-${calls.createChannel.length}` };
          },
      deleteChannel: overrides.deleteChannel
        ? overrides.deleteChannel
        : async (id) => {
            calls.deleteChannel.push(id);
          },
    },
    configPatch: async (patch) => {
      calls.configPatch.push(patch);
    },
  };
  return { ctx, calls };
};

const makeTestAction = <P, R>(
  overrides: Partial<OnboardingActionDefinition<P, R>> & {
    type: string;
    apply: OnboardingActionDefinition<P, R>['apply'];
    undo: OnboardingActionDefinition<P, R>['undo'];
    canUndo: OnboardingActionDefinition<P, R>['canUndo'];
  },
): OnboardingActionDefinition<P, R> => ({
  schema: z.record(z.string(), z.unknown()) as unknown as z.ZodType<P>,
  ...overrides,
});

const SESSION: OnboardingSessionId = '01HZ0ONBTEST000000000000001' as OnboardingSessionId;

describe('OnboardingExecutor — registry', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('refuse une définition sans undo', () => {
    const exec = createOnboardingExecutor({ client, logger: silentLogger() });
    expect(() =>
      exec.registerAction({
        type: 'bad.no-undo',
        schema: z.record(z.string(), z.unknown()),
        apply: async () => ({}),
        canUndo: true,
        // biome-ignore lint/suspicious/noExplicitAny: test d intention
      } as any),
    ).toThrow(/sans undo/);
  });

  it('refuse une définition sans canUndo', () => {
    const exec = createOnboardingExecutor({ client, logger: silentLogger() });
    expect(() =>
      exec.registerAction({
        type: 'bad.no-canundo',
        schema: z.record(z.string(), z.unknown()),
        apply: async () => ({}),
        undo: async () => undefined,
        // biome-ignore lint/suspicious/noExplicitAny: test d intention
      } as any),
    ).toThrow(/canUndo/);
  });

  it('refuse un doublon de type', () => {
    const exec = createOnboardingExecutor({ client, logger: silentLogger() });
    const def = makeTestAction({
      type: 'dup',
      apply: async () => ({}),
      undo: async () => undefined,
      canUndo: true,
    });
    exec.registerAction(def);
    expect(() => exec.registerAction(def)).toThrow(/déjà enregistré/);
  });
});

describe('OnboardingExecutor — applyActions nominal', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    // Seed guild + session.
    client.db.insert(sqliteSchema.guilds).values({ id: '111', name: 'Test' }).run();
    client.db
      .insert(sqliteSchema.onboardingSessions)
      .values({
        id: SESSION,
        guildId: '111',
        startedBy: '42',
        status: 'applying',
        presetSource: 'blank',
      })
      .run();
  });

  afterEach(async () => {
    await client.close();
  });

  it('applique une séquence de 3 actions en ordre et enregistre les externalIds', async () => {
    const exec = createOnboardingExecutor({
      client,
      logger: silentLogger(),
      delayBetweenActionsMs: 0,
    });
    let counter = 0;
    const action = makeTestAction({
      type: 'test.create',
      apply: async (_c, _p) => {
        counter += 1;
        return { id: `ext-${counter}` };
      },
      undo: async () => undefined,
      canUndo: true,
    });
    exec.registerAction(action);

    const { ctx } = makeContext();
    const requests: OnboardingActionRequest[] = [
      { type: 'test.create', payload: {} },
      { type: 'test.create', payload: {} },
      { type: 'test.create', payload: {} },
    ];

    const result = await exec.applyActions(SESSION, requests, ctx);
    expect(result.ok).toBe(true);
    expect(result.appliedCount).toBe(3);
    expect(result.externalIds).toEqual(['ext-1', 'ext-2', 'ext-3']);

    const rows = client.db.select().from(sqliteSchema.onboardingActionsLog).all();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe('applied');
      expect(row.appliedAt).not.toBeNull();
    }
  });

  it('respecte un délai entre actions (configurable)', async () => {
    const exec = createOnboardingExecutor({
      client,
      logger: silentLogger(),
      delayBetweenActionsMs: 25,
    });
    const action = makeTestAction({
      type: 'test.slow',
      apply: async () => ({ id: 'x' }),
      undo: async () => undefined,
      canUndo: true,
    });
    exec.registerAction(action);

    const { ctx } = makeContext();
    const requests: OnboardingActionRequest[] = [
      { type: 'test.slow', payload: {} },
      { type: 'test.slow', payload: {} },
      { type: 'test.slow', payload: {} },
    ];
    const start = Date.now();
    await exec.applyActions(SESSION, requests, ctx);
    const elapsed = Date.now() - start;
    // 2 délais de 25 ms entre 3 actions => au moins ~50 ms.
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('refuse un payload qui ne passe pas le schema (aucune écriture Discord)', async () => {
    const exec = createOnboardingExecutor({
      client,
      logger: silentLogger(),
      delayBetweenActionsMs: 0,
    });
    const applyMock = vi.fn().mockResolvedValue({ id: 'x' });
    const action = makeTestAction({
      type: 'test.strict',
      schema: z.object({ required: z.string() }) as unknown as z.ZodType<{ required: string }>,
      apply: applyMock,
      undo: async () => undefined,
      canUndo: true,
    });
    exec.registerAction(action);

    const { ctx } = makeContext();
    await expect(
      exec.applyActions(SESSION, [{ type: 'test.strict', payload: {} }], ctx),
    ).rejects.toThrow(/payload invalide/);
    expect(applyMock).not.toHaveBeenCalled();
    const rows = client.db.select().from(sqliteSchema.onboardingActionsLog).all();
    expect(rows).toHaveLength(0);
  });
});

describe('OnboardingExecutor — rollback auto sur échec', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    client.db.insert(sqliteSchema.guilds).values({ id: '111', name: 'Test' }).run();
    client.db
      .insert(sqliteSchema.onboardingSessions)
      .values({
        id: SESSION,
        guildId: '111',
        startedBy: '42',
        status: 'applying',
        presetSource: 'blank',
      })
      .run();
  });

  afterEach(async () => {
    await client.close();
  });

  it('undo auto les actions déjà appliquées quand la 3e échoue', async () => {
    const exec = createOnboardingExecutor({
      client,
      logger: silentLogger(),
      delayBetweenActionsMs: 0,
    });
    const undoCalls: string[] = [];
    let applyCount = 0;
    const action = makeTestAction<Record<string, unknown>, { id: string }>({
      type: 'test.flaky',
      apply: async () => {
        applyCount += 1;
        if (applyCount === 3) throw new Error('boom');
        return { id: `ext-${applyCount}` };
      },
      undo: async (_ctx, _payload, result) => {
        undoCalls.push(result.id);
      },
      canUndo: true,
    });
    exec.registerAction(action);

    const { ctx } = makeContext();
    const result = await exec.applyActions(
      SESSION,
      [
        { type: 'test.flaky', payload: {} },
        { type: 'test.flaky', payload: {} },
        { type: 'test.flaky', payload: {} },
      ],
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.failedAt).toBe(2);
    expect(result.error).toMatch(/boom/);

    // Undo en ordre inverse des `applied`.
    expect(undoCalls).toEqual(['ext-2', 'ext-1']);

    const rows = client.db
      .select()
      .from(sqliteSchema.onboardingActionsLog)
      .orderBy(sqliteSchema.onboardingActionsLog.sequence)
      .all();
    expect(rows[0]?.status).toBe('undone');
    expect(rows[1]?.status).toBe('undone');
    expect(rows[2]?.status).toBe('failed');
    expect(rows[2]?.error).toMatch(/boom/);
  });

  it('ne tente pas d undo une action dont canUndo=false', async () => {
    const exec = createOnboardingExecutor({
      client,
      logger: silentLogger(),
      delayBetweenActionsMs: 0,
    });
    const undoCalls: string[] = [];
    const actionUndoable = makeTestAction({
      type: 'test.undoable',
      apply: async () => ({ id: 'A' }),
      undo: async (_c, _p, r) => {
        undoCalls.push(r.id);
      },
      canUndo: true,
    });
    const actionNotUndoable = makeTestAction({
      type: 'test.not-undoable',
      apply: async () => ({ id: 'B' }),
      undo: async () => undefined,
      canUndo: false,
    });
    let step = 0;
    const actionBoom = makeTestAction({
      type: 'test.boom',
      apply: async () => {
        step += 1;
        throw new Error('fail');
      },
      undo: async () => undefined,
      canUndo: true,
    });
    exec.registerAction(actionUndoable);
    exec.registerAction(actionNotUndoable);
    exec.registerAction(actionBoom);

    const { ctx } = makeContext();
    await exec.applyActions(
      SESSION,
      [
        { type: 'test.undoable', payload: {} },
        { type: 'test.not-undoable', payload: {} },
        { type: 'test.boom', payload: {} },
      ],
      ctx,
    );

    // Seule l'action undoable a été défaite (2 retournée en DESC,
    // mais canUndo=false donc skippée).
    expect(undoCalls).toEqual(['A']);
    expect(step).toBe(1);
  });
});

describe('OnboardingExecutor — undoSession idempotence', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    client.db.insert(sqliteSchema.guilds).values({ id: '111', name: 'Test' }).run();
    client.db
      .insert(sqliteSchema.onboardingSessions)
      .values({
        id: SESSION,
        guildId: '111',
        startedBy: '42',
        status: 'applied',
        presetSource: 'blank',
      })
      .run();
  });

  afterEach(async () => {
    await client.close();
  });

  it('undoSession défait toutes les actions applied, relancer = no-op', async () => {
    const exec = createOnboardingExecutor({
      client,
      logger: silentLogger(),
      delayBetweenActionsMs: 0,
    });
    const undoCalls: string[] = [];
    const action = makeTestAction({
      type: 'test.undoable',
      apply: async () => ({ id: Math.random().toString(36).slice(2) }),
      undo: async (_c, _p, r) => {
        undoCalls.push(r.id);
      },
      canUndo: true,
    });
    exec.registerAction(action);

    const { ctx } = makeContext();
    await exec.applyActions(
      SESSION,
      [
        { type: 'test.undoable', payload: {} },
        { type: 'test.undoable', payload: {} },
      ],
      ctx,
    );

    const first = await exec.undoSession(SESSION, ctx);
    expect(first.ok).toBe(true);
    expect(first.undoneCount).toBe(2);

    const undoCallsBefore = [...undoCalls];
    const second = await exec.undoSession(SESSION, ctx);
    expect(second.ok).toBe(true);
    expect(second.undoneCount).toBe(0); // rien de plus à défaire
    // Aucun `undo` supplémentaire n'a été appelé.
    expect(undoCalls).toEqual(undoCallsBefore);
  });
});
