import type { PresetDefinition } from '../types.js';

/**
 * Commu créative (artistes, designers, écrivains) : salons partage
 * d'œuvres, feedback, work-in-progress, off-topic. Deux rôles :
 * contributeur (partage régulier) et spectateur (par défaut).
 * Slowmode fort sur #share pour éviter le spam visuel.
 */
export const communityCreative: PresetDefinition = {
  id: 'community-creative',
  name: 'Commu créative',
  description:
    'Salons pour partager des œuvres, recevoir des retours et montrer ses works-in-progress. Rôle contributeur pour celles et ceux qui partagent régulièrement, rôle spectateur par défaut pour tout le monde.',
  tags: ['creative', 'art', 'design'],
  locale: 'both',
  roles: [
    {
      localId: 'role-contributor',
      name: 'Contributeur',
      nameFr: 'Contributeur',
      nameEn: 'Contributor',
      color: 0xe91e63,
      permissionPreset: 'member-default',
      hoist: true,
      mentionable: true,
    },
    {
      localId: 'role-spectator',
      name: 'Spectateur',
      nameFr: 'Spectateur',
      nameEn: 'Spectator',
      color: 0x95a5a6,
      permissionPreset: 'member-restricted',
      hoist: false,
      mentionable: false,
    },
  ],
  categories: [
    {
      localId: 'cat-showcase',
      name: 'œuvres',
      nameFr: 'œuvres',
      nameEn: 'showcase',
      position: 0,
    },
    {
      localId: 'cat-discuss',
      name: 'discussions',
      nameFr: 'discussions',
      nameEn: 'discussions',
      position: 1,
    },
  ],
  channels: [
    {
      localId: 'chan-share',
      categoryLocalId: 'cat-showcase',
      name: 'partage',
      nameFr: 'partage',
      nameEn: 'share',
      type: 'text',
      topic: 'Vos créations finies. Un post par œuvre, contexte bienvenu.',
      topicFr: 'Vos créations finies. Un post par œuvre, contexte bienvenu.',
      topicEn: 'Your finished works. One post per piece, context welcome.',
      slowmodeSeconds: 300,
      readableBy: [],
      writableBy: ['role-contributor'],
    },
    {
      localId: 'chan-wip',
      categoryLocalId: 'cat-showcase',
      name: 'wip',
      nameFr: 'work-in-progress',
      nameEn: 'work-in-progress',
      type: 'text',
      topic: 'Vos travaux en cours. Moins formel que #partage, plus itératif.',
      topicFr: 'Vos travaux en cours. Moins formel que #partage, plus itératif.',
      topicEn: 'Works in progress. Less formal than #share, more iterative.',
      slowmodeSeconds: 60,
      readableBy: [],
      writableBy: ['role-contributor'],
    },
    {
      localId: 'chan-feedback',
      categoryLocalId: 'cat-discuss',
      name: 'feedback',
      nameFr: 'retours',
      nameEn: 'feedback',
      type: 'text',
      topic: 'Demandez des retours constructifs. Citez l œuvre concernée.',
      topicFr: 'Demandez des retours constructifs. Citez l œuvre concernée.',
      topicEn: 'Ask for constructive feedback. Reference the piece concerned.',
      slowmodeSeconds: 30,
      readableBy: [],
      writableBy: [],
    },
    {
      localId: 'chan-offtopic',
      categoryLocalId: 'cat-discuss',
      name: 'off-topic',
      nameFr: 'hors-sujet',
      nameEn: 'off-topic',
      type: 'text',
      topic: 'Discussion libre hors création.',
      topicFr: 'Discussion libre hors création.',
      topicEn: 'Free discussion, not about creating.',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: [],
    },
  ],
  modules: [
    {
      moduleId: 'hello-world',
      enabled: true,
      config: { welcomeDelayMs: 800 },
    },
  ],
  permissionBindings: [],
};
