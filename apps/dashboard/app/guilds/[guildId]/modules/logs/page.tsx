import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  UnboundPermissionsBanner,
} from '@varde/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { LogsConfigEditor } from '../../../../../components/logs/LogsConfigEditor';
import type { LogsConfigClient } from '../../../../../components/logs/LogsConfigEditor';
import { moduleIcon } from '../../../../../components/shell/module-icons';
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
      excludeBots:
        typeof exclusionsRaw['excludeBots'] === 'boolean' ? exclusionsRaw['excludeBots'] : true,
    },
  };
}

/**
 * Page de configuration du module logs pour une guild. Charge en
 * parallèle les données nécessaires : descripteur de module, config,
 * permissions non liées, routes cassées, salons texte et rôles Discord.
 *
 * Layout : header custom (breadcrumb + icône + titre + badge inline +
 * description), séparateur, puis grid 2/3 ↔ 1/3. La colonne de gauche
 * porte les bannières (permissions / module désactivé) et l'éditeur ;
 * la sidebar droite expose une Card « À propos » (version + statut).
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
      <header className="bg-surface px-6 pt-5 pb-4">
        <nav aria-label="Fil d'Ariane" className="mb-3 text-xs text-muted-foreground">
          <Link
            href={`/guilds/${guildId}`}
            className="font-medium uppercase tracking-wider hover:text-foreground"
          >
            Modules
          </Link>
          <span aria-hidden="true" className="mx-2">
            →
          </span>
          <span className="font-medium uppercase tracking-wider text-foreground">
            {logsModule.name}
          </span>
        </nav>
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
              isEnabled ? 'bg-primary/15 text-primary' : 'bg-surface-active text-muted-foreground'
            }`}
          >
            {moduleIcon('logs', 20)}
          </div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground">{logsModule.name}</h1>
          <Badge variant={isEnabled ? 'active' : 'inactive'}>
            {isEnabled ? 'Actif' : 'Inactif'}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Publie dans un salon Discord les événements importants de ton serveur — arrivées,
          départs, modifications de rôles, messages supprimés, etc. Utile pour un audit de
          modération ou un suivi des changements.
        </p>
      </header>
      <Separator />
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <UnboundPermissionsBanner
              permissions={unbound.map((p) => ({ id: p.id, description: p.description }))}
              configureHref={`/guilds/${guildId}/settings/permissions?focus=logs`}
            />

            {!isEnabled ? (
              <div
                role="status"
                className="rounded-lg border border-blue-300 bg-blue-50 p-6 text-blue-900 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-100"
              >
                <p className="font-semibold">Le module n'est pas activé sur cette guild.</p>
                <p className="mt-2 text-sm">
                  Tant que le module n'est pas activé, aucun événement ne sera capturé ni envoyé
                  vers un salon. L'activation se fait automatiquement lorsque le bot rejoint une
                  nouvelle guild (voir <code>DEFAULT_ENABLED_MODULES</code> dans{' '}
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

          <aside className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>À propos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono text-foreground">v{logsModule.version}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Statut</span>
                  <div className="flex items-center gap-3">
                    <span className="text-foreground">{isEnabled ? 'Actif' : 'Inactif'}</span>
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full opacity-50 ${
                        isEnabled ? 'bg-success' : 'bg-[#4e5058]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.75 left-0.75 h-4 w-4 rounded-full bg-white shadow ${
                          isEnabled ? 'translate-x-4.5' : 'translate-x-0'
                        }`}
                      />
                    </span>
                  </div>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  Les logs sont envoyés en temps réel dans le salon sélectionné.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
