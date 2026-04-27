import { z } from 'zod';

import {
  type ChannelId,
  type GuildId,
  isChannelId,
  isGuildId,
  isMessageId,
  isModuleId,
  isRoleId,
  isUserId,
  type MessageId,
  type ModuleId,
  type RoleId,
  type UserId,
} from './ids.js';

/**
 * Catalogue d'événements V1 du projet.
 *
 * Les événements préfixés `guild.*` sont originés du gateway Discord.
 * Les événements préfixés `config.*` et `module.*` sont internes au
 * core. Les modules peuvent émettre leurs propres événements préfixés
 * par leur id (ex. `moderation.sanction.applied`), non listés ici.
 */

// --- Sous-schémas réutilisables ---

const guildIdSchema = z.custom<GuildId>(isGuildId);
const userIdSchema = z.custom<UserId>(isUserId);
const channelIdSchema = z.custom<ChannelId>(isChannelId);
const roleIdSchema = z.custom<RoleId>(isRoleId);
const messageIdSchema = z.custom<MessageId>(isMessageId);
const moduleIdSchema = z.custom<ModuleId>(isModuleId);

/** Timestamp en millisecondes depuis l'epoch. */
const timestampSchema = z.number().int().nonnegative();

/** Emoji unicode ou custom Discord (discriminated union). */
const emojiSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('unicode'), value: z.string().min(1) }),
  z.object({
    type: z.literal('custom'),
    id: z.string().regex(/^\d{17,19}$/, 'emoji.id doit être un snowflake Discord'),
    name: z.string().min(1),
    animated: z.boolean(),
  }),
]);
export type Emoji = z.infer<typeof emojiSchema>;

// --- Événements Discord : membres ---

export const guildMemberJoinSchema = z.object({
  type: z.literal('guild.memberJoin'),
  guildId: guildIdSchema,
  userId: userIdSchema,
  joinedAt: timestampSchema,
  inviterId: userIdSchema.optional(),
});
export type GuildMemberJoinEvent = z.infer<typeof guildMemberJoinSchema>;

export const guildMemberLeaveSchema = z.object({
  type: z.literal('guild.memberLeave'),
  guildId: guildIdSchema,
  userId: userIdSchema,
  leftAt: timestampSchema,
});
export type GuildMemberLeaveEvent = z.infer<typeof guildMemberLeaveSchema>;

export const guildMemberUpdateSchema = z.object({
  type: z.literal('guild.memberUpdate'),
  guildId: guildIdSchema,
  userId: userIdSchema,
  rolesAdded: z.array(roleIdSchema).readonly(),
  rolesRemoved: z.array(roleIdSchema).readonly(),
  nickBefore: z.string().nullable(),
  nickAfter: z.string().nullable(),
  updatedAt: timestampSchema,
});
export type GuildMemberUpdateEvent = z.infer<typeof guildMemberUpdateSchema>;

// --- Événements Discord : messages ---

/**
 * Attachement Discord normalisé pour les events. Le `contentType`
 * est le MIME ; certains messages historiques l'ont à `null` (Discord
 * peut ne pas l'avoir encore détecté côté CDN). Les modules consommateurs
 * doivent fail-open (traiter `null` comme « inconnu ») plutôt que rejeter.
 */
export const messageAttachmentSchema = z.object({
  id: z.string(),
  url: z.string(),
  filename: z.string().optional(),
  contentType: z.string().nullable().optional(),
});
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;

export const guildMessageCreateSchema = z.object({
  type: z.literal('guild.messageCreate'),
  guildId: guildIdSchema,
  channelId: channelIdSchema,
  messageId: messageIdSchema,
  authorId: userIdSchema,
  content: z.string(),
  createdAt: timestampSchema,
  /**
   * Attachements liés au message. Vide si aucun. Optionnel pour la
   * rétro-compat avec les modules qui ne le lisent pas — les modules
   * qui l'attendent lisent `attachments ?? []`.
   */
  attachments: z.array(messageAttachmentSchema).readonly().default([]),
});
export type GuildMessageCreateEvent = z.infer<typeof guildMessageCreateSchema>;

