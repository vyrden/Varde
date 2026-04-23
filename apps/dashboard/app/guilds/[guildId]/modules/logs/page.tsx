import { PageTitle, UnboundPermissionsBanner } from '@varde/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { DashboardHeader } from '../../../../../components/DashboardHeader';
import { LogsConfigEditor } from '../../../../../components/logs/LogsConfigEditor';
import type { LogsConfigClient } from '../../../../../components/logs/LogsConfigEditor';
import {
  ApiError,
  fetchAdminGuilds,
  fetchGuildRoles,
  fetchGuildTextChannels,
  fetchLogsBrokenRoutes,
  fetchModuleConfig,
  fetchModules,
  fetchUnboundPermissions,
} from '../../../../../lib/api-client';

interface LogsPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

/**
 * Page de configuration du module logs pour une guild. Charge en
 * parallèle les données nécessaires : descripteur de module, config,
 * permissions non liées, routes cassées, salons texte et rôles Discord.
 *
 * Affiche `UnboundPermissionsBanner` si des permissions ne sont pas
 * encore liées à un rôle, puis l'éditeur `LogsConfigEditor`.
 */
export default async function LogsPage({ params }: LogsPageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let modules: Awaited<ReturnType<typeof fetchModules>>;
  let moduleConfig: Awaited<ReturnType<typeof fetchModuleConfig>>;
  let unbound: Awaited<ReturnType<typeof fetchUnboundPermissions>>;
  let brokenRoutes: Awaited<ReturnType<typeof fetchLogsBrokenRoutes>>;
  let channels: Awaited<ReturnType<typeof fetchGuildTextChannels>>;
  let roles: Awaited<ReturnType<typeof fetchGuildRoles>>;

  try {
    [guilds, modules, moduleConfig, unbound, brokenRoutes, channels, roles] = await Promise.all([
      fetchAdminGuilds(),
      fetchModules(guildId),
      fetchModuleConfig(guildId, 'logs'),
      fetchUnboundPermissions(guildId, 'logs'),
      fetchLogsBrokenRoutes(guildId),
      fetchGuildTextChannels(guildId),
      fetchGuildRoles(guildId),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }

  const guild = guilds.find((g) => g.id === guildId);
  const logsModule = modules.find((m) => m.id === 'logs');
  if (!guild || !logsModule) notFound();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader userName={session.user.name ?? null} />
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <div>
          <Link
            href={`/guilds/${guildId}`}
            className="text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
          >
            ← {guild.name}
          </Link>
        </div>
        <PageTitle
          title={logsModule.name}
          description={
            logsModule.description ||
            `Configuration du module ${logsModule.name} (v${logsModule.version}).`
          }
        />

        <UnboundPermissionsBanner
          permissions={unbound.map((p) => ({ id: p.id, description: p.description }))}
          configureHref={`/guilds/${guildId}/settings/permissions?focus=logs`}
        />

        <LogsConfigEditor
          guildId={guildId}
          initialConfig={moduleConfig.config as unknown as LogsConfigClient}
          brokenRoutes={brokenRoutes}
          channels={channels}
          roles={roles}
        />
      </main>
    </div>
  );
}
