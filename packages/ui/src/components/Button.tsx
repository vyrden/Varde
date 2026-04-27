import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

import { cn } from '../lib/cn.js';

/**
 * Variantes Discord (cf. DA.md) :
 * - primary  : action principale, gradient blurple façon discord.com
 * - secondary: action neutre, gris #4e5058
 * - destructive : suppression, rouge #ed4245
 * - outline  : action neutre encadrée, bordure subtile
 * - ghost    : action discrète, transparent
 * - link     : texte cliquable inline
 *
 * Tailles : default 38px (Discord), sm 32px, lg 44px (rare). Les
 * boutons Discord sont arrondis à 3px (rounded-sm dans ce thème).
 *
 * Toutes les variantes interactives bénéficient d'un léger feedback
 * d'enfoncement (cf. utilitaire `.interactive-press`) appliqué via la
 * classe de base. Les ombres sont mappées sur les tokens
 * `--shadow-{sm,md}` pour rester cohérentes avec les cards.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
    'rounded-sm text-sm font-medium',
    'interactive-press will-change-transform',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none disabled:shadow-none',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'text-primary-foreground shadow-sm',
          'bg-[image:var(--gradient-primary)]',
          'hover:bg-[image:var(--gradient-primary-hover)] hover:shadow-md',
        ].join(' '),
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-[var(--secondary-hover)] hover:shadow-md',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-[var(--destructive-hover)] hover:shadow-md',
        outline:
          'border border-[var(--border-strong)] bg-transparent text-foreground hover:bg-white/[0.08] hover:border-[rgba(255,255,255,0.22)]',
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
