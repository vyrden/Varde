'use client';

import { Button } from '@varde/ui';

import { type ReactionRoleTemplate, TEMPLATES } from './templates';

export interface TemplatePickerProps {
  readonly onPick: (template: ReactionRoleTemplate) => void;
  readonly onCancel: () => void;
}

/**
 * Écran 2 : sélection d'un modèle parmi les 6 templates disponibles.
 */
export function TemplatePicker({ onPick, onCancel }: TemplatePickerProps) {
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
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            aria-label={`Choisir le modèle ${t.label}`}
            className="flex flex-col gap-2 rounded-md border border-border bg-card p-4 text-left hover:border-primary focus:border-primary focus:outline-none"
          >
            <div className="text-2xl">{t.icon}</div>
            <div className="font-semibold">{t.label}</div>
            <div className="text-xs text-muted-foreground">{t.category}</div>
            <p className="text-xs text-muted-foreground">{t.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
