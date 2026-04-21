import { PageTitle } from '@varde/ui';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../auth';
import { DashboardHeader } from '../components/DashboardHeader';
import { ServerList } from '../components/ServerList';
import { ApiError, fetchAdminGuilds } from '../lib/api-client';

/**
 * Page d'accueil du dashboard : « Mes serveurs ». Server component
 * qui (a) vérifie la session via Auth.js, (b) redirige vers le
 * signIn Discord si absente, (c) fetch `/guilds` côté API en
 * forwardant le cookie de session, (d) rend la liste.
 *
 * Rendu non mis en cache (cache: 'no-store') pour rester aligné avec
 * l'état réel du bot : si un serveur est ajouté pendant la session,
 * le prochain GET / le reflète.
 */
export default async function Page(): Promise<ReactElement> {
  const session = await auth();
  if (!session?.user) {
    redirect('/api/auth/signin');
  }

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  try {
    guilds = await fetchAdminGuilds();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/api/auth/signin');
    }
    throw error;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader userName={session.user.name} />
      <main className="mx-auto max-w-5xl p-6">
        <PageTitle
          title="Mes serveurs"
          description="Les serveurs sur lesquels le bot Varde est présent et pour lesquels vous avez les droits d'administration."
        />
        <div className="mt-6">
          <ServerList guilds={guilds} />
        </div>
      </main>
    </div>
  );
}
