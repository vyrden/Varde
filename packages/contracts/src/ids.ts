/**
 * Identifiants typés (branded types) du projet.
 *
 * Les identifiants Discord (snowflakes) sont typés distinctement les
 * uns des autres : le compilateur refuse qu'on passe un `UserId` là où
 * un `GuildId` est attendu. Les identifiants applicatifs
 * (`ModuleId`, `PermissionId`, `ActionId`) ont leurs propres formats
 * normalisés.
 */

declare const idBrand: unique symbol;

type IdBrand<B extends string> = { readonly [idBrand]: B };

/** Identifiant d'un serveur Discord (snowflake). */
export type GuildId = string & IdBrand<'GuildId'>;
/** Identifiant d'un utilisateur Discord (snowflake). */
export type UserId = string & IdBrand<'UserId'>;
/** Identifiant d'un salon Discord (snowflake). */
export type ChannelId = string & IdBrand<'ChannelId'>;
/** Identifiant d'un rôle Discord (snowflake). */
export type RoleId = string & IdBrand<'RoleId'>;
/** Identifiant d'un message Discord (snowflake). */
export type MessageId = string & IdBrand<'MessageId'>;

/**
 * Identifiant d'un module. Kebab-case, optionnellement préfixé
 * par l'auteur (`author/module-name`).
 */
export type ModuleId = string & IdBrand<'ModuleId'>;
/** Identifiant d'une permission applicative. Format `module.action` ou `module.category.action`. */
export type PermissionId = string & IdBrand<'PermissionId'>;
/** Identifiant d'une action d'audit. Format `module.action.verb`. */
export type ActionId = string & IdBrand<'ActionId'>;

/** Snowflake Discord : entier 64 bits stringifié, 17 à 20 chiffres. */
const SNOWFLAKE_REGEX = /^[0-9]{17,20}$/;

/** Module id : kebab-case, optionnellement préfixé `author/`. */
const MODULE_ID_REGEX = /^([a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9-]*$/;

/** Permission id : deux à trois segments kebab-case séparés par un point (`module.action` ou `module.category.action`). */
const PERMISSION_ID_REGEX = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*){1,2}$/;

/** Action id : trois segments kebab-case séparés par des points. */
const ACTION_ID_REGEX = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;

/** Vérifie si `value` est un `GuildId` valide. */
export function isGuildId(value: unknown): value is GuildId {
  return typeof value === 'string' && SNOWFLAKE_REGEX.test(value);
}

/** Vérifie si `value` est un `UserId` valide. */
export function isUserId(value: unknown): value is UserId {
  return typeof value === 'string' && SNOWFLAKE_REGEX.test(value);
}

/** Vérifie si `value` est un `ChannelId` valide. */
export function isChannelId(value: unknown): value is ChannelId {
  return typeof value === 'string' && SNOWFLAKE_REGEX.test(value);
}

/** Vérifie si `value` est un `RoleId` valide. */
export function isRoleId(value: unknown): value is RoleId {
  return typeof value === 'string' && SNOWFLAKE_REGEX.test(value);
}

/** Vérifie si `value` est un `MessageId` valide. */
export function isMessageId(value: unknown): value is MessageId {
  return typeof value === 'string' && SNOWFLAKE_REGEX.test(value);
}

/** Vérifie si `value` est un `ModuleId` valide. */
export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && MODULE_ID_REGEX.test(value);
}

/** Vérifie si `value` est un `PermissionId` valide. */
export function isPermissionId(value: unknown): value is PermissionId {
  return typeof value === 'string' && PERMISSION_ID_REGEX.test(value);
}

/** Vérifie si `value` est un `ActionId` valide. */
export function isActionId(value: unknown): value is ActionId {
  return typeof value === 'string' && ACTION_ID_REGEX.test(value);
}

/**
 * Raffine `value` en `GuildId`.
 *
 * @throws {TypeError} Si la valeur ne respecte pas le format snowflake.
 */
export function assertGuildId(value: string): GuildId {
  if (!isGuildId(value)) {
    throw new TypeError(`GuildId invalide: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Raffine `value` en `UserId`.
 *
 * @throws {TypeError} Si la valeur ne respecte pas le format snowflake.
 */
export function assertUserId(value: string): UserId {
  if (!isUserId(value)) {
    throw new TypeError(`UserId invalide: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Raffine `value` en `ChannelId`.
 *
 * @throws {TypeError} Si la valeur ne respecte pas le format snowflake.
 */
export function assertChannelId(value: string): ChannelId {
  if (!isChannelId(value)) {
    throw new TypeError(`ChannelId invalide: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Raffine `value` en `RoleId`.
 *
 * @throws {TypeError} Si la valeur ne respecte pas le format snowflake.
 */
export function assertRoleId(value: string): RoleId {
  if (!isRoleId(value)) {
    throw new TypeError(`RoleId invalide: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Raffine `value` en `MessageId`.
 *
 * @throws {TypeError} Si la valeur ne respecte pas le format snowflake.
 */
export function assertMessageId(value: string): MessageId {
  if (!isMessageId(value)) {
    throw new TypeError(`MessageId invalide: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Raffine `value` en `ModuleId`.
 *
 * @throws {TypeError} Si la valeur ne respecte pas le format attendu.
 */
export function assertModuleId(value: string): ModuleId {
  if (!isModuleId(value)) {
    throw new TypeError(`ModuleId invalide: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Raffine `value` en `PermissionId`.
 *
 * @throws {TypeError} Si la valeur ne respecte pas le format attendu.
 */
export function assertPermissionId(value: string): PermissionId {
  if (!isPermissionId(value)) {
    throw new TypeError(`PermissionId invalide: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Raffine `value` en `ActionId`.
 *
 * @throws {TypeError} Si la valeur ne respecte pas le format attendu.
 */
export function assertActionId(value: string): ActionId {
  if (!isActionId(value)) {
    throw new TypeError(`ActionId invalide: ${JSON.stringify(value)}`);
  }
  return value;
}
