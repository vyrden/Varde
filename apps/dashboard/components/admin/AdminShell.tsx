import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactElement, ReactNode } from 'react';

import { DashboardHeader } from '../DashboardHeader';

/**
 * Cadre commun aux 5 sections admin (jalon 7 PR 7.2 sub-livrable 7).
 *
 * Composé de trois éléments structurants :
 *
 * 1. **Header global** identique au reste du dashboard (logo +
 *    menu user). Cohérence visuelle avec `app/(dashboard)/layout`.
 * 2. **Bandeau jaune permanent** sous le header rappelant que
 *    l'admin parle ici à l'instance entière, pas à une guild —
 *    toute modification s'applique immédiatement et globalement.
 *    Posé en `<aside role="alert">` pour être annoncé par les
 *    lecteurs d'écran.
 * 3. **Layout 2 colonnes** : sidebar gauche (liens vers les 5
 *    sections + retour app) + main content. Sur mobile, la sidebar
 *    devient une rangée scrollable horizontale au-dessus du
 *    contenu.
 *
 * Les liens de la sidebar sont calculés statiquement — pas de
 * service-side state, pas d'i18n côté composant pour les labels
 * (ils viennent en props depuis le layout pour rester traduisibles
 * via `next-intl`).
 */

export type AdminSection = 'overview' | 'identity' | 'discord' | 'urls' | 'ownership';

export interface AdminSidebarItem {
  readonly key: AdminSection;
  readonly label: string;
  readonly href: string;
}

export interface AdminShellProps {
  readonly current: AdminSection;
  readonly userName: string | null | undefined;
  readonly bannerMessage: string;
  readonly sidebarHeading: string;
  readonly items: readonly AdminSidebarItem[];
  readonly backToAppLabel: string;
  readonly children: ReactNode;
}

export async function AdminShell({
  current,
  userName,
  bannerMessage,
  sidebarHeading,
  items,
  backToAppLabel,
  children,
}: AdminShellProps): Promise<ReactElement> {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DashboardHeader userName={userName} />
      <aside
        role="alert"
        className="border-b border-amber-300 bg-amber-100 px-6 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
        data-testid="admin-banner"
      >
        {bannerMessage}
      </aside>
      <div className="flex flex-1 flex-col md:flex-row">
        <nav
          aria-label={sidebarHeading}
          className="border-b border-border-muted bg-sidebar md:w-64 md:border-b-0 md:border-r"
        >
          <div className="px-6 py-5 md:py-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {sidebarHeading}
            </h2>
            <ul className="flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible">
              {items.map((item) => {
                const active = item.key === current;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`block whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
                        active
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 hidden md:block">
              <Link
                href="/"
                className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                ← {backToAppLabel}
              </Link>
            </div>
          </div>
        </nav>
        <main className="flex-1 px-6 py-8">
          <div className="mx-auto max-w-4xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Helper i18n : assemble les items de sidebar via next-intl. */
export const buildAdminSidebarItems = async (): Promise<readonly AdminSidebarItem[]> => {
  const t = await getTranslations('admin.shell.sections');
  return [
    { key: 'overview', label: t('overview'), href: '/admin' },
    { key: 'identity', label: t('identity'), href: '/admin/identity' },
    { key: 'discord', label: t('discord'), href: '/admin/discord' },
    { key: 'urls', label: t('urls'), href: '/admin/urls' },
    { key: 'ownership', label: t('ownership'), href: '/admin/ownership' },
  ];
};
