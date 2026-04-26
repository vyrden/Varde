import type { PresetDefinition } from '../types.js';

/**
 * Preset minimal à proposer quand rien d'autre ne matche : juste
 * les salons universels (annonces, général, off-topic). Aucun rôle
 * personnalisé — @everyone suffit. Pas de modules activés.
 *
 * Locale `both` : les noms de salons suivent la convention Discord
 * (kebab-case, latin, minuscules). Topics fr/en affichés dans le
 * header du salon.
 */
export const communityGenericStarter: PresetDefinition = {
  id: 'community-generic-starter',
  name: 'Communauté minimaliste',
  description:
    'Trois salons essentiels pour démarrer : annonces, général, off-topic. Aucun rôle supplémentaire, aucun module activé. À utiliser quand aucun preset typé ne correspond.',
  tags: ['generic', 'starter', 'minimal'],
  locale: 'both',
  roles: [],
  categories: [
    {
      localId: 'cat-main',
      name: 'general',
      nameFr: 'général',
      nameEn: 'general',
      position: 0,
    },
  ],
  channels: [
    {
      localId: 'chan-announcements',
      categoryLocalId: 'cat-main',
      name: 'annonces',
      nameFr: 'annonces',
      nameEn: 'announcements',
      type: 'text',
      topic: 'Annonces officielles du serveur.',
      topicFr: 'Annonces officielles du serveur.',
      topicEn: 'Official server announcements.',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: [],
    },
    {
      localId: 'chan-general',
      categoryLocalId: 'cat-main',
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
      localId: 'chan-offtopic',
      categoryLocalId: 'cat-main',
      name: 'off-topic',
      nameFr: 'hors-sujet',
      nameEn: 'off-topic',
      type: 'text',
      topic: 'Tout sauf le sujet principal.',
      topicFr: 'Tout sauf le sujet principal.',
      topicEn: 'Everything but the main topic.',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: [],
    },
    {
      localId: 'chan-logs',
      categoryLocalId: 'cat-main',
      name: 'logs',
      nameFr: 'logs',
      nameEn: 'logs',
      type: 'text',
      topic: 'Journal des actions modérateurs et événements serveur.',
      topicFr: 'Journal des actions modérateurs et événements serveur.',
      topicEn: 'Server moderation and event log.',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: [],
    },
  ],
  modules: [
    {
      moduleId: 'moderation',
      enabled: false,
      config: {
        version: 1,
        mutedRoleId: null,
        dmOnSanction: true,
        automod: {
          rules: [
            {
              id: 'rule-everyone-abuse',
              label: 'Mention @everyone / @here',
              kind: 'regex',
              pattern: '@(everyone|here)',
              action: 'warn',
              durationMs: null,
              enabled: true,
            },
          ],
          bypassRoleIds: [],
        },
      },
    },
  ],
  permissionBindings: [],
};
