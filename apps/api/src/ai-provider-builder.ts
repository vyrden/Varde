import {
  type AIProvider,
  createOllamaProvider,
  createOpenAICompatibleProvider,
  createStubProvider,
} from '@varde/ai';
import type { GuildId, KeystoreService } from '@varde/contracts';
import type { CoreConfigService } from '@varde/core';

/**
 * Construit l'`AIProvider` applicable à une guild en lisant la
 * config stockée (PR 3.9 : `guild_config.core.ai`) et la clé API
 * chiffrée (`keystore` scopé `core.ai`). Stratégie :
 *
 * - config absente / providerId=`none`    → `createStubProvider()`
 *   (fallback déterministe, zéro réseau — CLAUDE.md §13).
 * - providerId=`ollama`                   → adapter Ollama avec
 *   endpoint + model de la config.
 * - providerId=`openai-compat`            → adapter OpenAI-compat
 *   avec la clé lue dans le keystore. Si la clé est absente, on
 *   retombe sur le stub avec un warn — un `openai-compat` sans
 *   clé ne peut pas fonctionner, autant ne pas casser le flow.
 *
 * Cette fonction est partagée entre la route `/settings/ai/test`
 * (build ad hoc avec body brut) et les routes `/onboarding/ai/*`
 * (build avec config persistée).
 */

const KEYSTORE_API_KEY_SLOT = 'providerApiKey';

interface StoredAiConfig {
  readonly providerId: 'none' | 'ollama' | 'openai-compat';
  readonly endpoint: string | null;
  readonly model: string | null;
}

const readStoredConfig = async (
  config: CoreConfigService,
  guildId: GuildId,
): Promise<StoredAiConfig> => {
  let snapshot: unknown = {};
  try {
    snapshot = await config.get(guildId);
  } catch {
    snapshot = {};
  }
  if (typeof snapshot !== 'object' || snapshot === null) {
    return { providerId: 'none', endpoint: null, model: null };
  }
  const core = (snapshot as { core?: unknown }).core;
  if (typeof core !== 'object' || core === null) {
    return { providerId: 'none', endpoint: null, model: null };
  }
  const ai = (core as { ai?: unknown }).ai;
  if (typeof ai !== 'object' || ai === null) {
    return { providerId: 'none', endpoint: null, model: null };
  }
  const obj = ai as Record<string, unknown>;
  const pid = obj['providerId'];
  const providerId: StoredAiConfig['providerId'] =
    pid === 'ollama' || pid === 'openai-compat' ? pid : 'none';
  const endpoint = typeof obj['endpoint'] === 'string' ? obj['endpoint'] : null;
  const model = typeof obj['model'] === 'string' ? obj['model'] : null;
  return { providerId, endpoint, model };
};

export interface BuildAiProviderOptions {
  readonly config: CoreConfigService;
  readonly keystore: KeystoreService;
  readonly guildId: GuildId;
  readonly fetchImpl?: typeof globalThis.fetch;
}

export async function buildAiProviderForGuild(
  options: BuildAiProviderOptions,
): Promise<AIProvider> {
  const { config, keystore, guildId } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const stored = await readStoredConfig(config, guildId);

  if (stored.providerId === 'ollama' && stored.endpoint && stored.model) {
    return createOllamaProvider({
      endpoint: stored.endpoint,
      model: stored.model,
      fetch: fetchImpl,
    });
  }
  if (stored.providerId === 'openai-compat' && stored.endpoint && stored.model) {
    const apiKey = await keystore.get(guildId, KEYSTORE_API_KEY_SLOT);
    if (apiKey !== null && apiKey.length > 0) {
      return createOpenAICompatibleProvider({
        baseUrl: stored.endpoint,
        model: stored.model,
        apiKey,
        fetch: fetchImpl,
      });
    }
    // Provider configuré mais clé absente : retour au stub silencieux.
  }
  return createStubProvider();
}
