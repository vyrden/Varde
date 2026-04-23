import type { PresetDefinition } from '../types.js';

/**
 * Petite commu gaming : un rôle modérateur minimaliste, un salon
 * annonces, un salon général, un salon voice pour jouer, un salon
 * LFG (looking for group). hello-world activé comme module témoin
 * pour le moment ; sera remplacé par welcome / moderation une fois
 * ces modules disponibles (jalon 4).
 */
export const communityGamingSmall: PresetDefinition = {
  id: 'community-gaming-small',
  name: 'Petite commu gaming',
  description:
    'Configuration orientée multi-joueurs : salon annonces, général, LFG et voice. Un rôle modérateur minimal qui peut timeout et nettoyer le chat sans permissions dangereuses.',
  tags: ['gaming', 'small', 'voice'],
  locale: 'both',
  roles: [
    {
      localId: 'role-mod',
      name: 'Modérateur',
      nameFr: 'Modérateur',
      nameEn: 'Moderator',
      color: 0x1abc9c,
      permissionPreset: 'moderator-minimal',
      hoist: true,
      mentionable: true,
    },
  ],
  categories: [
    {
      localId: 'cat-text',
      name: 'text',
      nameFr: 'textuel',
      nameEn: 'text',
      position: 0,
    },
    {
      localId: 'cat-voice',
      name: 'voice',
      nameFr: 'vocal',
      nameEn: 'voice',
      position: 1,
    },
  ],
  channels: [
    {
      localId: 'chan-announcements',
      categoryLocalId: 'cat-text',
      name: 'annonces',
      nameFr: 'annonces',
      nameEn: 'announcements',
      type: 'text',
      topic: 'Annonces et mises à jour.',
      topicFr: 'Annonces et mises à jour.',
      topicEn: 'Announcements and updates.',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: ['role-mod'],
    },
    {
      localId: 'chan-general',
      categoryLocalId: 'cat-text',
      name: 'general',
      nameFr: 'général',
      nameEn: 'general',
      type: 'text',
      topic: 'Discussion générale.',
      topicFr: 'Discussion générale.',
      topicEn: 'General discussion.',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: [],
    },
    {
      localId: 'chan-lfg',
      categoryLocalId: 'cat-text',
      name: 'lfg',
      nameFr: 'recherche-équipe',
      nameEn: 'lfg',
      type: 'text',
      topic: 'Trouve des coéquipiers pour ta prochaine partie.',
      topicFr: 'Trouve des coéquipiers pour ta prochaine partie.',
      topicEn: 'Find teammates for your next match.',
      slowmodeSeconds: 10,
      readableBy: [],
      writableBy: [],
    },
    {
      localId: 'chan-voice-lobby',
      categoryLocalId: 'cat-voice',
      name: 'lobby',
      nameFr: 'salon-principal',
      nameEn: 'lobby',
      type: 'voice',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: [],
    },
  ],
  modules: [
    {
      moduleId: 'hello-world',
      enabled: true,
      config: { welcomeDelayMs: 500 },
    },
  ],
  permissionBindings: [{ permissionId: 'logs.config.manage', roleLocalId: 'role-mod' }],
};
