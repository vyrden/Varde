import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Classes appliquées au wrapper externe (utile pour `flex-1`, `w-fit`…). */
  readonly wrapperClassName?: string;
}

/**
 * `<select>` natif stylé Discord, avec un chevron custom rendu en
 * SVG côté React (et non en background-image pour rester thémable
 * proprement). Le wrapper externe absorbe le sizing flex du parent
 * via `wrapperClassName`, le `<select>` interne reste plein largeur.
 *
 * Pourquoi pas `<select>` brut ? Le chevron natif des navigateurs
 * dépare avec le thème dark Discord ; `appearance-none` + chevron
 * SVG donne un rendu identique sur Chrome/Firefox/Safari.
 *
 * Le mode `multiple` (listbox) skip le chevron et le padding réservé :
 * un listbox n'a pas de flèche déroulante, et le rendu doit refléter
 * sa hauteur dictée par `size`.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, wrapperClassName, multiple, ...props }, ref) => {
    const isMultiple = multiple === true;
    return (
      <div className={cn('relative w-full', wrapperClassName)}>
        <select
          ref={ref}
          multiple={multiple}
          className={cn(
            'w-full rounded-md border border-(--surface-active) bg-input px-3',
            'text-sm text-foreground',
            'shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]',
            'transition-[color,background-color,border-color,box-shadow] duration-150 ease-out',
            'hover:border-[var(--border-strong)]',
            'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
            'disabled:cursor-not-allowed disabled:opacity-50',
            isMultiple ? 'py-2' : 'flex h-10 cursor-pointer appearance-none items-center pr-9',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        {isMultiple ? null : (
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
          >
            <path
              d="M3 4.5 L6 7.5 L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    );
  },
);
Select.displayName = 'Select';
