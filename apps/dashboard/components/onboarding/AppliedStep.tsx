'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress } from '@varde/ui';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useMemo, useState, useTransition } from 'react';
import { rollbackOnboarding } from '../../lib/onboarding-actions';
import type { OnboardingSessionDto } from '../../lib/onboarding-client';

export interface AppliedStepProps {
  readonly session: OnboardingSessionDto;
}

const formatMMSS = (msLeft: number): string => {
  if (msLeft <= 0) return '00:00';
  const totalSeconds = Math.floor(msLeft / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatAbsoluteTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Étape 4 : session appliquée. Affiche un résumé + bouton "Défaire"
 * accompagné d'un compte à rebours MM:SS et d'une barre de progression
 * de la fenêtre de rollback (PR 3.12c). Passé le délai, le bouton
 * grise, le message change et un bouton "Actualiser" propose de
 * rafraîchir la page — côté serveur le scheduler aura fait passer la
 * session en `expired` via le job auto-expire (PR 3.12b), l'appel à
 * `/current` retourne alors 404 et l'UI retombe sur le PresetPicker.
 */
export function AppliedStep({ session }: AppliedStepProps): ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const expiresAtMs = useMemo(
    () => (session.expiresAt ? Date.parse(session.expiresAt) : 0),
    [session.expiresAt],
  );
  const appliedAtMs = useMemo(
    () => (session.appliedAt ? Date.parse(session.appliedAt) : 0),
    [session.appliedAt],
  );
  const windowTotalMs = Math.max(0, expiresAtMs - appliedAtMs);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = (): void => setNow(Date.now());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const msLeft = Math.max(0, expiresAtMs - now);
  const expired = msLeft <= 0;
  const progressPercent =
    windowTotalMs > 0
      ? Math.max(0, Math.min(100, ((windowTotalMs - msLeft) / windowTotalMs) * 100))
      : 100;

  const onRollback = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await rollbackOnboarding(session.guildId, session.id);
      if (!result.ok) {
        setError(result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`);
      }
    });
  };

  const onRefresh = (): void => {
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Appliqué</h2>
          <Badge variant={expired ? 'inactive' : 'active'}>
            {expired ? 'Fenêtre close' : 'Rollback dispo'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Le preset a été appliqué sur votre serveur. Vous pouvez défaire dans les 30 min suivant
          l'application ; au-delà, les créations sont gelées et doivent être gérées manuellement.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {expired ? 'Fenêtre de rollback dépassée' : `Temps restant : ${formatMMSS(msLeft)}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Progress value={progressPercent} label="progression de la fenêtre de rollback" />
            <p className="text-xs text-muted-foreground">
              {expired
                ? 'Fenêtre close.'
                : session.expiresAt
                  ? `Expire à ${formatAbsoluteTime(session.expiresAt)}.`
                  : null}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Preset appliqué</dt>
              <dd className="font-medium">{session.presetId ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Appliqué le</dt>
              <dd className="font-medium">
                {session.appliedAt ? new Date(session.appliedAt).toLocaleString('fr-FR') : '—'}
              </dd>
            </div>
          </dl>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={onRollback} disabled={pending || expired}>
              {pending ? 'Rollback en cours...' : expired ? 'Rollback indisponible' : 'Défaire'}
            </Button>
            {expired ? (
              <Button type="button" variant="outline" onClick={onRefresh}>
                Actualiser
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
