import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { SetupShell } from '../../../components/setup/SetupShell';
import { SetupStep } from '../../../components/setup/SetupStep';
import { ValidationCheckList } from '../../../components/setup/ValidationCheckList';
import { runSystemCheck, type SystemCheckResult } from '../../../lib/setup-client';
import { loadStepperCopy } from '../../../lib/setup-stepper-copy';
import { SETUP_STEPS, setupStepHref, setupStepIndex } from '../../../lib/setup-steps';

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';

/**
 * Étape 2 du wizard — vérification système. Server component qui
 * appelle `POST /setup/system-check` au render et affiche le résultat
 * sous forme de liste à 3 entrées (DB, master key, connectivité
 * Discord) plus l'`detectedBaseUrl` calculée par le serveur.
 *
 * Pas de bouton « relancer » ici — un refresh du navigateur fait le
 * job. La modale d'édition de l'URL d'accès évoquée dans le wireframe
 * est reportée à une PR ultérieure (l'API ne sait pas encore persister
 * un `baseUrl` côté instance_config).
 */
export default async function SystemCheckPage(): Promise<ReactElement> {
  const tShell = await getTranslations('setup.shell');
  const tActions = await getTranslations('setup.actions');
  const t = await getTranslations('setup.systemCheck');
  const stepperCopy = await loadStepperCopy();

  const totalSteps = SETUP_STEPS.length;
  const result = await runSystemCheck(API_URL, fetch);
  const apiReachable = result.ok;
  const checks: readonly SystemCheckResult[] = result.ok ? result.checks : [];
  const detectedBaseUrl = result.ok ? result.detectedBaseUrl : '';
  const allOk = result.ok && checks.every((c) => c.ok);

  const labels = {
    database: t('checks.database'),
    master_key: t('checks.masterKey'),
    discord_connectivity: t('checks.discordConnectivity'),
  } as const;

  return (
    <SetupShell
      currentStep="system-check"
      stepIndicatorLabel={tShell('stepIndicator', {
        current: setupStepIndex('system-check'),
        total: totalSteps,
      })}
      stepperCopy={stepperCopy}
    >
      <SetupStep
        title={t('title')}
        description={t('subtitle')}
        secondaryAction={
          <Link
            href={setupStepHref('welcome')}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tActions('previous')}
          </Link>
        }
        primaryAction={
          allOk ? (
            <Link
              href={setupStepHref('discord-app')}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tActions('next')}
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-md bg-primary/40 px-5 text-sm font-medium text-primary-foreground opacity-60"
              data-testid="next-disabled"
            >
              {tActions('next')}
            </span>
          )
        }
      >
        {apiReachable ? (
          <ValidationCheckList checks={checks} labels={labels} />
        ) : (
          <div
            className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
            data-testid="api-error"
          >
            {t('apiUnreachable')}
            {result.ok ? null : <p className="mt-1 text-xs opacity-80">{result.message}</p>}
          </div>
        )}
        {apiReachable ? (
          <div className="rounded-md border border-border-muted bg-sidebar px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('baseUrl.label')}
            </p>
            <p
              className="mt-1 break-all font-mono text-sm text-foreground"
              data-testid="detected-base-url"
            >
              {detectedBaseUrl}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{t('baseUrl.hint')}</p>
          </div>
        ) : null}
      </SetupStep>
    </SetupShell>
  );
}
