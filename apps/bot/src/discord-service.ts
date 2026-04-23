import {
  type ChannelId,
  DependencyFailureError,
  DiscordSendError,
  type DiscordSendErrorReason,
  type DiscordService,
  type Logger,
  type ModuleId,
  type UIMessage,
} from '@varde/contracts';

/**
 * Implémentation concrète du `DiscordService` : un wrapper minimal
 * autour d'un port `ChannelSender` qui abstrait discord.js. Le bot
 * injecte le vrai sender relié au client discord.js ; les tests
 * injectent un sender fake.
 *
 * Rate limiting V1 : fenêtre glissante (sliding window) par instance
 * du service, partagée entre `sendMessage` et `sendEmbed` (le coût
 * Discord d'un envoi est le même qu'on attache un embed ou non). Le
 * ctx factory produit un service par module — c'est ce qui donne la
 * granularité "par module" demandée par le plan.
 */

/** Port minimal vers discord.js. Production : `channel.send(...)`. */
export interface ChannelSender {
  readonly sendMessage: (channelId: ChannelId, content: string) => Promise<void>;
  readonly sendEmbed: (channelId: ChannelId, message: UIMessage) => Promise<void>;
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
 * Codes d'erreur Discord (REST API v10) mappés sur nos raisons typées.
 * - 10003 = Unknown Channel
 * - 10008 = Unknown Message (rattaché à channel-not-found : situation équivalente pour l'admin)
 * - 50001 = Missing Access
 * - 50013 = Missing Permissions
 */
const DISCORD_CODE_TO_REASON: Readonly<Record<number, DiscordSendErrorReason>> = Object.freeze({
  10003: 'channel-not-found',
  10008: 'channel-not-found',
  50001: 'missing-permission',
  50013: 'missing-permission',
});

const classifyError = (error: unknown): DiscordSendErrorReason => {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'number' && code in DISCORD_CODE_TO_REASON) {
      return DISCORD_CODE_TO_REASON[code] ?? 'unknown';
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      if (/unknown channel/i.test(message)) return 'channel-not-found';
      if (/missing permissions?/i.test(message)) return 'missing-permission';
    }
  }
  return 'unknown';
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

    async sendEmbed(channelId, message) {
      if (message.kind !== 'embed') {
        throw new TypeError(
          `DiscordService.sendEmbed : UIMessage attendu de kind='embed', reçu kind='${message.kind}'.`,
        );
      }
      if (window && !consume(window, clock())) {
        throw new DiscordSendError(
          'rate-limit-exhausted',
          'DiscordService : rate limit applicatif atteint',
          {
            metadata: {
              ...(moduleId ? { moduleId } : {}),
              limit: window.limit,
              windowMs: window.windowMs,
            },
          },
        );
      }
      try {
        await sender.sendEmbed(channelId, message);
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        const reason = classifyError(error);
        logger.warn('sendEmbed a échoué', { channelId, reason, error: cause.message });
        throw new DiscordSendError(reason, `DiscordService.sendEmbed : ${cause.message}`, {
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
