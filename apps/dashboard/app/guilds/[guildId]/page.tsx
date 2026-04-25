import { PageHeader } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../auth';
import { ModuleList } from '../../../components/ModuleList';
import { ApiError, fetchAdminGuilds, fetchModules } from '../../../lib/api-client';

interface GuildPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

/**
 * Page d'une guild : grille de modules. La sidebar fournit déjà les
 * raccourcis vers Onboarding / IA / Audit / Permissions — pas besoin
 * de les dupliquer ici.
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
    <>
      <PageHeader
        breadcrumbs={[{ label: guild.name }, { label: 'Modules' }]}
        title="Modules"
        description="Clique sur un module pour en éditer la configuration."
      />
      <div className="p-6">
        <ModuleList guildId={guildId} modules={modules} />
      </div>
    </>
  );
}
