'use client';

import { Badge, Button } from '@varde/ui';
import type { ReactElement } from 'react';

import { type ReactionRoleTemplate, TEMPLATES } from './templates';

export interface TemplatePickerProps {
  readonly onPick: (template: ReactionRoleTemplate) => void;
  readonly onCancel: () => void;
}

const CATEGORY_LABELS: Record<ReactionRoleTemplate['category'], string> = {
  essentiel: 'Essentiel',
  fonction: 'Fonction',
  amusant: 'Amusant',
  mixte: 'Mixte',
};

const CATEGORY_VARIANT: Record<
  ReactionRoleTemplate['category'],
  'inactive' | 'default' | 'active' | 'warning'
> = {
  essentiel: 'default',
  fonction: 'active',
  amusant: 'warning',
  mixte: 'inactive',
};

const PREVIEW_LIMIT = 6;

/**
 * Écran 2 : sélection d'un modèle parmi les 6 templates disponibles.
 * Mini-aperçu sur hover : la liste des suggestions emoji + rôle du
 * template apparaît dans le footer de la card. Pas de popover
 * complexe — la zone reste toujours visible mais ne charge la
 * lecture que quand l'utilisateur survole un template.
 */
export function TemplatePicker({ onPick, onCancel }: TemplatePickerProps): ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Choisis un modèle</h3>
          <p className="text-sm text-muted-foreground">Tu peux aussi partir de zéro.</p>
        </div>
        <Button type="button" variant="secondary" onClick={onCancel}>
          ← Retour
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => {
          const previewSuggestions = t.suggestions.slice(0, PREVIEW_LIMIT);
          const overflow = t.suggestions.length - previewSuggestions.length;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t)}
              aria-label={`Choisir le modèle ${t.label}`}
              className="group flex flex-col gap-2 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-primary focus:border-primary focus:outline-none"
            >
              <div className="flex items-start justify-between gap-2">
                <span aria-hidden="true" className="text-2xl">
                  {t.icon}
                </span>
                <Badge variant={CATEGORY_VARIANT[t.category]}>{CATEGORY_LABELS[t.category]}</Badge>
              </div>
              <div className="font-semibold text-foreground">{t.label}</div>
              <p className="text-xs text-muted-foreground">{t.description}</p>

              {previewSuggestions.length > 0 ? (
                <div
                  aria-hidden="true"
                  className="mt-1 flex max-h-0 flex-col gap-1 overflow-hidden text-[11px] text-muted-foreground opacity-0 transition-all duration-150 ease-out group-hover:max-h-32 group-hover:pt-2 group-hover:opacity-100 group-focus:max-h-32 group-focus:pt-2 group-focus:opacity-100"
                >
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Aperçu</span>
                  <ul className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {previewSuggestions.map((s) => (
                      <li key={`${s.emoji}-${s.roleName}`} className="whitespace-nowrap">
                        {s.emoji} {s.roleName}
                      </li>
                    ))}
                    {overflow > 0 ? <li>+{overflow} autres</li> : null}
                  </ul>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
