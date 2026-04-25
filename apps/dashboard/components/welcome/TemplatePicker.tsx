'use client';

import { Button } from '@varde/ui';

import { WELCOME_TEMPLATES_CLIENT, type WelcomeTemplateClient } from './templates';

export interface TemplatePickerProps {
  readonly onApply: (template: WelcomeTemplateClient) => void;
}

export function TemplatePicker({ onApply }: TemplatePickerProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Templates</p>
      <p className="text-xs text-muted-foreground">
        Charge une config pré-remplie. Les salons et rôles spécifiques au serveur restent à
        renseigner après application.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {WELCOME_TEMPLATES_CLIENT.map((t) => (
          <div
            key={t.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3"
          >
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-2xl">
                {t.icon}
              </span>
              <span className="font-medium text-sm">{t.label}</span>
            </div>
            <p className="flex-1 text-xs text-muted-foreground">{t.description}</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => onApply(t)}>
              Appliquer
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
