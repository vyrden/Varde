'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
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

/**
 * Étape 4 : session appliquée. Affiche un résumé + bouton "Défaire"
 * accompagné d'un compte à rebours MM:SS. Passé le délai, le bouton
 * grise et le message change. La page se revalide après rollback.
 */
export function AppliedStep({ session }: AppliedStepProps): ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const expiresAtMs = useMemo(
    () => (session.expiresAt ? Date.parse(session.expiresAt) : 0),
    [session.expiresAt],
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = (): void => setNow(Date.now());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const msLeft = Math.max(0, expiresAtMs - now);
  const expired = msLeft <= 0;

  const onRollback = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await rollbackOnboarding(session.guildId, session.id);
      if (!result.ok) {
        setError(result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Appliqué</h2>
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
        <CardContent className="space-y-3">
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
          <Button type="button" onClick={onRollback} disabled={pending || expired}>
            {pending ? 'Rollback en cours...' : expired ? 'Rollback indisponible' : 'Défaire'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
