import type { I18nMessages } from '@varde/core';

/**
 * Locales V1 du module `logs`. FR uniquement. Le jalon 5 ajoutera
 * `en` dans un fichier séparé sans refonte.
 *
 * Les clés suivent la convention `<section>.<event?>.<label>` pour
 * rester lisibles dans les fichiers YAML d'une future édition
 * communautaire. Les params (`{user}`, `{channel}`) sont résolus par
 * `ctx.i18n.t(key, params)`.
 */

const fr = {
  // Champs communs à tous les embeds.
  'common.author': 'Auteur',
  'common.channel': 'Salon',
  'common.role': 'Rôle',
  'common.timestamp': 'Date',
  'common.footer': 'Varde',
  'common.truncated.inline': 'Contenu trop long : voir la pièce jointe.',
  'common.attachment.deleted.unavailable':
    'Pièce jointe non récupérable (URL CDN expirée par Discord).',

  // Titres d'embed par event type.
  'memberJoin.title': 'Nouveau membre',
  'memberJoin.description': '<@{userId}> a rejoint la guilde.',
  'memberJoin.inviter': 'Invité par',

  'memberLeave.title': 'Départ',
  'memberLeave.description': '<@{userId}> a quitté la guilde.',

  'messageDelete.title': 'Message supprimé',
  'messageDelete.description': 'Un message a été supprimé dans <#{channelId}>.',
  'messageDelete.contentBefore': 'Contenu',
  'messageDelete.noAuthor': 'Auteur introuvable (message hors cache)',

  'messageEdit.title': 'Message édité',
  'messageEdit.description': 'Un message a été édité dans <#{channelId}>.',
  'messageEdit.contentBefore': 'Avant',
  'messageEdit.contentAfter': 'Après',
  'messageEdit.jumpLink': 'Lien',

  // Test de la route de logs (PR 4.1d).
  'test.title': 'Test de la route',
  'test.description':
    'Si tu vois ce message, la route fonctionne correctement. Tu peux fermer ce test.',
} satisfies Readonly<Record<string, string>>;

export const locales = { fr } as const satisfies I18nMessages;
