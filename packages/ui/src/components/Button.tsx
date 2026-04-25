import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

import { cn } from '../lib/cn.js';

/**
 * Variantes Discord (cf. DA.md) :
 * - primary  : action principale, blurple
 * - secondary: action neutre, gris #4e5058
 * - destructive : suppression, rouge #ed4245
 * - ghost    : action discrète, transparent + bordure subtile
 * - link     : texte cliquable inline
 *
 * Tailles : default 38px (Discord), sm 32px, lg 44px (rare). Les
 * boutons Discord sont arrondis à 3px (rounded-sm dans ce thème).
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
    'rounded-sm text-sm font-medium',
    'transition-colors duration-100 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-[var(--secondary-hover)]',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-[var(--destructive-hover)]',
        outline:
          'border border-[rgba(255,255,255,0.16)] bg-transparent text-foreground hover:bg-white/[0.08]',
        ghost: 'bg-transparent text-foreground hover:bg-white/[0.06]',
        link: 'text-primary underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        default: 'h-[38px] px-4',
        sm: 'h-8 px-3 text-[13px]',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
