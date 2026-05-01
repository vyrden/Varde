import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { auth } from '../../../../auth';
import { ModulesGrid } from '../../../../components/modules-grid/ModulesGrid';
import { ApiError, fetchModules, type ModuleListItemDto } from '../../../../lib/api-client';

/**
 * Grille de modules d'une guild (jalon 7 PR 7.4.7). Surface
 * principale de gestion d'activation et d'épinglage. Chaque carte :
 * toggle on/off + bouton pin + badges Actif/Inactif et Configuré /
 * Non configuré. Click sur la card → page de config du module.
 *
 * Recherche full-text + filtre statut côté client (les listes
 * tiennent en quelques dizaines d'entrées maximum). Debounce 200 ms
 * pour la recherche, filtrage local en O(N) — latence ressentie
 * < 100 ms quand le bundle est chargé.
 *
 * Source des données : `fetchModules(guildId)` enrichi par PR 7.4.3
 * (catégorie, icône, shortDescription, isPinned, lastConfiguredAt).
 * Les permissions sont déjà filtrées côté API : un user `moderator`
 * ne voit que les modules taggés en conséquence.
 */

interface ModulesPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

export default async function ModulesGridPage({ params }: ModulesPageProps): Promise<ReactElement> {
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

  const t = await getTranslations('modulesGrid');

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </header>
      <ModulesGrid guildId={guildId} modules={modules} />
    </div>
  );
}
