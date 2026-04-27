import {
  type AIProvider,
  createAIService,
  generatePresetInputSchema,
  suggestCompletionInputSchema,
} from '@varde/ai';
import {
  type ActionId,
  type AuditService,
  type GuildId,
  type KeystoreService,
  type Logger,
  newUlid,
  type OnboardingActionContext,
  type OnboardingDraft,
  type OnboardingSessionRecord,
  onboardingDraftSchema,
  parseUlid,
  type SchedulerService,
  type Ulid,
  type UserId,
} from '@varde/contracts';
import type { CoreConfigService, OnboardingExecutor } from '@varde/core';
import type { DbClient, DbDriver } from '@varde/db';
import { type PresetDefinition, presetDefinitionSchema } from '@varde/presets';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { buildAiProviderForGuild } from '../ai-provider-builder.js';
import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';
import { emptyDraft, presetToDraft, serializeDraftToActions } from '../onboarding-draft.js';
import {
  findActiveSessionByGuild,
  findCurrentSessionByGuild,
  findSessionById,
  insertSession,
  updateSession,
} from '../onboarding-repo.js';

/**
 * Routes builder d'onboarding (ADR 0007, PR 3.4). Six endpoints qui
 * couvrent le cycle de vie côté dashboard :
 *
 * - `POST /guilds/:guildId/onboarding` — crée une session (draft).
 *   `source: 'blank'` part d'un draft vide, `source: 'preset'` avec
 *   un `presetId` matérialise le preset en draft éditable. 409 si une
 *   session active (`draft | previewing | applying`) existe déjà
 *   pour la guild (R3).
 *
 * - `GET /guilds/:guildId/onboarding/current` — retourne la session
 *   active ou 404. Le dashboard s'en sert pour reprendre un build en
 *   cours au rechargement de la page.
 *
 * - `PATCH /guilds/:guildId/onboarding/:sessionId/draft` — applique
 *   un patch partiel au draft via `deepMerge`. Valide le draft final
 *   contre `onboardingDraftSchema`. Refuse (409) si status autre que
 *   `draft`.
 *
 * - `POST /guilds/:guildId/onboarding/:sessionId/preview` — sérialise
 *   le draft en `OnboardingActionRequest[]` et bascule en
 *   `previewing`. Idempotent : on peut retrigger un preview tant
 *   qu'on n'a pas appliqué.
 *
 * - `POST /guilds/:guildId/onboarding/:sessionId/apply` — appelle
 *   `executor.applyActions`. Succès → status `applied`, `appliedAt`,
 *   `expiresAt = now + rollbackWindowMs`. Échec → status `failed` ;
 *   l'executor a déjà rollbacké les actions déjà appliquées.
 *
 * - `POST /guilds/:guildId/onboarding/:sessionId/rollback` — appelle
 *   `executor.undoSession`. Refusé (409) si status != `applied` ou
 *   si la fenêtre `expiresAt` est dépassée. Succès → `rolled_back`.
 *
 * Toutes les routes exigent MANAGE_GUILD via `requireGuildAdmin`. Le
 * contexte d'action (services Discord concrets + configPatch) est
 * fourni par `actionContextFactory` pour garder les routes
 * agnostiques du bot (tests : mocks ; prod : bridge discord.js).
 */

const DEFAULT_ROLLBACK_WINDOW_MS = 30 * 60 * 1000;

/**
 * Clés du draft qui sont des arrays d'objets additifs. Un patch qui
 * en fournit une concatène au lieu de remplacer — contrairement au
 * `deepMerge` générique de `@varde/core` qui écrase toute valeur
 * non-object. Sans cette distinction, une suggestion IA qui renvoie
 * `{ roles: [newRole] }` effaçait les rôles préexistants du preset.
 *
 * La concaténation filtre les doublons de `localId` : si le patch
 * contient un élément avec un `localId` déjà présent, on garde
 * l'élément patché (il remplace l'ancien).
 */
const ARRAY_KEYS_WITH_LOCAL_ID = new Set(['roles', 'categories', 'channels']);
const ARRAY_KEYS_WITH_MODULE_ID = new Set(['modules']);
const ARRAY_KEYS_UNKEYED = new Set(['permissionBindings']);

