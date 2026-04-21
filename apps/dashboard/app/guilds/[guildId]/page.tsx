import { PageTitle } from '@varde/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../auth';
import { DashboardHeader } from '../../../components/DashboardHeader';
import { ModuleList } from '../../../components/ModuleList';
import { ApiError, fetchAdminGuilds, fetchModules } from '../../../lib/api-client';

interface GuildPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

/**
 * Page d'une guild : header de la guild + liste des modules chargés
 * pour elle. Le nom / icône de la guild viennent de `/guilds` (pas
 * de route `/guilds/:id` dédiée en V1 — on filtre la liste admin
 * côté dashboard, c'est suffisant pour l'usage humain).
 */
export default async function GuildPage({ params }: GuildPageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let modules: Awaited<ReturnType<typeof fetchModules>>;
  try {
    [guilds, modules] = await Promise.all([fetchAdminGuilds(), fetchModules(guildId)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && error.status === 403) notFound();
    throw error;
  }

  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader userName={session.user.name} />
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
          >
            ← Mes serveurs
          </Link>
        </div>
        <PageTitle
          title={guild.name}
          description="Modules chargés pour ce serveur. Cliquez sur un module pour en éditer la configuration."
        />
        <div className="flex flex-wrap gap-4">
          <Link
            href={`/guilds/${guildId}/onboarding`}
            className="text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded"
          >
            Lancer l'onboarding →
          </Link>
          <Link
            href={`/guilds/${guildId}/audit`}
            className="text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded"
          >
            Voir le journal d'audit →
          </Link>
        </div>
        <ModuleList guildId={guildId} modules={modules} />
      </main>
    </div>
  );
}
