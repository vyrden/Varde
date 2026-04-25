import { Badge, PageHeader, UnboundPermissionsBanner } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
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
 * Normalise la config brute retournée par l'API en un `LogsConfigClient`
 * aux champs garantis. Nécessaire parce que `fetchModuleConfig` retourne
 * le JSON stocké dans `guild_config` tel quel — pour une guild qui n'a
 * jamais configuré le module, c'est `{}`, ce qui ferait planter
 * l'éditeur sur `config.routes.find(...)`.
 */
function normalizeLogsConfig(raw: unknown): LogsConfigClient {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const routes = Array.isArray(obj['routes']) ? (obj['routes'] as LogsConfigClient['routes']) : [];
  const exclusionsRaw =
    typeof obj['exclusions'] === 'object' && obj['exclusions'] !== null
      ? (obj['exclusions'] as Record<string, unknown>)
      : {};
  return {
    version: 1,
    routes,
    exclusions: {
      userIds: Array.isArray(exclusionsRaw['userIds']) ? (exclusionsRaw['userIds'] as string[]) : [],
      roleIds: Array.isArray(exclusionsRaw['roleIds']) ? (exclusionsRaw['roleIds'] as string[]) : [],
      channelIds: Array.isArray(exclusionsRaw['channelIds'])
        ? (exclusionsRaw['channelIds'] as string[])
        : [],
      excludeBots: typeof exclusionsRaw['excludeBots'] === 'boolean' ? exclusionsRaw['excludeBots'] : true,
    },
  };
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

  const isEnabled = logsModule.enabled !== false;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Mes serveurs', href: '/' },
          { label: guild.name, href: `/guilds/${guildId}` },
          { label: 'Modules', href: `/guilds/${guildId}` },
          { label: logsModule.name },
        ]}
        title={logsModule.name}
        description="Publie dans un salon Discord les événements importants de ton serveur — arrivées, départs, modifications de rôles, messages supprimés, etc. Utile pour un audit de modération ou un suivi des changements."
        actions={
          <Badge variant={isEnabled ? 'active' : 'inactive'}>
            {isEnabled ? 'Actif' : 'Inactif'}
          </Badge>
        }
      />
      <div className="mx-auto w-full max-w-4xl space-y-5 px-6 py-6">
        <UnboundPermissionsBanner
          permissions={unbound.map((p) => ({ id: p.id, description: p.description }))}
          configureHref={`/guilds/${guildId}/settings/permissions?focus=logs`}
        />

        {/* Bandeau informatif si le module est désactivé sur la guild */}
        {!isEnabled ? (
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
            initialConfig={normalizeLogsConfig(moduleConfig.config)}
            brokenRoutes={brokenRoutes}
            channels={channels}
            roles={roles}
          />
        )}
      </div>
    </>
  );
}
