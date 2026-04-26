import {
  communityCreative,
  communityGamingSmall,
  communityGenericStarter,
  communityStudyGroup,
  communityTechSmall,
  PRESET_CATALOG,
  type PresetDefinition,
} from '@varde/presets';

import type {
  AIProvider,
  GeneratePresetInput,
  PresetProposal,
  ProviderInfo,
  SuggestCompletionInput,
  Suggestion,
} from './types.js';

/**
 * Provider stub rule-based. Zéro réseau, zéro randomness : même
 * entrée → même sortie. Sert deux usages :
 *
 * 1. Tests unit partout dans le monorepo (CI déterministe, pas de
 *    dépendance LLM — R9 du plan jalon 3).
 * 2. Runtime fallback : quand l'admin n'a configué aucun provider,
 *    on ne veut pas que l'UI remonte une erreur ; elle remonte une
 *    proposition "best guess" basée sur un matching mot-clé simple.
 *    L'admin peut toujours brancher Ollama / OpenAI-compat ensuite.
 *
 * Le stub n'essaie pas de battre un vrai LLM. Il pioche parmi les
 * 5 presets hand-curated via un score de match par mot-clé. Pour
 * suggestCompletion, il propose 1-2 entrées génériques en fonction
 * du `kind`. Le but est d'être utile, pas impressionnant.
 */

// ─── Mapping mot-clé → preset ─────────────────────────────────────

interface KeywordRule {
  readonly preset: PresetDefinition;
  readonly keywords: readonly string[];
}

/**
 * Règles ordonnées : le premier match gagne, ce qui rend l'ordre
 * des entrées signifiant (tech avant gaming par exemple, pour ne
 * pas confondre un "gaming server with dev focus"). Les mots-clés
 * sont normalisés en lowercase ASCII avant comparaison ; voir
 * `normalizeToken`.
 */
const KEYWORD_RULES: readonly KeywordRule[] = [
  {
    preset: communityTechSmall,
    keywords: [
      'tech',
      'dev',
      'devs',
      'developer',
      'développeur',
      'code',
      'coding',
      'ops',
      'devops',
    ],
  },
  {
    preset: communityGamingSmall,
    keywords: ['game', 'gaming', 'gamers', 'jeu', 'jeux', 'lfg', 'esports', 'multi'],
  },
  {
    preset: communityCreative,
    keywords: [
      'art',
      'artist',
      'artiste',
      'design',
      'designer',
      'creative',
      'créatif',
      'créa',
      'illustration',
      'musique',
      'music',
      'writer',
      'écrivain',
    ],
  },
  {
    preset: communityStudyGroup,
    keywords: [
      'study',
      'étude',
      'etudes',
      'education',
      'éducation',
      'classroom',
      'classe',
      'learning',
      'apprentissage',
    ],
  },
  {
    preset: communityGenericStarter,
    keywords: ['start', 'starter', 'minimal', 'simple', 'generic', 'générique', 'débutant'],
  },
];

const normalizeToken = (raw: string): string =>
  raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Pour chaque règle, compte combien de ses mots-clés apparaissent
 * dans le texte normalisé. Retourne le preset du meilleur score,
 * ou `null` si aucun match. En cas d'égalité, l'ordre des règles
 * tranche (priorité à la première entrée).
 */
const matchPreset = (
  description: string,
  hints: readonly string[],
): { readonly preset: PresetDefinition; readonly score: number } | null => {
  const text = normalizeToken([description, ...hints].join(' '));
  let best: { preset: PresetDefinition; score: number } | null = null;
  for (const rule of KEYWORD_RULES) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (text.includes(normalizeToken(keyword))) score += 1;
    }
    if (score > 0 && (best === null || score > best.score)) {
      best = { preset: rule.preset, score };
    }
  }
  return best;
};

// ─── Suggestions : listes courtes par kind ────────────────────────

