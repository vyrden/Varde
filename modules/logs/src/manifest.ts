import type { ManifestStatic, ModuleId, PermissionId } from '@varde/contracts';

/**
 * Manifeste statique du module officiel `logs`.
 *
 * Rôle : dispatcher les événements `guild.*` émis par le core vers
 * un ou plusieurs salons Discord, sous forme d'embeds formatés par
 * route, configurables depuis le dashboard.
 *
 * PR 4.2 couvre les 12 events `guild.*` pertinents pour un log guild
 * (exclus : `guild.join` et `guild.leave` qui sont des meta-events
 * bot-level inutilisables pour un log puisque le bot quitte la guild).
 *
 * Aucune slash command en V1 : le test d'une route se fait via un
 * bouton dashboard qui appelle une action serveur (PR 4.1d).
 *
 * Permissions : une seule en V1 — `logs.config.manage`. Un admin qui
 * veut distinguer lecture et écriture utilise le contrôle d'accès
 * du dashboard, pas une permission applicative séparée.
 */
export const manifest: ManifestStatic = {
  id: 'logs' as ModuleId,
  name: 'Logs',
  version: '1.1.0',
  coreVersion: '^1.0.0',
  description:
    'Dispatch les événements Discord (arrivées/départs, messages supprimés/édités, etc.) vers des salons de logs configurables.',
  shortDescription: 'Journal des événements Discord vers des salons configurables.',
  category: 'observability',
  icon: 'scroll-text',
  author: { name: 'Mainteneur' },
  license: 'Apache-2.0',
  schemaVersion: 0,
  permissions: [
    {
      id: 'logs.config.manage' as PermissionId,
      category: 'config',
      defaultLevel: 'admin',
      description:
        'Configurer les routes de logs, la verbosité et les exclusions pour cette guild.',
    },
  ],
  events: {
    listen: [
      'guild.memberJoin',
      'guild.memberLeave',
      'guild.memberUpdate',
      'guild.messageCreate',
      'guild.messageDelete',
      'guild.messageEdit',
      'guild.channelCreate',
      'guild.channelUpdate',
      'guild.channelDelete',
      'guild.roleCreate',
      'guild.roleUpdate',
      'guild.roleDelete',
    ],
    emit: [],
  },
};
