import { PRESET_CATALOG } from '@varde/presets';
import { PageTitle } from '@varde/ui';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../auth';
import { AppliedStep } from '../../../../components/onboarding/AppliedStep';
import { BuilderCanvas } from '../../../../components/onboarding/BuilderCanvas';
import { FinishedStep } from '../../../../components/onboarding/FinishedStep';
import { PresetPicker } from '../../../../components/onboarding/PresetPicker';
import { PreviewStep } from '../../../../components/onboarding/PreviewStep';
import { ApiError, fetchAdminGuilds } from '../../../../lib/api-client';
import {
  fetchCurrentOnboardingSession,
  OnboardingApiError,
  type OnboardingSessionDto,
} from '../../../../lib/onboarding-client';

interface OnboardingPageProps {
  readonly params: Promise<{ readonly guildId: string }>;
}

/**
 * Page onboarding builder (PR 3.5). Server component qui fetche la
 * session active et dispatche vers le step client correspondant :
 *
 * - pas de session     → PresetPicker
 * - draft              → BuilderCanvas (affichage + preview)
 * - previewing         → PreviewStep (liste d'actions + apply)
 * - applied            → AppliedStep (résumé + rollback)
 * - rolled_back / …    → FinishedStep (résumé terminal + reset)
 *
 * `applying` est un état de transit très court (le temps de
 * l'appel executor). Si on tombe dessus, on retombe sur le canvas
 * — la page sera re-fetchée après l'action, qui aura fini.
 */
export default async function OnboardingPage({
  params,
}: OnboardingPageProps): Promise<ReactElement> {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/');

  let guilds: Awaited<ReturnType<typeof fetchAdminGuilds>>;
  let onboarding: OnboardingSessionDto | null;
  try {
    [guilds, onboarding] = await Promise.all([
      fetchAdminGuilds(),
      fetchCurrentOnboardingSession(guildId),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/');
    if (error instanceof ApiError && error.status === 403) notFound();
    if (error instanceof OnboardingApiError && error.status === 401) redirect('/');
    if (error instanceof OnboardingApiError && error.status === 403) notFound();
    throw error;
  }

  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <Link
            href={`/guilds/${guildId}`}
            className="text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
          >
            ← Retour au serveur
          </Link>
        </div>
        <PageTitle
          title={`Onboarding — ${guild.name}`}
          description="Installez un preset de départ, prévisualisez, appliquez. Défaire reste possible pendant 30 min après apply."
        />
        <StepRouter guildId={guildId} session={onboarding} />
      </div>
    </>
  );
}

function StepRouter({
  guildId,
  session,
}: {
  readonly guildId: string;
  readonly session: OnboardingSessionDto | null;
}): ReactElement {
  if (session === null) {
    return <PresetPicker guildId={guildId} presets={PRESET_CATALOG} />;
  }
  if (session.status === 'draft' || session.status === 'applying') {
    return <BuilderCanvas session={session} />;
  }
  if (session.status === 'previewing') {
    return <PreviewStep session={session} />;
  }
  if (session.status === 'applied') {
    return <AppliedStep session={session} />;
  }
  return <FinishedStep session={session} />;
}
