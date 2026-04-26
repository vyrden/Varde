import type { ZodType } from 'zod';

import type { AuditLogRecord, Iso8601DateTime } from './db-records.js';
import type { CoreEvent, CoreEventType, Emoji } from './events.js';
import type {
  ActionId,
  ChannelId,
  GuildId,
  MessageId,
  ModuleId,
  PermissionId,
  RoleId,
  UserId,
} from './ids.js';
import type { OnboardingActionDefinition } from './onboarding.js';
import type { UIAttachment, UIEmbed } from './ui.js';
import type { Ulid } from './ulid.js';

/**
 * Interfaces des services exposés aux modules via `ctx`. Types
 * uniquement : les implémentations vivent dans `@varde/core` et
 * packages associés. Les modules ne dépendent à la compilation que
 * de `@varde/contracts`.
 */

/** Logger scoped à un module. */
export interface Logger {
  readonly trace: (message: string, meta?: Record<string, unknown>) => void;
  readonly debug: (message: string, meta?: Record<string, unknown>) => void;
  readonly info: (message: string, meta?: Record<string, unknown>) => void;
  readonly warn: (message: string, meta?: Record<string, unknown>) => void;
  readonly error: (message: string, error?: Error, meta?: Record<string, unknown>) => void;
  readonly fatal: (message: string, error?: Error, meta?: Record<string, unknown>) => void;
  readonly child: (bindings: Record<string, unknown>) => Logger;
}

/** Accès à la configuration d'un serveur. */
export interface ConfigService {
  readonly get: <T = unknown>(guildId: GuildId) => Promise<T>;
  readonly set: <T = unknown>(guildId: GuildId, patch: Partial<T>) => Promise<void>;
}

/** Acteur d'une action auditée. */
export type AuditActor =
  | { readonly type: 'user'; readonly id: UserId }
  | { readonly type: 'system' }
  | { readonly type: 'module'; readonly id: ModuleId };

/** Cible optionnelle d'une action auditée. */
export type AuditTarget =
  | { readonly type: 'user'; readonly id: UserId }
  | { readonly type: 'channel'; readonly id: ChannelId }
  | { readonly type: 'role'; readonly id: RoleId }
  | { readonly type: 'message'; readonly id: string };

/** Niveau de gravité d'une entrée d'audit. */
export type AuditSeverity = 'info' | 'warn' | 'error';

/** Entrée d'audit soumise par un module. */
export interface AuditEntry {
  readonly action: ActionId;
  readonly actor: AuditActor;
  readonly target?: AuditTarget;
  readonly severity: AuditSeverity;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly guildId?: GuildId;
}

/**
 * Filtre de lecture audit_log exposé aux modules. Par rapport à
 * `CoreAuditService.query`, le `moduleId` n'est PAS exposé : la
 * factory l'injecte automatiquement à l'`id` du module appelant
 * pour empêcher un module de lire les entrées d'un autre module
 * (règle ADR 0001 : isolation par module).
 *
 * Pour `/infractions @user`, un module passera typiquement
 * `{ guildId, targetType: 'user', targetId: userId }` et récupérera
 * uniquement ses propres entrées (auto-filtré par moduleId).
 */
export interface ModuleAuditQuery {
  readonly guildId?: GuildId;
  /** Action exacte (ex. `moderation.case.warn`). Pour un préfixe, faire plusieurs appels. */
  readonly action?: ActionId;
  /** Filtre sur le type de cible (`user` / `channel` / `role` / `message`). */
  readonly targetType?: AuditTarget['type'];
  /** Snowflake / id de la cible (à combiner avec `targetType`). */
  readonly targetId?: string;
  readonly actorType?: AuditActor['type'];
  readonly severity?: AuditSeverity;
  readonly since?: Date | Iso8601DateTime;
  readonly until?: Date | Iso8601DateTime;
  /** Limite de lignes (défaut 50, max 100 côté impl). */
  readonly limit?: number;
  /** Pagination cursor : retourne les lignes strictement plus anciennes que cet ULID. */
  readonly cursor?: Ulid;
}

/**
 * Service d'audit log exposé aux modules.
 *
 * - `log` : écrit une entrée (append-only).
 * - `query` : lit les entrées de **ce module uniquement** (filtre
 *   `moduleId` auto-injecté). Permet par exemple l'historique des
 *   sanctions d'un user pour `/infractions @user`.
 * - `get` : lookup direct par ULID, scopé au module appelant.
 *
 * Les modules ne peuvent pas lire les entrées des autres modules.
 * Le dashboard a sa propre route `GET /guilds/:id/audit` qui passe
 * par `CoreAuditService` (sans restriction de scope) côté API.
 */
