import {
  type ActionId,
  type CoreEvent,
  DiscordSendError,
  defineModule,
  type GuildId,
  type ModuleContext,
  type ModuleId,
} from '@varde/contracts';
import { createRouteBuffer } from './buffer.js';
import type { LogsConfig, LogsRoute } from './config.js';
import { configSchema, configUi, resolveConfig } from './config.js';
import { applicableRoutes, type DispatchMeta } from './dispatch.js';
import { FORMATTERS } from './formatters/index.js';
import { locales } from './locales.js';
import { manifest } from './manifest.js';

const MODULE_ID = 'logs' as ModuleId;
const ROUTE_BROKEN_ACTION = 'logs.route.broken' as ActionId;

/**
 * Sous-union des `CoreEvent` qui portent un `guildId`. Ce module
 * n'écoute que ces 4 types — le cast est sûr car les abonnements
 * sont explicites dans `onLoad`.
 */
type GuildEvent = Extract<CoreEvent, { guildId: GuildId }>;

/**
 * Module officiel `logs`. À chaque event `guild.*` écouté, résout les
 * routes applicables via la config, formate un embed par route et
 * envoie via `ctx.discord.sendEmbed`. Sur échec (`DiscordSendError`),
 * bufferise l'event dans la RAM de la route cassée (plafond 100),
 * audit warn une fois par heure par route.
 */

// Souscriptions EventBus actives — collectées au onLoad, détachées au
// onUnload. Module singleton : ces variables module-level sont correctes.
const subscriptions = new Set<() => void>();
const buffer = createRouteBuffer();
const lastAuditedAt = new Map<string, number>();

export const logs = defineModule({
  manifest,
  configSchema,
  configUi,

  onLoad: async (ctx) => {
    ctx.logger.info('logs : onLoad');

    // Réinitialiser les souscriptions au cas où onLoad serait rappelé
    // après un onUnload dans le même process (reload du module).
    subscriptions.clear();

    // Abonnement explicite par event type (les 4 pilotes PR 4.1c).
    // Chaque handler downcase vers GuildEvent pour que handleEvent soit
    // typé sans cast dangereux.
    subscriptions.add(ctx.events.on('guild.memberJoin', async (e) => handleEvent(ctx, e)));
    subscriptions.add(ctx.events.on('guild.memberLeave', async (e) => handleEvent(ctx, e)));
    subscriptions.add(ctx.events.on('guild.messageDelete', async (e) => handleEvent(ctx, e)));
    subscriptions.add(ctx.events.on('guild.messageEdit', async (e) => handleEvent(ctx, e)));
  },

  onUnload: async (ctx) => {
    ctx.logger.info('logs : onUnload');
    for (const unsub of subscriptions) unsub();
    subscriptions.clear();
    // Le buffer RAM n'est pas effacé ici : au rechargement du module,
    // les events bufferisés pour une route toujours existante pourraient
    // être rejoués (fonctionnalité future). En pratique le process
    // redémarre rarement sans reset complet.
  },
});

async function handleEvent(ctx: ModuleContext, event: GuildEvent): Promise<void> {
  // Lecture fraîche de la config à chaque event : une modification via
  // le dashboard prend effet immédiatement, sans redémarrage.
  let cfg: LogsConfig;
  try {
    const raw = await ctx.config.get(event.guildId);
    cfg = resolveConfig(raw);
  } catch (error) {
    ctx.logger.warn('logs : impossible de résoudre la config', {
      guildId: event.guildId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const meta: DispatchMeta = {};
  const routes = applicableRoutes(cfg, event as CoreEvent, meta);
  if (routes.length === 0) return;

  for (const route of routes) {
    await deliverToRoute(ctx, event, route);
  }
}

async function deliverToRoute(
  ctx: ModuleContext,
  event: GuildEvent,
  route: LogsRoute,
): Promise<void> {
  const formatter = FORMATTERS[event.type];
  if (!formatter) {
    ctx.logger.warn('logs : pas de formatter pour event', { type: event.type });
    return;
  }

  const output = formatter(event as CoreEvent, {
    t: (key, params) => ctx.i18n.t(key, params),
    verbosity: route.verbosity,
  });

  const message = ctx.ui.embed(output.embed, output.attachments);

  try {
    await ctx.discord.sendEmbed(route.channelId as never, message);
  } catch (error) {
    if (error instanceof DiscordSendError) {
      buffer.push(route.id, event, Date.now(), {
        guildId: event.guildId,
        channelId: route.channelId,
        reason: error.reason,
      });
      auditBrokenRoute(ctx, event.guildId, route, error.reason);
      return;
    }
    const err = error instanceof Error ? error : new Error(String(error));
    ctx.logger.error('logs : erreur inattendue lors de sendEmbed', err, {
      routeId: route.id,
      eventType: event.type,
    });
  }
}

function auditBrokenRoute(
  ctx: ModuleContext,
  guildId: string,
  route: LogsRoute,
  reason: string,
): void {
  const key = `${guildId}::${route.id}`;
  const now = Date.now();
  const last = lastAuditedAt.get(key) ?? 0;
  // Debounce d'une heure par route cassée : évite de spammer l'audit
  // si Discord reste en erreur en continu.
  if (now - last < 60 * 60 * 1000) return;
  lastAuditedAt.set(key, now);
  void ctx.audit.log({
    guildId: guildId as never,
    action: ROUTE_BROKEN_ACTION,
    actor: { type: 'module', id: MODULE_ID },
    severity: 'warn',
    metadata: {
      routeId: route.id,
      channelId: route.channelId,
      reason,
    },
  });
}

/** Informations d'une route cassée exposée via l'API dashboard. */
export interface LogsBrokenRouteInfo {
  readonly routeId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly droppedCount: number;
  readonly bufferedCount: number;
  readonly markedAt: number | null;
  readonly reason: string;
}

/**
 * Retourne la liste des routes cassées pour une guild donnée.
 * Consommé par l'API dashboard pour afficher le bandeau de statut.
 * Les routes cassées d'autres guilds sont filtrées.
 */
export function getBrokenRoutesFor(guildId: string): readonly LogsBrokenRouteInfo[] {
  const result: LogsBrokenRouteInfo[] = [];
  for (const [routeId, snap] of buffer.snapshotAll()) {
    if (snap.guildId !== guildId) continue;
    result.push({
      routeId,
      guildId: snap.guildId,
      channelId: snap.channelId,
      droppedCount: snap.droppedCount,
      bufferedCount: snap.events.length,
      markedAt: snap.markedAt,
      reason: snap.reason,
    });
  }
  return result;
}

export { configSchema, configUi, type LogsConfig, resolveConfig } from './config.js';
export { locales, manifest };
export default logs;
