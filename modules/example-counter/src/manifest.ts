import type { ManifestStatic, ModuleId, PermissionId } from '@varde/contracts';

export const manifest: ManifestStatic = {
  id: 'example-counter' as ModuleId,
  name: 'Example Counter',
  version: '1.0.0',
  coreVersion: '^1.0.0',
  description:
    'Compte les messages envoyés par chaque membre. Module pédagogique de référence pour docs/MODULE-AUTHORING.md.',
  author: { name: 'Mainteneur' },
  license: 'Apache-2.0',
  schemaVersion: 0,
  permissions: [
    {
      id: 'example-counter.view' as PermissionId,
      category: 'utility',
      defaultLevel: 'member',
      description: 'Autorise la consultation du compteur via /count.',
    },
  ],
  events: {
    listen: ['guild.messageCreate'],
    emit: [],
  },
};
