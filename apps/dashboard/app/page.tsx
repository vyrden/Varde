import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { auth } from '../auth';
import { SignInCard } from '../components/SignInCard';
import { RouterRefreshOnFocus } from '../components/shell/RouterRefreshOnFocus';
import { ApiError, fetchAdminGuilds } from '../lib/api-client';
import { getOAuthCredentialsClient } from '../lib/oauth-credentials';

const buildBotInviteUrl = (clientId: string | null): string | null => {
  if (clientId === null || clientId.length === 0) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot',
    permissions: '8',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
};

/**
 * Page d'accueil du dashboard.
 *
 * Cas 1 : utilisateur non connecté → CTA de connexion inline.
 * Cas 2 : connecté, au moins un serveur admin → redirect vers le
 *   premier serveur. La sélection de serveurs se fait ensuite via
 *   le rail (composant `GuildRail` du shell), `/` n'est qu'un point
 *   d'entrée.
 * Cas 3 : connecté, aucun serveur admin → écran d'attente expliquant
 *   comment inviter le bot et déconnexion.
 */
export default async function Page(): Promise<ReactElement> {
  const session = await auth();
  if (!session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rail p-6">
        <SignInCard />
      </div>
    );
  }

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  try {
    guilds = await fetchAdminGuilds();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-rail p-6">
          <SignInCard />
        </div>
      );
    }
    throw error;
  }

  if (guilds.length > 0) {
    redirect(`/guilds/${guilds[0]?.id}`);
  }

  const t = await getTranslations('home.empty');

  // Récupère l'App ID Discord depuis instance_config (chiffré en DB,
  // exposé en clair via /internal/oauth-credentials — cf. ADR 0016).
  // Échec silencieux : si l'API est injoignable, on masque le bouton
  // Inviter et on retombe sur la consigne textuelle uniquement.
  let inviteUrl: string | null = null;
  try {
    const creds = await getOAuthCredentialsClient().get();
    inviteUrl = buildBotInviteUrl(creds?.clientId ?? null);
  } catch {
    inviteUrl = null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-rail p-6">
      {/*
       * Re-rend la page server-side dès que l'onglet redevient visible
       * (l'admin a cliqué « Inviter », ouvert l'OAuth Discord dans un
       * nouvel onglet, autorisé, puis est revenu sur ce dashboard) —
       * `fetchAdminGuilds` se rejoue, et si le bot est entré dans une
       * guild, `guilds.length > 0` et le `redirect(...)` plus haut
       * envoie l'admin sur sa nouvelle guild sans clic manuel.
       */}
      <RouterRefreshOnFocus />
      <div className="max-w-md rounded-lg bg-sidebar p-8 text-center shadow-xl">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-active text-3xl"
        >
          🤖
        </div>
        <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('descriptionLine1')}</p>
        {inviteUrl !== null ? (
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="home-empty-invite-bot"
          >
            {t('inviteButton')}
          </a>
        ) : null}
        <p className="mt-4 text-xs text-muted-foreground">{t('descriptionLine2')}</p>
      </div>
    </div>
  );
}
