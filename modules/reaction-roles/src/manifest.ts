import type { ManifestStatic, ModuleId, PermissionId } from '@varde/contracts';

/**
 * Manifeste du module officiel `reaction-roles`. Rôle : écouter les events
 * messageReactionAdd/Remove et appliquer les règles des 3 modes (normal,
 * unique, verifier) selon la config persistée par guild.
 *
 * Aucune slash command en V1 — toute la configuration passe par le dashboard.
 */
export const manifest: ManifestStatic = {
  id: 'reaction-roles' as ModuleId,
  name: 'Reaction-roles',
  version: '1.1.0',
  coreVersion: '^1.0.0',
  description:
    "Auto-attribution de rôles quand les membres réagissent à un message (templates prêts à l'emploi : vérification, couleurs, continents, zodiaque, etc.).",
  author: { name: 'Mainteneur' },
  license: 'Apache-2.0',
  schemaVersion: 0,
  permissions: [
    {
      id: 'reaction-roles.config.manage' as PermissionId,
      category: 'config',
      defaultLevel: 'admin',
      description: "Configurer les reaction-roles d'une guild (publier, éditer, supprimer).",
    },
  ],
  events: {
    listen: ['guild.messageReactionAdd', 'guild.messageReactionRemove'],
    emit: [],
  },
};
