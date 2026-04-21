import type { ManifestStatic, ModuleId, PermissionId } from '@varde/contracts';

/**
 * Manifeste statique du module témoin `hello-world`.
 *
 * Rôle V1 : exercer l'API publique du core pour valider bout en bout
 * que le critère de sortie du jalon 1 est atteint. Concrètement le
 * module :
 * - Déclare une permission applicative (`hello-world.ping`) consommable
 *   par la commande `/ping`.
 * - Écoute `guild.memberJoin` pour déclencher un flux qui touche
 *   audit + scheduler + i18n + ui.
 * - Ne persiste pas de données spécifiques en V1 (ScopedDatabase est
 *   encore un marker) ; la table `hello_world_greetings` prévue par
 *   le plan arrivera quand le vrai scoping DB sera livré.
 * - Ne déclare aucun événement émis au niveau du catalogue `CoreEvent`
 *   — l'EventBus du core est typé sur `CoreEvent` et ajouter un
 *   `hello-world.greeted` custom demanderait un registre d'events
 *   module-scoped distinct (à faire post-V1 si besoin).
 */
export const manifest: ManifestStatic = {
  id: 'hello-world' as ModuleId,
  name: 'Hello World',
  version: '1.0.0',
  coreVersion: '^1.0.0',
  description: 'Module témoin qui exerce audit, scheduler, i18n, ui sur guild.memberJoin et /ping.',
  author: { name: 'Mainteneur' },
  license: 'Apache-2.0',
  schemaVersion: 0,
  permissions: [
    {
      id: 'hello-world.ping' as PermissionId,
      category: 'utility',
      defaultLevel: 'member',
      description: 'Autorise l appel de la commande /ping.',
    },
  ],
  events: {
    listen: ['guild.memberJoin'],
    emit: [],
  },
};
