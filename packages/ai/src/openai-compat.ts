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
 * Adapter OpenAI-compatible (ADR 0007, PR 3.8). Cible la grande
 * famille de providers qui parlent le dialecte `/chat/completions`
 * introduit par OpenAI :
 *
 * - OpenAI officiel (`https://api.openai.com/v1`)
 * - OpenRouter (`https://openrouter.ai/api/v1`)
 * - Groq (`https://api.groq.com/openai/v1`)
 * - vLLM et LocalAI auto-hébergés
 * - LM Studio et text-gen-webui en mode "OpenAI-compatible server"
 *
 * Différences wire avec Ollama : auth Bearer token obligatoire,
 * `response_format: { type: 'json_object' }` au lieu de `format: 'json'`,
 * shape de réponse `choices[0].message.content`, compteurs de tokens
 * exposés par `usage`.
 *
 * `useJsonMode` est `true` par défaut (couvre OpenAI et les forks
 * récents). Les providers plus anciens qui ne supportent pas
 * `response_format` peuvent passer `useJsonMode: false` ; le prompt
 * reste le même (il contraint déjà strictement la sortie), le
 * retry sur JSON invalide protège.
 *
 * `extraHeaders` couvre les cas où le provider exige un header
 * métier supplémentaire — OpenRouter demande `HTTP-Referer` et
 * `X-Title` optionnels pour la télémetrie d'origine d'appel.
 *
 * CLAUDE.md §13 : aucun provider par défaut. L'admin branche
 * explicitement. La clé API vit dans le keystore chiffré
 * (PR 3.9) — ce package ne l'écrit jamais en clair nulle part.
 */

// ─── Options ───────────────────────────────────────────────────────

export interface CreateOpenAICompatibleProviderOptions {
  /** Base URL sans trailing slash. Ex : `https://api.openai.com/v1`. */
  readonly baseUrl: string;
  /** Modèle. Ex : `gpt-4o-mini`, `anthropic/claude-3.5-sonnet` (OpenRouter). */
  readonly model: string;
  /** API key envoyée en Bearer. Obligatoire — la plupart des providers le refusent vide. */
  readonly apiKey: string;
  /** Fetch injectable pour les tests. */
  readonly fetch?: typeof globalThis.fetch;
  /** Timeout par requête HTTP en ms. Défaut : 20_000. */
  readonly requestTimeoutMs?: number;
  /** Utilise `response_format: {type: 'json_object'}`. Défaut : `true`. */
  readonly useJsonMode?: boolean;
  /** Headers additionnels (HTTP-Referer pour OpenRouter, etc.). */
  readonly extraHeaders?: Readonly<Record<string, string>>;
  /** Slug stockage `ai_invocations.provider`. Défaut : `openai-compat`. */
  readonly providerId?: string;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_PROVIDER_ID = 'openai-compat';

// ─── Shapes wire ───────────────────────────────────────────────────

const chatCompletionResponseSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          role: z.string(),
          content: z.string(),
        }),
        finish_reason: z.string().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().default(0),
      completion_tokens: z.number().int().nonnegative().default(0),
      total_tokens: z.number().int().nonnegative().default(0),
    })
    .optional(),
});

const modelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
    }),
  ),
});

// ─── Schémas applicatifs ───────────────────────────────────────────

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
 * Accepte les deux formes classiques pour les LLMs derrière
 * `response_format: { type: 'json_object' }` :
 *
 * - Array direct `[{...}, {...}]` (idéal, mais certains providers
 *   refusent car ils imposent un object racine).
 * - Object wrapper `{ suggestions: [...] }` ou `{ completions: [...] }`
 *   ou `{ items: [...] }` (variantes les plus courantes renvoyées par
 *   les modèles qui exigent un object racine).
 *
 * Les trois variantes sont normalisées en array via `.transform`.
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

interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

