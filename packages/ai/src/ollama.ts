import { presetDefinitionSchema } from '@varde/presets';
import { z } from 'zod';

import {
  buildGeneratePresetPrompt,
  buildSuggestCompletionPrompt,
  type PromptPair,
} from './prompts.js';
import {
  type AIProvider,
  AIProviderError,
  type GeneratePresetInput,
  type PresetProposal,
  type ProviderInfo,
  type SuggestCompletionInput,
  type Suggestion,
} from './types.js';

/**
 * Adapter Ollama (ADR 0007, PR 3.7). Parle à une instance locale
 * (ou self-hosted) via `{endpoint}/api/chat` en mode non-streaming.
 * Options minimales : `endpoint`, `model`, un `fetch` injectable
 * (tests) et un timeout optionnel appliqué via `AbortController`.
 *
 * Flow nominal :
 * 1. `buildGeneratePresetPrompt(input)` → prompt versionné.
 * 2. POST `/api/chat` avec `format: 'json'` pour forcer une sortie
 *    parseable.
 * 3. Parse `response.message.content` en JSON puis Zod-valide.
 * 4. Si parse/validation échoue, retry une fois avec un rappel de
 *    format ("réponds STRICTEMENT en JSON valide"). Au-delà,
 *    remonte `AIProviderError('invalid_response')`.
 *
 * Erreurs HTTP :
 * - Connection refused / fetch thrown → `unavailable`.
 * - 404 → `unavailable` + hint "modèle introuvable".
 * - 401 / 403 → `unauthorized`.
 * - autres 4xx/5xx → `unavailable`.
 * - AbortError (timeout) → `timeout`.
 *
 * Le retry ne s'applique qu'aux erreurs de parsing/validation. Les
 * erreurs réseau ne sont pas retentées ici : le service au-dessus
 * peut décider (et logger chaque tentative).
 */

// ─── Options ───────────────────────────────────────────────────────

export interface CreateOllamaProviderOptions {
  /** URL base (pas de trailing slash). Ex : `http://localhost:11434`. */
  readonly endpoint: string;
  /** Nom de modèle côté Ollama. Ex : `llama3.1:8b`, `qwen2.5:7b`. */
  readonly model: string;
  /** Fetch injectable pour les tests. Défaut : `globalThis.fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /** Timeout par requête HTTP en ms. Défaut : 20_000 (Ollama peut être lent). */
  readonly requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

// ─── Shapes wire ───────────────────────────────────────────────────

const ollamaChatResponseSchema = z.object({
  model: z.string(),
  message: z.object({
    role: z.string(),
    content: z.string(),
  }),
  done: z.boolean().optional(),
});

const ollamaTagsResponseSchema = z.object({
  models: z
    .array(
      z.object({
        name: z.string(),
        model: z.string().optional(),
      }),
    )
    .default([]),
});

// ─── Schémas applicatifs attendus ──────────────────────────────────

const presetProposalResponseSchema = z.object({
  preset: presetDefinitionSchema,
  rationale: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1).default(0.5),
});

const suggestionItemSchema = z.object({
  label: z.string().min(1).max(200),
  patch: z.record(z.string(), z.unknown()),
  rationale: z.string().min(1).max(500),
});

/**
 * Accepte array direct ou object wrapper (`suggestions`, `completions`,
 * `items`) — cohérent avec le parser OpenAI-compat. Voir
 * `openai-compat.ts` pour l'explication détaillée.
 */
const suggestionArrayResponseSchema = z
  .union([
    z.array(suggestionItemSchema).min(1).max(5),
    z
      .object({ suggestions: z.array(suggestionItemSchema).min(1).max(5) })
      .transform((o) => o.suggestions),
    z
      .object({ completions: z.array(suggestionItemSchema).min(1).max(5) })
      .transform((o) => o.completions),
    z.object({ items: z.array(suggestionItemSchema).min(1).max(5) }).transform((o) => o.items),
  ])
  .transform((arr) => arr as readonly z.infer<typeof suggestionItemSchema>[]);

// ─── Helpers ───────────────────────────────────────────────────────

interface OllamaMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

const buildMessages = (prompt: PromptPair, retryHint: boolean): readonly OllamaMessage[] => {
  const base: OllamaMessage[] = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
  if (retryHint) {
    base.push({
      role: 'user',
      content:
        'ATTENTION : la sortie précédente était invalide. Réponds STRICTEMENT en JSON valide, sans markdown, sans commentaire, en respectant le schéma indiqué dans le message system.',
    });
  }
  return base;
};

