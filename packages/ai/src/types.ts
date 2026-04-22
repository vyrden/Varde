import type { GuildId, UserId } from '@varde/contracts';
import type { PresetDefinition } from '@varde/presets';
import { z } from 'zod';

/**
 * Contrat `AIProvider` (ADR 0007). Surface publique qu'implémentent
 * tous les providers brancheables par l'admin :
 *
 * - `createStubProvider()` — déterministe, zéro réseau. Utilisé en
 *   tests partout et en runtime quand aucun provider n'est configuré
 *   (CLAUDE.md §13 : pas de default cloud).
 * - `createOllamaProvider()` — PR 3.7.
 * - `createOpenAICompatibleProvider()` — PR 3.8, couvre OpenAI
 *   officiel + OpenRouter + Groq + vLLM + LocalAI + LM Studio.
 *
 * Le contrat reste pauvre volontairement : deux opérations
 * applicatives (`generatePreset`, `suggestCompletion`) + une check
 * de santé (`testConnection`). Les adapters s'occupent du
 * templating prompt, du parsing, des retries — l'appelant ne voit
 * que des shapes applicatives.
 *
 * Toutes les sorties sont Zod-validées par l'adapter avant de
 * remonter au service. Une sortie invalide = un `AIProviderError`
 * `invalid_response` typé.
 */

// ─── Entrée / sortie : generatePreset ─────────────────────────────

export const generatePresetInputSchema = z.object({
  description: z.string().min(1).max(2000).describe('description libre de la commu par l admin'),
  locale: z.enum(['fr', 'en']).default('fr'),
  hints: z.array(z.string().min(1).max(64)).default([]).describe('tags indicatifs (tech, gaming…)'),
});
export type GeneratePresetInput = z.infer<typeof generatePresetInputSchema>;

/**
 * Proposition d'un preset par l'IA. `preset` reste un
 * `PresetDefinition` standard — le provider est responsable de le
 * produire cohérent, le service le revalide via `validatePreset`
 * avant de le retourner.
 */
export interface PresetProposal {
  readonly preset: PresetDefinition;
  readonly rationale: string;
  /** Confiance 0..1, indicative — le stub renvoie 1 pour un match exact, 0.3 pour fallback. */
  readonly confidence: number;
}

// ─── Entrée / sortie : suggestCompletion ──────────────────────────

export const suggestCompletionInputSchema = z.object({
  kind: z.enum(['role', 'category', 'channel']),
  /** Le draft en cours au moment de la suggestion (forme libre). */
  contextDraft: z.record(z.string(), z.unknown()),
  /** Indice texte libre donné par l'admin ("un rôle pour modérer les noobs"). */
  hint: z.string().max(512).optional(),
});
export type SuggestCompletionInput = z.infer<typeof suggestCompletionInputSchema>;

/**
 * Suggestion renvoyée par le provider. `patch` est appliqué par le
 * consommateur via un PATCH /draft — l'AI ne mute jamais d'état
 * directement. `label` est le libellé affichable dans l'UI.
 */
export interface Suggestion {
  readonly label: string;
  readonly patch: Readonly<Record<string, unknown>>;
  readonly rationale: string;
}

// ─── Santé du provider ────────────────────────────────────────────

export interface ProviderInfo {
  readonly id: string;
  readonly model: string;
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly details?: string;
}

// ─── Contrat ──────────────────────────────────────────────────────

export interface AIProvider {
  /** Slug court : 'stub', 'ollama', 'openai-compat', … */
  readonly id: string;
  /** Modèle courant utilisé (ex. `llama3.1:8b`, `gpt-4o-mini`). Stable par instance. */
  readonly model: string;
  readonly generatePreset: (input: GeneratePresetInput) => Promise<PresetProposal>;
  readonly suggestCompletion: (input: SuggestCompletionInput) => Promise<readonly Suggestion[]>;
  readonly testConnection: () => Promise<ProviderInfo>;
}

// ─── Erreurs typées ───────────────────────────────────────────────

export type AIProviderErrorCode =
  | 'timeout'
  | 'unavailable'
  | 'invalid_response'
  | 'quota_exceeded'
  | 'unauthorized'
  | 'unknown';

/**
 * Erreur remontée par un `AIService` ou un adapter. `cause` garde
 * la trace de l'erreur sous-jacente (HTTP, JSON, Zod). Le
 * consommateur teste sur `code` pour adapter son message UI.
 */
export class AIProviderError extends Error {
  constructor(
    readonly code: AIProviderErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

// ─── Traçabilité : input minimal du wrapper ───────────────────────

/**
 * Contexte appelant passé au `AIService`. Le service enrichit avec
 * provider, model, promptHash, tokens, coût, succès/erreur — puis
 * insère une ligne `ai_invocations` (ADR 0007 R4/R5).
 */
export interface AIInvocationContext {
  readonly guildId: GuildId;
  readonly actorId: UserId;
  /**
   * Purpose applicatif (ex. `onboarding.generatePreset`,
   * `onboarding.suggestRole`). Utilisé pour rate-limit per-user
   * per-purpose post-V1 et pour filtrer les dashboards d'usage.
   */
  readonly purpose: string;
}
