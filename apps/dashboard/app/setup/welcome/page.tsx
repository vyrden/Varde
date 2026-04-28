import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { SetupShell } from '../../../components/setup/SetupShell';
import { SetupStep } from '../../../components/setup/SetupStep';
import { SETUP_STEPS, setupStepHref, setupStepIndex } from '../../../lib/setup-steps';

/**
 * Étape 1 du wizard — page d'accueil. Pas d'appel API, pas de
 * formulaire : on présente le wizard et on déroule la liste des
 * pré-requis. Le bouton « Commencer » route vers
 * `/setup/system-check` (étape 2).
 */
export default async function WelcomePage(): Promise<ReactElement> {
  const tShell = await getTranslations('setup.shell');
  const tActions = await getTranslations('setup.actions');
  const t = await getTranslations('setup.welcome');
  const totalSteps = SETUP_STEPS.length;
  return (
    <SetupShell
      currentStep="welcome"
      stepIndicatorLabel={tShell('stepIndicator', {
        current: setupStepIndex('welcome'),
        total: totalSteps,
      })}
      progressLabel={tShell('progressLabel')}
    >
      <SetupStep
        title={t('title')}
        description={t('subtitle')}
        primaryAction={
          <Link
            href={setupStepHref('system-check')}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tActions('start')}
          </Link>
        }
      >
        <p>{t('intro')}</p>
        <div className="rounded-md border border-border-muted bg-sidebar p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">{t('needsHeading')}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t('needsItem1')}</li>
            <li>{t('needsItem2')}</li>
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">{t('localModeNote')}</p>
      </SetupStep>
    </SetupShell>
  );
}
