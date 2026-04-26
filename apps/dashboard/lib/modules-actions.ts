'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

/**
 * Server action de toggle d'activation d'un module pour une guild.
 * Pattern miroir des autres actions du dashboard : forward du cookie
 * de session au Fastify, mutations invalidées via `revalidatePath`.
 *
 * L'API persiste l'override dans `guild_config` (lu par bin.ts au
 * boot) et applique immédiatement via `loader.enable/disable`.
 */

// biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature requires bracket access on process.env
const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export interface SetModuleEnabledResult {
  readonly ok: boolean;
  readonly status?: number;
  readonly code?: string;
  readonly message?: string;
}

export async function setModuleEnabled(
  guildId: string,
  moduleId: string,
  enabled: boolean,
): Promise<SetModuleEnabledResult> {
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/${encodeURIComponent(moduleId)}/enabled`,
    {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify({ enabled }),
    },
  );

  if (response.status === 204) {
    // Invalide les pages susceptibles de réagir à l'état du module.
    revalidatePath(`/guilds/${guildId}`);
    revalidatePath(`/guilds/${guildId}/modules/${moduleId}`);
    return { ok: true };
  }

  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return {
      ok: false,
      status: response.status,
      ...(body.error ? { code: body.error } : {}),
      ...(body.message ? { message: body.message } : {}),
    };
  } catch {
    return { ok: false, status: response.status };
  }
}
