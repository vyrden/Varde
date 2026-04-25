import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Input texte façon Discord :
 * - fond `--input` (#1e1f22, couche la plus sombre)
 * - bordure subtile, virage blurple au focus
 * - hauteur 40px par défaut (Discord settings)
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded border border-[var(--surface-active)] bg-input px-3 py-1.5',
        'text-sm text-foreground placeholder:text-muted-foreground',
        'transition-colors duration-100 ease-out',
        'hover:border-primary/60',
        'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