export interface AuditService {
  readonly log: (entry: AuditEntry) => Promise<void>;
  readonly query: (options: ModuleAuditQuery) => Promise<readonly AuditLogRecord[]>;
  readonly get: (id: Ulid) => Promise<AuditLogRecord | null>;
}

/**
 * Raison d'un refus de `DiscordService.canModerate`. Stable enum —
 * les modules s'en servent pour brancher des messages d'erreur
 * localisés.
 */
export type ModerationCheckReason = 'self' | 'bot' | 'owner' | 'rank' | 'unknown';

/** Service de permissions applicatives. */
export interface PermissionService {
  readonly can: (
    actor: AuditActor,
    permission: PermissionId,
    target?: AuditTarget,
  ) => Promise<boolean>;
}

/** Handler d'événement, signature générique. */
export type EventHandler<TEvent = CoreEvent> = (event: TEvent) => Promise<void> | void;

/** Bus d'événements typé, avec narrowing par `type`. */
export interface EventBus {
  readonly emit: <T extends CoreEvent>(event: T) => Promise<void>;
  readonly on: <TType extends CoreEventType>(
    type: TType,
    handler: EventHandler<Extract<CoreEvent, { type: TType }>>,
  ) => () => void;
  readonly onAny: (handler: EventHandler) => () => void;
}

/** Signature d'une tâche planifiée. */
export type ScheduledTaskHandler = () => Promise<void> | void;

/** Service de planification de tâches différées. */
export interface SchedulerService {
  readonly in: (durationMs: number, jobKey: string, handler: ScheduledTaskHandler) => Promise<void>;
  readonly at: (date: Date, jobKey: string, handler: ScheduledTaskHandler) => Promise<void>;
  readonly cron: (
    expression: string,
    jobKey: string,
    handler: ScheduledTaskHandler,
  ) => Promise<void>;
  readonly cancel: (jobKey: string) => Promise<boolean>;
}

/** Service d'internationalisation (contrat V1 minimal). */
export interface I18nService {
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * Entrée d'une interaction de type bouton Discord. Produit par le bot
 * (cf. `apps/bot`) au moment d'un click utilisateur sur un message
 * porteur de composants (`message.components`). Les modules y accèdent
 * via les handlers enregistrés sur `ctx.interactions.onButton`.
 *
 * `customId` est la chaîne posée à la création du bouton : c'est sur
 * elle que le routing s'appuie (préfixe `<moduleId>:`). Le handler
 * peut la parser pour récupérer ses arguments encodés.
 */
export interface ButtonInteractionInput {
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly messageId: MessageId;
  readonly userId: UserId;
  readonly customId: string;
}

/**
 * Handler d'une interaction bouton. Retourne un `UIMessage` rendu en
 * réponse éphémère (visible uniquement par l'utilisateur qui a cliqué)
 * ou `null`/`void` pour ne rien renvoyer. Le bot accuse toujours
 * réception côté Discord pour éviter le spinner « cette interaction a
 * échoué » même quand le handler ne renvoie rien.
 */
export type ButtonHandler = (
  input: ButtonInteractionInput,
) => Promise<UIMessage | null | undefined> | UIMessage | null | undefined;

/**
 * Service d'enregistrement de handlers pour les interactions bouton.
 *
 * Le routage par module se fait par préfixe de `customId` :
 *   `ctx.interactions.onButton('rr:', handler)`
 * matche tout `customId` qui commence par `rr:`. Le préfixe doit être
 * unique dans le runtime — un conflit lève une erreur explicite à
 * l'enregistrement. La fonction de désouscription retournée est
 * idempotente.
 */
export interface InteractionsService {
  readonly onButton: (customIdPrefix: string, handler: ButtonHandler) => () => void;
}

/** Service d'accès au keystore chiffré. */
export interface KeystoreService {
  readonly put: (guildId: GuildId, key: string, value: string) => Promise<void>;
  readonly get: (guildId: GuildId, key: string) => Promise<string | null>;
  readonly delete: (guildId: GuildId, key: string) => Promise<void>;
}

/**
 * Surface minimale d'accès Discord autorisée aux modules. Les modules
 * n'accèdent jamais au client discord.js directement : tout passe
 * par `ctx.discord.*` pour que le core applique rate limiting et
 * audit.
 */
export interface DiscordService {
  readonly sendMessage: (channelId: ChannelId, content: string) => Promise<void>;
  /**
   * Envoi proactif d'un `UIMessage` de kind `'embed'` dans un salon.
   * Lève `TypeError` si `message.kind !== 'embed'` (fail fast,
   * pas de no-op).
   *
   * Mapping des échecs vers `DiscordSendError.reason` :
   * - `channel-not-found` : le salon n'existe pas ou le bot n'y a
   *   pas accès au niveau guild.
   * - `missing-permission` : le bot n'a pas `SendMessages` ou
   *   `EmbedLinks` sur le salon.
   * - `rate-limit-exhausted` : les tentatives de retry ont été
   *   épuisées.
   * - `unknown` : toute autre erreur réseau / API.
   */
  readonly sendEmbed: (channelId: ChannelId, message: UIMessage) => Promise<void>;

