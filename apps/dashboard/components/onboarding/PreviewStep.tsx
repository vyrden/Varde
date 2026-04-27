'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import { type ReactElement, useEffect, useState, useTransition } from 'react';
import { applyOnboarding, previewOnboarding } from '../../lib/onboarding-actions';
import type { OnboardingActionPreviewDto, OnboardingSessionDto } from '../../lib/onboarding-client';

export interface PreviewStepProps {
  readonly session: OnboardingSessionDto;
}

const ACTION_LABELS: Record<string, string> = {
  'core.createRole': 'Créer le rôle',
  'core.createCategory': 'Créer la catégorie',
  'core.createChannel': 'Créer le salon',
  'core.patchModuleConfig': 'Configurer le module',
};

const summarizePayload = (type: string, payload: Readonly<Record<string, unknown>>): string => {
  if (type === 'core.patchModuleConfig') {
    const id = payload['moduleId'];
    return typeof id === 'string' ? id : 'module';
  }
  const name = payload['name'];
  if (typeof name === 'string') return name;
  return '';
};

/**
 * Étape 3 du flow : preview. Liste les actions qui seront exécutées
 * et propose le bouton "Appliquer". La preview est fetchée côté
 * client par appel de la même server action `previewOnboarding`
 * (idempotente) au mount — garantit qu'on montre toujours la version
 * à jour, même si l'utilisateur recharge la page pendant que la
 * session est déjà en `previewing`.
 */
export function PreviewStep({ session }: PreviewStepProps): ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<readonly OnboardingActionPreviewDto[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const result = await previewOnboarding(session.guildId, session.id);
      if (cancelled) return;
      if (result.ok && result.data) {
        setActions(result.data.actions);
      } else {
        setError(result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session.guildId, session.id]);

  const onApply = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await applyOnboarding(session.guildId, session.id);
      if (!result.ok) {
        setError(result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`);
        return;
      }
      if (result.data && !result.data.ok) {
        setError(
          `L'application a échoué à l'étape ${result.data.failedAt ?? '?'} : ${result.data.error ?? 'raison inconnue'}. Rollback auto effectué.`,
        );
      }
    });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Prévisualisation</h2>
          <p className="text-sm text-muted-foreground">
            Voici les actions qui seront exécutées sur votre serveur Discord. Appliquez pour lancer,
            ou revenez en arrière — un rollback reste possible dans les 30 min après apply.
          </p>
        </div>
        <Button type="button" onClick={onApply} disabled={pending || actions === null}>
          {pending ? 'Application...' : 'Appliquer'}
        </Button>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{actions === null ? 'Chargement...' : 'Actions prévues'}</CardTitle>
            {actions !== null ? (
              <Badge variant={actions.length > 0 ? 'active' : 'inactive'}>
                {actions.length} action{actions.length > 1 ? 's' : ''}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {actions === null ? (
            <p className="text-sm text-muted-foreground">Récupération de la preview...</p>
          ) : actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune action à appliquer.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {actions.map((action, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: ordre stable, pas d'édition inline
                  key={`${action.type}-${index}`}
                  className="flex items-center gap-3"
                >
                  <Badge variant="secondary" className="font-mono text-xs">
                    {String(index + 1).padStart(2, '0')}
                  </Badge>
                  <span className="font-medium">{ACTION_LABELS[action.type] ?? action.type}</span>
                  <span className="text-muted-foreground">
                    {summarizePayload(action.type, action.payload)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
