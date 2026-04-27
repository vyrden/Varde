'use client';

import { Button } from '@varde/ui';
import type { ReactElement } from 'react';

const USE_CASES = [
  {
    icon: '🔔',
    title: 'Notifications opt-in',
    description: 'Laisse les membres choisir les pings qu’ils reçoivent.',
  },
  {
    icon: '✅',
    title: 'Vérification',
    description: 'Demande l’acceptation des règles avant accès au serveur.',
  },
  {
    icon: '🎨',
    title: 'Personnalisation',
    description: 'Couleurs de nom, signe astro, continent, etc.',
  },
] as const;

export interface LandingEmptyStateProps {
  readonly onCreate: () => void;
}

/**
 * État vide pédagogique de la landing reaction-roles. Affiché quand
 * la guild n'a aucun message reaction-role configuré. Donne 3 cas
 * d'usage concrets pour aider l'admin à imaginer ce qu'il peut faire.
 */
export function LandingEmptyState({ onCreate }: LandingEmptyStateProps): ReactElement {
  return (
    <div className="flex flex-col items-center gap-6 rounded-lg border border-dashed border-border bg-card/40 px-6 py-10 text-center">
      <div
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-3xl"
      >
        🎯
      </div>
      <div className="space-y-2 max-w-xl">
        <h2 className="text-lg font-semibold text-foreground">
          Crée des messages où tes membres cliquent pour obtenir un rôle
        </h2>
        <p className="text-sm text-muted-foreground">Trois patterns courants pour démarrer :</p>
      </div>

      <ul className="grid w-full max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
        {USE_CASES.map((u) => (
          <li
            key={u.title}
            className="flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-3"
          >
            <span aria-hidden="true" className="text-2xl">
              {u.icon}
            </span>
            <span className="text-sm font-semibold text-foreground">{u.title}</span>
            <span className="text-xs text-muted-foreground">{u.description}</span>
          </li>
        ))}
      </ul>

      <Button type="button" size="sm" onClick={onCreate}>
        + Créer un reaction-role
      </Button>
    </div>
  );
}
