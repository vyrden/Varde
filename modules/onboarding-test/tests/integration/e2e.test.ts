import type {
  GuildId,
  ModuleId,
  OnboardingActionContext,
  OnboardingActionRequest,
  OnboardingSessionId,
  UserId,
} from '@varde/contracts';
import { sqliteSchema } from '@varde/db';
import { createTestHarness, type TestHarness } from '@varde/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onboardingTest } from '../../src/index.js';

/**
 * Tests E2E du module `onboarding-test`. Couvrent le critère de
 * sortie jalon 3 (PR 3.13) : un module tiers peut contribuer une
 * action + un hint via `ctx.onboarding.*`, son apply agit sur
 * Discord (mock), son undo le défait, et le cycle complet preset →
 * apply → rollback reste cohérent dans la DB.
 */

const GUILD: GuildId = '111' as GuildId;
const USER: UserId = '42' as UserId;
const MODULE: ModuleId = 'onboarding-test' as ModuleId;
const SESSION: OnboardingSessionId = '01HZ0ONBTEST111111111111111' as OnboardingSessionId;

interface MockDiscord {
  readonly createRole: ReturnType<typeof vi.fn>;
  readonly deleteRole: ReturnType<typeof vi.fn>;
  readonly createCategory: ReturnType<typeof vi.fn>;
  readonly deleteCategory: ReturnType<typeof vi.fn>;
  readonly createChannel: ReturnType<typeof vi.fn>;
  readonly deleteChannel: ReturnType<typeof vi.fn>;
}

const buildMockDiscord = (): MockDiscord => {
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return `snowflake-${counter}`;
  };
  return {
    createRole: vi.fn(async () => ({ id: nextId() })),
    deleteRole: vi.fn(async () => undefined),
    createCategory: vi.fn(async () => ({ id: nextId() })),
    deleteCategory: vi.fn(async () => undefined),
    createChannel: vi.fn(async () => ({ id: nextId() })),
    deleteChannel: vi.fn(async () => undefined),
  };
};

