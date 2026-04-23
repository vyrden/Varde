import type { CoreEvent } from '@varde/contracts';

import type { LogsConfig, LogsRoute } from './config.js';

/**
 * Métadonnées enrichies injectées par le wiring (cf. `index.ts`).
 * Permet au dispatch pur d'être testable sans accès à Discord.
 */
export interface DispatchMeta {
  /** Map userId → est-ce un bot ? Alimentée par le wiring côté module. */
  readonly isBotByUserId?: Readonly<Record<string, boolean>>;
}

/** Retourne les routes qui doivent recevoir cet event après exclusions. */
export function applicableRoutes(
  cfg: LogsConfig,
  event: CoreEvent,
  meta: DispatchMeta,
): readonly LogsRoute[] {
  if (isExcluded(cfg, event, meta)) return [];
  return cfg.routes.filter((route) => route.events.includes(event.type));
}

function isExcluded(cfg: LogsConfig, event: CoreEvent, meta: DispatchMeta): boolean {
  const { exclusions } = cfg;

  const userId = extractUserId(event);
  if (userId && exclusions.userIds.includes(userId)) return true;

  if (exclusions.excludeBots && userId && meta.isBotByUserId?.[userId] === true) {
    return true;
  }

  const sourceChannelId = extractSourceChannelId(event);
  if (sourceChannelId && exclusions.channelIds.includes(sourceChannelId)) return true;

  return false;
}

function extractUserId(event: CoreEvent): string | null {
  switch (event.type) {
    case 'guild.memberJoin':
    case 'guild.memberLeave':
    case 'guild.memberUpdate':
      return event.userId;
    case 'guild.messageCreate':
    case 'guild.messageEdit':
      return event.authorId;
    case 'guild.messageDelete':
      return event.authorId;
    default:
      return null;
  }
}

function extractSourceChannelId(event: CoreEvent): string | null {
  switch (event.type) {
    case 'guild.messageCreate':
    case 'guild.messageEdit':
    case 'guild.messageDelete':
    case 'guild.channelCreate':
    case 'guild.channelUpdate':
    case 'guild.channelDelete':
      return event.channelId;
    default:
      return null;
  }
}
