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

  // guild.memberUpdate
  'memberUpdate.title': 'Membre modifié',
  'memberUpdate.description': 'Le profil de <@{userId}> a changé.',
  'memberUpdate.rolesAdded': 'Rôles ajoutés',
  'memberUpdate.rolesRemoved': 'Rôles retirés',
  'memberUpdate.nickBefore': 'Surnom avant',
  'memberUpdate.nickAfter': 'Surnom après',
  'memberUpdate.noNick': '(aucun)',

  // guild.channelCreate / Update / Delete
  'channelCreate.title': 'Salon créé',
  'channelCreate.description': 'Un nouveau salon a été créé : <#{channelId}>.',
  'channelUpdate.title': 'Salon modifié',
  'channelUpdate.description': 'Le salon <#{channelId}> a été modifié.',
  'channelUpdate.nameBefore': 'Nom avant',
  'channelUpdate.nameAfter': 'Nom après',
  'channelUpdate.topicBefore': 'Sujet avant',
  'channelUpdate.topicAfter': 'Sujet après',
  'channelUpdate.positionBefore': 'Position avant',
  'channelUpdate.positionAfter': 'Position après',
  'channelUpdate.parentBefore': 'Catégorie avant',
  'channelUpdate.parentAfter': 'Catégorie après',
  'channelUpdate.noTopic': '(aucun)',
  'channelUpdate.noParent': '(hors catégorie)',
  'channelDelete.title': 'Salon supprimé',
  'channelDelete.description': 'Un salon a été supprimé (id `{channelId}`).',

  // guild.roleCreate / Update / Delete
  'roleCreate.title': 'Rôle créé',
  'roleCreate.description': 'Un nouveau rôle a été créé (id `{roleId}`).',
  'roleUpdate.title': 'Rôle modifié',
  'roleUpdate.description': 'Le rôle <@&{roleId}> a été modifié.',
  'roleUpdate.nameBefore': 'Nom avant',
  'roleUpdate.nameAfter': 'Nom après',
  'roleUpdate.colorBefore': 'Couleur avant',
  'roleUpdate.colorAfter': 'Couleur après',
  'roleUpdate.hoistBefore': 'Séparé avant',
  'roleUpdate.hoistAfter': 'Séparé après',
  'roleUpdate.mentionableBefore': 'Mentionnable avant',
  'roleUpdate.mentionableAfter': 'Mentionnable après',
  'roleUpdate.permissionsBefore': 'Permissions avant',
  'roleUpdate.permissionsAfter': 'Permissions après',
  'roleUpdate.yes': 'oui',
  'roleUpdate.no': 'non',
  'roleDelete.title': 'Rôle supprimé',
  'roleDelete.description': 'Un rôle a été supprimé (id `{roleId}`).',

  // guild.messageCreate (optionnel, bruyant par défaut — non activé dans les presets simple mode)
  'messageCreate.title': 'Message envoyé',
  'messageCreate.description': '<@{authorId}> a envoyé un message dans <#{channelId}>.',
  'messageCreate.content': 'Contenu',

  // Test de la route de logs (PR 4.1d).
  'test.title': 'Test de la route',
  'test.description':
    'Si tu vois ce message, la route fonctionne correctement. Tu peux fermer ce test.',
} satisfies Readonly<Record<string, string>>;

export const locales = { fr } as const satisfies I18nMessages;
