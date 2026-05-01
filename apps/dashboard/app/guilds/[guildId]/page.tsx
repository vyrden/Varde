import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../auth';
import { OverviewHero } from '../../../components/guild-overview/OverviewHero';
import { PinnedShortcutsCard } from '../../../components/guild-overview/PinnedShortcutsCard';
import { QuickStartSection } from '../../../components/guild-overview/QuickStartSection';
import { RecentActivityCard } from '../../../components/guild-overview/RecentActivityCard';
import { RecentChangesCard } from '../../../components/guild-overview/RecentChangesCard';
import {
  ApiError,
  fetchGuildOverview,
  fetchGuildPreferences,
  fetchModules,
  type GuildOverviewDto,
  type GuildPreferencesDto,
  type ModuleListItemDto,
} from '../../../lib/api-client';

/**
 * Vue d'ensemble d'une guild (jalon 7 PR 7.4.6). Tableau de bord
 * d'actions pensé pour qu'un admin trouve en moins de 5 secondes ce
 * qui demande son attention :
 *
 * - Bandeau identité du serveur + signal vital « bot répond ».
 * - Carte « Modules épinglés » : raccourcis personnalisés, ou empty
 *   state qui pointe vers la liste complète.
 * - Carte « Modifié récemment » : top 3 modules dont la config a
 *   changé. Permet de revenir vite sur ce qu'on a touché hier.
 * - Carte « Activité du bot (24h) » : compteurs par catégorie
 *   d'événement audit. Lien vers les logs complets.
 * - Section « Démarrage rapide » : visible uniquement si < 2
 *   modules actifs. Suggère les modules officiels à activer.
 *
 * Pas de chart, pas de stats analytiques, pas de panneau « stats du
 * jour » — la page sert à agir, pas à contempler. Cf.
 * `docs/Jalon 7/PR4-experience-serveur.md` § 8 et anti-pattern n°3
 * du design system.
 *
 * Robustesse : `fetchGuildOverview` et `fetchGuildPreferences` sont
 * isolés dans leurs propres try/catch — un échec sur l'un d'eux
 * laisse la page se rendre avec des fallbacks vides plutôt que de
 * tomber en 404. Seul `fetchModules` reste critique : sans la liste
 * des modules, on ne peut afficher ni les raccourcis épinglés ni le
 * démarrage rapide.
 */

interface GuildPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

const EMPTY_OVERVIEW: GuildOverviewDto = {
  guild: { id: '', name: null, iconUrl: null, memberCount: null },
  bot: { connected: false, latencyMs: null, lastEventAt: null },
  recentChanges: [],
  recentActivity: { byCategory: {}, totalLast24h: 0 },
  modulesStats: { total: 0, active: 0, configured: 0 },
};

const EMPTY_PREFERENCES: GuildPreferencesDto = { pinnedModules: [] };

export default async function GuildOverviewPage({ params }: GuildPageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let modules: readonly ModuleListItemDto[] = [];
  try {
    modules = await fetchModules(guildId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }

  let overview = EMPTY_OVERVIEW;
  try {
    overview = await fetchGuildOverview(guildId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    // 403/404 sur l'overview : on garde le fallback vide. Le layout
    // a déjà géré l'accès à la guild en amont, on ne va pas tomber
    // ici une seconde fois.
  }

  let preferences = EMPTY_PREFERENCES;
  try {
    preferences = await fetchGuildPreferences(guildId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
  }

  // Index moduleId → ModuleListItemDto pour résoudre nom / icône /
  // shortDescription depuis les pins (qui ne portent que { moduleId,
  // position }) et depuis les recentChanges.
  const modulesById: Record<string, ModuleListItemDto> = {};
  for (const m of modules) {
    modulesById[m.id] = m;
  }

  // Liste des modules épinglés résolue en ordre des positions, en
  // ignorant les pins dont le moduleId n'a plus d'entrée (module
  // supprimé du système, cleanup background pas encore passé).
  const pinned = preferences.pinnedModules
    .map((p) => modulesById[p.moduleId])
    .filter((m): m is ModuleListItemDto => m !== undefined);

  return (
    <>
      <OverviewHero guild={overview.guild} bot={overview.bot} />
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <PinnedShortcutsCard guildId={guildId} pinned={pinned} />
          <RecentChangesCard
            guildId={guildId}
            changes={overview.recentChanges}
            modulesById={modulesById}
          />
          <RecentActivityCard guildId={guildId} activity={overview.recentActivity} />
        </div>
        <QuickStartSection guildId={guildId} modules={modules} />
      </div>
    </>
  );
}
