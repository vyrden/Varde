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
import { ModuleEnabledToggle } from '../../../../../components/ModuleEnabledToggle';
import {
  type AiCategoryClient,
  type AutomodRuleClient,
  type KeywordListLanguageClient,
  ModerationConfigForm,
  type RestrictedChannelClient,
  type RestrictedChannelModeClient,
} from '../../../../../components/moderation/ModerationConfigForm';
import { moduleIcon } from '../../../../../components/shell/module-icons';
import { PageBreadcrumb } from '../../../../../components/shell/PageBreadcrumb';
import {
  ApiError,
  fetchAdminGuilds,
  fetchAudit,
  fetchGuildRoles,
  fetchGuildTextChannels,
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
const isAiCategory = (c: unknown): c is AiCategoryClient =>
  c === 'toxicity' ||
  c === 'harassment' ||
  c === 'hate' ||
  c === 'sexual' ||
  c === 'self-harm' ||
  c === 'spam';

const isRestrictedMode = (m: unknown): m is RestrictedChannelModeClient =>
  m === 'commands' || m === 'images' || m === 'videos';

const normalizeConfig = (
  raw: unknown,
): {
  mutedRoleId: string | null;
  dmOnSanction: boolean;
  automod: {
    rules: readonly AutomodRuleClient[];
    bypassRoleIds: readonly string[];
  };
  restrictedChannels: readonly RestrictedChannelClient[];
} => {
  const fallback = {
    mutedRoleId: null,
    dmOnSanction: true,
    automod: { rules: [], bypassRoleIds: [] },
    restrictedChannels: [],
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
  const rules = rulesRaw.flatMap((r): AutomodRuleClient[] => {
    if (typeof r !== 'object' || r === null) return [];
    const rule = r as Record<string, unknown>;
    const id = rule['id'];
    const label = rule['label'];
    const kind = rule['kind'];
    if (typeof id !== 'string' || typeof label !== 'string') return [];

    // Hydrate `actions[]` depuis le format multi-actions ou retombe
    // sur le format legacy `action` (single). Filtre les valeurs
    // inconnues et déduplique. Au moins une action requise.
    const isAction = (v: unknown): v is 'delete' | 'warn' | 'mute' =>
      v === 'delete' || v === 'warn' || v === 'mute';
    const actionsRaw = rule['actions'];
    const legacyAction = rule['action'];
    const actionsParsed: ('delete' | 'warn' | 'mute')[] = Array.isArray(actionsRaw)
      ? (actionsRaw as unknown[]).filter(isAction)
      : isAction(legacyAction)
        ? [legacyAction]
        : [];
    const actions = Array.from(new Set(actionsParsed));
    if (actions.length === 0) return [];

    const base = {
      id,
      label,
      actions,
      durationMs: typeof rule['durationMs'] === 'number' ? (rule['durationMs'] as number) : null,
      enabled: typeof rule['enabled'] === 'boolean' ? rule['enabled'] : true,
    };
    if ((kind === 'blacklist' || kind === 'regex') && typeof rule['pattern'] === 'string') {
      return [{ ...base, kind, pattern: rule['pattern'] as string }];
    }
    if (
      kind === 'rate-limit' &&
      typeof rule['count'] === 'number' &&
      typeof rule['windowMs'] === 'number'
    ) {
      const scope = rule['scope'] === 'user-channel' ? 'user-channel' : 'user-guild';
      return [
        {
          ...base,
          kind: 'rate-limit',
          count: rule['count'] as number,
          windowMs: rule['windowMs'] as number,
          scope,
        },
      ];
    }
    if (kind === 'ai-classify' && Array.isArray(rule['categories'])) {
      const categories = (rule['categories'] as unknown[]).filter(isAiCategory);
      if (categories.length === 0) return [];
      const maxContentLength =
        typeof rule['maxContentLength'] === 'number'
          ? Math.min(2000, Math.max(64, rule['maxContentLength'] as number))
          : 500;
      return [
        {
          ...base,
          kind: 'ai-classify',
          categories,
          maxContentLength,
        },
      ];
    }
    if (kind === 'invites') {
      const allowOwnGuild =
        typeof rule['allowOwnGuild'] === 'boolean' ? rule['allowOwnGuild'] : true;
      return [{ ...base, kind: 'invites', allowOwnGuild }];
    }
    if (kind === 'links') {
      const mode = rule['mode'] === 'whitelist' ? 'whitelist' : 'block-all';
      const whitelist = Array.isArray(rule['whitelist'])
        ? (rule['whitelist'] as unknown[]).filter((w): w is string => typeof w === 'string')
        : [];
      return [{ ...base, kind: 'links', mode, whitelist }];
    }
    if (kind === 'caps') {
      const minLength =
        typeof rule['minLength'] === 'number'
          ? Math.min(200, Math.max(4, rule['minLength'] as number))
          : 8;
      const ratio =
        typeof rule['ratio'] === 'number'
          ? Math.min(1, Math.max(0.3, rule['ratio'] as number))
          : 0.7;
      return [{ ...base, kind: 'caps', minLength, ratio }];
    }
    if (kind === 'emojis' && typeof rule['maxCount'] === 'number') {
      const maxCount = Math.min(50, Math.max(2, rule['maxCount'] as number));
      return [{ ...base, kind: 'emojis', maxCount }];
    }
    if (kind === 'spoilers' && typeof rule['maxCount'] === 'number') {
      const maxCount = Math.min(20, Math.max(2, rule['maxCount'] as number));
      return [{ ...base, kind: 'spoilers', maxCount }];
    }
    if (kind === 'mentions' && typeof rule['maxCount'] === 'number') {
      const maxCount = Math.min(50, Math.max(2, rule['maxCount'] as number));
      const includeRoles = typeof rule['includeRoles'] === 'boolean' ? rule['includeRoles'] : true;
      return [{ ...base, kind: 'mentions', maxCount, includeRoles }];
    }
    if (kind === 'zalgo') {
      const ratio =
        typeof rule['ratio'] === 'number'
          ? Math.min(1, Math.max(0.1, rule['ratio'] as number))
          : 0.3;
      return [{ ...base, kind: 'zalgo', ratio }];
    }
    if (kind === 'keyword-list' && Array.isArray(rule['categories'])) {
      const categories = (rule['categories'] as unknown[]).filter(isAiCategory);
      if (categories.length === 0) return [];
      const language: KeywordListLanguageClient =
        rule['language'] === 'fr' || rule['language'] === 'en' || rule['language'] === 'all'
          ? rule['language']
          : 'all';
      const customWords = Array.isArray(rule['customWords'])
        ? (rule['customWords'] as unknown[]).filter((w): w is string => typeof w === 'string')
        : [];
      return [{ ...base, kind: 'keyword-list', language, categories, customWords }];
    }
    return [];
  });
  const bypassRoleIds = Array.isArray(automod['bypassRoleIds'])
    ? (automod['bypassRoleIds'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const restrictedRaw = Array.isArray(obj['restrictedChannels'])
    ? (obj['restrictedChannels'] as unknown[])
    : [];
  const restrictedChannels = restrictedRaw.flatMap((rc): RestrictedChannelClient[] => {
    if (typeof rc !== 'object' || rc === null) return [];
    const r = rc as Record<string, unknown>;
    if (typeof r['channelId'] !== 'string' || !Array.isArray(r['modes'])) return [];
    const modes = (r['modes'] as unknown[]).filter(isRestrictedMode);
    if (modes.length === 0) return [];
    return [{ channelId: r['channelId'] as string, modes }];
  });

  return {
    mutedRoleId,
    dmOnSanction,
    automod: { rules, bypassRoleIds },
    restrictedChannels,
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
  let channels: Awaited<ReturnType<typeof fetchGuildTextChannels>>;
  let auditPage: Awaited<ReturnType<typeof fetchAudit>>;

  try {
    [guilds, modules, moduleConfig, unbound, roles, channels, auditPage] = await Promise.all([
      fetchAdminGuilds(),
      fetchModules(guildId),
      fetchModuleConfig(guildId, 'moderation'),
      fetchUnboundPermissions(guildId, 'moderation'),
      fetchGuildRoles(guildId),
      fetchGuildTextChannels(guildId),
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
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
            {modModule.name}
          </h1>
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
          <ModerationConfigForm
            guildId={guildId}
            initial={config}
            roles={roles}
            channels={channels}
            auditInitialItems={auditPage.items}
            auditInitialNextCursor={auditPage.nextCursor}
            knownActions={knownActions}
            statusCard={
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Statut du module</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-mono text-foreground">v{modModule.version}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Activation</span>
                    <ModuleEnabledToggle
                      guildId={guildId}
                      moduleId={modModule.id}
                      moduleName={modModule.name}
                      initialEnabled={isEnabled}
                    />
                  </div>
                  <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                    12 commandes :{' '}
                    <code>
                      /warn /kick /ban /tempban /unban /mute /tempmute /unmute /clear /slowmode
                      /infractions /case
                    </code>
                  </p>
                </CardContent>
              </Card>
            }
          />
        )}
      </div>
    </>
  );
}
