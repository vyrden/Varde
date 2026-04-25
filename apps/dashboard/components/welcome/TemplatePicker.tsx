'use client';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@varde/ui';

import { WELCOME_TEMPLATES_CLIENT, type WelcomeTemplateClient } from './templates';

export interface TemplatePickerProps {
  readonly onApply: (template: WelcomeTemplateClient) => void;
}

/**
 * Grille des 4 templates welcome — appliquer pré-remplit les blocs
 * accueil / départ / auto-rôle / filtre. Pas pré-rempli : les IDs de
 * salons et de rôles, qui dépendent de la guild.
 */
export function TemplatePicker({ onApply }: TemplatePickerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Templates</CardTitle>
        <CardDescription>
          Charge une config pré-remplie. Les salons et rôles spécifiques au serveur restent à
          renseigner après application.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {WELCOME_TEMPLATES_CLIENT.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface-active/30 p-3"
            >
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-2xl">
                  {t.icon}
                </span>
                <span className="text-sm font-medium text-foreground">{t.label}</span>
              </div>
              <p className="flex-1 text-xs text-muted-foreground">{t.description}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => onApply(t)}>
                Appliquer
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
