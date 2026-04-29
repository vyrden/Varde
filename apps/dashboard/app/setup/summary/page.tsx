import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { SetupShell } from '../../../components/setup/SetupShell';
import { SetupStep } from '../../../components/setup/SetupStep';
import { SummaryComplete } from '../../../components/setup/SummaryComplete';
import { SETUP_STEPS, setupStepIndex } from '../../../lib/setup-steps';

/**
 * Étape 7 du wizard — récapitulatif et démarrage. Server component
 * qui assemble une checklist des étapes franchies (informative —
 * tout passage à cette page implique que les étapes précédentes
 * ont retourné 200 côté API) et délègue la finalisation à
 * `SummaryComplete`.
 *
 * On ne ré-affiche pas les valeurs des credentials ici : l'API n'a
 * pas d'endpoint `GET /setup/summary`, et exposer le token / client
 * secret (même masqués) ferait une surface d'attaque
 * supplémentaire pour peu de valeur — l'admin a vu ses inputs
 * pendant la saisie. Une PR ultérieure pourra ajouter une vue
 * détaillée si le besoin se confirme.
 */
export default async function SummaryPage(): Promise<ReactElement> {
  const tShell = await getTranslations('setup.shell');
  const tActions = await getTranslations('setup.actions');
  const t = await getTranslations('setup.summary');

  const items = [
    t('checklist.discordApp'),
    t('checklist.botToken'),
    t('checklist.oauth'),
    t('checklist.identity'),
  ] as const;

  return (
    <SetupShell
      currentStep="summary"
      stepIndicatorLabel={tShell('stepIndicator', {
        current: setupStepIndex('summary'),
        total: SETUP_STEPS.length,
      })}
      progressLabel={tShell('progressLabel')}
    >
      <SetupStep title={t('title')} description={t('subtitle')}>
        <ul
          className="divide-y divide-border-muted overflow-hidden rounded-md border border-border-muted bg-sidebar"
          data-testid="summary-checklist"
        >
          {items.map((label) => (
            <li key={label} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 flex-none rounded-full bg-emerald-500"
              />
              <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{t('startNote')}</p>
        <SummaryComplete
          copy={{
            start: t('start'),
            previous: tActions('previous'),
            successMessage: t('successMessage'),
            successContinue: t('successContinue'),
            timeoutMessage: t('timeoutMessage'),
            timeoutContinue: t('timeoutContinue'),
            errors: {
              missing_required_fields: t('errors.missingFields'),
              network_error: t('errors.network'),
              http_error: t('errors.unknown'),
            },
          }}
        />
      </SetupStep>
    </SetupShell>
  );
}
