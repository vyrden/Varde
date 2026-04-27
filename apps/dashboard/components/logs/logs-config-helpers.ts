import type { LogsConfigClient, LogsRouteClient } from './LogsConfigEditor';

/**
 * UUID v4 réservé à la route unique produite par la section
 * « Salon de destination » (vue simple). Permet à la vue simple et à
 * la sous-section avancée Routes de cohabiter dans le même tableau
 * `config.routes` sans conflit : la simple-route upsert cet id, les
 * autres routes ont chacune leur propre UUID généré côté client.
 */
export const SIMPLE_ROUTE_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Routes additionnelles — celles qui ne sont PAS la simple-route. La
 * sous-section Routes (configuration avancée) ne montre que celles-ci.
 */
export function additionalRoutes(routes: readonly LogsRouteClient[]): readonly LogsRouteClient[] {
  return routes.filter((r) => r.id !== SIMPLE_ROUTE_ID);
}

/**
 * Récupère la simple-route depuis la config, ou null si absente.
 */
export function extractSimpleRoute(config: LogsConfigClient): LogsRouteClient | null {
  return config.routes.find((r) => r.id === SIMPLE_ROUTE_ID) ?? null;
}

/**
 * Construit le tableau `routes` final à persister : simple-route
 * upsert (si `channelId !== ''` et events non vides) + routes
 * additionnelles préservées telles quelles. Si `channelId === ''` ou
 * aucun event coché, la simple-route est exclue (pas de route inerte
 * en base).
 */
export function buildRoutesForSave(
  current: readonly LogsRouteClient[],
  simpleChannelId: string,
  simpleEvents: readonly string[],
): readonly LogsRouteClient[] {
  const others = additionalRoutes(current);
  if (simpleChannelId === '' || simpleEvents.length === 0) {
    return others;
  }
  const simpleRoute: LogsRouteClient = {
    id: SIMPLE_ROUTE_ID,
    label: 'Logs',
    events: simpleEvents,
    channelId: simpleChannelId,
    verbosity: 'detailed',
  };
  return [...others, simpleRoute];
}

/**
 * Vrai si la config a au moins une route additionnelle (autre que la
 * simple-route) OU au moins un filtre actif. Sert à décider si la
 * section « Configuration avancée » doit être ouverte au mount.
 */
export function isAdvancedConfig(config: LogsConfigClient): boolean {
  if (additionalRoutes(config.routes).length > 0) return true;
  const ex = config.exclusions;
  if (ex.userIds.length > 0) return true;
  if (ex.roleIds.length > 0) return true;
  if (ex.channelIds.length > 0) return true;
  // `excludeBots` n'est pas considéré comme « avancé » — il vit dans
  // la section Options simple. La section avancée le miroite via
  // `FiltersSubsection` mais sa présence ne déclenche pas l'ouverture.
  return false;
}

/**
 * Compte le nombre d'events distincts couverts par les routes
 * additionnelles. Utilisé par `DestinationChannelSection` pour
 * afficher un bandeau « X events redirigés via les routes ».
 */
export function countRedirectedEvents(routes: readonly LogsRouteClient[]): number {
  const set = new Set<string>();
  for (const route of additionalRoutes(routes)) {
    for (const ev of route.events) set.add(ev);
  }
  return set.size;
}