const hasLocalId = (item: unknown): item is { readonly localId: string } =>
  typeof item === 'object' &&
  item !== null &&
  typeof (item as { localId?: unknown }).localId === 'string';

const hasModuleId = (item: unknown): item is { readonly moduleId: string } =>
  typeof item === 'object' &&
  item !== null &&
  typeof (item as { moduleId?: unknown }).moduleId === 'string';

const mergeArrayByLocalId = (
  base: readonly unknown[],
  patch: readonly unknown[],
): readonly unknown[] => {
  const patchIds = new Set(patch.filter(hasLocalId).map((item) => item.localId));
  const kept = base.filter((item) => !hasLocalId(item) || !patchIds.has(item.localId));
  return [...kept, ...patch];
};

const mergeArrayByModuleId = (
  base: readonly unknown[],
  patch: readonly unknown[],
): readonly unknown[] => {
  const patchIds = new Set(patch.filter(hasModuleId).map((item) => item.moduleId));
  const kept = base.filter((item) => !hasModuleId(item) || !patchIds.has(item.moduleId));
  return [...kept, ...patch];
};

/**
 * Merger dédié aux patches d'`OnboardingDraft` : concatène les arrays
 * d'objets identifiés (roles, categories, channels par `localId` ;
 * modules par `moduleId` ; permissionBindings concat brut), écrase
 * les scalaires (`locale`). Préserve les objets préexistants non
 * mentionnés dans le patch.
 */
export function mergeOnboardingDraftPatch(
  base: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, next] of Object.entries(patch)) {
    const current = result[key];
    if (Array.isArray(current) && Array.isArray(next)) {
      if (ARRAY_KEYS_WITH_LOCAL_ID.has(key)) {
        result[key] = mergeArrayByLocalId(current, next);
      } else if (ARRAY_KEYS_WITH_MODULE_ID.has(key)) {
        result[key] = mergeArrayByModuleId(current, next);
      } else if (ARRAY_KEYS_UNKEYED.has(key)) {
        result[key] = [...current, ...next];
      } else {
        result[key] = next;
      }
    } else {
      result[key] = next;
    }
  }
  return result;
}

/** Factory d'`OnboardingActionContext` injectée au registre des routes. */
export type OnboardingActionContextFactory = (args: {
  readonly guildId: GuildId;
  readonly actorId: UserId;
}) => OnboardingActionContext;

export interface RegisterOnboardingRoutesOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly discord: DiscordClient;
  readonly executor: OnboardingExecutor;
  readonly actionContextFactory: OnboardingActionContextFactory;
  /** Catalogue des presets disponibles. Omettre désactive `source: 'preset'`. */
  readonly presetCatalog?: readonly PresetDefinition[];
  /** Fenêtre de rollback après apply en ms. Défaut : 30 minutes. */
  readonly rollbackWindowMs?: number;
  /**
   * Services IA optionnels. Requis pour activer la route
   * `POST /onboarding/ai/generate-preset` et le support
   * `source: 'ai'` côté POST /onboarding. Omis = endpoints IA
   * désactivés.
   */
  readonly ai?: {
    readonly config: CoreConfigService;
    readonly keystore: KeystoreService;
    readonly logger: Logger;
    readonly fetchImpl?: typeof globalThis.fetch;
  };
  /**
   * SchedulerService pour l'auto-expiration des sessions appliquées.
   * Fourni : chaque `/apply` réussi planifie un job one-shot à
   * `expiresAt` qui passe la session en `expired` si l'admin n'a ni
   * rollbacké ni confirmé. Omis : pas de transition auto, la session
   * reste en `applied` indéfiniment (fallback utile en tests
   * unitaires qui ne veulent pas bootstrap un scheduler).
   */
  readonly scheduler?: SchedulerService;
  /** Logger pour le handler auto-expire. Requis si `scheduler` est fourni. */
  readonly schedulerLogger?: Logger;
  /**
   * AuditService pour tracer les transitions lifecycle (créée,
   * appliquée, défaite, expirée, échec). Optionnel — omettre désactive
   * silencieusement l'écriture (utile pour les tests). Quand fourni,
   * chaque transition écrit une entrée scope `core` avec actor=user
   * (admin) ou system (auto-expire au boot ou à l'échéance).
   */
  readonly audit?: AuditService;
}

