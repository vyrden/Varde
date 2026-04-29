import { type ZodObject, type ZodType, z } from 'zod';

import type { ModuleContext, ModuleQuery, UIMessage } from './context.js';
import type { ChannelId, GuildId, PermissionId, RoleId, UserId } from './ids.js';
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
 * Vue résolue d'un user passé en option d'une slash command.
 * `displayName` est garanti non-vide : fallback côté builder sur
 * `member.displayName` → `user.globalName` → `user.username` → `user.tag`.
 * `tag` reste l'identifiant public canonique (`pseudo#0`).
 */
export interface ResolvedUser {
  readonly id: UserId;
  readonly tag: string;
  readonly displayName: string;
  readonly isBot: boolean;
}

/**
 * Vue résolue d'un rôle. `position` permet aux handlers de
 * modération de vérifier la hiérarchie (un mod ne peut pas
 * sanctionner un membre dont un rôle est plus haut que les siens).
 */
export interface ResolvedRole {
  readonly id: RoleId;
  readonly name: string;
  readonly position: number;
}

/**
 * Vue résolue d'un salon. `type` est la valeur numérique
 * `ChannelType` de discord.js (0=GuildText, 2=GuildVoice,
 * 5=GuildAnnouncement, 11=PublicThread, 13=GuildStageVoice,
 * 15=GuildForum, etc.). Pas d'import discord.js dans `@varde/contracts` —
 * les consommateurs gardent le mapping si besoin.
 */
export interface ResolvedChannel {
  readonly id: ChannelId;
  readonly name: string;
  readonly type: number;
}

/**
 * Entités résolues par le bot à partir de `interaction.options.resolved`.
 * Indexées par snowflake pour permettre `resolved.users[input.options.member]`.
 * Toujours présent (objet vide si aucune option de type user/role/channel)
 * — évite les `?.` chez chaque handler.
 */
export interface ResolvedCommandInput {
  readonly users: Readonly<Record<UserId, ResolvedUser>>;
  readonly roles: Readonly<Record<RoleId, ResolvedRole>>;
  readonly channels: Readonly<Record<ChannelId, ResolvedChannel>>;
}

/**
 * Entrée d'une interaction de commande reçue par le handler d'un
 * module. Les options elles-mêmes restent plates et limitées aux
 * primitives Discord (string | number | boolean) — pour les options
 * de type user/role/channel, le snowflake est passé en `string` dans
 * `options`, et la vue enrichie correspondante est lisible dans
 * `resolved` (pattern miroir de `interaction.options.resolved` côté
 * discord.js).
 */
export interface CommandInteractionInput {
  readonly commandName: string;
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly userId: UserId;
  readonly options: Readonly<Record<string, string | number | boolean>>;
  readonly resolved: ResolvedCommandInput;
}

/**
 * Handler de commande : reçoit l'interaction + le `ctx` scopé au
 * module, retourne un UIMessage produit par `ctx.ui.*`. Le `ctx` est
 * construit par le bot via le ctxFactory au moment de l'invocation
 * (voir @varde/bot `routeCommandInteraction`), ce qui donne accès à
 * i18n, audit, scheduler, config, etc. directement depuis le handler.
 */
export type ModuleCommandHandler = (
  input: CommandInteractionInput,
  ctx: ModuleContext,
) => Promise<UIMessage> | UIMessage;

/**
 * Type d'une option de slash command. Mappe 1:1 sur Discord
 * `ApplicationCommandOptionType` (3=string, 4=integer, 5=boolean,
 * 6=user, 7=channel, 8=role, 10=number). Les types sub-command (1,
 * 2), mentionable (9) et attachment (11) ne sont pas exposés en V1
 * — ajout possible plus tard sans casser la rétrocompat.
 */
export type ModuleCommandOptionType =
  | 'string'
  | 'integer'
  | 'boolean'
  | 'number'
  | 'user'
  | 'role'
  | 'channel';

/**
 * Choix prédéfini d'une option de type `string`. Le user voit `name`
 * dans le client Discord et le handler reçoit `value` dans
 * `input.options[option.name]`.
 */
export interface ModuleCommandOptionChoice {
  readonly name: string;
  readonly value: string;
}

