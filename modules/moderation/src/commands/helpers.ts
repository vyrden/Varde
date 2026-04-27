import {
  type ChannelId,
  type CommandInteractionInput,
  DiscordSendError,
  type GuildId,
  type ModuleCommandHandler,
  type ModuleContext,
  type UIMessage,
  type UserId,
} from '@varde/contracts';

import { describeCheckReason } from '../audit-actions.js';
import { resolveConfig } from '../config.js';

/**
 * Helpers partagés par les 10 handlers : extraction des options
 * communes, vérifications préliminaires (cible présente dans
 * `resolved`, hiérarchie via `ctx.discord.canModerate`), formatage
 * d'erreurs Discord uniformes.
 */

/** Lit une option string non vide ; renvoie null si absente. */
export const readStringOption = (input: CommandInteractionInput, name: string): string | null => {
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  const raw = input.options[name];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
};

/** Lit une option number ; renvoie null si absente / NaN. */
export const readNumberOption = (input: CommandInteractionInput, name: string): number | null => {
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  const raw = input.options[name];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
};

/** Lit une option user (snowflake string). */
export const readUserIdOption = (input: CommandInteractionInput, name: string): UserId | null => {
  const raw = readStringOption(input, name);
  return raw === null ? null : (raw as UserId);
};

/**
 * Vérifie la hiérarchie via `ctx.discord.canModerate`. Retourne :
 * - `null` si la cible peut être sanctionnée (handler continue) ;
 * - un `UIMessage` `error` à retourner immédiatement sinon.
 *
 * Centralise le message d'erreur via `describeCheckReason` pour que
 * les 10 handlers n'aient pas à le dupliquer.
 */
export const enforceHierarchy = async (
  ctx: ModuleContext,
  guildId: GuildId,
  modUserId: UserId,
  targetUserId: UserId,
): Promise<UIMessage | null> => {
  const verdict = await ctx.discord.canModerate(guildId, modUserId, targetUserId);
  if (verdict.ok) return null;
  return ctx.ui.error(describeCheckReason(verdict.reason));
};

/**
 * Convertit une `DiscordSendError` en `UIMessage` `error` lisible.
 * Mappe les `reason` typées sur des messages français.
 */
export const formatDiscordError = (
  ctx: ModuleContext,
  error: unknown,
  action: string,
): UIMessage => {
  if (error instanceof DiscordSendError) {
    switch (error.reason) {
      case 'missing-permission':
        return ctx.ui.error(
          `Discord refuse l'action "${action}" : permission insuffisante côté bot (vérifier le rôle du bot).`,
        );
      case 'channel-not-found':
        return ctx.ui.error(`Salon introuvable pour l'action "${action}".`);
      case 'message-not-found':
        return ctx.ui.error(`Message introuvable pour l'action "${action}".`);
      case 'rate-limit-exhausted':
        return ctx.ui.error(
          `Discord a rate-limit l'action "${action}". Réessayer dans quelques secondes.`,
        );
      default:
        return ctx.ui.error(`L'action "${action}" a échoué côté Discord.`);
    }
  }
  return ctx.ui.error(
    `L'action "${action}" a échoué : ${error instanceof Error ? error.message : String(error)}`,
  );
};

/** Lit `mutedRoleId` depuis la config moderation pour la guild. */
export const getMutedRoleId = async (
  ctx: ModuleContext,
  guildId: GuildId,
): Promise<string | null> => {
  try {
    const raw = await ctx.config.get(guildId);
    return resolveConfig(raw).mutedRoleId;
  } catch {
    return null;
  }
};

/** Lit `dmOnSanction` depuis la config (défaut `true` si lecture rate). */
export const shouldDmOnSanction = async (
  ctx: ModuleContext,
  guildId: GuildId,
): Promise<boolean> => {
  try {
    const raw = await ctx.config.get(guildId);
    return resolveConfig(raw).dmOnSanction;
  } catch {
    return true;
  }
};

/** Cast un id channel string → branded ChannelId. */
export const asChannelId = (id: string): ChannelId => id as ChannelId;

/** Type alias pratique pour les handlers. */
export type ModerationHandler = ModuleCommandHandler;
