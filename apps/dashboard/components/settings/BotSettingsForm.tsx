'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from '@varde/ui';
import { type FormEvent, type ReactElement, useState } from 'react';
import { type BotSettingsMutationResult, saveBotSettings } from '../../lib/bot-settings-actions';
import {
  BOT_LANGUAGES,
  BOT_TIMEZONES,
  type BotLanguage,
  type BotSettingsDto,
  type BotTimezone,
} from '../../lib/bot-settings-types';

export interface BotSettingsFormProps {
  readonly guildId: string;
  readonly initial: BotSettingsDto;
}

interface FormState {
  readonly language: BotLanguage;
  readonly timezone: BotTimezone;
  readonly embedColor: string;
}

const LANGUAGE_LABEL: Record<BotLanguage, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Formulaire des paramètres globaux du bot par guild. Layout 2
 * colonnes : 3 cards à gauche (Langue, Fuseau horaire, Couleur des
 * embeds avec aperçu), card « À propos » à droite. Footer avec bouton
 * Enregistrer.
 *
 * Validation côté client : couleur hex `#RRGGBB`. Le serveur revalide
 * tout via Zod et renvoie 400 + message si quelque chose passe à
 * travers.
 */
export function BotSettingsForm({ guildId, initial }: BotSettingsFormProps): ReactElement {
  const [state, setState] = useState<FormState>({
    language: initial.language,
    timezone: initial.timezone,
    embedColor: initial.embedColor,
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BotSettingsMutationResult | null>(null);

  const isColorValid = HEX_COLOR_RE.test(state.embedColor);
  const isDirty =
    state.language !== initial.language ||
    state.timezone !== initial.timezone ||
    state.embedColor.toLowerCase() !== initial.embedColor.toLowerCase();

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setResult(null);
    if (!isColorValid) {
      setResult({ ok: false, message: 'Couleur invalide — format attendu #RRGGBB.' });
      return;
    }
    setSaving(true);
    try {
      const next = await saveBotSettings(guildId, state);
      setResult(next);
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Paramètres du bot"
      className="grid grid-cols-1 gap-6 lg:grid-cols-3"
    >
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Langue</CardTitle>
            <CardDescription>
              Change la langue par défaut utilisée pour les messages produits par les modules sur ce
              serveur.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label htmlFor="bot-language">Langue du bot</Label>
            <Select
              id="bot-language"
              value={state.language}
              onChange={(e) => updateField('language', e.target.value as BotLanguage)}
              wrapperClassName="sm:w-64"
            >
              {BOT_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABEL[lang]}
                </option>
              ))}
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fuseau horaire</CardTitle>
            <CardDescription>
              Utilisé par les modules planifiés (welcome delays, audit, scheduler interne).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label htmlFor="bot-timezone">Fuseau horaire du bot</Label>
            <Select
              id="bot-timezone"
              value={state.timezone}
              onChange={(e) => updateField('timezone', e.target.value as BotTimezone)}
              wrapperClassName="sm:w-80"
            >
              {BOT_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Couleur de l'embed par défaut</CardTitle>
            <CardDescription>
              Modifie la barre latérale des embeds envoyés par les modules (logs, welcome,
              reaction-roles…).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                aria-label="Sélecteur de couleur"
                type="color"
                value={state.embedColor}
                onChange={(e) => updateField('embedColor', e.target.value.toUpperCase())}
                className="h-10 w-14 cursor-pointer rounded border border-border bg-input"
              />
              <Input
                id="bot-embed-color"
                type="text"
                value={state.embedColor}
                onChange={(e) => updateField('embedColor', e.target.value)}
                placeholder="#5865F2"
                aria-label="Code couleur hex"
                className="w-32 font-mono uppercase"
              />
              {!isColorValid ? (
                <span className="text-xs text-destructive">Format attendu #RRGGBB</span>
              ) : null}
            </div>

            {/* Aperçu Discord-style avec barre latérale colorée. */}
            <div className="rounded-md bg-card p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Aperçu
              </p>
              <div
                className="rounded border-l-4 bg-surface-active/30 px-3 py-2"
                style={{ borderLeftColor: isColorValid ? state.embedColor : 'var(--border)' }}
              >
                <p className="text-xs font-semibold text-foreground">Varde Bot</p>
                <p className="mt-0.5 text-sm text-foreground">
                  Voici à quoi ressemblera la barre latérale des embeds publiés par les modules.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {result?.ok === true ? (
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            Paramètres enregistrés.
          </p>
        ) : null}
        {result?.ok === false ? (
          <p role="alert" className="text-sm text-destructive">
            {result.message ?? `Erreur ${result.status ?? ''} (${result.code ?? ''})`}
          </p>
        ) : null}

        <div className="flex items-center justify-end pt-2">
          <Button type="submit" disabled={saving || !isColorValid || !isDirty}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      <aside className="lg:col-span-1">
        <div className="sticky top-6 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">À propos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Portée</span>
                <span className="text-foreground">Par serveur</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Stockage</span>
                <span className="font-mono text-foreground">guild_config</span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Les paramètres prennent effet immédiatement pour toutes les actions postérieures à
                la sauvegarde — pas besoin de redémarrer le bot.
              </p>
            </CardContent>
          </Card>
        </div>
      </aside>
    </form>
  );
}