/** Clé de job utilisée pour `scheduler.at` + `scheduler.cancel`. */
export const autoExpireJobKey = (sessionId: string): string => `onboarding.autoExpire:${sessionId}`;

// ─── Types DTO ─────────────────────────────────────────────────────

export interface OnboardingSessionDto {
  readonly id: string;
  readonly guildId: string;
  readonly status: OnboardingSessionRecord['status'];
  readonly presetSource: OnboardingSessionRecord['presetSource'];
  readonly presetId: string | null;
  readonly draft: OnboardingDraft;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly appliedAt: string | null;
  readonly expiresAt: string | null;
}

export interface PreviewDto {
  readonly actions: ReturnType<typeof serializeDraftToActions>;
}

// ─── Helpers ───────────────────────────────────────────────────────

const httpError = (
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Error & { statusCode: number; code: string; details?: unknown } => {
  const err = new Error(message) as Error & {
    statusCode: number;
    code: string;
    details?: unknown;
  };
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
};

const toDto = (record: OnboardingSessionRecord): OnboardingSessionDto => {
  const parsed = onboardingDraftSchema.safeParse(record.draft);
  const draft: OnboardingDraft = parsed.success ? parsed.data : emptyDraft();
  return {
    id: record.id,
    guildId: record.guildId,
    status: record.status,
    presetSource: record.presetSource,
    presetId: record.presetId,
    draft,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    appliedAt: record.appliedAt,
    expiresAt: record.expiresAt,
  };
};

const createBodySchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('blank') }),
  z.object({ source: z.literal('preset'), presetId: z.string().min(1) }),
  z.object({
    source: z.literal('ai'),
    preset: presetDefinitionSchema,
    aiInvocationId: z.string().min(1).max(26).optional(),
  }),
]);

const generatePresetBodySchema = generatePresetInputSchema.extend({
  purpose: z.string().max(128).default('onboarding.generatePreset'),
});

const suggestCompletionBodySchema = suggestCompletionInputSchema.extend({
  purpose: z.string().max(128).default('onboarding.suggestCompletion'),
});

const parseSessionId = (raw: string): Ulid => {
  const parsed = parseUlid(raw);
  if (!parsed) {
    throw httpError(400, 'invalid_session_id', `sessionId "${raw}" n'est pas un ULID valide.`);
  }
  return parsed;
};

const ensureSessionBelongsToGuild = (session: OnboardingSessionRecord, guildId: string): void => {
  if (session.guildId !== guildId) {
    throw httpError(404, 'session_not_found', 'Session inconnue pour cette guild.');
  }
};

const isSessionActive = (status: OnboardingSessionRecord['status']): boolean =>
  status === 'draft' || status === 'previewing' || status === 'applying';

// ─── Enregistrement ────────────────────────────────────────────────

/**
 * Construit le handler de tâche planifiée qui fait expirer une
 * session `applied` dont la fenêtre de rollback vient de s'écouler.
 * Idempotent : re-vérifie le status en base avant de muter pour
 * gérer la race où l'admin a rollbacké entre le schedule et le fire
 * du job. Exporté pour que la passe de réconciliation au boot
 * puisse réenregistrer exactement le même handler avec
 * `scheduler.register(jobKey, handler)`.
 */
export const buildAutoExpireHandler = <D extends DbDriver>(
  client: DbClient<D>,
  sessionId: Ulid,
  logger: Logger,
  audit?: AuditService,
): (() => Promise<void>) => {
  return async () => {
    const row = await findSessionById(client, sessionId);
    if (!row) return;
    if (row.status !== 'applied') return;
    await updateSession(client, sessionId, { status: 'expired' });
    logger.info('session onboarding auto-expirée', { sessionId });
    if (audit) {
      await audit.log({
        guildId: row.guildId,
        action: 'onboarding.session.expired' as ActionId,
        actor: { type: 'system' },
        severity: 'info',
        metadata: {
          sessionId,
          presetId: row.presetId,
          appliedAt: row.appliedAt,
          expiresAt: row.expiresAt,
        },
      });
    }
  };
};

