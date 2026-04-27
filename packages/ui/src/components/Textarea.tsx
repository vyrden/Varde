import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Textarea façon Discord, mêmes tokens que `Input`. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'flex w-full rounded border border-[var(--surface-active)] bg-input px-3 py-2',
        'text-sm leading-relaxed text-foreground placeholder:text-muted-foreground',
        'transition-colors duration-100 ease-out',
        'hover:border-primary/60',
        'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'resize-y min-h-[80px]',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
