import { cookies } from 'next/headers';

/**
 * Client léger vers `/guilds/:guildId/settings/ai`. Shapes DTO
 * recopiées depuis `apps/api/src/routes/ai-settings.ts` pour éviter
 * de charger Fastify côté dashboard.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

export type AiProviderId = 'none' | 'ollama' | 'openai-compat';

export interface AiSettingsDto {
  readonly providerId: AiProviderId;
  readonly endpoint: string | null;
  readonly model: string | null;
  readonly hasApiKey: boolean;
  readonly updatedAt: string | null;
}

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export class AiSettingsApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchAiSettings(guildId: string): Promise<AiSettingsDto> {
  const response = await fetch(`${API_URL}/guilds/${encodeURIComponent(guildId)}/settings/ai`, {
    cache: 'no-store',
    headers: { accept: 'application/json', cookie: await buildCookieHeader() },
  });
  if (!response.ok) {
    throw new AiSettingsApiError(response.status, `GET settings/ai a répondu ${response.status}`);
  }
  return (await response.json()) as AiSettingsDto;
}
