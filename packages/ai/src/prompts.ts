import type { GeneratePresetInput, SuggestCompletionInput } from './types.js';

/**
 * Templates de prompts versionnés (ADR 0007 / R5). Chaque bump de
 * version trace explicitement le changement dans `ai_invocations`
 * via la colonne `prompt_version` — ce qui permet de corréler une
 * régression de qualité à un changement de prompt, pas à un
 * changement de modèle. Les adapters (Ollama, OpenAI-compat)
 * partagent ces templates ; seul le format wire diffère.
 *
 * Règles de style :
 * - Le `system` message cadre la tâche et fixe le format de sortie.
 *   Strictement JSON, sans markdown, sans commentaires. C'est ce
 *   qu'un LLM local de classe 7-8B sait faire quand on est insistant.
 * - Le `user` message porte l'input concret.
 * - On ne demande jamais au LLM de choses hors contrat : si la sortie
 *   n'est pas conforme, l'adapter retry une fois, puis échoue
 *   proprement via `AIProviderError('invalid_response')`.
 */

export const PROMPT_VERSIONS = {
  generatePreset: 'v1',
  suggestCompletion: 'v1',
} as const;

export interface PromptPair {
  readonly system: string;
  readonly user: string;
  readonly version: string;
}

const GENERATE_PRESET_SYSTEM_FR = `Tu es un assistant qui compose des preset de serveur Discord pour des petites communautés.

Format de sortie STRICTEMENT JSON, sans markdown, sans commentaire. Structure attendue :

{
  "preset": {
    "id": "slug-kebab-case",
    "name": "Nom court",
    "description": "Description française 1-2 phrases",
    "tags": ["tag1", "tag2"],
    "locale": "fr",
    "roles": [
      { "localId": "role-x", "name": "Nom du rôle", "color": 0, "permissionPreset": "member-default" | "moderator-minimal" | "moderator-full" | "member-restricted", "hoist": false, "mentionable": false }
    ],
    "categories": [
      { "localId": "cat-x", "name": "nom", "position": 0 }
    ],
    "channels": [
      { "localId": "chan-x", "categoryLocalId": "cat-x" | null, "name": "salon", "type": "text" | "voice" | "forum", "slowmodeSeconds": 0, "readableBy": [], "writableBy": [] }
    ],
    "modules": []
  },
  "rationale": "Pourquoi ce preset en 1-2 phrases",
  "confidence": 0.0
}

Contraintes :
- Maximum 20 objets au total (rôles + catégories + salons + modules).
- Les localId doivent être uniques par scope et au format kebab-case.
- \`permissionPreset\` est obligatoirement l'une des 4 valeurs listées.
- Tags en lowercase court.
- Tu ne commentes pas ta sortie, tu réponds uniquement en JSON valide.`;

const GENERATE_PRESET_SYSTEM_EN = `You are an assistant composing Discord server presets for small communities.

Output STRICTLY JSON, no markdown, no comments. Expected structure:

{
  "preset": {
    "id": "slug-kebab-case",
    "name": "Short name",
    "description": "English description 1-2 sentences",
    "tags": ["tag1", "tag2"],
    "locale": "en",
    "roles": [
      { "localId": "role-x", "name": "Role name", "color": 0, "permissionPreset": "member-default" | "moderator-minimal" | "moderator-full" | "member-restricted", "hoist": false, "mentionable": false }
    ],
    "categories": [
      { "localId": "cat-x", "name": "name", "position": 0 }
    ],
    "channels": [
      { "localId": "chan-x", "categoryLocalId": "cat-x" | null, "name": "channel", "type": "text" | "voice" | "forum", "slowmodeSeconds": 0, "readableBy": [], "writableBy": [] }
    ],
    "modules": []
  },
  "rationale": "Why this preset in 1-2 sentences",
  "confidence": 0.0
}

Constraints:
- At most 20 objects total (roles + categories + channels + modules).
- localId values must be unique per scope, kebab-case.
- \`permissionPreset\` must be one of the four listed values.
- Tags: short lowercase.
- Do not comment the output; reply only with valid JSON.`;

/**
 * Construit le couple (system, user) pour `generatePreset`. Le
 * system diffère selon la locale demandée pour guider le ton et la
 * langue des noms produits — plus robuste qu'un même prompt FR/EN
 * qui laisse le LLM hésiter.
 */
export function buildGeneratePresetPrompt(input: GeneratePresetInput): PromptPair {
  const system = input.locale === 'en' ? GENERATE_PRESET_SYSTEM_EN : GENERATE_PRESET_SYSTEM_FR;
  const hintsLine = input.hints.length > 0 ? `\nTags indicatifs : ${input.hints.join(', ')}` : '';
  const user = `Description de la communauté :\n${input.description}${hintsLine}`;
  return { system, user, version: PROMPT_VERSIONS.generatePreset };
}

const SUGGEST_COMPLETION_SYSTEM = `Tu proposes des compléments de configuration pour un serveur Discord en cours de construction.

Format de sortie STRICTEMENT JSON, tableau d'objets, pas de markdown :

[
  {
    "label": "Libellé affichable",
    "patch": { /* objet partiel d'un OnboardingDraft */ },
    "rationale": "Pourquoi cette suggestion"
  }
]

Contraintes :
- Entre 1 et 5 suggestions.
- \`patch\` est un objet partiel OnboardingDraft (roles/categories/channels/modules), jamais un champ racine comme "locale".
- Tu réponds uniquement en JSON valide, sans commentaire.`;

/**
 * Construit le couple (system, user) pour `suggestCompletion`. Le
 * contexte actuel (draft) est sérialisé en JSON compact dans le
 * message user pour que le LLM "voie" ce qui existe déjà et évite
 * les doublons.
 */
export function buildSuggestCompletionPrompt(input: SuggestCompletionInput): PromptPair {
  const hintLine = input.hint ? `\nIndice : ${input.hint}` : '';
  const user = `Type de suggestion demandé : ${input.kind}${hintLine}\nDraft actuel :\n${JSON.stringify(input.contextDraft)}`;
  return {
    system: SUGGEST_COMPLETION_SYSTEM,
    user,
    version: PROMPT_VERSIONS.suggestCompletion,
  };
}
