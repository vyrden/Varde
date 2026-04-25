import { PageHeader } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../../auth';
import { AIProviderForm } from '../../../../../components/settings/AIProviderForm';
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
 * Page paramètres IA (PR 3.9). Server component qui fetche les
 * paramètres actuels puis délègue le rendu éditable à un composant
 * client. L'admin choisit un provider, configure, peut tester la
 * connexion et enregistrer — la clé API est chiffrée côté serveur.
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
      <PageHeader
        breadcrumbs={[{ label: 'Paramètres' }, { label: 'IA' }]}
        title="Paramètres IA"
        description="Choisissez le provider IA utilisé par l'onboarding. Auto-hébergé ou via une API tierce. La clé API éventuelle est chiffrée côté serveur et n'est jamais renvoyée en clair."
      />
      <div className="mx-auto w-full max-w-3xl space-y-5 px-6 py-6">
        <AIProviderForm guildId={guildId} initial={settings} />
      </div>
    </>
  );
}
