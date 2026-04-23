import type { ConfigUi, ModuleId } from '@varde/contracts';
import { z } from 'zod';

/**
 * Schéma de la config de `logs` stockée sous `guild_config.modules.logs`.
 *
 * Invariants (vérifiés via superRefine) :
 * - `events` d'une route sont non-vides.
 * - Pas de channelId cible d'une route qui figure aussi dans
 *   `exclusions.channelIds` (contradiction produit/UX).
 *
 * La liste des `events` valides est ouverte côté schema (z.string) —
 * la validation stricte "event fait partie du catalogue core" est
 * faite côté dashboard (dropdown fermé sur la liste de PR 4.1c).
 * Côté module, un event non reconnu est simplement ignoré (aucun
 * formatter, donc silent skip — loggé warn).
 */

const SNOWFLAKE = /^\d{17,19}$/;

export const verbositySchema = z.enum(['compact', 'detailed']);
export type LogsVerbosity = z.infer<typeof verbositySchema>;

export const routeSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(64),
  events: z.array(z.string().min(1)).min(1),
  channelId: z.string().regex(SNOWFLAKE, 'channelId doit être un snowflake Discord'),
  verbosity: verbositySchema.default('detailed'),
});
export type LogsRoute = z.infer<typeof routeSchema>;

export const exclusionsSchema = z.object({
  userIds: z.array(z.string().regex(SNOWFLAKE)).default([]),
  roleIds: z.array(z.string().regex(SNOWFLAKE)).default([]),
  channelIds: z.array(z.string().regex(SNOWFLAKE)).default([]),
  excludeBots: z.boolean().default(true),
});
export type LogsExclusions = z.infer<typeof exclusionsSchema>;

export const logsConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    routes: z.array(routeSchema).default([]),
    exclusions: exclusionsSchema.default({
      userIds: [],
      roleIds: [],
      channelIds: [],
      excludeBots: true,
    }),
  })
  .superRefine((cfg, ctx) => {
    const excluded = new Set(cfg.exclusions.channelIds);
    for (const [i, route] of cfg.routes.entries()) {
      if (excluded.has(route.channelId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['routes', i, 'channelId'],
          message: `contradiction : la route cible #${route.channelId} qui est aussi dans exclusions.channelIds`,
        });
      }
    }
  });

export type LogsConfig = z.infer<typeof logsConfigSchema>;

/** Alias normalisé utilisé par `defineModule` et les exports publics. */
export const configSchema = logsConfigSchema;

const MODULE_ID = 'logs' as ModuleId;

/**
 * Lit la section `modules.logs` d'un snapshot `guild_config` et
 * retourne une `LogsConfig` validée. Si `raw` est nul, absent ou ne
 * contient pas la section, les valeurs par défaut du schéma sont
 * retournées.
 */
export function resolveConfig(raw: unknown): LogsConfig {
  const asObj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  // biome-ignore lint/complexity/useLiteralKeys: noUncheckedIndexedAccess impose l'accès par clé sur Record<string, unknown>
  const modules = (asObj['modules'] ?? {}) as Record<string, unknown>;
  const own = modules[MODULE_ID] ?? {};
  return logsConfigSchema.parse(own);
}

/**
 * Métadonnées de rendu dashboard. PR 4.1c expose une forme minimale —
 * le vrai rendu du mode simple/avancé est fait par des composants
 * dédiés côté dashboard (PR 4.1d). `configUi.fields` vide ici :
 * `logs` n'a pas de champ scalaire simple à rendre via le schéma
 * déclaratif générique (routes = structure complexe).
 */
export const configUi: ConfigUi = {
  fields: [],
};
