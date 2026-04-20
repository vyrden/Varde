import type { ZodType } from 'zod';

import type { ModuleContext, ModuleQuery } from './context.js';
import type { GuildId } from './ids.js';
import { type ManifestStatic, manifestStaticSchema, validateEmitPrefix } from './manifest.js';

/**
 * Forme runtime d'un module. Le champ `manifest` contient la partie
 * statique validée par le meta-schema Zod (cf. `./manifest.ts`) ;
 * les autres champs sont les hooks, queries et schéma de config
 * optionnels utilisés par le plugin loader.
 *
 * Un module ne dépend à la compilation que de `@varde/contracts` :
 * c'est pour cela que `defineModule()` vit ici et non dans
 * `@varde/core`. Le loader de `@varde/core` consomme le
 * `ModuleDefinition` retourné.
 */

/** Handler de cycle de vie sans guild. */
export type ModuleLifecycleHandler = (ctx: ModuleContext) => Promise<void> | void;

/** Handler de cycle de vie par guild (enable/disable). */
export type ModuleGuildLifecycleHandler = (
  ctx: ModuleContext,
  guildId: GuildId,
) => Promise<void> | void;

/** Registre de queries exposées par le module, clé = identifiant de query. */
export type ModuleQueryMap = Readonly<Record<string, ModuleQuery>>;

/** Définition complète d'un module, retournée par `defineModule()`. */
export interface ModuleDefinition {
  readonly manifest: ManifestStatic;
  readonly onLoad?: ModuleLifecycleHandler;
  readonly onEnable?: ModuleGuildLifecycleHandler;
  readonly onDisable?: ModuleGuildLifecycleHandler;
  readonly onUnload?: ModuleLifecycleHandler;
  readonly queries?: ModuleQueryMap;
  readonly configSchema?: ZodType<unknown>;
  readonly configDefaults?: Readonly<Record<string, unknown>>;
}

/**
 * Valide et gèle la définition d'un module. À appeler dans
 * `index.ts` du module : le résultat sera consommé par le plugin
 * loader. `defineModule` applique trois garde-fous :
 *
 * 1. Le manifeste statique doit parser sous `manifestStaticSchema`.
 * 2. Chaque événement listé dans `manifest.events.emit` doit être
 *    préfixé par l'id du module (règle structurante).
 * 3. L'objet retourné est `Object.freeze()` pour protéger contre les
 *    mutations accidentelles post-chargement.
 *
 * Le type de retour est préservé (generic) pour que l'inférence des
 * queries et du schéma de config remonte jusqu'aux consommateurs.
 *
 * @throws ZodError si le manifeste n'est pas conforme au meta-schema.
 * @throws Error si un événement émis ne respecte pas le préfixe.
 */
export function defineModule<T extends ModuleDefinition>(definition: T): T {
  manifestStaticSchema.parse(definition.manifest);
  const emitCheck = validateEmitPrefix(definition.manifest);
  if (!emitCheck.valid) {
    throw new Error(
      `defineModule : émissions en dehors du préfixe du module (${definition.manifest.id}) : ${emitCheck.offenders.join(', ')}`,
    );
  }
  return Object.freeze(definition) as T;
}
