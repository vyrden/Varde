import Link from 'next/link';
import { Fragment, type ReactElement } from 'react';

import {
  SETUP_STEPS,
  type SetupStepKey,
  setupStepHref,
  setupStepIndex,
} from '../../lib/setup-steps';

/**
 * Stepper visuel des 7 étapes du wizard (jalon 7 PR 7.6 sub-livrable 1).
 *
 * Remplace la `Progress` linéaire par une liste explicite des étapes,
 * pour qu'un admin sache à tout moment :
 *
 * - où il en est (pastille remplie, label en gras),
 * - ce qu'il a déjà validé (pastille verte avec ✓),
 * - ce qu'il reste à faire (pastille vide, label en gris).
 *
 * Une étape déjà validée est cliquable et renvoie sur sa page (le
 * `setupStep` côté core est monotone : revenir en arrière n'écrase
 * rien tant qu'on ne resoumet pas le formulaire). Les étapes futures
 * sont des `<span>` non-interactifs — l'utilisateur ne peut pas
 * sauter une étape.
 *
 * Layout : horizontal sur desktop, scrollable horizontalement sur
 * mobile (les 7 étapes ne tiennent pas sans wrap). Pas de
 * `<ol>` parce que la sémantique « liste ordonnée » rend mal avec
 * des `<Link>` non-cliquables pour les étapes futures ; on utilise
 * `aria-current="step"` pour signaler l'étape en cours et c'est
 * suffisant pour les lecteurs d'écran.
 */

export interface WizardStepperCopy {
  /** Nom court de chaque étape (tel qu'affiché sous la pastille). */
  readonly stepNames: Readonly<Record<SetupStepKey, string>>;
  /** Label invisible (lecteur d'écran) — « Étape 3 sur 7 : Discord App ». */
  readonly stepAriaLabelTemplate: string;
  /** Préfixe pour les étapes complétées (lecteur d'écran). */
  readonly completedPrefix: string;
}

export interface WizardStepperProps {
  readonly currentStep: SetupStepKey;
  readonly copy: WizardStepperCopy;
}

const renderTemplate = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));

export function WizardStepper({ currentStep, copy }: WizardStepperProps): ReactElement {
  const currentIndex = setupStepIndex(currentStep);
  const totalSteps = SETUP_STEPS.length;

  return (
    <nav
      aria-label="Wizard de configuration"
      className="overflow-x-auto"
      data-testid="wizard-stepper"
    >
      <ul className="flex min-w-max items-start gap-0">
        {SETUP_STEPS.map((step, idx) => {
          const stepIndex = idx + 1;
          const stepName = copy.stepNames[step];
          const status: 'done' | 'current' | 'future' =
            stepIndex < currentIndex ? 'done' : stepIndex === currentIndex ? 'current' : 'future';
          const ariaLabel = renderTemplate(copy.stepAriaLabelTemplate, {
            current: stepIndex,
            total: totalSteps,
            name: stepName,
          });

          const badgeClass =
            status === 'done'
              ? 'bg-success text-white'
              : status === 'current'
                ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                : 'bg-surface-active text-muted-foreground';

          const labelClass =
            status === 'done'
              ? 'text-foreground'
              : status === 'current'
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground';

          const connectorClass = stepIndex < currentIndex ? 'bg-success' : 'bg-border-muted';

          const inner = (
            <span className="flex flex-col items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${badgeClass}`}
              >
                {status === 'done' ? '✓' : stepIndex}
              </span>
              <span className={`whitespace-nowrap text-xs ${labelClass}`}>{stepName}</span>
            </span>
          );

          const stepCell = (
            <li
              className="flex flex-1 flex-col items-center"
              data-testid={`wizard-step-${step}`}
              data-status={status}
              aria-current={status === 'current' ? 'step' : undefined}
              aria-label={status === 'done' ? undefined : ariaLabel}
            >
              {status === 'done' ? (
                <Link
                  href={setupStepHref(step)}
                  aria-label={`${copy.completedPrefix} ${ariaLabel}`}
                  className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );

          return (
            <Fragment key={step}>
              {stepCell}
              {idx < SETUP_STEPS.length - 1 ? (
                <li aria-hidden="true" className="mt-3.5 h-0.5 flex-1 self-start">
                  <span className={`block h-full w-full ${connectorClass}`} />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
