import { Progress } from '@varde/ui';
import type { ReactElement, ReactNode } from 'react';

import { SETUP_STEPS, type SetupStepKey, setupStepIndex } from '../../lib/setup-steps';

/**
 * Cadre du wizard de setup (jalon 7 PR 7.1, sous-livrable 5). Pose
 * la mise en page commune aux 7 etapes :
 *
 * - Header avec marque et indicateur d etape (3 / 7).
 * - Progress bar refletant l avancement.
 * - Conteneur centre max-640 px pour le contenu de la step.
 *
 * Volontairement sans navigation (sidebar, header global) - le
 * wizard remplace temporairement le shell normal du dashboard
 * jusqu a ce que setup_completed_at soit pose. Le middleware
 * Next.js (PR 7.1 sous-livrable 4) garantit qu aucune autre route
 * du dashboard n est atteignable tant que la setup n est pas finie.
 */

export interface SetupShellProps {
  readonly currentStep: SetupStepKey;
  readonly stepIndicatorLabel: string;
  readonly progressLabel: string;
  readonly children: ReactNode;
}

export function SetupShell({
  currentStep,
  stepIndicatorLabel,
  progressLabel,
  children,
}: SetupShellProps): ReactElement {
  const currentIndex = setupStepIndex(currentStep);
  const totalSteps = SETUP_STEPS.length;
  return (
    <div className="flex min-h-screen flex-col bg-rail">
      <header className="border-b border-border-muted bg-sidebar">
        <div className="mx-auto flex max-w-[640px] items-center justify-between px-6 py-4">
          <span aria-hidden="true" className="text-lg font-bold tracking-tight text-foreground">
            Varde
          </span>
          <span className="text-sm text-muted-foreground" data-testid="setup-step-indicator">
            {stepIndicatorLabel}
          </span>
        </div>
      </header>
      <main className="flex-1 py-10">
        <div className="mx-auto max-w-[640px] space-y-8 px-6">
          <Progress
            value={currentIndex}
            max={totalSteps}
            label={progressLabel}
            data-testid="setup-progress"
          />
          {children}
        </div>
      </main>
    </div>
  );
}