const buildMessages = (prompt: PromptPair, retryHint: boolean): readonly ChatMessage[] => {
  const base: ChatMessage[] = [
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
    return new AIProviderError('timeout', 'OpenAI-compat : timeout dépassé', err);
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new AIProviderError('timeout', 'OpenAI-compat : timeout dépassé', err);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AIProviderError('unavailable', `OpenAI-compat : ${message}`, err);
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
  if (response.status === 401) {
    return new AIProviderError(
      'unauthorized',
      `OpenAI-compat : 401 (${context}) — clé API invalide ou absente.`,
    );
  }
  if (response.status === 403) {
    return new AIProviderError('unauthorized', `OpenAI-compat : 403 (${context}) — accès refusé.`);
  }
  if (response.status === 404) {
    return new AIProviderError(
      'unavailable',
      `OpenAI-compat : 404 (${context}) — modèle ou endpoint introuvable. ${details}`,
    );
  }
  if (response.status === 429) {
    return new AIProviderError(
      'quota_exceeded',
      `OpenAI-compat : 429 (${context}) — quota ou rate limit dépassé. ${details}`,
    );
  }
  return new AIProviderError(
    'unavailable',
    `OpenAI-compat : ${response.status} (${context}). ${details}`,
  );
};

// ─── Provider ──────────────────────────────────────────────────────

export function createOpenAICompatibleProvider(
  options: CreateOpenAICompatibleProviderOptions,
): AIProvider {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const model = options.model;
  const apiKey = options.apiKey;
  const useJsonMode = options.useJsonMode ?? true;
  const providerId = options.providerId ?? DEFAULT_PROVIDER_ID;
  const extraHeaders = options.extraHeaders ?? {};

  if (apiKey.trim().length === 0) {
    throw new AIProviderError(
      'unauthorized',
      'OpenAI-compat : apiKey vide — fournir une clé valide (en prod, via le keystore).',
    );
  }

  const authHeaders = (): Readonly<Record<string, string>> => ({
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    ...extraHeaders,
  });

  const chat = async (
    messages: readonly ChatMessage[],
    opts: { readonly jsonMode?: boolean } = {},
  ): Promise<{ readonly content: string }> => {
    // `jsonMode` est par défaut le `useJsonMode` du constructeur (true).
    // Permet à `classify` de désactiver le mode JSON par-call : OpenAI
    // refuse une requête `response_format=json_object` si le prompt ne
    // contient pas le mot "JSON", ce qui faisait silencieusement
    // échouer la classification automod.
    const jsonMode = opts.jsonMode ?? useJsonMode;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model,
        messages,
      };
      if (jsonMode) {
        // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access (TS4111)
        body['response_format'] = { type: 'json_object' };
      }
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw await mapHttpStatusToError(response, '/chat/completions');
      }
      const raw = (await response.json()) as unknown;
      const parsed = chatCompletionResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AIProviderError(
          'invalid_response',
          `OpenAI-compat : shape /chat/completions inattendue — ${parsed.error.issues[0]?.message ?? 'raison inconnue'}`,
        );
      }
      const first = parsed.data.choices[0];
      if (!first) {
        throw new AIProviderError(
          'invalid_response',
          'OpenAI-compat : aucune choice retournée par le provider.',
        );
      }
      return { content: first.message.content };
    } catch (err) {
      throw toProviderError(err);
    } finally {
      clearTimeout(timer);
    }
  };

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
          `OpenAI-compat : sortie non-JSON pour ${label}`,
        );
        continue;
      }
      const result = schema.safeParse(parsedJson);
      if (result.success) return result.data;
      lastError = new AIProviderError(
        'invalid_response',
        `OpenAI-compat : sortie JSON invalide pour ${label} — ${result.error.issues[0]?.message ?? 'raison inconnue'}`,
      );
    }
    throw lastError ?? new AIProviderError('invalid_response', `OpenAI-compat : ${label} a échoué`);
  };

  return {
    id: providerId,
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

    async classify(text, labels) {
      // Prompt simple : on attend un label brut hors JSON. JSON mode
      // explicitement désactivé — OpenAI 400 sur `response_format=json_object`
      // si le prompt ne mentionne pas "JSON". Erreurs du provider remontées
      // au caller (automod logge + retombe sur `null` côté `classifyAgainst`).
      const labelList = labels.join(', ');
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are a Discord content classifier. The user message may be in any language (French, English, Spanish, etc.). You receive a message and a list of categories. Reply with EXACTLY ONE of the listed labels, lowercase, no quotes, no explanation, no punctuation. Allowed categories: ${labelList}.`,
        },
        { role: 'user', content: text.slice(0, 2000) },
      ];
      const { content } = await chat(messages, { jsonMode: false });
      const trimmed = content.trim().toLowerCase();
      for (const label of labels) {
        if (trimmed === label.toLowerCase() || trimmed.includes(label.toLowerCase())) {
          return label;
        }
      }
      return labels.includes('safe') ? 'safe' : (labels[0] ?? 'safe');
    },

    async testConnection(): Promise<ProviderInfo> {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${baseUrl}/models`, {
          method: 'GET',
          headers: authHeaders(),
          signal: controller.signal,
        });
        const latencyMs = Date.now() - startedAt;
        if (!response.ok) {
          return {
            id: providerId,
            model,
            ok: false,
            latencyMs,
            details: `HTTP ${response.status} sur /models`,
          };
        }
        const raw = (await response.json()) as unknown;
        const parsed = modelsResponseSchema.safeParse(raw);
        if (!parsed.success) {
          // Certains providers (LocalAI, LM Studio) retournent une
          // shape légèrement différente. On ne fail pas hard : si on
          // atteint /models on considère le provider joignable, le
          // modèle sera testé au premier vrai call.
          return {
            id: providerId,
            model,
            ok: true,
            latencyMs,
            details: 'shape /models non standard, vérification modèle différée au 1er appel',
          };
        }
        const modelAvailable = parsed.data.data.some((m) => m.id === model);
        return {
          id: providerId,
          model,
          ok: modelAvailable,
          latencyMs,
          ...(modelAvailable
            ? {}
            : {
                details: `modèle "${model}" introuvable dans /models (${parsed.data.data.length} modèles listés)`,
              }),
        };
      } catch (err) {
        return {
          id: providerId,
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
