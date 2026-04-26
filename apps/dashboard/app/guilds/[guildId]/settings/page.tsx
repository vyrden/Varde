import { Card, CardContent, CardDescription, CardHeader, CardTitle, Separator } from '@varde/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

import { auth } from '../../../../auth';
import { PageBreadcrumb } from '../../../../components/shell/PageBreadcrumb';
import { ApiError, fetchAdminGuilds } from '../../../../lib/api-client';

interface SettingsHubProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

interface SettingsLink {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly hrefSuffix: string;
  readonly icon: ReactNode;
  /** Couleur du wrapper d'icône — bg utilisé directement (pas un token blurple). */
  readonly iconBgClass: string;
}

const SETTINGS_LINKS: ReadonlyArray<SettingsLink> = [
  {
    key: 'bot',
    title: 'Bot',
    description: 'Langue, fuseau horaire, couleur des embeds — appliqués à tous les modules.',
    hrefSuffix: '/settings/bot',
    iconBgClass: 'bg-primary text-primary-foreground',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    key: 'permissions',
    title: 'Permissions',
    description:
      'Liez les permissions de chaque module à des rôles Discord. Sans rôle lié, les actions correspondantes sont bloquées.',
    hrefSuffix: '/settings/permissions',
    iconBgClass: 'bg-primary text-primary-foreground',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="6" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path
          d="M8.3 8L13.5 2.8M11.5 4.8L13 6.3M10 6.3L11.5 7.8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    key: 'ai',
    title: 'Fournisseur IA',
    description:
      'Choisissez le provider utilisé par l’onboarding (stub local, Ollama auto-hébergé ou OpenAI-compatible).',
    hrefSuffix: '/settings/ai',
    iconBgClass: 'bg-primary text-primary-foreground',
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 1.5l1.4 4.1L13.5 7l-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4L8 1.5z"
          fill="currentColor"
        />
      </svg>
    ),
  },
];

/**
 * Hub Paramètres — page de navigation listant les sous-pages
 * paramètres (Bot, Permissions, Fournisseur IA) sous forme de cards
 * cliquables. Sert aussi de destination pour le breadcrumb
 * « Paramètres » qui jusqu'à présent était non-cliquable.
 */
export default async function SettingsHubPage({ params }: SettingsHubProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  try {
    guilds = await fetchAdminGuilds();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && error.status === 403) notFound();
    throw error;
  }
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  return (
    <>
      <header className="bg-surface px-6 pt-5 pb-4">
        <PageBreadcrumb items={[{ label: 'Paramètres' }]} />
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 1l1.5 1.6 2.2-.4-.4 2.2L13 6l-1.6 1.5.4 2.2-2.2-.4L8 11l-1.5-1.6-2.2.4.4-2.2L3 6l1.6-1.5L4.2 2.3l2.2.4z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="6.5" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
            Paramètres
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Configuration globale du bot et des accès. Choisis une section pour entrer dans le détail.
        </p>
      </header>
      <Separator />
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SETTINGS_LINKS.map((link) => (
            <li key={link.key}>
              <Link
                href={`/guilds/${guildId}${link.hrefSuffix}`}
                className="group interactive-lift flex h-full flex-col rounded-lg border border-border bg-card shadow-sm hover:border-primary/60 hover:shadow-glow-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="border-0 bg-transparent shadow-none">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${link.iconBgClass}`}
                      >
                        {link.icon}
                      </span>
                      <CardTitle>{link.title}</CardTitle>
                    </div>
                    <CardDescription className="mt-2">{link.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto flex items-center justify-end pt-0">
                    <span className="text-sm font-medium text-primary group-hover:underline">
                      Ouvrir →
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