/**
 * Déclaration d'une option d'une slash command. Sert deux usages :
 * 1. Décrire à Discord la forme de la commande (REST registration).
 * 2. Documenter aux handlers ce qu'attend `input.options`.
 *
 * Les bornes (`minLength`, `maxLength`, `minValue`, `maxValue`) sont
 * appliquées par Discord côté client — pas besoin de re-vérifier
 * dans le handler. Discord refuse l'interaction si elles sont
 * dépassées.
 */
export interface ModuleCommandOption {
  readonly name: string;
  readonly description: string;
  readonly type: ModuleCommandOptionType;
  readonly required?: boolean;
  /** Bornes de longueur pour `type: 'string'`. */
  readonly minLength?: number;
  readonly maxLength?: number;
  /** Bornes pour `type: 'integer' | 'number'`. */
  readonly minValue?: number;
  readonly maxValue?: number;
  /** Choix prédéfinis pour `type: 'string'`. Mutuellement exclusif avec min/maxLength. */
  readonly choices?: readonly ModuleCommandOptionChoice[];
}

/**
 * Déclaration d'une slash command par un module.
 *
 * `defaultPermission` est la permission applicative requise pour
 * exécuter la commande ; si elle est déclarée, le bot vérifie
 * `can(actor, permission, ...)` avant d'invoquer le handler. `null`
 * explicite = ouverte à tous les utilisateurs.
 *
 * `options` décrit les arguments attendus. Le bot s'en sert pour
 * enregistrer la commande auprès de Discord (REST) au boot — les
 * commandes sans `options` sont enregistrées sans paramètres.
 * L'ordre des options est préservé tel quel à Discord.
 */
export interface ModuleCommand {
  readonly name: string;
  readonly description: string;
  readonly defaultPermission?: PermissionId | null;
  readonly options?: readonly ModuleCommandOption[];
  readonly handler: ModuleCommandHandler;
}

/** Registre de commandes déclarées par un module, clé = nom de commande. */
export type ModuleCommandMap = Readonly<Record<string, ModuleCommand>>;

/**
 * Widget de rendu d'un champ de config côté dashboard. V1 reste volontairement
 * restreint aux types Discord-compatibles directement éditables. Les
 * widgets plus riches (channel picker, role picker, user picker, code
 * editor, file upload) seront ajoutés post-V1 avec un catalogue étendu.
 */
export type ConfigFieldWidget = 'text' | 'textarea' | 'number' | 'toggle' | 'select';

/** Option d'un widget `select`. */
export interface ConfigFieldOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Spécification de rendu d'un champ de config. Le dashboard
 * introspecte `configUi.fields` pour générer un formulaire ;
 * la validation reste portée par `configSchema` (Zod).
 *
 * `path` est une notation à points dans l'objet config (par exemple
 * `welcomeDelayMs` ou `moderation.thresholds.spam`). Le
 * meta-validator `defineModule()` vérifie que chaque path pointe bien
 * sur une clé du `configSchema` (uniquement pour les Zod `object`
 * imbriqués — les schémas union ou tuple restent best-effort V1).
 */
export interface ConfigFieldSpec {
  readonly path: string;
  readonly label: string;
  readonly widget: ConfigFieldWidget;
  readonly description?: string;
  readonly placeholder?: string;
  readonly options?: readonly ConfigFieldOption[];
  readonly group?: string;
  readonly order?: number;
}

/**
 * Métadonnées UI de la config d'un module : le dashboard consomme
 * `fields` pour rendre le formulaire, `configSchema` pour valider les
 * valeurs envoyées. Les deux se compensent : un champ peut changer de
 * widget sans impact sur la validation, et un champ schema sans
 * équivalent `configUi` n'est simplement pas rendu (pour garder des
 * champs internes invisibles côté admin).
 */
export interface ConfigUi {
  readonly fields: readonly ConfigFieldSpec[];
}

const configFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

const configFieldSpecSchema = z.object({
  path: z.string().min(1),
  label: z.string().min(1),
  widget: z.enum(['text', 'textarea', 'number', 'toggle', 'select']),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  options: z.array(configFieldOptionSchema).optional(),
  group: z.string().optional(),
  order: z.number().int().optional(),
});

/** Schéma Zod du `ConfigUi`, utilisé par `defineModule()`. */
export const configUiSchema = z.object({
  fields: z.array(configFieldSpecSchema),
});