const toProviderError = (err: unknown): AIProviderError => {
  if (err instanceof AIProviderError) return err;
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new AIProviderError('timeout', 'Ollama : timeout dépassé', err);
  }
  // Erreur AbortError en Node (not DOMException in some runtimes)
  if (err instanceof Error && err.name === 'AbortError') {
    return new AIProviderError('timeout', 'Ollama : timeout dépassé', err);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AIProviderError('unavailable', `Ollama : ${message}`, err);
};

const mapHttpStatusToError = async (
  response: Response,
  context: string,
): Promise<AIProviderError> => {
  let details = '';
  try {
    details = await response.text();
  } catch {
    // ignore
  }
  if (response.status === 404) {
    return new AIProviderError(
      'unavailable',
      `Ollama : 404 (${context}) — modèle ou endpoint introuvable. ${details}`,
    );
  }
  if (response.status === 401 || response.status === 403) {
    return new AIProviderError('unauthorized', `Ollama : ${response.status} (${context})`);
  }
  return new AIProviderError('unavailable', `Ollama : ${response.status} (${context}). ${details}`);
};

// ─── Provider ──────────────────────────────────────────────────────

export function createOllamaProvider(options: CreateOllamaProviderOptions): AIProvider {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const endpoint = options.endpoint.replace(/\/$/, '');
  const model = options.model;

  const chat = async (
    messages: readonly OllamaMessage[],
  ): Promise<{ readonly content: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          format: 'json',
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw await mapHttpStatusToError(response, '/api/chat');
      }
      const raw = (await response.json()) as unknown;
      const parsed = ollamaChatResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AIProviderError(
          'invalid_response',
          `Ollama : shape /api/chat inattendue — ${parsed.error.issues[0]?.message ?? 'raison inconnue'}`,
        );
      }
      return { content: parsed.data.message.content };
    } catch (err) {
      throw toProviderError(err);
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * Appelle `chat`, parse le contenu en JSON, valide via `schema`.
   * Retry une fois avec le retryHint si la réponse est invalide.
   */
  const chatForJson = async <T>(
    prompt: PromptPair,
    schema: z.ZodType<T>,
    label: string,
  ): Promise<T> => {
    const attempts: boolean[] = [false, true];
    let lastError: AIProviderError | null = null;
    for (const retryHint of attempts) {
      const messages = buildMessages(prompt, retryHint);
      const { content } = await chat(messages);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch {
        lastError = new AIProviderError(
          'invalid_response',
          `Ollama : sortie non-JSON pour ${label}`,
        );
        continue;
      }
      const result = schema.safeParse(parsedJson);
      if (result.success) return result.data;
      lastError = new AIProviderError(
        'invalid_response',
        `Ollama : sortie JSON invalide pour ${label} — ${result.error.issues[0]?.message ?? 'raison inconnue'}`,
      );
    }
    throw lastError ?? new AIProviderError('invalid_response', `Ollama : ${label} a échoué`);
  };

  return {
    id: 'ollama',
    model,

    async generatePreset(input: GeneratePresetInput): Promise<PresetProposal> {
      const prompt = buildGeneratePresetPrompt(input);
      const data = await chatForJson(prompt, presetProposalResponseSchema, 'generatePreset');
      return {
        preset: data.preset,
        rationale: data.rationale,
        confidence: data.confidence,
      };
    },

    async suggestCompletion(input: SuggestCompletionInput): Promise<readonly Suggestion[]> {
      const prompt = buildSuggestCompletionPrompt(input);
      const data = await chatForJson(prompt, suggestionArrayResponseSchema, 'suggestCompletion');
      return data;
    },

    async testConnection(): Promise<ProviderInfo> {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${endpoint}/api/tags`, {
          method: 'GET',
          signal: controller.signal,
        });
        const latencyMs = Date.now() - startedAt;
        if (!response.ok) {
          return {
            id: 'ollama',
            model,
            ok: false,
            latencyMs,
            details: `HTTP ${response.status} sur /api/tags`,
          };
        }
        const raw = (await response.json()) as unknown;
        const parsed = ollamaTagsResponseSchema.safeParse(raw);
        if (!parsed.success) {
          return {
            id: 'ollama',
            model,
            ok: false,
            latencyMs,
            details: 'shape /api/tags inattendue',
          };
        }
        const modelAvailable = parsed.data.models.some(
          (m) => m.name === model || m.model === model,
        );
        return {
          id: 'ollama',
          model,
          ok: modelAvailable,
          latencyMs,
          ...(modelAvailable
            ? {}
            : {
                details: `modèle "${model}" introuvable côté Ollama (${parsed.data.models.length} modèles listés)`,
              }),
        };
      } catch (err) {
        return {
          id: 'ollama',
          model,
          ok: false,
          latencyMs: Date.now() - startedAt,
          details: err instanceof Error ? err.message : String(err),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
