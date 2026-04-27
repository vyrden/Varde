'use client';

import { Badge, type BadgeProps, Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';

import type { OnboardingSessionDto } from '../../lib/onboarding-client';

export interface FinishedStepProps {
  readonly session: OnboardingSessionDto;
}

interface StatusMeta {
  readonly title: string;
  readonly description: string;
  readonly badge: { readonly label: string; readonly variant: BadgeProps['variant'] };
}

const STATUS_LABELS: Record<OnboardingSessionDto['status'], StatusMeta> = {
  draft: {
    title: 'Draft',
    description: '',
    badge: { label: 'Brouillon', variant: 'inactive' },
  },
  previewing: {
    title: 'Prévisualisation',
    description: '',
    badge: { label: 'Preview', variant: 'inactive' },
  },
  applying: {
    title: 'Application en cours',
    description: '',
    badge: { label: 'En cours', variant: 'warning' },
  },
  applied: {
    title: 'Appliqué',
    description: '',
    badge: { label: 'Appliqué', variant: 'active' },
  },
  rolled_back: {
    title: 'Session défaite',
    description: 'Les créations ont été supprimées, votre serveur est revenu à son état antérieur.',
    badge: { label: 'Défaite', variant: 'inactive' },
  },
  expired: {
    title: 'Session expirée',
    description: 'La fenêtre de rollback est passée. Les créations sont conservées.',
    badge: { label: 'Expirée', variant: 'warning' },
  },
  failed: {
    title: 'Application échouée',
    description:
      "L'application a rencontré une erreur ; le moteur a défait les actions déjà effectuées.",
    badge: { label: 'Échec', variant: 'danger' },
  },
};

/**
 * Étape terminale (rolled_back / expired / failed). Affiche un résumé
 * et un lien pour démarrer une nouvelle session. La nouvelle session
 * sera proposée à partir de la même page — il suffit de recharger ou
 * de suivre le lien.
 */
export function FinishedStep({ session }: FinishedStepProps): ReactElement {
  const info = STATUS_LABELS[session.status];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{info.title}</CardTitle>
            <Badge variant={info.badge.variant}>{info.badge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {info.description ? <p className="text-muted-foreground">{info.description}</p> : null}
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-muted-foreground">Preset</dt>
              <dd className="font-medium">{session.presetId ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Démarré le</dt>
              <dd className="font-medium">{new Date(session.startedAt).toLocaleString('fr-FR')}</dd>
            </div>
          </dl>
          <Link
            href={`/guilds/${session.guildId}/onboarding`}
            className="inline-block text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded"
          >
            Démarrer une nouvelle session →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
