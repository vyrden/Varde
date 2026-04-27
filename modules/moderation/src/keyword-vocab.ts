import type { AutomodAiCategory, AutomodKeywordListLanguage } from './config.js';

/**
 * Vocabulaires curés FR/EN par catégorie de risque, utilisés par les
 * règles `keyword-list`. Le contenu est volontairement minimal — la
 * curation idéale dépend de la communauté, et le mainteneur attend
 * que l'admin étende via `customWords` sur ses cas spécifiques.
 *
 * Choix éditoriaux :
 *
 * - Pas de listes massives ni de variantes orthographiques exhaustives.
 *   Le but est d'amorcer la couverture des cas évidents, pas de battre
 *   un classifier IA. Pour de la classification fine, l'admin branche
 *   un provider IA (`ai-classify`).
 * - Match `substring case-insensitive accent-insensitive` côté runtime
 *   (cf. `matchKeywordList` dans `automod.ts`) — donc « idiot » couvre
 *   « idiote », « idïot », etc.
 * - `hate` reste très restreint : les slurs ethniques / homophobes les
 *   plus génériques. L'admin spécialiste de sa communauté ajoute le
 *   reste via `customWords`. Pas de roman ici.
 *
 * Référence pour les inspections côté dashboard : la page modération
 * affiche le vocabulaire réel utilisé pour chaque règle.
 */

export type KeywordVocabulary = Readonly<Record<AutomodAiCategory, ReadonlyArray<string>>>;

const FR: KeywordVocabulary = {
  toxicity: [
    'idiot',
    'crétin',
    'imbécile',
    'con',
    'connard',
    'connasse',
    'débile',
    'abruti',
    'pauvre type',
    'minable',
    'lamentable',
  ],
  harassment: [
    'ferme-la',
    'ferme ta',
    'ta gueule',
    'tg',
    'casse-toi',
    'va te faire',
    'dégage',
    'la ferme',
  ],
  hate: [
    'raciste',
    'sale arabe',
    'sale noir',
    'sale juif',
    'sale blanc',
    'pédé',
    'tapette',
    'gouine',
    'antisémite',
  ],
  sexual: [
    'porn',
    'porno',
    'sexe',
    'pute',
    'salope',
    'enculé',
    'enculée',
    'baise',
    'baiser',
    'chatte',
    'bite',
  ],
  'self-harm': [
    'suicide',
    'se suicider',
    'tue-toi',
    'kys',
    'kill yourself',
    'auto-mutilation',
    'scarification',
  ],
  spam: [
    'discord.gg/',
    'free nitro',
    'nitro gratuit',
    'clique ici',
    'clic ici',
    'gagne maintenant',
    'cliquer ici',
  ],
};

const EN: KeywordVocabulary = {
  toxicity: [
    'idiot',
    'stupid',
    'moron',
    'dumb',
    'dumbass',
    'asshole',
    'jerk',
    'retard',
    'loser',
    'pathetic',
  ],
  harassment: [
    'shut up',
    'shutup',
    'stfu',
    'shut the fuck up',
    'fuck off',
    'piss off',
    'get lost',
    'kys',
  ],
  hate: [
    'racist',
    'nazi',
    'faggot',
    'fag',
    'tranny',
    'kike',
    'spic',
    'chink',
    'antisemite',
    'homophobic',
  ],
  sexual: [
    'porn',
    'porno',
    'pornhub',
    'nsfw',
    'sex',
    'sexual',
    'whore',
    'slut',
    'pussy',
    'dick',
    'cock',
  ],
  'self-harm': [
    'suicide',
    'kill yourself',
    'kys',
    'self-harm',
    'self harm',
    'cut myself',
    'cutting myself',
    'end it all',
  ],
  spam: ['discord.gg/', 'free nitro', 'click here', 'click this', 'win now', 'limited offer'],
};

const ALL: KeywordVocabulary = {
  toxicity: [...FR.toxicity, ...EN.toxicity],
  harassment: [...FR.harassment, ...EN.harassment],
  hate: [...FR.hate, ...EN.hate],
  sexual: [...FR.sexual, ...EN.sexual],
  'self-harm': [...FR['self-harm'], ...EN['self-harm']],
  spam: [...FR.spam, ...EN.spam],
};

const VOCABULARIES: Readonly<Record<AutomodKeywordListLanguage, KeywordVocabulary>> = {
  fr: FR,
  en: EN,
  all: ALL,
};

/**
 * Retourne la liste des mots-clés pour une langue × catégories. La
 * dédup est appliquée — utile quand `language: 'all'` mélange FR et EN
 * et qu'un mot identique (« porn », « kys », « racist ») apparaît
 * dans les deux.
 */
export function vocabularyFor(
  language: AutomodKeywordListLanguage,
  categories: ReadonlyArray<AutomodAiCategory>,
): ReadonlyArray<string> {
  const vocab = VOCABULARIES[language];
  const out = new Set<string>();
  for (const cat of categories) {
    for (const word of vocab[cat]) out.add(word);
  }
  return Array.from(out);
}

/**
 * Expose le vocabulaire complet pour une langue donnée — utilisé par
 * le dashboard pour afficher le tableau de transparence (« quels mots
 * la règle keyword-list reconnaît-elle pour ma langue ? »).
 */
export function vocabularyByCategoryFor(language: AutomodKeywordListLanguage): KeywordVocabulary {
  return VOCABULARIES[language];
}

/** Pour les tests / outillage. */
export const VOCAB_LANGUAGES: ReadonlyArray<AutomodKeywordListLanguage> = ['fr', 'en', 'all'];
