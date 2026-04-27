export interface ReactionRoleTemplateSuggestion {
  readonly emoji: string;
  readonly roleName: string;
}

export interface ReactionRoleTemplate {
  readonly id: 'scratch' | 'verify' | 'notifications' | 'colors' | 'continents' | 'zodiac';
  readonly icon: string;
  readonly label: string;
  readonly category: 'essentiel' | 'fonction' | 'amusant' | 'mixte';
  readonly description: string;
  readonly defaultMessage: string;
  readonly defaultLabel: string;
  readonly defaultMode: 'normal' | 'unique' | 'verifier';
  readonly suggestions: readonly ReactionRoleTemplateSuggestion[];
}

export const TEMPLATES: readonly ReactionRoleTemplate[] = [
  {
    id: 'scratch',
    icon: '✏️',
    label: 'Commencer à partir de zéro',
    category: 'essentiel',
    description: 'Configuration libre, crée tout ce dont tu as besoin.',
    defaultMessage: '',
    defaultLabel: '',
    defaultMode: 'normal',
    suggestions: [],
  },
  {
    id: 'verify',
    icon: '✅',
    label: 'Vérifier',
    category: 'mixte',
    description: "Demander aux utilisateurs d'accepter les règles du serveur.",
    defaultMessage: 'Clique sur ✅ pour confirmer que tu as lu les règles du serveur.',
    defaultLabel: 'Vérification règles',
    defaultMode: 'verifier',
    suggestions: [{ emoji: '✅', roleName: 'Vérifié' }],
  },
  {
    id: 'notifications',
    icon: '📨',
    label: 'Notifications',
    category: 'fonction',
    description: 'Les utilisateurs sélectionnent les canaux de notification.',
    defaultMessage: 'Choisis les notifications que tu veux recevoir :',
    defaultLabel: 'Notifications',
    defaultMode: 'normal',
    suggestions: [
      { emoji: '📢', roleName: 'Annonces' },
      { emoji: '🎉', roleName: 'Événements' },
      { emoji: '🔔', roleName: 'Mises à jour' },
    ],
  },
  {
    id: 'colors',
    icon: '🎨',
    label: 'Couleurs',
    category: 'amusant',
    description: 'Permettre aux utilisateurs de choisir la couleur de leur nom.',
    defaultMessage: 'Choisis la couleur de ton nom dans le serveur :',
    defaultLabel: 'Couleurs de nom',
    defaultMode: 'unique',
    suggestions: [
      { emoji: '🟥', roleName: 'Rouge' },
      { emoji: '🟧', roleName: 'Orange' },
      { emoji: '🟨', roleName: 'Jaune' },
      { emoji: '🟩', roleName: 'Vert' },
      { emoji: '🟦', roleName: 'Bleu' },
      { emoji: '🟪', roleName: 'Violet' },
    ],
  },
  {
    id: 'continents',
    icon: '🗺️',
    label: 'Continents',
    category: 'amusant',
    description: 'Laisser les utilisateurs choisir leur origine géographique.',
    defaultMessage: "Sélectionne ton continent d'origine 🌍",
    defaultLabel: 'Continents',
    defaultMode: 'unique',
    suggestions: [
      { emoji: '🇪🇺', roleName: 'Europe' },
      { emoji: '🌏', roleName: 'Asie' },
      { emoji: '🌎', roleName: 'Amériques' },
      { emoji: '🌍', roleName: 'Afrique' },
      { emoji: '🇦🇺', roleName: 'Océanie' },
    ],
  },
  {
    id: 'zodiac',
    icon: '♉️',
    label: 'Zodiaque',
    category: 'amusant',
    description: 'Permettre aux utilisateurs de sélectionner leur signe du zodiaque.',
    defaultMessage: 'Choisis ton signe du zodiaque :',
    defaultLabel: 'Zodiaque',
    defaultMode: 'unique',
    suggestions: [
      { emoji: '♈', roleName: 'Bélier' },
      { emoji: '♉', roleName: 'Taureau' },
      { emoji: '♊', roleName: 'Gémeaux' },
      { emoji: '♋', roleName: 'Cancer' },
      { emoji: '♌', roleName: 'Lion' },
      { emoji: '♍', roleName: 'Vierge' },
      { emoji: '♎', roleName: 'Balance' },
      { emoji: '♏', roleName: 'Scorpion' },
      { emoji: '♐', roleName: 'Sagittaire' },
      { emoji: '♑', roleName: 'Capricorne' },
      { emoji: '♒', roleName: 'Verseau' },
      { emoji: '♓', roleName: 'Poissons' },
    ],
  },
];
