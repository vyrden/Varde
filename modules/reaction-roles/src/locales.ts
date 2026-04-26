import type { I18nMessages } from '@varde/core';

/**
 * Locales du module reaction-roles. FR + EN. Les deux dictionnaires
 * partagent le même set de clés ; le fallback du core retombe sur EN
 * si une clé manque dans la locale active.
 */

const fr = {
  'audit.role.assigned': '{userId} a reçu le rôle {roleId} via reaction-roles',
  'audit.role.unassigned': '{userId} a perdu le rôle {roleId} via reaction-roles',
  'audit.message.published': 'Reaction-role publié dans <#{channelId}>',
  'audit.message.deleted': 'Reaction-role supprimé de la config (le message Discord reste)',
  'audit.role.created': 'Rôle {roleName} créé automatiquement par reaction-roles',
} satisfies Readonly<Record<string, string>>;

const en: typeof fr = {
  'audit.role.assigned': '{userId} received role {roleId} via reaction-roles',
  'audit.role.unassigned': '{userId} lost role {roleId} via reaction-roles',
  'audit.message.published': 'Reaction-role published in <#{channelId}>',
  'audit.message.deleted': 'Reaction-role removed from config (Discord message remains)',
  'audit.role.created': 'Role {roleName} created automatically by reaction-roles',
};

export const locales = { fr, en } as const satisfies I18nMessages;
