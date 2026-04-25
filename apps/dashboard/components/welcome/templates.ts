import type { WelcomeConfigClient } from '../../lib/welcome-actions';

/**
 * 4 templates pré-mâchés exposés par l'éditeur. Miroir des templates
 * définis dans `@varde/module-welcome`. Dupliqués ici pour éviter
 * d'importer le module côté client (il dépend de @napi-rs/canvas qui
 * est natif et ne tourne pas dans le navigateur).
 */
export interface WelcomeTemplateClient {
  readonly id: 'gaming' | 'pro-tech' | 'creative' | 'vanilla';
  readonly icon: string;
  readonly label: string;
  readonly description: string;
  readonly config: WelcomeConfigClient;
}

const baseConfig = (): WelcomeConfigClient => ({
  version: 1,
  welcome: {
    enabled: true,
    destination: 'channel',
    channelId: null,
    message: '',
    embed: { enabled: false, color: '#5865F2' },
    card: { enabled: true, backgroundColor: '#2C2F33' },
  },
  goodbye: {
    enabled: false,
    channelId: null,
    message: '',
    embed: { enabled: false, color: '#5865F2' },
    card: { enabled: false, backgroundColor: '#2C2F33' },
  },
  autorole: { enabled: false, roleIds: [], delaySeconds: 0 },
  accountAgeFilter: {
    enabled: false,
    minDays: 0,
    action: 'kick',
    quarantineRoleId: null,
  },
});

export const WELCOME_TEMPLATES_CLIENT: readonly WelcomeTemplateClient[] = [
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
        card: { enabled: true, backgroundColor: '#1F2937' },
      },
      goodbye: {
        ...baseConfig().goodbye,
        enabled: true,
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
        card: { enabled: false, backgroundColor: '#2C2F33' },
      },
      goodbye: {
        ...baseConfig().goodbye,
        enabled: true,
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
        card: { enabled: true, backgroundColor: '#7C3AED' },
      },
      goodbye: {
        ...baseConfig().goodbye,
        enabled: true,
        message: 'Au revoir {user.tag}, prends soin de toi. ✨',
        card: { enabled: true, backgroundColor: '#1E1B4B' },
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
        card: { enabled: false, backgroundColor: '#2C2F33' },
      },
    },
  },
];

export const TEMPLATE_VARIABLES_CLIENT = [
  { key: 'user', description: "Nom d'affichage du membre" },
  { key: 'user.mention', description: 'Mention cliquable du membre (<@id>)' },
  { key: 'user.tag', description: 'Pseudo complet du membre' },
  { key: 'guild', description: 'Nom du serveur' },
  { key: 'memberCount', description: 'Nombre total de membres' },
  { key: 'accountAge', description: 'Âge du compte Discord (welcome uniquement)' },
] as const;
