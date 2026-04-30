import type { ReactElement, ReactNode } from 'react';

import type { SetupStepKey } from '../../lib/setup-steps';
import { WizardStepper, type WizardStepperCopy } from './WizardStepper';

/**
 * Cadre du wizard de setup (jalon 7 PR 7.1 sous-livrable 5, refondu
 * PR 7.6 sub-livrable 1). Pose la mise en page commune aux 7 étapes :
 *
 * - Header avec marque et indicateur d'étape (3 / 7) — pour les
 *   lecteurs d'écran et les écrans très étroits.
 * - `WizardStepper` au-dessus du contenu : liste explicite des 7
 *   étapes avec nom, état (done / current / future), retour libre
 *   sur les étapes déjà validées. Remplace l'ancienne `Progress`
 *   linéaire qui ne montrait qu'un pourcentage abstrait.
 * - Conteneur centré max-640 px pour le contenu de la step.
 *
 * Volontairement sans navigation (sidebar, header global) — le
 * wizard remplace temporairement le shell normal du dashboard
 * jusqu'à ce que `setup_completed_at` soit posé. Le middleware
 * Next.js garantit qu'aucune autre route du dashboard n'est
 * atteignable tant que la setup n'est pas finie.
 */

export interface SetupShellProps {
  readonly currentStep: SetupStepKey;
  readonly stepIndicatorLabel: string;
  readonly stepperCopy: WizardStepperCopy;
  readonly children: ReactNode;
}

export function SetupShell({
  currentStep,
  stepIndicatorLabel,
  stepperCopy,
  children,
}: SetupShellProps): ReactElement {
  return (
    <div className="flex min-h-screen flex-col bg-rail">
      <header className="border-b border-border-muted bg-sidebar">
        <div className="mx-auto flex max-w-160 items-center justify-between px-6 py-4">
          <span aria-hidden="true" className="text-lg font-bold tracking-tight text-foreground">
            Varde
          </span>
          <span className="text-sm text-muted-foreground" data-testid="setup-step-indicator">
            {stepIndicatorLabel}
          </span>
        </div>
      </header>
      <main className="flex-1 py-10">
        <div className="mx-auto max-w-180 space-y-8 px-6">
          <WizardStepper currentStep={currentStep} copy={stepperCopy} />
          <div className="mx-auto max-w-160">{children}</div>
        </div>
      </main>
    </div>
  );
}
