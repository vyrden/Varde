import type { ManifestStatic, ModuleId, PermissionId } from '@varde/contracts';

/**
 * Manifeste du module officiel `moderation`. PR 4.M.1 ne livre que
 * la déclaration des permissions et la coquille du module ; les
 * handlers de slash commands arrivent en PR 4.M.2.
 *
 * Permissions volontairement granulaires par action (vs un seul
 * `moderation.manage`) — l'admin compose finement qui peut warn vs
 * ban vs purge. La permission `cases.read` est rangée en catégorie
 * `audit` pour matérialiser la lecture seule sur l'historique
 * (`/infractions`, `/case`).
 *
 * Une seule permission couvre `ban / tempban / unban` (idem pour
 * `mute / tempmute / unmute`) — éviter d'inonder la matrice
 * permissions le jour 1. Si un déploiement veut un grain plus fin
 * post-V1, on ajoutera `moderation.actions.unban` séparément sans
 * casser la rétrocompat.
 *
 * `events.listen` reste vide : aucun handler events V1. `emit` vide
 * également (pas d'event public émis par moderation pour l'instant).
 */
export const manifest: ManifestStatic = {
  id: 'moderation' as ModuleId,
  name: 'Moderation',
  version: '1.1.0',
  coreVersion: '^1.0.0',
  description:
    'Commandes manuelles de modération (warn, kick, ban, mute, purge, slowmode) avec historique des sanctions.',
  author: { name: 'Mainteneur' },
  license: 'Apache-2.0',
  schemaVersion: 0,
  permissions: [
    {
      id: 'moderation.actions.warn' as PermissionId,
      category: 'moderation',
      defaultLevel: 'admin',
      description: 'Émettre un avertissement (`/warn`).',
    },
    {
      id: 'moderation.actions.kick' as PermissionId,
      category: 'moderation',
      defaultLevel: 'admin',
      description: 'Expulser un membre (`/kick`).',
    },
    {
      id: 'moderation.actions.ban' as PermissionId,
      category: 'moderation',
      defaultLevel: 'admin',
      description: 'Bannir / tempban / unban (`/ban`, `/tempban`, `/unban`).',
    },
    {
      id: 'moderation.actions.mute' as PermissionId,
      category: 'moderation',
      defaultLevel: 'admin',
      description: 'Muter / tempmute / unmute via le rôle muet configuré.',
    },
    {
      id: 'moderation.actions.purge' as PermissionId,
      category: 'moderation',
      defaultLevel: 'admin',
      description: 'Supprimer des messages en masse (`/clear`).',
    },
    {
      id: 'moderation.actions.slowmode' as PermissionId,
      category: 'moderation',
      defaultLevel: 'admin',
      description: 'Modifier le slowmode d’un salon (`/slowmode`).',
    },
    {
      id: 'moderation.cases.read' as PermissionId,
      category: 'audit',
      defaultLevel: 'admin',
      description: "Consulter l'historique des sanctions (`/infractions`, `/case`).",
    },
    {
      id: 'moderation.automod.manage' as PermissionId,
      category: 'config',
      defaultLevel: 'admin',
      description: "Configurer l'automod (règles, bypass, actions).",
    },
  ],
  events: {
    listen: ['guild.messageCreate'],
    emit: [],
  },
};
