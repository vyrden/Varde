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
        {/* Fil d'Ariane */}
        <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
          <ol className="flex items-center gap-2">
            <li>
              <Link
                href="/"
                className="hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
              >
                Mes serveurs
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/guilds/${guildId}`}
                className="hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
              >
                {guild.name}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/guilds/${guildId}`}
                className="hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
              >
                Modules
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="font-medium text-foreground" aria-current="page">
              {logsModule.name}
            </li>
          </ol>
        </nav>

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

        {/* Bandeau informatif si le module est désactivé sur la guild */}
        {logsModule.enabled === false ? (
          <div
            role="status"
            className="rounded-lg border border-blue-300 bg-blue-50 p-6 text-blue-900 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-100"
          >
            <p className="font-semibold">Le module n'est pas activé sur cette guild.</p>
            <p className="mt-2 text-sm">
              Tant que le module n'est pas activé, aucun événement ne sera capturé ni envoyé vers
              un salon. L'activation se fait automatiquement lorsque le bot rejoint une nouvelle
              guild (voir <code>DEFAULT_ENABLED_MODULES</code> dans{' '}
              <code>apps/server/src/bin.ts</code>). Si tu as invité le bot avant que ce module
              existe, redémarre le serveur après avoir ajouté l'ID de ta guild dans{' '}
              <code>VARDE_SEED_GUILD_IDS</code>.
            </p>
          </div>
        ) : (
          <LogsConfigEditor
            guildId={guildId}
            initialConfig={moduleConfig.config as unknown as LogsConfigClient}
            brokenRoutes={brokenRoutes}
            channels={channels}
            roles={roles}
          />
        )}
      </main>
    </div>
  );
}
