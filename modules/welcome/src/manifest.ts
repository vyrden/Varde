import type { ManifestStatic, ModuleId, PermissionId } from '@varde/contracts';

/**
 * Manifeste du module officiel `welcome`. Écoute `guild.memberJoin` et
 * `guild.memberLeave` pour poster un message d'accueil/départ, attribuer
 * un auto-rôle et appliquer un filtre de comptes neufs.
 *
 * Aucune slash command en V1 — toute la configuration passe par le
 * dashboard.
 */
export const manifest: ManifestStatic = {
  id: 'welcome' as ModuleId,
  name: 'Welcome',
  version: '1.0.0',
  coreVersion: '^1.0.0',
  description:
    "Message d'accueil/départ avec carte d'avatar, auto-rôle (avec délai optionnel) et filtre comptes neufs.",
  shortDescription: "Messages d'arrivée et de départ, auto-rôle et filtre comptes neufs.",
  category: 'community',
  icon: 'door-open',
  author: { name: 'Mainteneur' },
  license: 'Apache-2.0',
  schemaVersion: 0,
  permissions: [
    {
      id: 'welcome.config.manage' as PermissionId,
      category: 'config',
      defaultLevel: 'admin',
      description:
        "Configurer le module welcome d'une guild (messages, auto-rôle, filtre comptes neufs).",
    },
  ],
  events: {
    listen: ['guild.memberJoin', 'guild.memberLeave'],
    emit: [],
  },
};
