import { type ButtonHTMLAttributes, forwardRef } from 'react';

import { cn } from '../lib/cn.js';

export interface ToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type'> {
  /** État on/off du toggle. */
  readonly checked: boolean;
  /** Notifie le parent du nouveau state. */
  readonly onCheckedChange: (next: boolean) => void;
  /** Label accessible décrivant ce que le toggle bascule. */
  readonly label: string;
}

/**
 * Switch façon Discord (cf. DA.md « Composants signature ») : 40 × 22 px,
 * curseur blanc, fond gris quand off, vert succès quand on. Pas de
 * texte interne — utiliser un label adjacent (`<label>` avec `htmlFor`
 * lié à `id`, ou texte sœur dans un layout flex).
 *
 * Implémentation : `<button role="switch">` qui annonce son état via
 * `aria-checked`. Compatible avec lecteurs d'écran et navigation
 * clavier (Enter / Espace).
 */
export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked, onCheckedChange, label, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      className={cn(
        'relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer items-center rounded-full',
        'transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-success' : 'bg-secondary',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow',
          'transition-transform duration-150 ease-out',
          checked ? 'translate-x-[18px]' : 'translate-x-0',
        )}
      />
    </button>
  ),
);
Toggle.displayName = 'Toggle';
