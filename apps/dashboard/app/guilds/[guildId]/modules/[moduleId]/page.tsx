import { EmptyState, PageTitle } from '@varde/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { ConfigForm } from '../../../../../components/ConfigForm';
import { DashboardHeader } from '../../../../../components/DashboardHeader';
import {
  ApiError,
  fetchAdminGuilds,
  fetchModuleConfig,
  fetchModules,
} from '../../../../../lib/api-client';

interface ModuleConfigPageProps {
  readonly params: Promise<{ readonly guildId: string; readonly moduleId: string }>;
}

/**
 * Page de configuration d'un module pour une guild donnée. Charge
 * en parallèle le descripteur du module (pour le nom et le check
 * d'existence côté liste) et sa config + `configUi`. Le formulaire
 * est monté seulement si le module expose un `configUi` — sinon on
 * affiche un `EmptyState` explicite (module sans config éditable).
 */
export default async function ModuleConfigPage({
  params,
}: ModuleConfigPageProps): Promise<ReactElement> {
  const { guildId, moduleId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/api/auth/signin');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let modules: Awaited<ReturnType<typeof fetchModules>>;
  let moduleConfig: Awaited<ReturnType<typeof fetchModuleConfig>>;
  try {
    [guilds, modules, moduleConfig] = await Promise.all([
      fetchAdminGuilds(),
      fetchModules(guildId),
      fetchModuleConfig(guildId, moduleId),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/api/auth/signin');
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }

  const guild = guilds.find((g) => g.id === guildId);
  const module = modules.find((m) => m.id === moduleId);
  if (!guild || !module) notFound();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader userName={session.user.name} />
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <div>
          <Link
            href={`/guilds/${guildId}`}
            className="text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
          >
            ← {guild.name}
          </Link>
        </div>
        <PageTitle
          title={module.name}
          description={
            module.description || `Configuration du module ${module.name} (v${module.version}).`
          }
        />

        {moduleConfig.configUi && moduleConfig.configUi.fields.length > 0 ? (
          <ConfigForm
            guildId={guildId}
            moduleId={moduleId}
            moduleName={module.name}
            ui={moduleConfig.configUi}
            initialValues={moduleConfig.config}
          />
        ) : (
          <EmptyState
            title="Module sans configuration éditable"
            description="Ce module n'expose pas de schéma de configuration. Rien à régler ici."
          />
        )}
      </main>
    </div>
  );
}
