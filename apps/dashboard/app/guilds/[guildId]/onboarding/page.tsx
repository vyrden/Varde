import { PRESET_CATALOG } from '@varde/presets';
import { Separator } from '@varde/ui';
import { notFound, redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { auth } from '../../../../auth';
import { AppliedStep } from '../../../../components/onboarding/AppliedStep';
import { BuilderCanvas } from '../../../../components/onboarding/BuilderCanvas';
import { FinishedStep } from '../../../../components/onboarding/FinishedStep';
import {
  type AiProviderSnapshot,
  PresetPicker,
} from '../../../../components/onboarding/PresetPicker';
import { PreviewStep } from '../../../../components/onboarding/PreviewStep';
import { PageBreadcrumb } from '../../../../components/shell/PageBreadcrumb';
import { fetchAiSettings } from '../../../../lib/ai-settings-client';
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
 * Page onboarding builder. Header custom (breadcrumb « Gestion →
 * Onboarding », icône fusée blurple, titre, description) + Separator,
 * puis dispatch vers le step client correspondant à la session :
 *
 * - pas de session     → PresetPicker (layout 2 colonnes en interne)
 * - draft              → BuilderCanvas
 * - previewing         → PreviewStep
 * - applied            → AppliedStep
 * - rolled_back / …    → FinishedStep
 *
 * `applying` est un état de transit très court ; on retombe sur le
 * canvas — la page sera re-fetchée après l'action.
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

  // Fetch best-effort du provider IA pour la sidebar de PresetPicker.
  // Si l'appel échoue, on omet la card — la page reste fonctionnelle.
  let aiProvider: AiProviderSnapshot | null = null;
  try {
    const ai = await fetchAiSettings(guildId);
    aiProvider = {
      providerId: ai.providerId,
      model: ai.model,
      endpoint: ai.endpoint,
      hasApiKey: ai.hasApiKey,
    };
  } catch {
    aiProvider = null;
  }

  return (
    <>
      <header className="bg-surface px-6 pt-5 pb-4">
        <PageBreadcrumb
          items={[{ label: 'Gestion', href: `/guilds/${guildId}` }, { label: 'Onboarding' }]}
        />
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M9 2c2 0 4 2 4 4 0 1.2-.4 2.2-1 3l-4 4-1-1 4-4c.4-.5.6-1.2.6-2 0-1.5-1.1-2.6-2.6-2.6-.8 0-1.5.2-2 .6l-4 4-1-1 4-4c.8-.6 1.8-1 3-1zM3 13l-1.5 1.5M5 11l-2 2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
            Onboarding
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Installez un preset de départ, prévisualisez, appliquez. Défaire reste possible pendant 30
          minutes après application.
        </p>
      </header>
      <Separator />
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <StepRouter guildId={guildId} session={onboarding} aiProvider={aiProvider} />
      </div>
    </>
  );
}

function StepRouter({
  guildId,
  session,
  aiProvider,
}: {
  readonly guildId: string;
  readonly session: OnboardingSessionDto | null;
  readonly aiProvider: AiProviderSnapshot | null;
}): ReactElement {
  if (session === null) {
    return <PresetPicker guildId={guildId} presets={PRESET_CATALOG} aiProvider={aiProvider} />;
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