export const guildMessageEditSchema = z.object({
  type: z.literal('guild.messageEdit'),
  guildId: guildIdSchema,
  channelId: channelIdSchema,
  messageId: messageIdSchema,
  authorId: userIdSchema,
  contentBefore: z.string().nullable(),
  contentAfter: z.string(),
  editedAt: timestampSchema,
});
export type GuildMessageEditEvent = z.infer<typeof guildMessageEditSchema>;

export const guildMessageDeleteSchema = z.object({
  type: z.literal('guild.messageDelete'),
  guildId: guildIdSchema,
  channelId: channelIdSchema,
  messageId: messageIdSchema,
  authorId: userIdSchema.nullable(),
  deletedAt: timestampSchema,
});
export type GuildMessageDeleteEvent = z.infer<typeof guildMessageDeleteSchema>;

export const guildMessageReactionAddSchema = z.object({
  type: z.literal('guild.messageReactionAdd'),
  guildId: guildIdSchema,
  channelId: channelIdSchema,
  messageId: messageIdSchema,
  userId: userIdSchema,
  emoji: emojiSchema,
  reactedAt: timestampSchema,
});
export type GuildMessageReactionAddEvent = z.infer<typeof guildMessageReactionAddSchema>;

export const guildMessageReactionRemoveSchema = z.object({
  type: z.literal('guild.messageReactionRemove'),
  guildId: guildIdSchema,
  channelId: channelIdSchema,
  messageId: messageIdSchema,
  userId: userIdSchema,
  emoji: emojiSchema,
  reactedAt: timestampSchema,
});
export type GuildMessageReactionRemoveEvent = z.infer<typeof guildMessageReactionRemoveSchema>;

// --- Événements Discord : salons ---

export const guildChannelCreateSchema = z.object({
  type: z.literal('guild.channelCreate'),
  guildId: guildIdSchema,
  channelId: channelIdSchema,
  createdAt: timestampSchema,
});
export type GuildChannelCreateEvent = z.infer<typeof guildChannelCreateSchema>;

export const guildChannelUpdateSchema = z.object({
  type: z.literal('guild.channelUpdate'),
  guildId: guildIdSchema,
  channelId: channelIdSchema,
  nameBefore: z.string(),
  nameAfter: z.string(),
  topicBefore: z.string().nullable(),
  topicAfter: z.string().nullable(),
  positionBefore: z.number().int().nonnegative(),
  positionAfter: z.number().int().nonnegative(),
  parentIdBefore: channelIdSchema.nullable(),
  parentIdAfter: channelIdSchema.nullable(),
  updatedAt: timestampSchema,
});
export type GuildChannelUpdateEvent = z.infer<typeof guildChannelUpdateSchema>;

export const guildChannelDeleteSchema = z.object({
  type: z.literal('guild.channelDelete'),
  guildId: guildIdSchema,
  channelId: channelIdSchema,
  deletedAt: timestampSchema,
});
export type GuildChannelDeleteEvent = z.infer<typeof guildChannelDeleteSchema>;

// --- Événements Discord : rôles ---

export const guildRoleCreateSchema = z.object({
  type: z.literal('guild.roleCreate'),
  guildId: guildIdSchema,
  roleId: roleIdSchema,
  createdAt: timestampSchema,
});
export type GuildRoleCreateEvent = z.infer<typeof guildRoleCreateSchema>;

export const guildRoleUpdateSchema = z.object({
  type: z.literal('guild.roleUpdate'),
  guildId: guildIdSchema,
  roleId: roleIdSchema,
  nameBefore: z.string(),
  nameAfter: z.string(),
  colorBefore: z.number().int().nonnegative(),
  colorAfter: z.number().int().nonnegative(),
  hoistBefore: z.boolean(),
  hoistAfter: z.boolean(),
  mentionableBefore: z.boolean(),
  mentionableAfter: z.boolean(),
  permissionsBefore: z.string(),
  permissionsAfter: z.string(),
  updatedAt: timestampSchema,
});
export type GuildRoleUpdateEvent = z.infer<typeof guildRoleUpdateSchema>;

