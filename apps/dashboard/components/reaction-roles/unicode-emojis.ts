/**
 * Catalogue restreint d'emojis Unicode pour le picker reaction-roles.
 * Liste curée : on cible les emojis les plus courants pour des
 * reaction-roles (rôles, notifications, vérification, couleurs, etc.)
 * sans embarquer une lib lourde type emoji-mart (~150 kB).
 *
 * Si un utilisateur veut un emoji absent de la liste, il peut toujours
 * le coller directement dans le champ texte — le picker n'est qu'une
 * aide de saisie.
 */

export interface UnicodeEmoji {
  /** Caractère emoji Unicode. */
  readonly char: string;
  /** Mots-clés en français pour la recherche. */
  readonly keywords: readonly string[];
}

export interface UnicodeEmojiCategory {
  readonly id: string;
  readonly label: string;
  readonly emojis: readonly UnicodeEmoji[];
}

export const UNICODE_EMOJI_CATEGORIES: readonly UnicodeEmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Émotions',
    emojis: [
      { char: '😀', keywords: ['sourire', 'content'] },
      { char: '😁', keywords: ['sourire', 'dents'] },
      { char: '😂', keywords: ['rire', 'larmes'] },
      { char: '🤣', keywords: ['rire', 'fou'] },
      { char: '😊', keywords: ['heureux', 'rougi'] },
      { char: '😍', keywords: ['amour', 'cœur'] },
      { char: '😎', keywords: ['cool', 'lunettes'] },
      { char: '🤩', keywords: ['star', 'admiration'] },
      { char: '🤔', keywords: ['réflexion', 'penser'] },
      { char: '😴', keywords: ['dormir', 'fatigué'] },
      { char: '😡', keywords: ['colère', 'fâché'] },
      { char: '😭', keywords: ['pleurer', 'triste'] },
      { char: '🥺', keywords: ['suppliant', 'mignon'] },
      { char: '😱', keywords: ['surprise', 'choc'] },
      { char: '🤯', keywords: ['mind blown', 'choc'] },
      { char: '🥳', keywords: ['fête', 'anniversaire'] },
      { char: '😈', keywords: ['diable', 'sourire'] },
      { char: '🤖', keywords: ['robot', 'bot'] },
      { char: '👻', keywords: ['fantôme', 'halloween'] },
      { char: '💀', keywords: ['crâne', 'mort'] },
    ],
  },
  {
    id: 'people',
    label: 'Gestes',
    emojis: [
      { char: '👋', keywords: ['salut', 'bonjour', 'main'] },
      { char: '👍', keywords: ['ok', 'pouce', 'oui'] },
      { char: '👎', keywords: ['non', 'pouce'] },
      { char: '👏', keywords: ['applaudir', 'bravo'] },
      { char: '🙌', keywords: ['hourra', 'mains'] },
      { char: '🙏', keywords: ['merci', 'prière'] },
      { char: '💪', keywords: ['force', 'biceps'] },
      { char: '✌️', keywords: ['paix', 'victoire'] },
      { char: '🤝', keywords: ['accord', 'main'] },
      { char: '👀', keywords: ['regarder', 'yeux'] },
      { char: '🫡', keywords: ['salut', 'militaire'] },
      { char: '🤞', keywords: ['chance', 'doigts croisés'] },
    ],
  },
  {
    id: 'symbols',
    label: 'Symboles',
    emojis: [
      { char: '✅', keywords: ['check', 'oui', 'validé'] },
      { char: '❌', keywords: ['croix', 'non', 'refus'] },
      { char: '⭐', keywords: ['étoile', 'favori'] },
      { char: '🌟', keywords: ['étoile', 'brillante'] },
      { char: '💯', keywords: ['100', 'parfait'] },
      { char: '🔥', keywords: ['feu', 'tendance'] },
      { char: '✨', keywords: ['étincelles', 'magique'] },
      { char: '🎉', keywords: ['fête', 'célébration'] },
      { char: '🎊', keywords: ['confettis'] },
      { char: '❤️', keywords: ['cœur', 'amour', 'rouge'] },
      { char: '🧡', keywords: ['cœur', 'orange'] },
      { char: '💛', keywords: ['cœur', 'jaune'] },
      { char: '💚', keywords: ['cœur', 'vert'] },
      { char: '💙', keywords: ['cœur', 'bleu'] },
      { char: '💜', keywords: ['cœur', 'violet'] },
      { char: '🖤', keywords: ['cœur', 'noir'] },
      { char: '🤍', keywords: ['cœur', 'blanc'] },
      { char: '🤎', keywords: ['cœur', 'marron'] },
      { char: '💔', keywords: ['cœur brisé'] },
      { char: '💖', keywords: ['cœur', 'brillant'] },
      { char: '🔔', keywords: ['cloche', 'notification'] },
      { char: '🔕', keywords: ['silencieux', 'cloche'] },
      { char: '📢', keywords: ['annonce', 'porte-voix'] },
      { char: '📣', keywords: ['annonce', 'megaphone'] },
      { char: '⚠️', keywords: ['attention', 'avertissement'] },
      { char: '🚨', keywords: ['urgence', 'alerte'] },
      { char: '🆗', keywords: ['ok'] },
      { char: '🆕', keywords: ['nouveau'] },
      { char: '🔒', keywords: ['cadenas', 'verrou'] },
      { char: '🔓', keywords: ['cadenas', 'ouvert'] },
      { char: '🔑', keywords: ['clé', 'accès'] },
    ],
  },
  {
    id: 'activities',
    label: 'Activités',
    emojis: [
      { char: '🎮', keywords: ['jeu', 'gaming', 'manette'] },
      { char: '🎲', keywords: ['dé', 'jeu', 'hasard'] },
      { char: '🎯', keywords: ['cible', 'précision'] },
      { char: '🎨', keywords: ['art', 'peinture', 'palette'] },
      { char: '🎵', keywords: ['musique', 'note'] },
      { char: '🎬', keywords: ['cinéma', 'clap', 'film'] },
      { char: '📚', keywords: ['livre', 'lecture'] },
      { char: '✏️', keywords: ['crayon', 'écrire'] },
      { char: '⚽', keywords: ['football', 'sport'] },
      { char: '🏀', keywords: ['basket', 'sport'] },
      { char: '🏆', keywords: ['trophée', 'gagnant'] },
      { char: '🥇', keywords: ['or', 'premier', 'médaille'] },
      { char: '💻', keywords: ['ordinateur', 'tech', 'pc'] },
      { char: '📱', keywords: ['mobile', 'téléphone'] },
    ],
  },
  {
    id: 'animals',
    label: 'Animaux',
    emojis: [
      { char: '🐶', keywords: ['chien', 'chiot'] },
      { char: '🐱', keywords: ['chat', 'chaton'] },
      { char: '🦊', keywords: ['renard'] },
      { char: '🐻', keywords: ['ours'] },
      { char: '🐼', keywords: ['panda'] },
      { char: '🦁', keywords: ['lion'] },
      { char: '🐯', keywords: ['tigre'] },
      { char: '🐰', keywords: ['lapin'] },
      { char: '🐨', keywords: ['koala'] },
      { char: '🐸', keywords: ['grenouille'] },
      { char: '🦄', keywords: ['licorne'] },
      { char: '🐲', keywords: ['dragon'] },
      { char: '🦋', keywords: ['papillon'] },
      { char: '🐝', keywords: ['abeille'] },
    ],
  },
  {
    id: 'food',
    label: 'Nourriture',
    emojis: [
      { char: '🍎', keywords: ['pomme', 'fruit', 'rouge'] },
      { char: '🍌', keywords: ['banane', 'fruit'] },
      { char: '🍕', keywords: ['pizza'] },
      { char: '🍔', keywords: ['burger', 'hamburger'] },
      { char: '🍟', keywords: ['frites'] },
      { char: '🌮', keywords: ['taco'] },
      { char: '🍣', keywords: ['sushi'] },
      { char: '🍰', keywords: ['gâteau'] },
      { char: '🍪', keywords: ['cookie', 'biscuit'] },
      { char: '🍫', keywords: ['chocolat'] },
      { char: '☕', keywords: ['café'] },
      { char: '🍺', keywords: ['bière'] },
      { char: '🍷', keywords: ['vin'] },
    ],
  },
  {
    id: 'travel',
    label: 'Lieux',
    emojis: [
      { char: '🌍', keywords: ['terre', 'europe', 'afrique', 'monde'] },
      { char: '🌎', keywords: ['terre', 'amérique'] },
      { char: '🌏', keywords: ['terre', 'asie', 'océanie'] },
      { char: '🗺️', keywords: ['carte'] },
      { char: '🏠', keywords: ['maison'] },
      { char: '🏢', keywords: ['bureau', 'building'] },
      { char: '⛰️', keywords: ['montagne'] },
      { char: '🏖️', keywords: ['plage'] },
      { char: '✈️', keywords: ['avion', 'voyage'] },
      { char: '🚗', keywords: ['voiture'] },
      { char: '🚀', keywords: ['fusée', 'lancement'] },
      { char: '🌙', keywords: ['lune', 'nuit'] },
      { char: '☀️', keywords: ['soleil', 'jour'] },
    ],
  },
  {
    id: 'flags',
    label: 'Drapeaux',
    emojis: [
      { char: '🇫🇷', keywords: ['france', 'français'] },
      { char: '🇧🇪', keywords: ['belgique'] },
      { char: '🇨🇭', keywords: ['suisse'] },
      { char: '🇨🇦', keywords: ['canada', 'québec'] },
      { char: '🇬🇧', keywords: ['royaume uni', 'angleterre'] },
      { char: '🇺🇸', keywords: ['états-unis', 'usa'] },
      { char: '🇪🇸', keywords: ['espagne'] },
      { char: '🇮🇹', keywords: ['italie'] },
      { char: '🇩🇪', keywords: ['allemagne'] },
      { char: '🇯🇵', keywords: ['japon'] },
      { char: '🇰🇷', keywords: ['corée du sud'] },
      { char: '🇨🇳', keywords: ['chine'] },
      { char: '🇧🇷', keywords: ['brésil'] },
      { char: '🇲🇽', keywords: ['mexique'] },
      { char: '🇦🇺', keywords: ['australie'] },
      { char: '🏳️‍🌈', keywords: ['rainbow', 'lgbt', 'pride'] },
    ],
  },
];
