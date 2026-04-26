import type { I18nMessages } from '@varde/core';

/**
 * Locales du module `logs`. FR et EN, indexées par couple
 * `<section>.<event?>.<label>` pour rester lisibles dans une future
 * édition communautaire YAML. Les params (`{user}`, `{channel}`)
 * sont résolus par `ctx.i18n.t(key, params)`.
 *
 * Les deux dictionnaires partagent le même set de clés. Une clé
 * absente côté `en` retombe sur le fallback du core (`fr` reste la
 * locale par défaut tant que `core.bot-settings.language` n'est pas
 * basculé).
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

const en: typeof fr = {
  'common.author': 'Author',
  'common.channel': 'Channel',
  'common.role': 'Role',
  'common.timestamp': 'Date',
  'common.footer': 'Varde',
  'common.truncated.inline': 'Content too long: see attachment.',
  'common.attachment.deleted.unavailable': 'Attachment unavailable (CDN URL expired by Discord).',

  'memberJoin.title': 'New member',
  'memberJoin.description': '<@{userId}> joined the server.',
  'memberJoin.inviter': 'Invited by',

  'memberLeave.title': 'Member left',
  'memberLeave.description': '<@{userId}> left the server.',

  'messageDelete.title': 'Message deleted',
  'messageDelete.description': 'A message was deleted in <#{channelId}>.',
  'messageDelete.contentBefore': 'Content',
  'messageDelete.noAuthor': 'Author not found (message out of cache)',

  'messageEdit.title': 'Message edited',
  'messageEdit.description': 'A message was edited in <#{channelId}>.',
  'messageEdit.contentBefore': 'Before',
  'messageEdit.contentAfter': 'After',
  'messageEdit.jumpLink': 'Jump to message',

  'memberUpdate.title': 'Member updated',
  'memberUpdate.description': "<@{userId}>'s profile changed.",
  'memberUpdate.rolesAdded': 'Roles added',
  'memberUpdate.rolesRemoved': 'Roles removed',
  'memberUpdate.nickBefore': 'Nickname before',
  'memberUpdate.nickAfter': 'Nickname after',
  'memberUpdate.noNick': '(none)',

  'channelCreate.title': 'Channel created',
  'channelCreate.description': 'A new channel was created: <#{channelId}>.',
  'channelUpdate.title': 'Channel updated',
  'channelUpdate.description': '<#{channelId}> was updated.',
  'channelUpdate.nameBefore': 'Name before',
  'channelUpdate.nameAfter': 'Name after',
  'channelUpdate.topicBefore': 'Topic before',
  'channelUpdate.topicAfter': 'Topic after',
  'channelUpdate.positionBefore': 'Position before',
  'channelUpdate.positionAfter': 'Position after',
  'channelUpdate.parentBefore': 'Category before',
  'channelUpdate.parentAfter': 'Category after',
  'channelUpdate.noTopic': '(none)',
  'channelUpdate.noParent': '(no category)',
  'channelDelete.title': 'Channel deleted',
  'channelDelete.description': 'A channel was deleted (id `{channelId}`).',

  'roleCreate.title': 'Role created',
  'roleCreate.description': 'A new role was created (id `{roleId}`).',
  'roleUpdate.title': 'Role updated',
  'roleUpdate.description': '<@&{roleId}> was updated.',
  'roleUpdate.nameBefore': 'Name before',
  'roleUpdate.nameAfter': 'Name after',
  'roleUpdate.colorBefore': 'Color before',
  'roleUpdate.colorAfter': 'Color after',
  'roleUpdate.hoistBefore': 'Hoisted before',
  'roleUpdate.hoistAfter': 'Hoisted after',
  'roleUpdate.mentionableBefore': 'Mentionable before',
  'roleUpdate.mentionableAfter': 'Mentionable after',
  'roleUpdate.permissionsBefore': 'Permissions before',
  'roleUpdate.permissionsAfter': 'Permissions after',
  'roleUpdate.yes': 'yes',
  'roleUpdate.no': 'no',
  'roleDelete.title': 'Role deleted',
  'roleDelete.description': 'A role was deleted (id `{roleId}`).',

  'messageCreate.title': 'Message sent',
  'messageCreate.description': '<@{authorId}> sent a message in <#{channelId}>.',
  'messageCreate.content': 'Content',

  'test.title': 'Route test',
  'test.description':
    'If you see this message, the route is working correctly. You can dismiss this test.',
};

export const locales = { fr, en } as const satisfies I18nMessages;
