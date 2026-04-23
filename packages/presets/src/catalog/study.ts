import type { PresetDefinition } from '../types.js';

/**
 * Petit groupe d'étude : salons ressources, questions, sessions de
 * travail (voice), off-topic. Un seul rôle organisateur qui peut
 * modérer légèrement et anime les sessions. Budget serré (preset de
 * départ, l'admin étend ensuite selon la discipline).
 */
export const communityStudyGroup: PresetDefinition = {
  id: 'community-study-group',
  name: "Groupe d'étude",
  description:
    'Salons ressources, questions, sessions de travail en vocal et hors-sujet. Rôle organisateur minimal pour animer et modérer. À étendre selon la discipline étudiée.',
  tags: ['study', 'small', 'education'],
  locale: 'both',
  roles: [
    {
      localId: 'role-organizer',
      name: 'Organisateur',
      nameFr: 'Organisateur',
      nameEn: 'Organizer',
      color: 0xf39c12,
      permissionPreset: 'moderator-minimal',
      hoist: true,
      mentionable: true,
    },
  ],
  categories: [
    {
      localId: 'cat-work',
      name: 'travail',
      nameFr: 'travail',
      nameEn: 'work',
      position: 0,
    },
    {
      localId: 'cat-side',
      name: 'à-côté',
      nameFr: 'à-côté',
      nameEn: 'side',
      position: 1,
    },
  ],
  channels: [
    {
      localId: 'chan-resources',
      categoryLocalId: 'cat-work',
      name: 'ressources',
      nameFr: 'ressources',
      nameEn: 'resources',
      type: 'text',
      topic: 'Liens, PDFs, livres. Un lien par message, avec un commentaire bref.',
      topicFr: 'Liens, PDFs, livres. Un lien par message, avec un commentaire bref.',
      topicEn: 'Links, PDFs, books. One link per message with a brief note.',
      slowmodeSeconds: 30,
      readableBy: [],
      writableBy: [],
    },
    {
      localId: 'chan-questions',
      categoryLocalId: 'cat-work',
      name: 'questions',
      nameFr: 'questions',
      nameEn: 'questions',
      type: 'text',
      topic: 'Les questions que vous n osez pas poser ailleurs. Bienveillance.',
      topicFr: 'Les questions que vous n osez pas poser ailleurs. Bienveillance.',
      topicEn: "Questions you won't ask elsewhere. Be kind.",
      slowmodeSeconds: 15,
      readableBy: [],
      writableBy: [],
    },
    {
      localId: 'chan-sessions',
      categoryLocalId: 'cat-work',
      name: 'sessions',
      nameFr: 'sessions',
      nameEn: 'sessions',
      type: 'voice',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: [],
    },
    {
      localId: 'chan-offtopic',
      categoryLocalId: 'cat-side',
      name: 'off-topic',
      nameFr: 'hors-sujet',
      nameEn: 'off-topic',
      type: 'text',
      topic: 'Tout sauf la matière étudiée.',
      topicFr: 'Tout sauf la matière étudiée.',
      topicEn: 'Everything but the subject studied.',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: [],
    },
  ],
  modules: [],
  permissionBindings: [],
};
