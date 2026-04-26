import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  UnboundPermissionsBanner,
} from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { AuditView } from '../../../../../components/audit/AuditView';
import { ModuleEnabledToggle } from '../../../../../components/ModuleEnabledToggle';
import { ModerationConfigForm } from '../../../../../components/moderation/ModerationConfigForm';
import { moduleIcon } from '../../../../../components/shell/module-icons';
import { PageBreadcrumb } from '../../../../../components/shell/PageBreadcrumb';
import {
  ApiError,
  fetchAdminGuilds,
  fetchAudit,
  fetchGuildRoles,
  fetchModuleConfig,
  fetchModules,
  fetchUnboundPermissions,
} from '../../../../../lib/api-client';

interface ModerationPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

/**
 * Lit la config moderation depuis le snapshot retourné par l'API.
 * Format `{ mutedRoleId, dmOnSanction, automod: { rules, bypassRoleIds }}`.
 * Tout champ absent ou mal typé tombe sur le défaut.
 */
const normalizeConfig = (
  raw: unknown,
): {
  mutedRoleId: string | null;
  dmOnSanction: boolean;
  automod: {
    rules: ReadonlyArray<{
      id: string;
      label: string;
      kind: 'blacklist' | 'regex';
      pattern: string;
      action: 'delete' | 'warn' | 'mute';
      durationMs: number | null;
      enabled: boolean;
    }>;
    bypassRoleIds: readonly string[];
  };
} => {
  const fallback = {
    mutedRoleId: null,
    dmOnSanction: true,
    automod: { rules: [], bypassRoleIds: [] },
  } as const;
  if (typeof raw !== 'object' || raw === null) return fallback;
  const obj = raw as Record<string, unknown>;
  const mutedRoleId =
    typeof obj['mutedRoleId'] === 'string' && obj['mutedRoleId'].length > 0
      ? (obj['mutedRoleId'] as string)
      : null;
  const dmOnSanction = typeof obj['dmOnSanction'] === 'boolean' ? obj['dmOnSanction'] : true;

  const automodRaw = obj['automod'];
  const automod =
    typeof automodRaw === 'object' && automodRaw !== null
      ? (automodRaw as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const rulesRaw = Array.isArray(automod['rules']) ? (automod['rules'] as unknown[]) : [];
  const rules = rulesRaw.flatMap((r) => {
    if (typeof r !== 'object' || r === null) return [];
    const rule = r as Record<string, unknown>;
    if (
      typeof rule['id'] !== 'string' ||
      typeof rule['label'] !== 'string' ||
      (rule['kind'] !== 'blacklist' && rule['kind'] !== 'regex') ||
      typeof rule['pattern'] !== 'string' ||
      (rule['action'] !== 'delete' && rule['action'] !== 'warn' && rule['action'] !== 'mute')
    ) {
      return [];
    }
    return [
      {
        id: rule['id'],
        label: rule['label'],
        kind: rule['kind'] as 'blacklist' | 'regex',
        pattern: rule['pattern'],
        action: rule['action'] as 'delete' | 'warn' | 'mute',
        durationMs: typeof rule['durationMs'] === 'number' ? (rule['durationMs'] as number) : null,
        enabled: typeof rule['enabled'] === 'boolean' ? rule['enabled'] : true,
      },
    ];
  });
  const bypassRoleIds = Array.isArray(automod['bypassRoleIds'])
    ? (automod['bypassRoleIds'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  return {
    mutedRoleId,
    dmOnSanction,
    automod: { rules, bypassRoleIds },
  };
};

/**
 * Page modération. Layout cohérent avec les autres modules dédiés :
 * - Header (icône + nom + badge état)
 * - Bandeau permissions non liées (PR 4.2 commune)
 * - Soit banner « non activé » avec toggle inline (sidebar absente
 *   tant que le module est OFF), soit grid 2/3 ↔ 1/3 :
 *   - Main : `Card` config + `AuditView` filtré par `moduleId='moderation'`
 *     pour lister les sanctions (réutilise scroll infini, drawer détail).
 *   - Sidebar : `Card` À propos avec version + toggle d'activation.
 *
 * Le filtre `moduleId='moderation'` est passé en `lockedFilters` à
 * `AuditView` pour qu'il survive aux resets utilisateur (filtre
 * non-éditable côté UI).
 */
export default async function ModerationPage({
  params,
}: ModerationPageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let modules: Awaited<ReturnType<typeof fetchModules>>;
  let moduleConfig: Awaited<ReturnType<typeof fetchModuleConfig>>;
  let unbound: Awaited<ReturnType<typeof fetchUnboundPermissions>>;
  let roles: Awaited<ReturnType<typeof fetchGuildRoles>>;
  let auditPage: Awaited<ReturnType<typeof fetchAudit>>;

  try {
    [guilds, modules, moduleConfig, unbound, roles, auditPage] = await Promise.all([
      fetchAdminGuilds(),
      fetchModules(guildId),
      fetchModuleConfig(guildId, 'moderation'),
      fetchUnboundPermissions(guildId, 'moderation'),
      fetchGuildRoles(guildId),
      fetchAudit(guildId, { moduleId: 'moderation', limit: 50 }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }

  const guild = guilds.find((g) => g.id === guildId);
  const modModule = modules.find((m) => m.id === 'moderation');
  if (!guild || !modModule) notFound();

  const isEnabled = modModule.enabled !== false;
  const config = normalizeConfig(moduleConfig.config);
  const knownActions = Array.from(new Set(auditPage.items.map((item) => item.action))).sort();

  return (
    <>
      <header className="bg-surface px-6 pt-5 pb-4">
        <PageBreadcrumb
          items={[{ label: 'Modules', href: `/guilds/${guildId}` }, { label: modModule.name }]}
        />
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
              isEnabled ? 'bg-primary/15 text-primary' : 'bg-surface-active text-muted-foreground'
            }`}
          >
            {moduleIcon('moderation', 20)}
          </div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground">{modModule.name}</h1>
          <Badge variant={isEnabled ? 'active' : 'inactive'}>
            {isEnabled ? 'Actif' : 'Inactif'}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Sanctions manuelles (warn, kick, ban, mute, etc.) avec historique des cases. Les actions
          sont auditées et consultables via <code>/infractions @user</code> et <code>/case</code>.
        </p>
      </header>
      <Separator />
      <div className="mx-auto w-full max-w-7xl space-y-5 px-6 py-6">
        <UnboundPermissionsBanner
          permissions={unbound.map((p) => ({ id: p.id, description: p.description }))}
          configureHref={`/guilds/${guildId}/settings/permissions?focus=moderation`}
        />

        {!isEnabled ? (
          <div
            role="status"
            className="flex items-start justify-between gap-4 rounded-lg border border-info/40 bg-info/10 p-5 text-foreground"
          >
            <div>
              <p className="font-semibold">Le module n'est pas activé sur cette guild.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tant qu'il reste désactivé, les commandes de modération ne sont pas exécutées et
                aucune sanction n'est enregistrée. Activez-le pour reprendre la modération.
              </p>
            </div>
            <ModuleEnabledToggle
              guildId={guildId}
              moduleId={modModule.id}
              moduleName={modModule.name}
              initialEnabled={isEnabled}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <ModerationConfigForm guildId={guildId} initial={config} roles={roles} />

              <Card>
                <CardHeader>
                  <CardTitle>Historique des sanctions</CardTitle>
                </CardHeader>
                <CardContent>
                  <AuditView
                    guildId={guildId}
                    initialItems={auditPage.items}
                    initialNextCursor={auditPage.nextCursor}
                    initialFilters={{}}
                    knownActions={knownActions}
                    lockedFilters={{ moduleId: 'moderation' }}
                  />
                </CardContent>
              </Card>
            </div>

            <aside className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">À propos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-mono text-foreground">v{modModule.version}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Statut</span>
                    <ModuleEnabledToggle
                      guildId={guildId}
                      moduleId={modModule.id}
                      moduleName={modModule.name}
                      initialEnabled={isEnabled}
                    />
                  </div>
                  <p className="pt-1 text-xs text-muted-foreground">
                    12 commandes :{' '}
                    <code>
                      /warn /kick /ban /tempban /unban /mute /tempmute /unmute /clear /slowmode
                      /infractions /case
                    </code>
                    .
                  </p>
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