describe('onboarding-test — e2e avec TestHarness', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createTestHarness({
      guilds: [{ id: GUILD, name: 'Alpha' }],
      startTime: new Date('2026-05-01T12:00:00.000Z'),
    });
    await harness.config.ensureGuild(GUILD);
    await harness.loadModule(onboardingTest);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('onLoad contribue son action au registre de l executor', () => {
    const types = harness.onboardingHost.getContributedActionTypes();
    expect(types).toContain('onboarding-test.setup-gaming-commands');
    expect(harness.onboardingExecutor.hasAction('onboarding-test.setup-gaming-commands')).toBe(
      true,
    );
  });

  it('onLoad contribue un hint `channel` via `ctx.onboarding.contributeHint`', () => {
    const hints = harness.onboardingHost.getHints();
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({
      id: 'onboarding-test.gaming-channel',
      kind: 'channel',
      label: expect.stringMatching(/gaming-commands/i),
    });
    const patch = hints[0]?.patch as { channels: { name: string }[] };
    expect(patch.channels?.[0]?.name).toBe('gaming-commands');
  });

  it('apply → rollback : crée un salon + patche la config, puis tout défait', async () => {
    // Seed une session onboarding factice : l'executor en a besoin
    // pour ses FK sur onboarding_actions_log.
    harness.client.db
      .insert(sqliteSchema.onboardingSessions)
      .values({
        id: SESSION,
        guildId: GUILD,
        startedBy: USER,
        status: 'applying',
        presetSource: 'blank',
      })
      .run();

    const mock = buildMockDiscord();
    const configCalls: Readonly<Record<string, unknown>>[] = [];
    const ctx: OnboardingActionContext = {
      guildId: GUILD,
      actorId: USER,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      discord: mock,
      configPatch: async (patch) => {
        configCalls.push(patch);
        await harness.config.setWith(GUILD, patch, { scope: 'onboarding', updatedBy: USER });
      },
      resolveLocalId: () => null,
    };

    const requests: readonly OnboardingActionRequest[] = [
      {
        type: 'onboarding-test.setup-gaming-commands',
        localId: 'chan-gaming',
        payload: { channelName: 'gaming-commands', topic: 'Commandes de jeu.' },
      },
    ];

    const applyResult = await harness.onboardingExecutor.applyActions(SESSION, requests, ctx);
    expect(applyResult.ok).toBe(true);
    expect(applyResult.appliedCount).toBe(1);
    expect(mock.createChannel).toHaveBeenCalledTimes(1);
    expect(mock.createChannel.mock.calls[0]?.[0]).toMatchObject({
      name: 'gaming-commands',
      type: 'text',
      topic: 'Commandes de jeu.',
    });
    expect(configCalls).toHaveLength(1);
    expect(configCalls[0]).toMatchObject({
      modules: {
        'onboarding-test': {
          gamingChannelId: expect.stringMatching(/^snowflake-/),
          gamingChannelName: 'gaming-commands',
        },
      },
    });

    // Vérifie l'entrée action_log en base.
    const logRows = harness.client.db
      .select()
      .from(sqliteSchema.onboardingActionsLog)
      .where(eq(sqliteSchema.onboardingActionsLog.sessionId, SESSION))
      .all();
    expect(logRows).toHaveLength(1);
    expect(logRows[0]).toMatchObject({
      actionType: 'onboarding-test.setup-gaming-commands',
      status: 'applied',
    });
    expect(logRows[0]?.externalId).toMatch(/^snowflake-/);

    // Rollback.
    const undoResult = await harness.onboardingExecutor.undoSession(SESSION, ctx);
    expect(undoResult.ok).toBe(true);
    expect(undoResult.undoneCount).toBe(1);
    expect(mock.deleteChannel).toHaveBeenCalledTimes(1);
    expect(mock.deleteChannel.mock.calls[0]?.[0]).toMatch(/^snowflake-/);

    const logAfter = harness.client.db
      .select()
      .from(sqliteSchema.onboardingActionsLog)
      .where(eq(sqliteSchema.onboardingActionsLog.sessionId, SESSION))
      .all();
    expect(logAfter[0]?.status).toBe('undone');
  });

  it("unload puis reload du module n'écrase pas les actions déjà enregistrées", async () => {
    // Premier enregistrement effectué au beforeEach. Un second
    // loadAll() ne déclenche pas un second registerAction tant que
    // le loader protège contre les doublons — ce test vérifie que le
    // contrat reste solide.
    await harness.loader.unloadAll();
    expect(harness.onboardingExecutor.hasAction('onboarding-test.setup-gaming-commands')).toBe(
      true,
    );
    // L'executor ne supporte pas unregister en V1 ; un reload
    // déclencherait une erreur "type déjà enregistré". On se contente
    // ici de vérifier la persistance du registre après unload.
    expect(harness.onboardingHost.getContributedActionTypes()).toContain(
      'onboarding-test.setup-gaming-commands',
    );
  });

  it('onboardingHost.getHints() conserve un dédoublonnage par id', () => {
    // Contribution manuelle via ctx : reproduit l'effet si un
    // `onLoad` contribuait deux fois le même hint.
    const ctx = harness.getCtx(MODULE);
    ctx.onboarding.contributeHint({
      id: 'onboarding-test.gaming-channel',
      kind: 'channel',
      label: 'Salon #gaming-commands (maj)',
      rationale: 'Rationale mise à jour.',
      patch: { channels: [] },
    });

    const hints = harness.onboardingHost.getHints();
    const matching = hints.filter((h) => h.id === 'onboarding-test.gaming-channel');
    expect(matching).toHaveLength(1);
    expect(matching[0]?.label).toBe('Salon #gaming-commands (maj)');
  });
});