/**
 * Niveau de permission requis pour qu'un user accède à un module
 * via le dashboard d'un serveur (jalon 7 PR 7.3).
 *
 * - `'admin'` (défaut) : accès complet ; correspond aux rôles
 *   Discord configurés en `adminRoleIds` côté `guild_permissions`,
 *   au propriétaire du serveur, et fallback rôles avec perm Discord
 *   `Administrator`.
 * - `'moderator'` : accès limité aux modules tagués comme tels.
 *   Couvre les use cases mod/anti-spam où on veut un accès dashboard
 *   sans donner les leviers complets de l'instance.
 *
 * Les modules tiers peuvent déclarer leur niveau requis via
 * `defineModule({ requiredPermission: 'moderator' })`. Ne pas
 * spécifier équivaut à `'admin'` — le défaut est restrictif.
 */
export type PermissionLevel = 'admin' | 'moderator';

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
  readonly configUi?: ConfigUi;
  /**
   * Niveau de permission requis pour accéder au module via le
   * dashboard. Défaut : `'admin'`. Cf. `PermissionLevel`.
   */
  readonly requiredPermission?: PermissionLevel;
}

/**
 * Descend dans un ZodObject via un chemin en notation pointée. Pour
 * V1 on ne descend qu'à travers les `ZodObject` ; une union ou un
 * tuple sur le chemin stoppe la descente (retourne `null` — considéré
 * best-effort, pas d'erreur).
 */
const getZodAtPath = (schema: ZodType<unknown>, path: string): ZodType<unknown> | null => {
  const parts = path.split('.');
  let current: ZodType<unknown> = schema;
  for (const part of parts) {
    const asObject = current as ZodObject<Record<string, ZodType<unknown>>> | ZodType<unknown>;
    if (!('shape' in asObject) || typeof asObject.shape !== 'object' || asObject.shape === null) {
      return null;
    }
    const shape = asObject.shape as Record<string, ZodType<unknown>>;
    const next = shape[part];
    if (!next) {
      return null;
    }
    current = next;
  }
  return current;
};

/**
 * Valide et gèle la définition d'un module. À appeler dans
 * `index.ts` du module : le résultat sera consommé par le plugin
 * loader. `defineModule` applique quatre garde-fous :
 *
 * 1. Le manifeste statique doit parser sous `manifestStaticSchema`.
 * 2. Chaque événement listé dans `manifest.events.emit` doit être
 *    préfixé par l'id du module (règle structurante).
 * 3. Si `configUi` est fourni, il doit parser sous `configUiSchema`.
 *    Si `configSchema` est également fourni, chaque `path` de
 *    `configUi.fields` doit exister dans `configSchema` (parcours
 *    best-effort à travers les `ZodObject` imbriqués). Un path
 *    absent jette avec le nom du module et le path fautif.
 * 4. L'objet retourné est `Object.freeze()` pour protéger contre les
 *    mutations accidentelles post-chargement.
 *
 * Le type de retour est préservé (generic) pour que l'inférence des
 * queries et du schéma de config remonte jusqu'aux consommateurs.
 *
 * @throws ZodError si le manifeste ou `configUi` ne parse pas.
 * @throws Error si un événement émis ne respecte pas le préfixe, ou
 *   si `configUi.fields[n].path` ne résout pas dans `configSchema`.
 */
export function defineModule<T extends ModuleDefinition>(definition: T): T {
  manifestStaticSchema.parse(definition.manifest);
  const emitCheck = validateEmitPrefix(definition.manifest);
  if (!emitCheck.valid) {
    throw new Error(
      `defineModule : émissions en dehors du préfixe du module (${definition.manifest.id}) : ${emitCheck.offenders.join(', ')}`,
    );
  }
  if (definition.configUi) {
    configUiSchema.parse(definition.configUi);
    if (definition.configSchema) {
      for (const field of definition.configUi.fields) {
        const resolved = getZodAtPath(definition.configSchema, field.path);
        if (resolved === null) {
          throw new Error(
            `defineModule : configUi.fields path "${field.path}" ne correspond à aucune clé de configSchema pour le module "${definition.manifest.id}"`,
          );
        }
      }
    }
  }
  return Object.freeze(definition) as T;
}