  /**
   * Pose une réaction du bot sur un message.
   * `emoji` est un Emoji (unicode ou custom).
   * Lève `DiscordSendError` avec `reason: 'channel-not-found' | 'message-not-found' | 'missing-permission' | 'emoji-not-found' | 'rate-limit-exhausted' | 'unknown'`.
   */
  readonly addReaction: (channelId: ChannelId, messageId: MessageId, emoji: Emoji) => Promise<void>;

  /**
   * Retire la réaction d'un user spécifique sur un message (nécessite ManageMessages).
   * Utilisé par le mode Unique de reaction-roles pour basculer d'un rôle à un autre.
   */
  readonly removeUserReaction: (
    channelId: ChannelId,
    messageId: MessageId,
    userId: UserId,
    emoji: Emoji,
  ) => Promise<void>;

  /**
   * Retire la propre réaction du bot sur un message (raccourci pour
   * removeUserReaction(..., botUserId, ...) — le bot n'a pas besoin de
   * connaître son userId).
   */
  readonly removeOwnReaction: (
    channelId: ChannelId,
    messageId: MessageId,
    emoji: Emoji,
  ) => Promise<void>;

  /**
   * Ajoute un rôle Discord à un membre du serveur (nécessite ManageRoles).
   * Utilisé par reaction-roles pour attribuer un rôle sur réaction.
   * Lève `DiscordSendError` avec `reason: 'missing-permission' | 'unknown'`.
   */
  readonly addMemberRole: (guildId: GuildId, userId: UserId, roleId: RoleId) => Promise<void>;

  /**
   * Retire un rôle Discord d'un membre du serveur (nécessite ManageRoles).
   * Utilisé par reaction-roles en mode unique pour retirer le rôle précédent.
   * Lève `DiscordSendError` avec `reason: 'missing-permission' | 'unknown'`.
   */
  readonly removeMemberRole: (guildId: GuildId, userId: UserId, roleId: RoleId) => Promise<void>;

  /**
   * Vérifie si un membre possède un rôle donné.
   * Retourne `false` si le membre ou le rôle n'existe pas.
   * Utilisé par reaction-roles en mode unique pour détecter le rôle courant.
   */
  readonly memberHasRole: (guildId: GuildId, userId: UserId, roleId: RoleId) => Promise<boolean>;

  /**
   * Poste un message texte dans un salon et retourne son identifiant.
   * Variante de `sendMessage` qui expose le `messageId` pour les modules
   * qui doivent persister une référence au message posté (reaction-roles).
   *
   * `options.files` permet d'attacher une ou plusieurs pièces jointes
   * (carte d'accueil pour le module welcome). `options.embeds` accepte
   * des embeds Discord encodés en JSON brut. `options.components`
   * accepte des `ActionRow` Discord encodées en JSON brut — utilisé par
   * reaction-roles V2 pour publier des boutons cliquables.
   *
   * Lève `DiscordSendError` avec `reason: 'channel-not-found' | 'missing-permission' | 'unknown'`.
   */
  readonly postMessage: (
    channelId: ChannelId,
    content: string,
    options?: {
      readonly files?: ReadonlyArray<{ readonly name: string; readonly data: Buffer }>;
      readonly embeds?: ReadonlyArray<unknown>;
      readonly components?: ReadonlyArray<unknown>;
    },
  ) => Promise<{ readonly id: MessageId }>;

