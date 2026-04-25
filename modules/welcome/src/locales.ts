import type { I18nMessages } from '@varde/core';

const fr = {
  'audit.member.welcomed': '{userId} a été accueilli (mode={destination})',
  'audit.member.goodbye': '{userId} a quitté ({channelId} notifié)',
  'audit.member.autorole': "{userId} a reçu l'auto-rôle {roleId}",
  'audit.member.kicked': '{userId} kické (compte trop neuf, âge={accountAgeDays}j)',
  'audit.member.quarantined':
    '{userId} mis en quarantaine (compte trop neuf, rôle={roleId}, âge={accountAgeDays}j)',
} satisfies Readonly<Record<string, string>>;

export const locales = { fr } as const satisfies I18nMessages;
