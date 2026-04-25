import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, ReactElement } from 'react';

import { cn } from '../lib/cn.js';

/**
 * Badges façon Discord : pastille discrète, fond teinté à l'opacité,
 * texte coloré assorti. Pas de bordure visible (le contraste vient
 * du fond).
 *
 * Variantes :
 * - active   : module activé / état OK (vert succès)
 * - inactive : muet, gris
 * - bot      : tag « BOT » blurple (à côté du nom du bot dans le preview)
 * - warning  : avertissement jaune
 * - danger   : erreur rouge
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
  {
    variants: {
      variant: {
        active: 'bg-success/20 text-success',
        inactive: 'bg-muted/40 text-muted-foreground',
        bot: 'bg-primary text-primary-foreground rounded-sm tracking-normal',
        warning: 'bg-warning/20 text-warning',
        danger: 'bg-destructive/20 text-destructive',
        outline: 'border border-border text-foreground bg-transparent',
        // Alias rétrocompatibles avec l'ancien design system shadcn.
        // Les pages migrées vers la DA utilisent active / inactive / etc.
        default: 'bg-primary text-primary-foreground rounded-sm tracking-normal',
        secondary: 'bg-muted/40 text-muted-foreground',
        success: 'bg-success/20 text-success',
        destructive: 'bg-destructive/20 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'active',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): ReactElement {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
