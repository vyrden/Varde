import type { ZodType } from 'zod';

import type { ModuleContext, ModuleQuery, UIMessage } from './context.js';
import type { ChannelId, GuildId, PermissionId, UserId } from './ids.js';
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

/**
 * Entrée d'une interaction de commande reçue par le handler d'un
 * module. Les options sont volontairement contraintes aux types
 * Discord natifs stables (string | number | boolean). Les types plus
 * riches (channel, user, role) seront ajoutés si nécessaire post-V1.
 */
export interface CommandInteractionInput {
  readonly commandName: string;
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly userId: UserId;
  readonly options: Readonly<Record<string, string | number | boolean>>;
}

/** Handler de commande : reçoit l'interaction, retourne un UIMessage. */
export type ModuleCommandHandler = (
  input: CommandInteractionInput,
) => Promise<UIMessage> | UIMessage;

/**
 * Déclaration d'une slash command par un module.
 *
 * `defaultPermission` est la permission applicative requise pour
 * exécuter la commande ; si elle est déclarée, le bot vérifie
 * `can(actor, permission, ...)` avant d'invoquer le handler. `null`
 * explicite = ouverte à tous les utilisateurs.
 */
export interface ModuleCommand {
  readonly name: string;
  readonly description: string;
  readonly defaultPermission?: PermissionId | null;
  readonly handler: ModuleCommandHandler;
}

/** Registre de commandes déclarées par un module, clé = nom de commande. */
export type ModuleCommandMap = Readonly<Record<string, ModuleCommand>>;

/** Définition complète d'un module, retournée par `defineModule()`. */
export interface ModuleDefinition {
  readonly manifest: ManifestStatic;
  readonly onLoad?: ModuleLifecycleHandler;
  readonly onEnable?: ModuleGuildLifecycleHandler;
  readonly onDisable?: ModuleGuildLifecycleHandler;
  readonly onUnload?: ModuleLifecycleHandler;
  readonly queries?: ModuleQueryMap;
  readonly commands?: ModuleCommandMap;
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
