import { cookies } from 'next/headers';

/**
 * Client léger vers les routes `/onboarding/*` de `@varde/api`. On
 * recopie ici les shapes DTO côté dashboard pour ne pas ramener une
 * dépendance runtime à Fastify/drizzle via `@varde/api`. Les shapes
 * restent alignées sur `apps/api/src/routes/onboarding.ts` — si
 * l'API évolue, ce fichier suit.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

export type OnboardingSessionStatus =
  | 'draft'
  | 'previewing'
  | 'applying'
  | 'applied'
  | 'rolled_back'
  | 'expired'
  | 'failed';

export type OnboardingPresetSource = 'blank' | 'preset' | 'ai';

export interface OnboardingDraftRole {
  readonly localId: string;
  readonly name: string;
  readonly nameFr?: string;
  readonly nameEn?: string;
  readonly color: number;
  readonly permissionPreset:
    | 'moderator-full'
    | 'moderator-minimal'
    | 'member-default'
    | 'member-restricted';
  readonly hoist: boolean;
  readonly mentionable: boolean;
}

export interface OnboardingDraftCategory {
  readonly localId: string;
  readonly name: string;
  readonly position: number;
}

export interface OnboardingDraftChannel {
  readonly localId: string;
  readonly categoryLocalId: string | null;
  readonly name: string;
  readonly type: 'text' | 'voice' | 'forum';
  readonly topic?: string;
  readonly slowmodeSeconds: number;
  readonly readableBy: readonly string[];
  readonly writableBy: readonly string[];
}

export interface OnboardingDraftModuleConfig {
  readonly moduleId: string;
  readonly enabled: boolean;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface OnboardingDraftDto {
  readonly locale: 'fr' | 'en';
  readonly roles: readonly OnboardingDraftRole[];
  readonly categories: readonly OnboardingDraftCategory[];
  readonly channels: readonly OnboardingDraftChannel[];
  readonly modules: readonly OnboardingDraftModuleConfig[];
}

export interface OnboardingSessionDto {
  readonly id: string;
  readonly guildId: string;
  readonly status: OnboardingSessionStatus;
  readonly presetSource: OnboardingPresetSource;
  readonly presetId: string | null;
  readonly draft: OnboardingDraftDto;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly appliedAt: string | null;
  readonly expiresAt: string | null;
}

export interface OnboardingActionPreviewDto {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface OnboardingPreviewDto {
  readonly actions: readonly OnboardingActionPreviewDto[];
}

/**
 * Shape retournée par `POST /onboarding/ai/generate-preset` (PR 3.10).
 * `preset` est un PresetDefinition complet produit par l'IA,
 * re-vérifié Zod côté API avant retour. `invocationId` référence la
 * ligne `ai_invocations` — le dashboard le renvoie dans le body de
 * POST /onboarding { source: 'ai' } pour lier la session.
 */
export interface GeneratedPresetDto {
  readonly preset: Readonly<Record<string, unknown>>;
  readonly rationale: string;
  readonly confidence: number;
  readonly invocationId: string;
  readonly provider: { readonly id: string; readonly model: string };
}

export type SuggestionKind = 'role' | 'category' | 'channel';

/**
 * Suggestion renvoyée par `POST /onboarding/ai/suggest-completion`
 * (PR 3.11). `patch` est un fragment de draft (ex. `{ roles: [...] }`)
 * que le dashboard fusionne avec le draft courant avant un PATCH —
 * le merge est fait côté client pour concaténer les arrays, là où
 * `deepMerge` côté serveur les remplace.
 */
export interface SuggestionDto {
  readonly label: string;
  readonly patch: Readonly<Record<string, unknown>>;
  readonly rationale: string;
}

export interface SuggestCompletionResponseDto {
  readonly suggestions: readonly SuggestionDto[];
  readonly invocationId: string;
  readonly provider: { readonly id: string; readonly model: string };
}

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export class OnboardingApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * Lit la session active d'une guild ou renvoie `null` si aucune. On
 * swallow volontairement les 404 `no_active_session` : côté UI
 * l'absence n'est pas une erreur, c'est un état de départ naturel.
 */
export async function fetchCurrentOnboardingSession(
  guildId: string,
): Promise<OnboardingSessionDto | null> {
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/onboarding/current`,
    {
      cache: 'no-store',
      headers: { accept: 'application/json', cookie: await buildCookieHeader() },
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new OnboardingApiError(
      response.status,
      `GET onboarding/current a répondu ${response.status}`,
    );
  }
  return (await response.json()) as OnboardingSessionDto;
}
