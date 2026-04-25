'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

// biome-ignore lint/complexity/useLiteralKeys: noUncheckedIndexedAccess requires bracket notation for process.env
const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export interface PublishReactionRoleInput {
  readonly label: string;
  readonly channelId: string;
  readonly message: string;
  readonly mode: 'normal' | 'unique' | 'verifier';
  readonly pairs: ReadonlyArray<{
    readonly emoji:
      | { readonly type: 'unicode'; readonly value: string }
      | {
          readonly type: 'custom';
          readonly id: string;
          readonly name: string;
          readonly animated?: boolean;
        };
    readonly roleId?: string;
    readonly roleName?: string;
  }>;
}

export type PublishResult =
  | { readonly ok: true; readonly id: string; readonly messageId: string }
  | { readonly ok: false; readonly reason: string; readonly detail?: string };

/**
 * Traduit une raison technique retournée par l'API (ou un échec réseau)
 * en message lisible pour l'admin. Accepte un `detail` optionnel
 * (typiquement la raison Discord d'une création de rôle échouée).
 */
export function formatReactionRoleReason(reason: string, detail?: string): string {
  switch (reason) {
    case 'service-indisponible':
      return 'Le bot Discord est indisponible. Réessaie dans quelques instants.';
    case 'body-invalide':
      return 'La requête est invalide. Vérifie les emojis et les rôles de chaque paire.';
    case 'role-creation-failed':
      return `Impossible de créer un rôle : ${formatDiscordReason(detail ?? 'unknown')}`;
    case 'channel-not-found':
      return 'Salon introuvable ou inaccessible par le bot.';
    case 'message-not-found':
      return "Le message Discord associé n'existe plus. Supprime l'entrée et recrée-la.";
    case 'emoji-not-found':
      return "Un emoji est introuvable. Vérifie qu'il s'agit d'un emoji Unicode ou d'un emoji du serveur.";
    case 'missing-permission':
      return 'Permissions Discord manquantes (Manage Roles, Send Messages, Add Reactions).';
    case 'rate-limit-exhausted':
      return 'Limite de débit Discord atteinte. Réessaie dans quelques secondes.';
    case 'network':
      return "Impossible de joindre l'API. Vérifie la connexion au serveur.";
    case 'unknown':
      return 'Erreur inattendue côté serveur. Consulte les logs.';
    default:
      if (reason.startsWith('http-')) {
        return `Erreur HTTP ${reason.slice(5)}.`;
      }
      return `Erreur : ${reason}`;
  }
}

function formatDiscordReason(reason: string): string {
  switch (reason) {
    case 'missing-permission':
      return 'permissions Discord manquantes.';
    case 'rate-limit-exhausted':
      return 'limite de débit atteinte.';
    case 'channel-not-found':
      return 'salon introuvable.';
    case 'message-not-found':
      return 'message introuvable.';
    case 'emoji-not-found':
      return 'emoji introuvable.';
    default:
      return 'erreur Discord inattendue.';
  }
}

/**
 * Publie un nouveau message reaction-roles sur Discord et persiste
 * l'entrée dans la config via `POST /guilds/:guildId/modules/reaction-roles/publish`.
 */
export async function publishReactionRole(
  guildId: string,
  input: PublishReactionRoleInput,
): Promise<PublishResult> {
  try {
    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/reaction-roles/publish`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: await buildCookieHeader(),
        },
        body: JSON.stringify(input),
      },
    );

    if (response.status === 201) {
      const body = (await response.json()) as { id: string; messageId: string };
      revalidatePath(`/guilds/${guildId}/modules/reaction-roles`);
      return { ok: true, id: body.id, messageId: body.messageId };
    }

    const errBody = (await response.json().catch(() => ({}))) as {
      reason?: string;
      detail?: string;
    };
    return {
      ok: false,
      reason: errBody.reason ?? `http-${response.status}`,
      ...(errBody.detail !== undefined ? { detail: errBody.detail } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'network',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface SyncReactionRoleInput {
  readonly label: string;
  readonly mode: 'normal' | 'unique' | 'verifier';
  readonly pairs: PublishReactionRoleInput['pairs'];
}

export type SyncResult =
  | { readonly ok: true; readonly added: number; readonly removed: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Synchronise les paires d'un message reaction-roles existant via
 * `POST /guilds/:guildId/modules/reaction-roles/:messageId/sync`.
 */
export async function syncReactionRole(
  guildId: string,
  messageId: string,
  input: SyncReactionRoleInput,
): Promise<SyncResult> {
  try {
    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/reaction-roles/${encodeURIComponent(messageId)}/sync`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: await buildCookieHeader(),
        },
        body: JSON.stringify(input),
      },
    );

    if (response.ok) {
      const body = (await response.json()) as { added: number; removed: number };
      revalidatePath(`/guilds/${guildId}/modules/reaction-roles`);
      return { ok: true, added: body.added, removed: body.removed };
    }

    const errBody = (await response.json().catch(() => ({}))) as { reason?: string };
    return { ok: false, reason: errBody.reason ?? `http-${response.status}` };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Suppression côté config uniquement. Récupère la config actuelle via
 * `GET /guilds/:guildId/modules/reaction-roles/config`, retire l'entrée
 * correspondante au messageId, puis persiste via
 * `PUT /guilds/:guildId/modules/reaction-roles/config`.
 *
 * Le message Discord reste en place (zombie) — suppression manuelle requise.
 */
export async function deleteReactionRole(
  guildId: string,
  messageId: string,
): Promise<{ readonly ok: boolean }> {
  try {
    const cookieHeader = await buildCookieHeader();

    const existing = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/reaction-roles/config`,
      {
        headers: { accept: 'application/json', cookie: cookieHeader },
        cache: 'no-store',
      },
    );
    if (!existing.ok) return { ok: false };

    const dto = (await existing.json()) as {
      config: { messages?: ReadonlyArray<{ messageId: string }> };
    };
    const remaining = (dto.config.messages ?? []).filter((m) => m.messageId !== messageId);

    const response = await fetch(
      `${API_URL}/guilds/${encodeURIComponent(guildId)}/modules/reaction-roles/config`,
      {
        method: 'PUT',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: cookieHeader,
        },
        body: JSON.stringify({ version: 1, messages: remaining }),
      },
    );
    if (response.ok || response.status === 204) {
      revalidatePath(`/guilds/${guildId}/modules/reaction-roles`);
      return { ok: true };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
