'use client';

import { useTranslations } from 'next-intl';
import { type ReactElement, useState, useTransition } from 'react';

import { togglePinnedModule } from '../../lib/user-preferences-actions';

/**
 * Bouton d'épingle d'un module dans la grille (jalon 7 PR 7.4.7).
 * État rempli (filled) si épinglé, contour seul sinon.
 *
 * Optimiste : on flip l'icône immédiatement, l'action serveur tourne
 * en background. En cas d'échec (notamment `invalid_pins` quand on
 * dépasse 8 épingles), on revert et on remonte le code d'erreur via
 * `onError` — le caller affiche un toast.
 *
 * Le bouton est `e.stopPropagation()` côté caller : la card autour
 * est cliquable pour la navigation, ce bouton ne doit pas
 * déclencher la navigation.
 */

export interface PinButtonProps {
  readonly guildId: string;
  readonly moduleId: string;
  readonly moduleName: string;
  readonly initialPinned: boolean;
  /**
   * Notification d'erreur remontée au caller pour afficher un toast.
   * Reçoit le code d'erreur API (`invalid_pins`, `unknown_module_ids`,
   * `network_error`…) et le message brut.
   */
  readonly onError?: (code: string, message: string) => void;
}

export function PinButton({
  guildId,
  moduleId,
  moduleName,
  initialPinned,
  onError,
}: PinButtonProps): ReactElement {
  const t = useTranslations('modulesGrid');
  const [pinned, setPinned] = useState(initialPinned);
  const [pending, startTransition] = useTransition();

  const onClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    const previous = pinned;
    setPinned(!previous); // optimiste
    startTransition(async () => {
      const result = await togglePinnedModule(guildId, moduleId);
      if (result.kind === 'error') {
        setPinned(previous);
        onError?.(result.code, result.message);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={pinned}
      aria-label={
        pinned ? t('unpinAria', { name: moduleName }) : t('pinAria', { name: moduleName })
      }
      title={pinned ? t('unpinTooltip') : t('pinTooltip')}
      className={`flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        pinned
          ? 'text-primary hover:bg-primary/15'
          : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
      } ${pending ? 'opacity-60' : ''}`}
    >
      {pinned ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M9.5 1.5L8 3 6.5 1.5l-3 3L5 6 3 8l3 3 .5-.5L8 9l3 3 1.5-1.5L11 9l1.5-1.5-3-3L11 3l-1.5-1.5z" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M9.5 1.5L8 3 6.5 1.5l-3 3L5 6 3 8l3 3 .5-.5L8 9l3 3 1.5-1.5L11 9l1.5-1.5-3-3L11 3l-1.5-1.5z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
