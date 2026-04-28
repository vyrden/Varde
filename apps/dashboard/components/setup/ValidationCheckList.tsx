import type { ReactElement } from 'react';

import type { SystemCheckResult } from '../../lib/setup-client';

/**
 * Liste de vérifs avec statuts visibles (jalon 7 PR 7.1, étape
 * « Vérification système »). Chaque ligne porte :
 *
 * - une pastille colorée (vert / rouge) pour le statut,
 * - le nom traduit du check,
 * - le `detail` éventuel renvoyé par l'API (cause d'erreur,
 *   message Discord, etc.) en sous-texte.
 *
 * Le composant ne fait pas l'appel API — il rend des résultats
 * passés en props. Cela permet au server component parent de
 * choisir quand exécuter (au render, sur retry, etc.) sans
 * couplage.
 */

export interface ValidationCheckListProps {
  /** Checks à rendre, dans l'ordre fourni (l'API les renvoie ordonnés). */
  readonly checks: readonly SystemCheckResult[];
  /** Libellé de chaque check, indexé par son `name`. */
  readonly labels: Readonly<Record<SystemCheckResult['name'], string>>;
}

const statusDot = (ok: boolean): string => (ok ? 'bg-emerald-500' : 'bg-rose-500');

const statusLabel = (ok: boolean): string => (ok ? 'OK' : 'KO');

export function ValidationCheckList({ checks, labels }: ValidationCheckListProps): ReactElement {
  return (
    <ul
      className="divide-y divide-border-muted overflow-hidden rounded-md border border-border-muted bg-sidebar"
      data-testid="validation-check-list"
    >
      {checks.map((check) => (
        <li
          key={check.name}
          className="flex items-start gap-3 px-4 py-3"
          data-testid={`check-${check.name}`}
        >
          <span
            aria-label={statusLabel(check.ok)}
            className={`mt-1.5 inline-block h-2.5 w-2.5 flex-none rounded-full ${statusDot(check.ok)}`}
            role="img"
          />
          <div className="flex-1 space-y-0.5">
            <p className="text-sm font-medium text-foreground">{labels[check.name]}</p>
            {check.detail !== undefined ? (
              <p className="text-xs text-muted-foreground">{check.detail}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
