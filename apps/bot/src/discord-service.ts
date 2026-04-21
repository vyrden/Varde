import {
  type ChannelId,
  DependencyFailureError,
  type DiscordService,
  type Logger,
  type ModuleId,
} from '@varde/contracts';

/**
 * Implémentation concrète du `DiscordService` : un wrapper minimal
 * autour d'un port `ChannelSender` qui abstrait discord.js. Le bot
 * (PR 1.6.d) injecte le vrai sender relié au client discord.js ; les
 * tests injectent un sender fake.
 *
 * Rate limiting V1 : fenêtre glissante (sliding window) par instance
 * du service. Chaque appel consomme un crédit ; si la fenêtre est
 * pleine, `sendMessage` lève `DependencyFailureError` sans appeler
 * le sender. L'idée est que le ctx factory produit un service par
 * module, chacun avec sa propre fenêtre — c'est ce qui donne la
 * granularité "par module" demandée par le plan. L'ajout d'une
 * dimension "par guild" dans la clé viendra avec la première
 * régression (V1 assume une poignée de guilds actives par module).
 *
 * Le respect des 429 Discord (retry-after) est prévu post-V1 via un
 * middleware dans discord.js (REST#handleRatelimit). V1 propage les
 * échecs du sender tels quels en DependencyFailureError.
 */

/** Port minimal vers discord.js. Production : `client.channels.send(...)`. */
export interface ChannelSender {
  readonly sendMessage: (channelId: ChannelId, content: string) => Promise<void>;
}

/** Paramètres du rate limiter interne. Omission = pas de limitation. */
export interface RateLimitConfig {
  readonly tokens: number;
  readonly windowMs: number;
}

/** Options de construction. */
export interface CreateDiscordServiceOptions {
  readonly sender: ChannelSender;
  readonly logger: Logger;
  readonly moduleId?: ModuleId;
  readonly rateLimit?: RateLimitConfig;
  /** Horloge injectable (tests). Défaut : `Date.now`. */
  readonly now?: () => number;
}

interface SlidingWindow {
  readonly limit: number;
  readonly windowMs: number;
  readonly hits: number[];
}

const createWindow = (config: RateLimitConfig): SlidingWindow => ({
  limit: config.tokens,
  windowMs: config.windowMs,
  hits: [],
});

/** Consomme un crédit si la fenêtre le permet, sinon retourne false. */
const consume = (window: SlidingWindow, nowMs: number): boolean => {
  const cutoff = nowMs - window.windowMs;
  // Retire les hits plus anciens que la fenêtre.
  while (window.hits.length > 0 && (window.hits[0] ?? 0) <= cutoff) {
    window.hits.shift();
  }
  if (window.hits.length >= window.limit) {
    return false;
  }
  window.hits.push(nowMs);
  return true;
};

/**
 * Construit un `DiscordService`. Chaque instance a son propre état de
 * rate limiting ; produire un service par module donne l'isolation
 * demandée par le plan.
 */
export function createDiscordService(options: CreateDiscordServiceOptions): DiscordService {
  const { sender, moduleId } = options;
  const logger = options.logger.child({
    component: 'discord-service',
    ...(moduleId ? { moduleId } : {}),
  });
  const clock = options.now ?? (() => Date.now());
  const window = options.rateLimit ? createWindow(options.rateLimit) : null;

  return {
    async sendMessage(channelId, content) {
      if (window && !consume(window, clock())) {
        throw new DependencyFailureError('DiscordService : rate limit applicatif atteint', {
          metadata: {
            ...(moduleId ? { moduleId } : {}),
            limit: window.limit,
            windowMs: window.windowMs,
          },
        });
      }
      try {
        await sender.sendMessage(channelId, content);
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        logger.warn('sendMessage a échoué', { channelId, error: cause.message });
        throw new DependencyFailureError('DiscordService.sendMessage : échec en aval', {
          cause,
          metadata: {
            ...(moduleId ? { moduleId } : {}),
            channelId,
          },
        });
      }
    },
  };
}
