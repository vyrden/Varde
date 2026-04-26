import { Separator } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { AIProviderForm } from '../../../../../components/settings/AIProviderForm';
import { PageBreadcrumb } from '../../../../../components/shell/PageBreadcrumb';
import {
  AiSettingsApiError,
  type AiSettingsDto,
  fetchAiSettings,
} from '../../../../../lib/ai-settings-client';
import { ApiError, fetchAdminGuilds } from '../../../../../lib/api-client';

interface AiSettingsPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

/**
 * Page paramètres IA. Header custom (breadcrumb « PARAMÈTRES →
 * FOURNISSEUR IA » + icône blurple + titre + description) + Separator,
 * puis le form 2 colonnes (provider cards + formulaire à gauche,
 * statut connexion + à propos à droite).
 */
export default async function AiSettingsPage({
  params,
}: AiSettingsPageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let settings: AiSettingsDto;
  try {
    [guilds, settings] = await Promise.all([fetchAdminGuilds(), fetchAiSettings(guildId)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && error.status === 403) notFound();
    if (error instanceof AiSettingsApiError && error.status === 401) redirect('/');
    if (error instanceof AiSettingsApiError && error.status === 403) notFound();
    throw error;
  }
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  return (
    <>
      <header className="bg-surface px-6 pt-5 pb-4">
        <PageBreadcrumb
          items={[
            { label: 'Paramètres', href: `/guilds/${guildId}/settings` },
            { label: 'Fournisseur IA' },
          ]}
        />
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 1.5l1.4 4.1L13.5 7l-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4L8 1.5z"
                fill="currentColor"
              />
            </svg>
          </div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground">Fournisseur IA</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Configurez le provider IA utilisé par l'onboarding. Auto-hébergé ou via une API tierce. La
          clé API éventuelle est chiffrée côté serveur et n'est jamais renvoyée en clair.
        </p>
      </header>
      <Separator />
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <AIProviderForm guildId={guildId} initial={settings} />
      </div>
    </>
  );
}
