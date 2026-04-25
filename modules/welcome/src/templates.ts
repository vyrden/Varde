import type { WelcomeConfig } from './config.js';

/**
 * Templates pré-mâchés exposés au dashboard. Chaque template est une
 * config welcome complète (sauf channelId / roleIds qui dépendent de la
 * guild — laissés à null/[] pour que l'admin les renseigne lui-même).
 *
 * `id` est le slug stable consommé par le dashboard pour reconnaître
 * un template au moment du choix.
 */
export interface WelcomeTemplate {
  readonly id: 'gaming' | 'pro-tech' | 'creative' | 'vanilla';
  readonly icon: string;
  readonly label: string;
  readonly description: string;
  /** Fragment de config à fusionner avec la config par défaut. */
  readonly config: WelcomeConfig;
}

const baseConfig = (): WelcomeConfig => ({
  version: 1,
  welcome: {
    enabled: true,
    destination: 'channel',
    channelId: null,
    message: '',
    embed: { enabled: false, color: '#5865F2' },
    card: { enabled: true, backgroundColor: '#2C2F33', backgroundImagePath: null },
  },
  goodbye: {
    enabled: false,
    channelId: null,
    message: '',
    embed: { enabled: false, color: '#5865F2' },
    card: { enabled: false, backgroundColor: '#2C2F33', backgroundImagePath: null },
  },
  autorole: { enabled: false, roleIds: [], delaySeconds: 0 },
  accountAgeFilter: {
    enabled: false,
    minDays: 0,
    action: 'kick',
    quarantineRoleId: null,
  },
});

export const WELCOME_TEMPLATES: readonly WelcomeTemplate[] = [
  {
    id: 'gaming',
    icon: '🎮',
    label: 'Communauté gaming',
    description: 'Accueil rythmé avec carte, mention du nouveau membre et compteur.',
    config: {
      ...baseConfig(),
      welcome: {
        ...baseConfig().welcome,
        message:
          'Yo {user.mention}, bienvenue sur **{guild}** ! Tu es notre {memberCount}ᵉ membre. GG, tu peux te lancer.',
        card: { enabled: true, backgroundColor: '#1F2937', backgroundImagePath: null },
      },
      goodbye: {
        ...baseConfig().goodbye,
        message: '{user.tag} a déconnecté. À la prochaine partie !',
      },
    },
  },
  {
    id: 'pro-tech',
    icon: '💻',
    label: 'Pro / tech',
    description: "Embed sobre, ton professionnel, sans carte d'avatar.",
    config: {
      ...baseConfig(),
      welcome: {
        ...baseConfig().welcome,
        message:
          "Bienvenue {user.mention} sur **{guild}**. N'hésitez pas à vous présenter dans le salon dédié — vous êtes le {memberCount}ᵉ membre.",
        embed: { enabled: true, color: '#0EA5E9' },
        card: { enabled: false, backgroundColor: '#2C2F33', backgroundImagePath: null },
      },
      goodbye: {
        ...baseConfig().goodbye,
        message: '{user.tag} a quitté la communauté.',
        embed: { enabled: true, color: '#64748B' },
      },
    },
  },
  {
    id: 'creative',
    icon: '🎨',
    label: 'Créatif',
    description: 'Carte colorée, message chaleureux, focus sur les nouveaux talents.',
    config: {
      ...baseConfig(),
      welcome: {
        ...baseConfig().welcome,
        message:
          "Bienvenue {user.mention} 🎉 Heureux de t'accueillir sur **{guild}** ! Montre-nous ce que tu fais.",
        card: { enabled: true, backgroundColor: '#7C3AED', backgroundImagePath: null },
      },
      goodbye: {
        ...baseConfig().goodbye,
        message: 'Au revoir {user.tag}, prends soin de toi. ✨',
        card: { enabled: true, backgroundColor: '#1E1B4B', backgroundImagePath: null },
      },
    },
  },
  {
    id: 'vanilla',
    icon: '✨',
    label: 'Minimal',
    description: "Texte simple, pas d'embed, pas de carte. À personnaliser.",
    config: {
      ...baseConfig(),
      welcome: {
        ...baseConfig().welcome,
        message: 'Bienvenue {user.mention} sur {guild} !',
        card: { enabled: false, backgroundColor: '#2C2F33', backgroundImagePath: null },
      },
    },
  },
];
