import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../auth';
import { SignInCard } from '../components/SignInCard';
import { ApiError, fetchAdminGuilds } from '../lib/api-client';

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-rail p-6">
      <div className="max-w-md rounded-lg bg-sidebar p-8 text-center shadow-xl">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-active text-3xl"
        >
          🤖
        </div>
        <h1 className="text-xl font-bold text-foreground">Aucun serveur</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Le bot Varde n'est présent sur aucun de tes serveurs administrables — ou les permissions
          Discord n'ont pas encore été synchronisées.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Invite le bot sur ton serveur via le portail développeur Discord, puis recharge cette
          page.
        </p>
      </div>
    </div>
  );
}
