/**
 * `@varde/ai` — contrat `AIProvider` + service avec timeout et
 * traçabilité, + stub rule-based déterministe (ADR 0007).
 *
 * Surfaces publiques consommées par :
 * - `apps/api` (PR 3.10+) pour générer un preset IA et proposer
 *   des suggestions contextuelles dans le builder.
 * - `packages/ai` adapters futurs (Ollama PR 3.7, OpenAI-compat
 *   PR 3.8) qui implémentent `AIProvider`.
 * - Les tests partout via `createStubProvider()` : déterministe,
 *   aucun appel réseau, aucune dépendance environnement.
 */

export { type CreateOllamaProviderOptions, createOllamaProvider } from './ollama.js';
export {
  type CreateOpenAICompatibleProviderOptions,
  createOpenAICompatibleProvider,
} from './openai-compat.js';
export {
  buildGeneratePresetPrompt,
  buildSuggestCompletionPrompt,
  PROMPT_VERSIONS,
  type PromptPair,
} from './prompts.js';
export {
  type AIService,
  type CreateAIServiceOptions,
  createAIService,
  type TracedPresetProposal,
  type TracedSuggestions,
} from './service.js';
export { createStubProvider, STUB_KEYWORD_RULES, STUB_PRESET_COUNT } from './stub.js';
export {
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
