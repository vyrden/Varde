import { Toaster } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

import { auth } from '../../../auth';
import { GuildRail } from '../../../components/shell/GuildRail';
import { GuildSidebar } from '../../../components/shell/GuildSidebar';
import { RouterRefreshOnFocus } from '../../../components/shell/RouterRefreshOnFocus';
import { UserPanel } from '../../../components/shell/UserPanel';
import { ApiError, fetchAdminGuilds, fetchModules } from '../../../lib/api-client';

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
  try {
    [guilds, modules] = await Promise.all([fetchAdminGuilds(), fetchModules(guildId)]);
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

  const userName = session.user.name ?? 'Utilisateur';
  const avatarUrl = session.user.image ?? null;

  return (
    <Toaster>
      <RouterRefreshOnFocus />
      <div className="flex min-h-screen bg-rail text-foreground">
        <GuildRail guilds={guilds} currentGuildId={guildId} />
        <GuildSidebar
          guildId={guildId}
          guildName={currentGuild.name}
          modules={sidebarModules}
          footer={<UserPanel name={userName} avatarUrl={avatarUrl} userRole="admin" />}
        />
        <main className="animate-page-enter flex min-w-0 flex-1 flex-col bg-surface">
          {children}
        </main>
      </div>
    </Toaster>
  );
}
