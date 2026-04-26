import type { I18nMessages } from '@varde/core';

const fr = {
  'audit.member.welcomed': '{userId} a été accueilli (mode={destination})',
  'audit.member.goodbye': '{userId} a quitté ({channelId} notifié)',
  'audit.member.autorole': "{userId} a reçu l'auto-rôle {roleId}",
  'audit.member.kicked': '{userId} kické (compte trop neuf, âge={accountAgeDays}j)',
  'audit.member.quarantined':
    '{userId} mis en quarantaine (compte trop neuf, rôle={roleId}, âge={accountAgeDays}j)',
} satisfies Readonly<Record<string, string>>;

const en: typeof fr = {
  'audit.member.welcomed': '{userId} was welcomed (mode={destination})',
  'audit.member.goodbye': '{userId} left ({channelId} notified)',
  'audit.member.autorole': '{userId} received auto-role {roleId}',
  'audit.member.kicked': '{userId} kicked (account too new, age={accountAgeDays}d)',
  'audit.member.quarantined':
    '{userId} quarantined (account too new, role={roleId}, age={accountAgeDays}d)',
};

export const locales = { fr, en } as const satisfies I18nMessages;
