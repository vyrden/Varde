import type { ActionId, ModerationCheckReason, PermissionId } from '@varde/contracts';

/**
 * Identifiants canoniques des actions audit émises par le module
 * moderation. Chaque commande émet une action `moderation.case.*`
 * avec `actor: { type: 'user', id: modUserId }` et `target` sur la
 * cible (user ou channel). L'utilisateur final lira ces entrées via
 * la page audit du dashboard, filtrées par `module_id = 'moderation'`.
 */
export const ACTION_WARN = 'moderation.case.warn' as ActionId;
export const ACTION_KICK = 'moderation.case.kick' as ActionId;
export const ACTION_BAN = 'moderation.case.ban' as ActionId;
export const ACTION_TEMPBAN = 'moderation.case.tempban' as ActionId;
export const ACTION_UNBAN = 'moderation.case.unban' as ActionId;
export const ACTION_MUTE = 'moderation.case.mute' as ActionId;
export const ACTION_TEMPMUTE = 'moderation.case.tempmute' as ActionId;
export const ACTION_UNMUTE = 'moderation.case.unmute' as ActionId;
export const ACTION_PURGE = 'moderation.case.purge' as ActionId;
export const ACTION_SLOWMODE = 'moderation.case.slowmode' as ActionId;

/** IDs de permissions applicatives consommés par les handlers. */
export const PERM_WARN = 'moderation.actions.warn' as PermissionId;
export const PERM_KICK = 'moderation.actions.kick' as PermissionId;
export const PERM_BAN = 'moderation.actions.ban' as PermissionId;
export const PERM_MUTE = 'moderation.actions.mute' as PermissionId;
export const PERM_PURGE = 'moderation.actions.purge' as PermissionId;
export const PERM_SLOWMODE = 'moderation.actions.slowmode' as PermissionId;
export const PERM_CASES_READ = 'moderation.cases.read' as PermissionId;

/** Toutes les actions `moderation.case.*` exposées par le module. */
export const ALL_CASE_ACTIONS = [
  ACTION_WARN,
  ACTION_KICK,
  ACTION_BAN,
  ACTION_TEMPBAN,
  ACTION_UNBAN,
  ACTION_MUTE,
  ACTION_TEMPMUTE,
  ACTION_UNMUTE,
] as const;

/**
 * Traduit une action audit en label court humain ("Warn", "Ban
 * temporaire", etc.). Utilisé par `/infractions` pour rendre la
 * liste lisible dans Discord.
 */
export function formatCaseLabel(action: ActionId): string {
  switch (action) {
    case ACTION_WARN:
      return 'Warn';
    case ACTION_KICK:
      return 'Kick';
    case ACTION_BAN:
      return 'Ban';
    case ACTION_TEMPBAN:
      return 'Tempban';
    case ACTION_UNBAN:
      return 'Unban';
    case ACTION_MUTE:
      return 'Mute';
    case ACTION_TEMPMUTE:
      return 'Tempmute';
    case ACTION_UNMUTE:
      return 'Unmute';
    case ACTION_PURGE:
      return 'Purge';
    case ACTION_SLOWMODE:
      return 'Slowmode';
    default:
      return action;
  }
}

/**
 * Traduit un `ModerationCheckReason` en message d'erreur affichable
 * via `ctx.ui.error`. Centralisé pour qu'on n'ait pas à dupliquer
 * dans les 10 handlers.
 */
export function describeCheckReason(reason: ModerationCheckReason): string {
  switch (reason) {
    case 'self':
      return 'Tu ne peux pas te sanctionner toi-même.';
    case 'bot':
      return 'Le bot ne peut pas se sanctionner lui-même.';
    case 'owner':
      return 'Le propriétaire de la guild ne peut pas être sanctionné.';
    case 'rank':
      return 'Hiérarchie insuffisante : le rôle le plus haut du modérateur (ou du bot) ne dépasse pas celui de la cible.';
    case 'unknown':
      return 'Vérification de hiérarchie impossible (guild non disponible).';
  }
}
