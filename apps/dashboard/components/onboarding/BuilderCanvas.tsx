'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@varde/ui';
import { type ReactElement, useState, useTransition } from 'react';
import { previewOnboarding } from '../../lib/onboarding-actions';
import type { OnboardingSessionDto } from '../../lib/onboarding-client';

export interface BuilderCanvasProps {
  readonly session: OnboardingSessionDto;
}

const PERMISSION_PRESET_LABELS: Record<string, string> = {
  'moderator-full': 'Modérateur complet',
  'moderator-minimal': 'Modérateur minimal',
  'member-default': 'Membre (défaut)',
  'member-restricted': 'Membre restreint',
};

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  text: 'Texte',
  voice: 'Voix',
  forum: 'Forum',
};

/**
 * Étape 2 du flow : le canvas builder. V1 affiche le draft en mode
 * lecture seule (rôles / catégories / salons / modules). Le bouton
 * "Preview" sérialise le draft en liste d'actions et bascule la
 * session en `previewing` côté serveur. L'édition inline du draft
 * (ajouter / supprimer / renommer) est reportée à une prochaine
 * itération — l'admin peut toujours éditer côté Discord après apply.
 */
export function BuilderCanvas({ session }: BuilderCanvasProps): ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onPreview = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await previewOnboarding(session.guildId, session.id);
      if (!result.ok) {
        setError(result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`);
      }
    });
  };

  const { draft } = session;
  const categoriesByLocalId = new Map(draft.categories.map((c) => [c.localId, c]));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Votre serveur en construction</h2>
          <p className="text-sm text-muted-foreground">
            Prévisualisez puis appliquez. L'édition inline arrive dans une prochaine version.
          </p>
        </div>
        <Button type="button" onClick={onPreview} disabled={pending}>
          {pending ? 'Prévisualisation...' : 'Prévisualiser'}
        </Button>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rôles ({draft.roles.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {draft.roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun rôle défini.</p>
            ) : (
              <ul className="space-y-2">
                {draft.roles.map((role) => (
                  <li
                    key={role.localId}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-3 w-3 rounded-full border"
                        style={{
                          backgroundColor:
                            role.color === 0
                              ? 'transparent'
                              : `#${role.color.toString(16).padStart(6, '0')}`,
                        }}
                      />
                      {role.name}
                    </span>
                    <Badge variant="secondary">
                      {PERMISSION_PRESET_LABELS[role.permissionPreset] ?? role.permissionPreset}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Modules ({draft.modules.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {draft.modules.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun module configuré.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {draft.modules.map((mod) => (
                  <li key={mod.moduleId} className="flex items-center justify-between gap-2">
                    <span className="font-mono">{mod.moduleId}</span>
                    <Badge variant={mod.enabled ? 'default' : 'secondary'}>
                      {mod.enabled ? 'Activé' : 'Désactivé'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Catégories et salons ({draft.categories.length} cat., {draft.channels.length} salons)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {draft.categories.length === 0 && draft.channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun salon défini.</p>
          ) : (
            draft.categories.map((category) => {
              const channels = draft.channels.filter((c) => c.categoryLocalId === category.localId);
              return (
                <div key={category.localId} className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {category.name}
                  </h3>
                  {channels.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun salon dans cette catégorie.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {channels.map((channel) => (
                        <li key={channel.localId} className="flex items-center gap-3 text-sm">
                          <Badge variant="secondary">
                            {CHANNEL_TYPE_LABELS[channel.type] ?? channel.type}
                          </Badge>
                          <span>#{channel.name}</span>
                          {channel.topic ? (
                            <span className="truncate text-xs text-muted-foreground">
                              — {channel.topic}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
          {(() => {
            const orphans = draft.channels.filter(
              (c) => c.categoryLocalId === null || !categoriesByLocalId.has(c.categoryLocalId),
            );
            if (orphans.length === 0) return null;
            return (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Sans catégorie
                </h3>
                <ul className="space-y-1">
                  {orphans.map((channel) => (
                    <li key={channel.localId} className="flex items-center gap-3 text-sm">
                      <Badge variant="secondary">
                        {CHANNEL_TYPE_LABELS[channel.type] ?? channel.type}
                      </Badge>
                      <span>#{channel.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
          <p className="text-xs text-muted-foreground">
            Note V1 : les salons sont créés à plat côté Discord (sans parent de catégorie). L'admin
            réorganise manuellement après apply. La résolution automatique des catégories arrive
            dans une prochaine version.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
