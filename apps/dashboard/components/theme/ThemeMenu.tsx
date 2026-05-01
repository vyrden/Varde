'use client';

import { useTranslations } from 'next-intl';
import { type ReactElement, useId } from 'react';

import type { StoredTheme } from '../../lib/resolve-theme';
import { useTheme } from './ThemeProvider';

/**
 * Sélecteur de thème (jalon 7 PR 7.4.9). Trois options présentées
 * en segmented control inline, taille compacte pour s'intégrer dans
 * un menu utilisateur ou un panneau de paramètres.
 *
 * `Système` est cochée par défaut quand l'utilisateur n'a jamais
 * choisi. Le rendu effectif (light/dark) suit alors
 * `prefers-color-scheme` du système. Les deux autres forcent.
 *
 * Persistance : le ThemeProvider gère le cookie + la server action
 * sur chaque changement.
 */

const OPTIONS: readonly StoredTheme[] = ['system', 'light', 'dark'];

const ICON_BY_OPTION: Readonly<Record<StoredTheme, ReactElement>> = {
  system: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 14h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  light: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.5 3.5l-1 1M4.5 11.5l-1 1M12.5 12.5l-1-1M4.5 4.5l-1-1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  dark: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13 9.5A6 6 0 016.5 3a5 5 0 105.65 6.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

export interface ThemeMenuProps {
  /** Variant compact : étiquettes masquées, icônes uniquement. */
  readonly compact?: boolean;
  readonly className?: string;
}

export function ThemeMenu({ compact = false, className }: ThemeMenuProps): ReactElement {
  const t = useTranslations('theme');
  const { stored, setStored, pending } = useTheme();
  const labelId = useId();

  return (
    <fieldset
      aria-labelledby={labelId}
      className={`flex flex-col gap-2 ${className ?? ''}`}
      disabled={pending}
    >
      <legend
        id={labelId}
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {t('groupLabel')}
      </legend>
      <div className="inline-flex items-center rounded-md border border-border bg-bg-surface-1 p-0.5">
        {OPTIONS.map((option) => {
          const active = option === stored;
          return (
            <button
              key={option}
              type="button"
              onClick={() => {
                if (option !== stored) setStored(option);
              }}
              aria-pressed={active}
              title={t(`options.${option}`)}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? 'bg-bg-surface-3 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span aria-hidden="true">{ICON_BY_OPTION[option]}</span>
              {compact ? (
                <span className="sr-only">{t(`options.${option}`)}</span>
              ) : (
                <span>{t(`options.${option}`)}</span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
