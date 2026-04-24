import {
  type ActionId,
  type ChannelId,
  type CoreEvent,
  DiscordSendError,
  defineModule,
  type GuildId,
  type ModuleContext,
  type ModuleId,
  type UIMessage,
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

/** Résultat d'un `replayBrokenRouteFor`. */
export interface ReplayResult {
  /** Nombre d'events ré-envoyés avec succès. */
  readonly replayed: number;
  /** Nombre d'events encore en échec (réinjectés dans le buffer). */
  readonly failed: number;
  /** Première `DiscordSendError` rencontrée lors du replay, le cas échéant. */
  readonly firstError?: DiscordSendError;
}

/** Options du replay. Test-friendly (`delayMs: 0` évite les timers en tests). */
export interface ReplayOptions {
  readonly delayMs?: number;
}

const DEFAULT_REPLAY_DELAY_MS = 50;

const localT = (key: string, params?: Record<string, string | number>): string => {
  const template = (locales.fr as Record<string, string>)[key] ?? key;
  if (!params) return template;
  let out = template;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Rejoue les events bufferisés d'une route Discord cassée. Synchrone
 * côté HTTP (pas de SSE), borné par le plafond buffer (100 events) et
 * le délai inter-envois (50ms par défaut) → au plus ~5s.
 *
 * Sécurité inter-guild : si la route bufferisée n'appartient pas à la
 * `guildId` demandée, renvoie `{replayed:0, failed:0}` sans rien faire.
 *
 * Atomicité : `buffer.drain` sort les events en une seule opération.
 * Un envoi concurrent (nouvel event qui arrive pendant le replay) se
 * re-bufferise normalement — on ne les écrase pas. En cas d'échec
 * partiel, on réinjecte les events restants dans le buffer.
 */
export async function replayBrokenRouteFor(
  guildId: string,
  routeId: string,
  sender: (channelId: ChannelId, message: UIMessage) => Promise<void>,
  options?: ReplayOptions,
): Promise<ReplayResult> {
  const snap = buffer.snapshotAll().get(routeId);
  if (!snap) return { replayed: 0, failed: 0 };
  if (snap.guildId !== guildId) return { replayed: 0, failed: 0 };
  if (snap.events.length === 0) return { replayed: 0, failed: 0 };

  const delayMs = options?.delayMs ?? DEFAULT_REPLAY_DELAY_MS;
  const events = buffer.drain(routeId);

  let replayed = 0;
  let firstError: DiscordSendError | undefined;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event === undefined) continue;
    if (i > 0 && delayMs > 0) await sleep(delayMs);

    const formatter = FORMATTERS[event.type];
    if (!formatter) {
      // Pas de formatter : event drop, ne compte ni replayed ni failed.
      continue;
    }
    const output = formatter(event, { t: localT, verbosity: 'detailed' });
    const message: UIMessage = {
      kind: 'embed',
      payload: output.embed,
      ...(output.attachments.length > 0 ? { attachments: output.attachments } : {}),
    };

    try {
      await sender(snap.channelId as ChannelId, message);
      replayed += 1;
    } catch (error) {
      if (error instanceof DiscordSendError) {
        firstError = error;
        // Réinjecte cet event + tous les restants dans le buffer avec la même meta.
        const meta = { guildId: snap.guildId, channelId: snap.channelId, reason: error.reason };
        const now = Date.now();
        for (let j = i; j < events.length; j += 1) {
          const pending = events[j];
          if (pending) buffer.push(routeId, pending, now, meta);
        }
        return {
          replayed,
          failed: events.length - replayed,
          firstError,
        };
      }
      throw error;
    }
  }
  return { replayed, failed: 0 };
}

/**
 * Accès au buffer module-level, exclusivement pour les tests unitaires
 * de replay. N'EST PAS exporté via `dist/index.d.ts` pour la prod — le
 * nom en `__` signale l'intention interne. Ne jamais appeler depuis le
 * code de prod : le buffer doit être alimenté via le cycle normal
 * `handleEvent` → `deliverToRoute`.
 */
export const __bufferForTests = buffer;

export { configSchema, configUi, type LogsConfig, resolveConfig } from './config.js';
export { locales, manifest };
export default logs;