export function registerOnboardingRoutes<D extends DbDriver>(
  app: FastifyInstance,
  options: RegisterOnboardingRoutesOptions<D>,
): void {
  const { client, discord, executor, actionContextFactory, scheduler, schedulerLogger, audit } =
    options;
  const rollbackWindowMs = options.rollbackWindowMs ?? DEFAULT_ROLLBACK_WINDOW_MS;
  const presetById = new Map<string, PresetDefinition>();
  for (const preset of options.presetCatalog ?? []) {
    presetById.set(preset.id, preset);
  }
  if (scheduler !== undefined && schedulerLogger === undefined) {
    throw new Error(
      'registerOnboardingRoutes: `schedulerLogger` requis quand `scheduler` est fourni.',
    );
  }

  // POST /guilds/:guildId/onboarding — création de session
  app.post<{ Params: { guildId: string }; Body: unknown }>(
    '/guilds/:guildId/onboarding',
    async (request, reply) => {
      const { guildId } = request.params;
      const session = await requireGuildAdmin(app, request, guildId, discord);

      const parsed = createBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }

      const existing = await findActiveSessionByGuild(client, guildId as GuildId);
      if (existing) {
        throw httpError(
          409,
          'onboarding_already_active',
          'Une session d onboarding active existe déjà pour cette guild.',
          { sessionId: existing.id, status: existing.status },
        );
      }

      let draft: OnboardingDraft;
      let presetId: string | null = null;
      let aiInvocationId: Ulid | null = null;
      if (parsed.data.source === 'blank') {
        draft = emptyDraft();
      } else if (parsed.data.source === 'preset') {
        const preset = presetById.get(parsed.data.presetId);
        if (!preset) {
          throw httpError(
            404,
            'preset_not_found',
            `Preset "${parsed.data.presetId}" inconnu du catalogue.`,
          );
        }
        draft = presetToDraft(preset);
        presetId = preset.id;
      } else {
        // source === 'ai' : le dashboard nous transmet un preset déjà
        // proposé par l'IA (route /onboarding/ai/generate-preset). On
        // le convertit en draft éditable côté builder, et on trace
        // l'invocation qui l'a produit pour audit.
        draft = presetToDraft(parsed.data.preset);
        presetId = parsed.data.preset.id;
        aiInvocationId = (parsed.data.aiInvocationId ?? null) as Ulid | null;
      }

      const inserted = await insertSession(client, {
        id: newUlid() as Ulid,
        guildId: guildId as GuildId,
        startedBy: session.userId as UserId,
        presetSource: parsed.data.source,
        presetId,
        draft,
        aiInvocationId,
      });
      if (audit) {
        await audit.log({
          guildId: guildId as GuildId,
          action: 'onboarding.session.created' as ActionId,
          actor: { type: 'user', id: session.userId as UserId },
          severity: 'info',
          metadata: {
            sessionId: inserted.id,
            presetSource: parsed.data.source,
            presetId,
            ...(aiInvocationId !== null ? { aiInvocationId } : {}),
          },
        });
      }
      void reply.status(201);
      return toDto(inserted);
    },
  );

  // POST /guilds/:guildId/onboarding/ai/generate-preset — générer
  // une proposition IA via l'AIService. La sortie est un
  // `PresetProposal` (preset + rationale + confidence) accompagné
  // de l'`invocationId` ULID — le dashboard le renvoie en retour
  // dans le body de POST /onboarding { source: 'ai' } pour lier la
  // session à l'invocation (audit / rejeu).
  if (options.ai !== undefined) {
    const aiOptions = options.ai;
    // Plafond serré sur les routes IA : ces endpoints appellent un
    // provider LLM externe (Ollama / OpenAI-compat) qui coûte des
    // tokens et peut être lent. 10 req/min/IP suffit pour un admin
    // qui itère son preset sans laisser un client cassé hammerer
    // l'endpoint.
    const aiRateLimit = { max: 10, timeWindow: '1 minute' };
    app.post<{ Params: { guildId: string }; Body: unknown }>(
      '/guilds/:guildId/onboarding/ai/generate-preset',
      { config: { rateLimit: aiRateLimit } },
      async (request) => {
        const { guildId } = request.params;
        const session = await requireGuildAdmin(app, request, guildId, discord);

        const parsed = generatePresetBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
        }

        let provider: AIProvider;
        try {
          provider = await buildAiProviderForGuild({
            config: aiOptions.config,
            keystore: aiOptions.keystore,
            guildId: guildId as GuildId,
            ...(aiOptions.fetchImpl ? { fetchImpl: aiOptions.fetchImpl } : {}),
          });
        } catch (err) {
          throw httpError(
            502,
            'ai_provider_build_failed',
            err instanceof Error ? err.message : String(err),
          );
        }

        const aiService = createAIService({
          provider,
          client,
          logger: aiOptions.logger,
        });

        const { proposal, invocationId } = await aiService.generatePreset(
          {
            guildId: guildId as GuildId,
            actorId: session.userId as UserId,
            purpose: parsed.data.purpose,
          },
          {
            description: parsed.data.description,
            locale: parsed.data.locale,
            hints: parsed.data.hints,
          },
        );

        return {
          preset: proposal.preset,
          rationale: proposal.rationale,
          confidence: proposal.confidence,
          invocationId,
          provider: { id: provider.id, model: provider.model },
        };
      },
    );

    // POST /guilds/:guildId/onboarding/ai/suggest-completion — demande
    // une ou plusieurs suggestions ciblées sur un `kind` (rôle,
    // catégorie, salon) en se basant sur le draft courant passé en
    // `contextDraft`. Le consommateur applique ensuite la suggestion
    // retenue côté dashboard via un PATCH /draft classique (les
    // suggestions ne mutent jamais l'état elles-mêmes, ADR 0007 R1).
    app.post<{ Params: { guildId: string }; Body: unknown }>(
      '/guilds/:guildId/onboarding/ai/suggest-completion',
      { config: { rateLimit: aiRateLimit } },
      async (request) => {
        const { guildId } = request.params;
        const session = await requireGuildAdmin(app, request, guildId, discord);

        const parsed = suggestCompletionBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
        }

        let provider: AIProvider;
        try {
          provider = await buildAiProviderForGuild({
            config: aiOptions.config,
            keystore: aiOptions.keystore,
            guildId: guildId as GuildId,
            ...(aiOptions.fetchImpl ? { fetchImpl: aiOptions.fetchImpl } : {}),
          });
        } catch (err) {
          throw httpError(
            502,
            'ai_provider_build_failed',
            err instanceof Error ? err.message : String(err),
          );
        }

        const aiService = createAIService({
          provider,
          client,
          logger: aiOptions.logger,
        });

        const { suggestions, invocationId } = await aiService.suggestCompletion(
          {
            guildId: guildId as GuildId,
            actorId: session.userId as UserId,
            purpose: parsed.data.purpose,
          },
          {
            kind: parsed.data.kind,
            contextDraft: parsed.data.contextDraft,
            ...(parsed.data.hint !== undefined ? { hint: parsed.data.hint } : {}),
          },
        );

        return {
          suggestions,
          invocationId,
          provider: { id: provider.id, model: provider.model },
        };
      },
    );
  }

  // GET /guilds/:guildId/onboarding/current — session courante
  // (draft | previewing | applying | applied dans la fenêtre).
  app.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/onboarding/current',
    async (request) => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, discord);

      const session = await findCurrentSessionByGuild(client, guildId as GuildId);
      if (!session) {
        throw httpError(
          404,
          'no_active_session',
          'Aucune session d onboarding active pour cette guild.',
        );
      }
      return toDto(session);
    },
  );

  // PATCH /guilds/:guildId/onboarding/:sessionId/draft — patch draft
  app.patch<{ Params: { guildId: string; sessionId: string }; Body: unknown }>(
    '/guilds/:guildId/onboarding/:sessionId/draft',
    async (request) => {
      const { guildId, sessionId: rawSessionId } = request.params;
      await requireGuildAdmin(app, request, guildId, discord);
      const sessionId = parseSessionId(rawSessionId);

      const session = await findSessionById(client, sessionId);
      if (!session) {
        throw httpError(404, 'session_not_found', 'Session inconnue.');
      }
      ensureSessionBelongsToGuild(session, guildId);
      if (session.status !== 'draft') {
        throw httpError(
          409,
          'session_not_editable',
          `Session en status "${session.status}", patch draft refusé.`,
        );
      }

      const body = (request.body ?? {}) as Readonly<Record<string, unknown>>;
      const merged = mergeOnboardingDraftPatch(session.draft, body);
      const validated = onboardingDraftSchema.safeParse(merged);
      if (!validated.success) {
        throw httpError(
          400,
          'invalid_draft',
          'Le draft résultant ne passe pas la validation.',
          validated.error.issues,
        );
      }

      await updateSession(client, sessionId, { draft: validated.data });
      const fresh = await findSessionById(client, sessionId);
      if (!fresh) {
        throw httpError(500, 'session_vanished', 'Session introuvable après patch.');
      }
      return toDto(fresh);
    },
  );

  // POST /guilds/:guildId/onboarding/:sessionId/preview
  app.post<{ Params: { guildId: string; sessionId: string } }>(
    '/guilds/:guildId/onboarding/:sessionId/preview',
    async (request): Promise<PreviewDto> => {
      const { guildId, sessionId: rawSessionId } = request.params;
      await requireGuildAdmin(app, request, guildId, discord);
      const sessionId = parseSessionId(rawSessionId);

      const session = await findSessionById(client, sessionId);
      if (!session) {
        throw httpError(404, 'session_not_found', 'Session inconnue.');
      }
      ensureSessionBelongsToGuild(session, guildId);
      if (session.status !== 'draft' && session.status !== 'previewing') {
        throw httpError(
          409,
          'session_not_previewable',
          `Preview refusé en status "${session.status}".`,
        );
      }

      const parsed = onboardingDraftSchema.safeParse(session.draft);
      if (!parsed.success) {
        throw httpError(
          422,
          'invalid_draft_state',
          'Le draft stocké ne passe pas la validation.',
          parsed.error.issues,
        );
      }
      const actions = serializeDraftToActions(parsed.data);

      if (session.status !== 'previewing') {
        await updateSession(client, sessionId, { status: 'previewing' });
      }
      return { actions };
    },
  );

  // POST /guilds/:guildId/onboarding/:sessionId/apply
  app.post<{ Params: { guildId: string; sessionId: string } }>(
    '/guilds/:guildId/onboarding/:sessionId/apply',
    async (request) => {
      const { guildId, sessionId: rawSessionId } = request.params;
      const adminSession = await requireGuildAdmin(app, request, guildId, discord);
      const sessionId = parseSessionId(rawSessionId);

      const session = await findSessionById(client, sessionId);
      if (!session) {
        throw httpError(404, 'session_not_found', 'Session inconnue.');
      }
      ensureSessionBelongsToGuild(session, guildId);
      if (!isSessionActive(session.status)) {
        throw httpError(
          409,
          'session_not_applicable',
          `Apply refusé en status "${session.status}".`,
        );
      }

      const parsed = onboardingDraftSchema.safeParse(session.draft);
      if (!parsed.success) {
        throw httpError(
          422,
          'invalid_draft_state',
          'Le draft stocké ne passe pas la validation.',
          parsed.error.issues,
        );
      }
      const actions = serializeDraftToActions(parsed.data);

      await updateSession(client, sessionId, { status: 'applying' });

      const ctx = actionContextFactory({
        guildId: guildId as GuildId,
        actorId: adminSession.userId as UserId,
      });
      const result = await executor.applyActions(
        sessionId as Ulid & { readonly __onboardingSessionId: true },
        actions,
        ctx,
      );

      if (result.ok) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + rollbackWindowMs);
        await updateSession(client, sessionId, {
          status: 'applied',
          appliedAt: now,
          expiresAt,
        });
        if (scheduler && schedulerLogger) {
          const handler = buildAutoExpireHandler(client, sessionId, schedulerLogger, audit);
          await scheduler.at(expiresAt, autoExpireJobKey(sessionId), handler);
        }
        if (audit) {
          await audit.log({
            guildId: guildId as GuildId,
            action: 'onboarding.session.applied' as ActionId,
            actor: { type: 'user', id: adminSession.userId as UserId },
            severity: 'info',
            metadata: {
              sessionId,
              presetId: session.presetId,
              appliedCount: result.appliedCount,
              expiresAt: expiresAt.toISOString(),
            },
          });
        }
      } else {
        await updateSession(client, sessionId, { status: 'failed' });
        if (audit) {
          await audit.log({
            guildId: guildId as GuildId,
            action: 'onboarding.session.apply_failed' as ActionId,
            actor: { type: 'user', id: adminSession.userId as UserId },
            severity: 'error',
            metadata: {
              sessionId,
              presetId: session.presetId,
              appliedCount: result.appliedCount,
              ...(result.failedAt !== undefined ? { failedAt: result.failedAt } : {}),
              ...(result.error !== undefined ? { error: result.error } : {}),
            },
          });
        }
      }

      return {
        ok: result.ok,
        appliedCount: result.appliedCount,
        externalIds: result.externalIds,
        ...(result.failedAt !== undefined ? { failedAt: result.failedAt } : {}),
        ...(result.error !== undefined ? { error: result.error } : {}),
      };
    },
  );

  // POST /guilds/:guildId/onboarding/:sessionId/rollback
  app.post<{ Params: { guildId: string; sessionId: string } }>(
    '/guilds/:guildId/onboarding/:sessionId/rollback',
    async (request) => {
      const { guildId, sessionId: rawSessionId } = request.params;
      const adminSession = await requireGuildAdmin(app, request, guildId, discord);
      const sessionId = parseSessionId(rawSessionId);

      const session = await findSessionById(client, sessionId);
      if (!session) {
        throw httpError(404, 'session_not_found', 'Session inconnue.');
      }
      ensureSessionBelongsToGuild(session, guildId);
      if (session.status !== 'applied') {
        throw httpError(
          409,
          'session_not_rollbackable',
          `Rollback refusé en status "${session.status}".`,
        );
      }
      const expiresAt = session.expiresAt ? Date.parse(session.expiresAt) : 0;
      if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
        await updateSession(client, sessionId, { status: 'expired' });
        throw httpError(
          409,
          'rollback_window_expired',
          'Fenêtre de rollback dépassée, session gelée.',
        );
      }

      const ctx = actionContextFactory({
        guildId: guildId as GuildId,
        actorId: adminSession.userId as UserId,
      });
      const result = await executor.undoSession(
        sessionId as Ulid & { readonly __onboardingSessionId: true },
        ctx,
      );

      if (result.ok) {
        await updateSession(client, sessionId, { status: 'rolled_back' });
        if (scheduler) {
          await scheduler.cancel(autoExpireJobKey(sessionId));
        }
        if (audit) {
          await audit.log({
            guildId: guildId as GuildId,
            action: 'onboarding.session.rolled_back' as ActionId,
            actor: { type: 'user', id: adminSession.userId as UserId },
            severity: 'info',
            metadata: {
              sessionId,
              presetId: session.presetId,
              undoneCount: result.undoneCount,
              skippedCount: result.skippedCount,
            },
          });
        }
      } else if (audit) {
        // Échec : on ne mute PAS le status (l'admin peut retry — la
        // session reste `applied` jusqu'à expiration). On trace
        // l'échec pour visibilité opérateur.
        await audit.log({
          guildId: guildId as GuildId,
          action: 'onboarding.session.rollback_failed' as ActionId,
          actor: { type: 'user', id: adminSession.userId as UserId },
          severity: 'error',
          metadata: {
            sessionId,
            presetId: session.presetId,
            undoneCount: result.undoneCount,
            skippedCount: result.skippedCount,
            ...(result.error !== undefined ? { error: result.error } : {}),
          },
        });
      }

      return {
        ok: result.ok,
        undoneCount: result.undoneCount,
        skippedCount: result.skippedCount,
        ...(result.error !== undefined ? { error: result.error } : {}),
      };
    },
  );
}