const SUGGESTION_SEEDS: Readonly<Record<SuggestCompletionInput['kind'], readonly Suggestion[]>> = {
  role: [
    {
      label: 'Modérateur minimal',
      rationale: 'Rôle pour timeout + nettoyer les messages sans permissions dangereuses.',
      patch: {
        roles: [
          {
            localId: 'suggest-role-mod',
            name: 'Modérateur',
            color: 0x3498db,
            permissionPreset: 'moderator-minimal',
            hoist: true,
            mentionable: true,
          },
        ],
      },
    },
    {
      label: 'Membre régulier',
      rationale: 'Rôle membre par défaut, lecture + écriture + voix.',
      patch: {
        roles: [
          {
            localId: 'suggest-role-member',
            name: 'Membre',
            color: 0x95a5a6,
            permissionPreset: 'member-default',
            hoist: false,
            mentionable: false,
          },
        ],
      },
    },
  ],
  category: [
    {
      label: 'Catégorie discussions',
      rationale: 'Regroupe les salons texte principaux.',
      patch: {
        categories: [{ localId: 'suggest-cat-discuss', name: 'discussions', position: 0 }],
      },
    },
    {
      label: 'Catégorie vocal',
      rationale: 'Regroupe les salons voice.',
      patch: {
        categories: [{ localId: 'suggest-cat-voice', name: 'voice', position: 1 }],
      },
    },
  ],
  channel: [
    {
      label: 'Salon #annonces',
      rationale: 'Annonces serveur, releases, events. Slowmode 0, lecture seule sauf admins.',
      patch: {
        channels: [
          {
            localId: 'suggest-chan-ann',
            categoryLocalId: null,
            name: 'annonces',
            type: 'text',
            slowmodeSeconds: 0,
            readableBy: [],
            writableBy: [],
          },
        ],
      },
    },
    {
      label: 'Salon #general',
      rationale: 'Discussion libre, bavardages, hors-sujet tolérés.',
      patch: {
        channels: [
          {
            localId: 'suggest-chan-gen',
            categoryLocalId: null,
            name: 'general',
            type: 'text',
            slowmodeSeconds: 0,
            readableBy: [],
            writableBy: [],
          },
        ],
      },
    },
  ],
};

// ─── Provider ─────────────────────────────────────────────────────

const DEFAULT_MODEL = 'stub-v1';

/**
 * Fabrique un provider stub. Pas d'options externes : reste pur
 * fonction de l'entrée et du catalogue. Le `model` est fixe pour
 * que les lignes `ai_invocations` soient identifiables.
 */
export function createStubProvider(): AIProvider {
  return {
    id: 'stub',
    model: DEFAULT_MODEL,

    async generatePreset(input: GeneratePresetInput): Promise<PresetProposal> {
      const match = matchPreset(input.description, input.hints);
      if (match !== null) {
        return {
          preset: match.preset,
          rationale: `Stub rule-based — ${match.score} mot-clé(s) correspondant à "${match.preset.name}".`,
          confidence: Math.min(1, match.score / 3),
        };
      }
      // Fallback : starter minimaliste, confiance faible.
      return {
        preset: communityGenericStarter,
        rationale:
          'Stub rule-based — aucun mot-clé ne matche, retour au preset minimal. À affiner côté admin.',
        confidence: 0.3,
      };
    },

    async suggestCompletion(input: SuggestCompletionInput): Promise<readonly Suggestion[]> {
      return SUGGESTION_SEEDS[input.kind];
    },

    async testConnection(): Promise<ProviderInfo> {
      return {
        id: 'stub',
        model: DEFAULT_MODEL,
        ok: true,
        latencyMs: 0,
        details: 'provider stub local, aucune dépendance externe',
      };
    },

    async classify(text, labels) {
      return stubClassify(text, labels);
    },
  };
}

/** Expose les règles pour les tests golden. */
export const STUB_KEYWORD_RULES = KEYWORD_RULES;
/** Expose le nombre de presets indexés — utile en test. */
export const STUB_PRESET_COUNT = PRESET_CATALOG.length;

/**
 * Mots-clés rule-based par catégorie de risque, pour le classify
 * stub. Très volontairement minimaliste — l'admin qui a besoin d'un
 * vrai classifier branche un provider Ollama / OpenAI-compat. Le
 * stub sert seulement à démontrer le câblage et à donner un repli
 * déterministe en CI / pendant les démos.
 *
 * Match : substring case-insensitive. Pas de fuzzing, pas de
 * morphologie — c'est un stub.
 */
const STUB_TOXICITY_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  toxicity: ['idiot', 'crétin', 'imbécile', 'nul', 'stupid', 'moron'],
  harassment: ['ferme-la', 'ta gueule', 'shut up', 'shutup', 'shut the fuck up', 'stfu'],
  hate: ['raciste', 'racist', 'homophobe', 'antisémite', 'antisemite'],
  sexual: ['nsfw', 'porn', 'sex', 'sexe', 'pute'],
  'self-harm': ['suicide', 'kill yourself', 'kys', 'auto-mutilation'],
  spam: ['discord.gg/', 'free nitro', 'nitro gratis', 'click here'],
};

const stubClassify = async (text: string, labels: readonly string[]): Promise<string> => {
  const lower = text.toLowerCase();
  for (const label of labels) {
    if (label === 'safe') continue;
    const keywords = STUB_TOXICITY_KEYWORDS[label] ?? [];
    if (keywords.some((k) => lower.includes(k))) return label;
  }
  return labels.includes('safe') ? 'safe' : (labels[0] ?? 'safe');
};
