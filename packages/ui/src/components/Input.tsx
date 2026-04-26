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
        'flex h-10 w-full rounded-md border border-[var(--surface-active)] bg-input px-3 py-1.5',
        'text-sm text-foreground placeholder:text-muted-foreground',
        'shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]',
        'transition-[color,background-color,border-color,box-shadow] duration-150 ease-out',
        'hover:border-[var(--border-strong)]',
        'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/45',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
