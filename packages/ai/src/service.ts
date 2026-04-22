import { createHash } from 'node:crypto';

import { type Logger, newUlid, type Ulid } from '@varde/contracts';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema, toCanonicalDate } from '@varde/db';

import {
  type AIInvocationContext,
  type AIProvider,
  AIProviderError,
  type AIProviderErrorCode,
  type GeneratePresetInput,
  generatePresetInputSchema,
  type PresetProposal,
  type ProviderInfo,
  type SuggestCompletionInput,
  type Suggestion,
  suggestCompletionInputSchema,
} from './types.js';

/**
 * `AIService` : wrapper stateful autour d'un `AIProvider` qui
 *
 * 1. valide les entrées via Zod (garde un contrat strict entre la
 *    route HTTP et l'adapter, même si l'adapter fait confiance à
 *    son input),
 * 2. applique un timeout global (défaut 30s, overridable). Choisi
 *    pour englober les 20s de l'adapter OpenAI-compat tout en
 *    laissant de la marge aux modèles cloud lents (gpt-4, Claude
 *    Opus…). Le stub et Ollama local terminent en dizaines de ms.
 * 3. logge chaque invocation dans `ai_invocations` — succès comme
 *    échec — avec un hash SHA-256 de l'input (le prompt brut n'est
 *    jamais stocké, seul son hash l'est ; ADR 0007 / R5),
 * 4. relaie les erreurs sous forme d'`AIProviderError` typée.
 *
 * Le service NE fait PAS :
 * - rate limiting per-user (post-V1, V1 gère côté route avec audit).
 * - quota journalier (post-V1, à lire directement sur `ai_invocations`).
 * - retries avec backoff (responsabilité de l'adapter qui sait si
 *   l'erreur est transitoire).
 *
 * L'idée est que le service reste un exécuteur fin, transparent,
 * qui capture ce qui doit l'être (audit + tokens) sans s'interposer
 * dans la logique métier de l'adapter.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PROMPT_VERSION = 'v1';

export interface CreateAIServiceOptions<D extends DbDriver> {
  readonly provider: AIProvider;
  readonly client: DbClient<D>;
  readonly logger: Logger;
  readonly timeoutMs?: number;
  /**
   * Version de template de prompt stamped dans chaque ligne
   * `ai_invocations`. Les adapters peuvent bumper via leurs propres
   * call sites ; le service en V1 propage celle reçue en option.
   */
  readonly promptVersion?: string;
}

/**
 * Résultat d'une invocation IA tracée. `invocationId` correspond à
 * la ligne `ai_invocations` écrite par le service — utile pour la
 * liaison avec une session d'onboarding (`onboarding_sessions.ai_invocation_id`).
 */
export interface TracedPresetProposal {
  readonly proposal: PresetProposal;
  readonly invocationId: Ulid;
}

export interface TracedSuggestions {
  readonly suggestions: readonly Suggestion[];
  readonly invocationId: Ulid;
}

export interface AIService {
  readonly generatePreset: (
    ctx: AIInvocationContext,
    input: GeneratePresetInput,
  ) => Promise<TracedPresetProposal>;
  readonly suggestCompletion: (
    ctx: AIInvocationContext,
    input: SuggestCompletionInput,
  ) => Promise<TracedSuggestions>;
  readonly testConnection: () => Promise<ProviderInfo>;
}

// ─── Utils ────────────────────────────────────────────────────────

