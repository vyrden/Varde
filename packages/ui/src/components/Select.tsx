import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * `<select>` natif stylé Discord. On garde le natif pour
 * l'accessibilité et le rendu OS — la flèche dropdown reste celle
 * du navigateur, c'est intentionnel (cohérent avec Discord settings).
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded border border-[var(--surface-active)] bg-input px-3',
        'text-sm text-foreground',
        'transition-colors duration-100 ease-out',
        'hover:border-primary/60',
        'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