  /**
   * Crée un rôle dans une guild. Retourne le `roleId` pour que le module
   * appelant puisse persister la référence. Requiert la permission
   * ManageRoles côté bot.
   *
   * Lève `DiscordSendError('missing-permission')` si le bot n'a pas les droits,
   * `DiscordSendError('unknown')` sinon.
   */
  readonly createRole: (
    guildId: GuildId,
    params: {
      readonly name: string;
      readonly mentionable?: boolean;
      readonly hoist?: boolean;
      /** Couleur RGB encodée en entier (0x000000 à 0xFFFFFF). */
      readonly color?: number;
    },
  ) => Promise<{ readonly id: RoleId }>;

  /**
   * Envoie un message privé à un utilisateur. Échoue silencieusement
   * (résout en `false`) si l'utilisateur a désactivé les DMs venant
   * du serveur ; les autres erreurs lèvent `DiscordSendError`.
   *
   * `options.files` / `options.embeds` ont la même sémantique que
   * pour `postMessage`.
   */
  readonly sendDirectMessage: (
    userId: UserId,
    content: string,
    options?: {
      readonly files?: ReadonlyArray<{ readonly name: string; readonly data: Buffer }>;
      readonly embeds?: ReadonlyArray<unknown>;
    },
  ) => Promise<boolean>;

  /**
   * Supprime un message Discord. Idempotent côté API : si le message
   * a déjà été supprimé manuellement, lève
   * `DiscordSendError('message-not-found')` que l'appelant peut traiter
   * comme un succès silencieux.
   */
  readonly deleteMessage: (channelId: ChannelId, messageId: MessageId) => Promise<void>;

  /**
   * Édite le contenu d'un message Discord posté par le bot.
   * `options.components` permet de remplacer la barre de boutons sans
   * toucher au texte (utile pour ajouter / retirer un bouton après
   * édition de la config reaction-roles).
   *
   * Lève `DiscordSendError` avec
   * `reason: 'channel-not-found' | 'message-not-found' | 'missing-permission' | 'unknown'`.
   */
  readonly editMessage: (
    channelId: ChannelId,
    messageId: MessageId,
    content: string,
    options?: {
      readonly components?: ReadonlyArray<unknown>;
    },
  ) => Promise<void>;

  /**
   * Kick un membre d'une guild. Utilisé par le module welcome pour
   * appliquer le filtre comptes neufs.
   * Lève `DiscordSendError` avec `reason: 'missing-permission' | 'unknown'`.
   */
  readonly kickMember: (guildId: GuildId, userId: UserId, reason?: string) => Promise<void>;

  /**
   * Bannit un membre d'une guild. `deleteMessageDays` est converti en
   * `deleteMessageSeconds` côté implémentation discord.js v14 (le champ
   * `days` est déprécié). Plage `[0, 7]` côté Discord ; pas de clamp
   * dans le contrat — laissé aux handlers V1.
   * Lève `DiscordSendError` avec `reason: 'missing-permission' | 'unknown'`.
   */
  readonly banMember: (
    guildId: GuildId,
    userId: UserId,
    reason?: string,
    deleteMessageDays?: number,
  ) => Promise<void>;

  /**
   * Lève le bannissement d'un utilisateur. Utilisé par `/unban` et
   * l'expiration d'un tempban.
   * Lève `DiscordSendError` avec `reason: 'missing-permission' | 'unknown'`.
   */
  readonly unbanMember: (guildId: GuildId, userId: UserId, reason?: string) => Promise<void>;

  /**
   * Supprime en masse `count` messages dans un salon textuel. Plage
   * Discord `[1, 100]` ; les messages > 14 jours sont silencieusement
   * exclus (limite Discord). Le retour `deleted` permet à l'appelant
   * d'informer l'admin du delta éventuel.
   * Lève `DiscordSendError` avec
   * `reason: 'channel-not-found' | 'missing-permission' | 'unknown'`.
   */
  readonly bulkDeleteMessages: (
    channelId: ChannelId,
    count: number,
  ) => Promise<{ readonly deleted: number }>;

  /**
   * Configure le slowmode d'un salon textuel. `seconds` ∈ `[0, 21600]`
   * (6h, limite Discord). 0 = désactivé. Pas de clamp dans le contrat.
   * Lève `DiscordSendError` avec
   * `reason: 'channel-not-found' | 'missing-permission' | 'unknown'`.
   */
  readonly setChannelSlowmode: (channelId: ChannelId, seconds: number) => Promise<void>;