export const guildRoleDeleteSchema = z.object({
  type: z.literal('guild.roleDelete'),
  guildId: guildIdSchema,
  roleId: roleIdSchema,
  deletedAt: timestampSchema,
});
export type GuildRoleDeleteEvent = z.infer<typeof guildRoleDeleteSchema>;

// --- Événements Discord : arrivée/départ du bot sur un serveur ---

export const guildJoinSchema = z.object({
  type: z.literal('guild.join'),
  guildId: guildIdSchema,
  joinedAt: timestampSchema,
});
export type GuildJoinEvent = z.infer<typeof guildJoinSchema>;

export const guildLeaveSchema = z.object({
  type: z.literal('guild.leave'),
  guildId: guildIdSchema,
  leftAt: timestampSchema,
});
export type GuildLeaveEvent = z.infer<typeof guildLeaveSchema>;

// --- Événements système : config et cycle de vie des modules ---

export const configChangedSchema = z.object({
  type: z.literal('config.changed'),
  guildId: guildIdSchema,
  /** Portion de config concernée : `core` ou `modules.<id>`. */
  scope: z.string(),
  versionBefore: z.number().int().nonnegative(),
  versionAfter: z.number().int().nonnegative(),
  updatedBy: userIdSchema.nullable(),
  updatedAt: timestampSchema,
});
export type ConfigChangedEvent = z.infer<typeof configChangedSchema>;

export const moduleLoadedSchema = z.object({
  type: z.literal('module.loaded'),
  moduleId: moduleIdSchema,
  version: z.string(),
  loadedAt: timestampSchema,
});
export type ModuleLoadedEvent = z.infer<typeof moduleLoadedSchema>;

export const moduleEnabledSchema = z.object({
  type: z.literal('module.enabled'),
  guildId: guildIdSchema,
  moduleId: moduleIdSchema,
  enabledAt: timestampSchema,
  enabledBy: userIdSchema.nullable(),
});
export type ModuleEnabledEvent = z.infer<typeof moduleEnabledSchema>;

export const moduleDisabledSchema = z.object({
  type: z.literal('module.disabled'),
  guildId: guildIdSchema,
  moduleId: moduleIdSchema,
  disabledAt: timestampSchema,
  disabledBy: userIdSchema.nullable(),
});
export type ModuleDisabledEvent = z.infer<typeof moduleDisabledSchema>;

export const moduleUnloadedSchema = z.object({
  type: z.literal('module.unloaded'),
  moduleId: moduleIdSchema,
  unloadedAt: timestampSchema,
});
export type ModuleUnloadedEvent = z.infer<typeof moduleUnloadedSchema>;

// --- Union discriminée ---

/**
 * Union de tous les événements core de la V1. Discriminée par le
 * champ `type` : permet aux handlers de faire une exhaustivité TS
 * sur les événements via un `switch` classique.
 */
export const coreEventSchema = z.discriminatedUnion('type', [
  guildMemberJoinSchema,
  guildMemberLeaveSchema,
  guildMemberUpdateSchema,
  guildMessageCreateSchema,
  guildMessageEditSchema,
  guildMessageDeleteSchema,
  guildMessageReactionAddSchema,
  guildMessageReactionRemoveSchema,
  guildChannelCreateSchema,
  guildChannelUpdateSchema,
  guildChannelDeleteSchema,
  guildRoleCreateSchema,
  guildRoleUpdateSchema,
  guildRoleDeleteSchema,
  guildJoinSchema,
  guildLeaveSchema,
  configChangedSchema,
  moduleLoadedSchema,
  moduleEnabledSchema,
  moduleDisabledSchema,
  moduleUnloadedSchema,
]);

/** Événement core validé. */
export type CoreEvent = z.infer<typeof coreEventSchema>;

/** Nom canonique (littéral) d'un événement core. */
export type CoreEventType = CoreEvent['type'];

/** Vérifie si `value` est un événement core valide. */
export function isCoreEvent(value: unknown): value is CoreEvent {
  return coreEventSchema.safeParse(value).success;
}

/**
 * Parse `value` en événement core. Renvoie `null` si invalide.
 */
export function parseCoreEvent(value: unknown): CoreEvent | null {
  const result = coreEventSchema.safeParse(value);
  return result.success ? result.data : null;
}