const hashInput = (input: unknown): string =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex');

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AIProviderError('timeout', `${label} a dépassé le timeout de ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const toProviderError = (err: unknown, fallbackCode: AIProviderErrorCode): AIProviderError => {
  if (err instanceof AIProviderError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new AIProviderError(fallbackCode, message, err);
};

// ─── Insert ai_invocations ───────────────────────────────────────

interface InvocationRow {
  readonly id: Ulid;
  readonly guildId: string;
  readonly actorId: string;
  readonly purpose: string;
  readonly provider: string;
  readonly model: string;
  readonly promptHash: string;
  readonly promptVersion: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costEstimate: string;
  readonly success: boolean;
  readonly error: string | null;
}

const insertInvocation = async <D extends DbDriver>(
  client: DbClient<D>,
  row: InvocationRow,
): Promise<void> => {
  const now = new Date();
  if (client.driver === 'pg') {
    const { aiInvocations } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db.insert(aiInvocations).values({
      id: row.id,
      guildId: row.guildId,
      actorId: row.actorId,
      purpose: row.purpose,
      provider: row.provider,
      model: row.model,
      promptHash: row.promptHash,
      promptVersion: row.promptVersion,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      costEstimate: row.costEstimate,
      success: row.success,
      error: row.error,
      createdAt: now,
    });
    return;
  }
  const { aiInvocations } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  sqlite.db
    .insert(aiInvocations)
    .values({
      id: row.id,
      guildId: row.guildId,
      actorId: row.actorId,
      purpose: row.purpose,
      provider: row.provider,
      model: row.model,
      promptHash: row.promptHash,
      promptVersion: row.promptVersion,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      costEstimate: row.costEstimate,
      success: row.success,
      error: row.error,
      createdAt: toCanonicalDate(now),
    })
    .run();
};

// ─── Service ─────────────────────────────────────────────────────

export function createAIService<D extends DbDriver>(options: CreateAIServiceOptions<D>): AIService {
  const { client, provider, logger } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const promptVersion = options.promptVersion ?? DEFAULT_PROMPT_VERSION;
  const log = logger.child({ component: 'ai.service', provider: provider.id });

  const runAndLog = async <R>(
    ctx: AIInvocationContext,
    input: unknown,
    label: string,
    work: () => Promise<R>,
  ): Promise<{ readonly result: R; readonly invocationId: Ulid }> => {
    const id = newUlid() as Ulid;
    const promptHash = hashInput(input);
    try {
      const result = await withTimeout(work(), timeoutMs, label);
      await insertInvocation(client, {
        id,
        guildId: ctx.guildId,
        actorId: ctx.actorId,
        purpose: ctx.purpose,
        provider: provider.id,
        model: provider.model,
        promptHash,
        promptVersion,
        inputTokens: 0,
        outputTokens: 0,
        costEstimate: '0',
        success: true,
        error: null,
      });
      return { result, invocationId: id };
    } catch (err) {
      const typed = toProviderError(err, 'unknown');
      log.warn('invocation IA en échec', {
        purpose: ctx.purpose,
        code: typed.code,
        message: typed.message,
      });
      // On tente toujours d'écrire la ligne d'échec. Si la DB
      // elle-même est indisponible, on laisse remonter l'erreur
      // initiale — l'audit DB est un nice-to-have ici, pas un
      // blocker du chemin critique.
      try {
        await insertInvocation(client, {
          id,
          guildId: ctx.guildId,
          actorId: ctx.actorId,
          purpose: ctx.purpose,
          provider: provider.id,
          model: provider.model,
          promptHash,
          promptVersion,
          inputTokens: 0,
          outputTokens: 0,
          costEstimate: '0',
          success: false,
          error: typed.message,
        });
      } catch (dbErr) {
        log.warn('écriture ai_invocations échec', {
          purpose: ctx.purpose,
          dbError: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }
      throw typed;
    }
  };

  return {
    async generatePreset(ctx, input) {
      const parsed = generatePresetInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new AIProviderError(
          'invalid_response',
          `Input generatePreset invalide — ${parsed.error.issues[0]?.message ?? 'raison inconnue'}`,
          parsed.error,
        );
      }
      const { result, invocationId } = await runAndLog(ctx, parsed.data, 'generatePreset', () =>
        provider.generatePreset(parsed.data),
      );
      return { proposal: result, invocationId };
    },

    async suggestCompletion(ctx, input) {
      const parsed = suggestCompletionInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new AIProviderError(
          'invalid_response',
          `Input suggestCompletion invalide — ${parsed.error.issues[0]?.message ?? 'raison inconnue'}`,
          parsed.error,
        );
      }
      const { result, invocationId } = await runAndLog(ctx, parsed.data, 'suggestCompletion', () =>
        provider.suggestCompletion(parsed.data),
      );
      return { suggestions: result, invocationId };
    },

    async testConnection() {
      return provider.testConnection();
    },
  };
}
