import type { I18nMessages } from '@varde/core';

/**
 * Locales V1 du module reaction-roles. FR uniquement. Jalon 5 ajoutera en.
 */

const fr = {
  'audit.role.assigned': '{userId} a reçu le rôle {roleId} via reaction-roles',
  'audit.role.unassigned': '{userId} a perdu le rôle {roleId} via reaction-roles',
  'audit.message.published': 'Reaction-role publié dans <#{channelId}>',
  'audit.message.deleted': 'Reaction-role supprimé de la config (le message Discord reste)',
  'audit.role.created': 'Rôle {roleName} créé automatiquement par reaction-roles',
} satisfies Readonly<Record<string, string>>;

export const locales = { fr } as const satisfies I18nMessages;