  /**
   * Vérifie qu'un modérateur peut sanctionner une cible. Encapsule
   * les règles de hiérarchie Discord côté serveur :
   *
   * - `self` : le mod cible lui-même → refus.
   * - `bot` : la cible est le bot Discord → refus.
   * - `owner` : la cible est le propriétaire de la guild → refus.
   * - `rank` : le rôle le plus haut du mod (ou du bot) ne dépasse
   *   pas celui de la cible → refus.
   * - `unknown` : guild non en cache → refus défensif.
   *
   * Si la cible n'est pas membre (ban préventif sur snowflake
   * externe), aucune contrainte de hiérarchie ne s'applique → `ok`.
   *
   * Pas d'effet de bord : pas de log audit, pas de DM, pas de
   * mutation Discord. C'est au handler d'appeler ce check avant la
   * mutation et de produire un `ctx.ui.error` adapté en cas de refus.
   */
  readonly canModerate: (
    guildId: GuildId,
    modUserId: UserId,
    targetUserId: UserId,
  ) => Promise<
    { readonly ok: true } | { readonly ok: false; readonly reason: ModerationCheckReason }
  >;

  /**
   * Retourne le nombre de membres d'une guild si elle est en cache,
   * `null` sinon. Pas d'appel réseau.
   */
  readonly getMemberCount: (guildId: GuildId) => number | null;

  /**
   * Retourne les informations d'affichage d'un utilisateur (nom,
   * tag, URL d'avatar). Source : cache discord.js puis fetch si manquant.
   * Retourne `null` si l'utilisateur n'a pas pu être résolu.
   */
  readonly getUserDisplayInfo: (userId: UserId) => Promise<{
    readonly username: string;
    readonly tag: string;
    readonly avatarUrl: string;
    readonly accountCreatedAt: number;
  } | null>;

  /** Retourne le nom de la guild si elle est en cache, `null` sinon. */
  readonly getGuildName: (guildId: GuildId) => string | null;

