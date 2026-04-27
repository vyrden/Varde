import type { ReactElement } from 'react';

/**
 * Onboarding inline affiché en haut de la page quand aucun salon
 * n'est sélectionné ET aucun event n'est coché — état « config
 * vierge ». Disparaît dès qu'au moins un de ces deux champs est
 * renseigné.
 */
export function OnboardingHint(): ReactElement {
  return (
    <div
      role="status"
      className="rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm text-foreground"
    >
      <p className="font-medium">Pour commencer :</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
        <li>sélectionne un salon de destination ;</li>
        <li>choisis les événements à surveiller ;</li>
        <li>clique sur Enregistrer.</li>
      </ol>
    </div>
  );
}
