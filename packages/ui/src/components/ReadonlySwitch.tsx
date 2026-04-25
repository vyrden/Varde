import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

export interface ReadonlySwitchProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** État on/off à représenter visuellement. */
  readonly enabled: boolean;
}

/**
 * Pastille « switch » purement visuelle, non interactive. Pour les
 * cas où l'on veut représenter un état booléen côté UI sans pouvoir
 * (encore) le piloter depuis le dashboard — typiquement la sidebar
 * « À propos » des modules quand l'API enable/disable n'existe pas.
 *
 * `aria-hidden` par défaut : l'état réel est annoncé par le texte
 * adjacent (« Actif »/« Inactif »), pas par la pastille.
 */
export const ReadonlySwitch = forwardRef<HTMLSpanElement, ReadonlySwitchProps>(
  ({ enabled, className, ...props }, ref) => (
    <span
      ref={ref}
      aria-hidden="true"
      {...props}
      className={cn(
        'relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full opacity-50',
        enabled ? 'bg-success' : 'bg-secondary',
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-0.75 left-0.75 h-4 w-4 rounded-full bg-white shadow',
          enabled ? 'translate-x-4.5' : 'translate-x-0',
        )}
      />
    </span>
  ),
);
ReadonlySwitch.displayName = 'ReadonlySwitch';
