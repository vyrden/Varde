import { Toaster } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

import { auth } from '../../../auth';
import { GuildRail } from '../../../components/shell/GuildRail';
import { GuildSidebar } from '../../../components/shell/GuildSidebar';
import { RouterRefreshOnFocus } from '../../../components/shell/RouterRefreshOnFocus';
import { UserPanel } from '../../../components/shell/UserPanel';
import {
  ApiError,
  fetchAdminGuilds,
  fetchGuildPreferences,
  fetchGuildUserLevel,
  fetchModules,
} from '../../../lib/api-client';
import { getOAuthCredentialsClient } from '../../../lib/oauth-credentials';

/**
 * Modules qui ont leur page dédiée dans la sidebar (un lien par
 * module avec pastille d'état). Tout autre module reste accessible
 * via la grille `/guilds/[guildId]` mais n'apparaît pas en
 * navigation persistante.
 */
const MODULES_WITH_PAGE = new Set(['logs', 'moderation', 'reaction-roles', 'welcome']);

interface LayoutProps {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly guildId: string }>;
}

export default async function GuildLayout({
  children,
  params,
}: LayoutProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>> = [];
  let modules: Awaited<ReturnType<typeof fetchModules>> = [];
  let userLevel: Awaited<ReturnType<typeof fetchGuildUserLevel>> | null = null;
  let pinnedModules: Awaited<ReturnType<typeof fetchGuildPreferences>>['pinnedModules'] = [];
  // Résolution de l'App ID Discord pour l'URL d'invitation du bouton « + »
  // du rail (ADR 0016). Source unique : `instance_config` via l'endpoint
  // interne `/internal/oauth-credentials`. Échec silencieux → bouton masqué,
  // pas de crash du layout pour autant.
  let inviteClientId: string | null = null;
  try {
    const oauthCreds = await getOAuthCredentialsClient().get();
    inviteClientId = oauthCreds?.clientId ?? null;
  } catch {
    inviteClientId = null;
  }
  try {
    const [guildsResult, modulesResult, userLevelResult, preferencesResult] = await Promise.all([
      fetchAdminGuilds(),
      fetchModules(guildId),
      fetchGuildUserLevel(guildId),
      fetchGuildPreferences(guildId),
    ]);
    guilds = guildsResult;
    modules = modulesResult;
    userLevel = userLevelResult;
    pinnedModules = preferencesResult.pinnedModules;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }

  const currentGuild = guilds.find((g) => g.id === guildId);
  if (!currentGuild) notFound();

  const sidebarModules = modules.map((m) => ({
    id: m.id,
    name: m.name,
    enabled: m.enabled,
    hasDedicatedPage: MODULES_WITH_PAGE.has(m.id),
  }));

  // Index { moduleId → { name, enabled } } pour la section épinglés
  // (jalon 7 PR 7.4.5). Couvre tous les modules visibles par le user
  // — un pin pointant sur un moduleId absent (module désinstallé)
  // est filtré côté client.
  const pinnedEntries: Record<string, { moduleId: string; name: string; enabled: boolean }> = {};
  for (const m of modules) {
    pinnedEntries[m.id] = { moduleId: m.id, name: m.name, enabled: m.enabled };
  }

  // global_name (le pseudo affiché public Discord) > username
  // historique > fallback statique. Discord encourage global_name
  // partout depuis 2023.
  const userName = session.user.globalName ?? session.user.name ?? 'Utilisateur';
  const avatarUrl = session.user.image ?? null;
  const avatarDecorationUrl = session.user.avatarDecorationUrl ?? null;

  return (
    <Toaster>
      <RouterRefreshOnFocus />
      <div className="flex min-h-screen bg-rail text-foreground">
        <GuildRail guilds={guilds} currentGuildId={guildId} inviteClientId={inviteClientId} />
        <GuildSidebar
          guildId={guildId}
          guildName={currentGuild.name}
          modules={sidebarModules}
          pinnedModules={pinnedModules}
          pinnedEntries={pinnedEntries}
          {...(userLevel !== null ? { userLevel } : {})}
          footer={
            <UserPanel
              name={userName}
              avatarUrl={avatarUrl}
              avatarDecorationUrl={avatarDecorationUrl}
              userRole={userLevel ?? 'admin'}
            />
          }
        />
        <main className="animate-page-enter flex min-w-0 flex-1 flex-col bg-surface">
          {children}
        </main>
      </div>
    </Toaster>
  );
}