  /**
   * Retourne le nom d'un rôle si la guild et le rôle sont en cache,
   * `null` sinon. Pas d'appel réseau.
   */
  readonly getRoleName: (guildId: GuildId, roleId: RoleId) => string | null;
}

/** Query exposée par un module et appelable par un autre via `ctx.modules.query`. */
export interface ModuleQuery<TInput = unknown, TOutput = unknown> {
  readonly schema: ZodType<TInput>;
  readonly resultSchema: ZodType<TOutput>;
  readonly handler: (input: TInput) => Promise<TOutput> | TOutput;
}

/** Service d'accès aux autres modules. */
export interface ModulesService {
  readonly query: <TInput = unknown, TOutput = unknown>(
    moduleId: ModuleId,
    queryId: string,
    input: TInput,
  ) => Promise<TOutput>;
  readonly isEnabled: (guildId: GuildId, moduleId: ModuleId) => Promise<boolean>;
}

/**
 * Suggestion contribuée par un module au flow onboarding (PR 3.13).
 * Vit dans un registre in-process alimenté via
 * `ctx.onboarding.contributeHint` pendant le `onLoad`. Les
 * suggestions sont présentées à l'admin dans le panel latéral du
 * builder au même titre que celles de l'IA — mais elles restent
 * déterministes et n'appellent jamais un provider externe.
 */
export interface OnboardingHint {
  /** Identifiant stable `${moduleId}.${slug}`. Utilisé pour dédupliquer. */
  readonly id: string;
  readonly kind: 'role' | 'category' | 'channel';
  readonly label: string;
  readonly rationale: string;
  /** Fragment de draft qui sera concaténé si l'admin accepte. */
  readonly patch: Readonly<Record<string, unknown>>;
}

/**
 * Surface publique exposée aux modules pour contribuer au moteur
 * d'onboarding (ADR 0007). Un module peut :
 *
 * - `registerAction(def)` : ajouter une action custom au registre de
 *   l'executor. Utile pour des primitives métier (ex. "créer un
 *   webhook Twitch et patcher la config du module streamer"). L'API
 *   vérifie le contrat `OnboardingActionDefinition` (schema Zod +
 *   `apply` + `undo` + `canUndo`).
 * - `contributeHint(hint)` : poser une suggestion hand-curée dans le
 *   registre partagé. L'admin voit ces suggestions à côté de celles
 *   de l'IA sans jamais passer par un provider LLM.
 *
 * Le service est stubbé tant qu'aucun backend n'est câblé (tests
 * isolés, smoke scripts) ; les appels lèvent alors une erreur
 * explicite plutôt que de disparaître silencieusement.
 */
export interface OnboardingService {
  readonly registerAction: <P, R>(definition: OnboardingActionDefinition<P, R>) => void;
  readonly contributeHint: (hint: OnboardingHint) => void;
}

/** Service IA. `null` côté `ctx.ai` si aucun provider n'est configuré. */
export interface AIService {
  readonly complete: (prompt: string, options?: { readonly maxTokens?: number }) => Promise<string>;
  readonly classify: (text: string, labels: readonly string[]) => Promise<string>;
  readonly summarize: (texts: readonly string[]) => Promise<string>;
}

/** Type de message UI normalisé. */
export type UIMessageKind = 'embed' | 'success' | 'error' | 'confirm';

/** Payload "message simple" (success, error). */
export interface UITextPayload {
  readonly message: string;
}

/** Payload d'une demande de confirmation interactive. */
export interface UIConfirmPayload {
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

/**
 * Message UI normalisé. Union discriminée par `kind`. Les consommateurs
 * narrow avec un `switch (message.kind)` ou un `if (message.kind === ...)`
 * et obtiennent le type concret du payload sans cast.
 *
 * Le kind `'embed'` accepte des attachments optionnels pour les cas où
 * un contenu utilisateur trop long ne rentre pas dans l'embed (cf.
 * `UIAttachment` et le module `logs`).
 */
export type UIMessage =
  | {
      readonly kind: 'embed';
      readonly payload: UIEmbed;
      readonly attachments?: readonly UIAttachment[];
    }
  | { readonly kind: 'success'; readonly payload: UITextPayload }
  | { readonly kind: 'error'; readonly payload: UITextPayload }
  | { readonly kind: 'confirm'; readonly payload: UIConfirmPayload };

/**
 * Factory d'UI standard (embeds, réponses, confirmations). Seule
 * surface autorisée pour répondre à une interaction Discord. Toute
 * tentative de contourner la factory est rejetée (dev) ou journalisée
 * comme violation (prod).
 */
export interface UIService {
  /**
   * Construit un `UIMessage` de kind `'embed'`. Rétro-compatible
   * avec l'ancien appel `ctx.ui.embed({ title, description })` — les
   * nouveaux champs (color, fields, author, footer, attachments) sont
   * optionnels.
   */
  readonly embed: (options: UIEmbed, attachments?: readonly UIAttachment[]) => UIMessage;
  readonly success: (message: string) => UIMessage;
  readonly error: (message: string) => UIMessage;
  readonly confirm: (options: {
    readonly message: string;
    readonly confirmLabel?: string;
    readonly cancelLabel?: string;
  }) => UIMessage;
}

/**
 * Accès DB scoped au module. Seules les tables préfixées par l'id
 * du module sont visibles. Les vues du core (guild_config, etc.) sont
 * exposées en lecture via les services `ctx.config`, `ctx.audit`, etc.
 *
 * Typage fin de cette surface : établi en parallèle avec l'arrivée
 * du client Drizzle dans `@varde/db`.
 */
export interface ScopedDatabase {
  readonly __scoped: true;
}

/**
 * Contexte d'exécution d'un module. Seul point d'accès autorisé du
 * module vers le core : aucune autre importation n'est tolérée
 * depuis les packages internes.
 */
export interface ModuleContext {
  readonly module: { readonly id: ModuleId; readonly version: string };
  readonly logger: Logger;
  readonly config: ConfigService;
  readonly db: ScopedDatabase;
  readonly events: EventBus;
  readonly audit: AuditService;
  readonly permissions: PermissionService;
  readonly discord: DiscordService;
  readonly scheduler: SchedulerService;
  readonly i18n: I18nService;
  readonly modules: ModulesService;
  readonly keystore: KeystoreService;
  readonly ai: AIService | null;
  readonly ui: UIService;
  readonly onboarding: OnboardingService;
  /**
   * Service d'enregistrement de handlers pour les interactions bouton
   * (Discord message components). Permet aux modules de réagir à un
   * click utilisateur sur un bouton en répondant éphémère — un
   * comportement impossible avec les réactions emoji classiques.
   */
  readonly interactions: InteractionsService;
}
