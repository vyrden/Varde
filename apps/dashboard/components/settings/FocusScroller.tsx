'use client';

import { useEffect } from 'react';

interface FocusScrollerProps {
  /** ID de l'élément vers lequel scroller au montage du composant. */
  readonly targetId: string;
}

/**
 * Composant client sans rendu visible : au montage, scrolle vers
 * l'élément dont l'`id` est `targetId`. Utilisé par la page
 * `settings/permissions` quand le query param `?focus=<moduleId>`
 * est présent (généré par `UnboundPermissionsBanner`).
 */
export function FocusScroller({ targetId }: FocusScrollerProps): null {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [targetId]);

  return null;
}
