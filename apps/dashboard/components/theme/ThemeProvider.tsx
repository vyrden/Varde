'use client';

import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';
import { resolveEffectiveTheme, type StoredTheme } from '../../lib/resolve-theme';
import { saveThemePreference } from '../../lib/theme-actions';

/**
 * Provider client du thème (jalon 7 PR 7.4.9).
 *
 * Responsabilités :
 *
 * - Maintient `stored` (la préférence brute : `system | light | dark`).
 * - Calcule `effective` (la valeur appliquée : `light | dark`)
 *   en suivant `prefers-color-scheme` quand stored = system.
 * - Met à jour `data-theme` sur `<html>` à chaque changement.
 * - Persiste via la server action (cookie + API) en transition.
 *
 * Le SSR pose déjà le bon `data-theme` via `<ThemeScript>` injecté
 * dans `<head>`. Le provider n'a donc rien à faire au mount initial,
 * juste à réagir aux changements utilisateur ou aux changements de
 * préférence système (passage entre clair/sombre via les paramètres
 * système, le cas type étant macOS qui bascule auto la nuit).
 */

interface ThemeContextValue {
  readonly stored: StoredTheme;
  readonly effective: 'light' | 'dark';
  readonly setStored: (next: StoredTheme) => void;
  readonly pending: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme doit être appelé sous <ThemeProvider />');
  }
  return ctx;
}

const applyEffectiveTheme = (effective: 'light' | 'dark'): void => {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (effective === 'light') {
    html.setAttribute('data-theme', 'light');
  } else {
    html.removeAttribute('data-theme');
  }
};

export interface ThemeProviderProps {
  /** Préférence initiale lue côté SSR depuis le cookie. */
  readonly initialStored: StoredTheme;
  readonly children: ReactNode;
}

export function ThemeProvider({ initialStored, children }: ThemeProviderProps): ReactElement {
  const [stored, setStoredState] = useState<StoredTheme>(initialStored);
  const [systemPref, setSystemPref] = useState<'light' | 'dark' | null>(null);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  // Capture initiale + suivi de la préférence système. matchMedia
  // n'existe que côté client, on l'évalue dans un effet pour éviter
  // les divergences SSR/client.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const update = (): void => {
      setSystemPref(mq.matches ? 'light' : 'dark');
    };
    update();
    mq.addEventListener('change', update);
    return () => {
      mq.removeEventListener('change', update);
    };
  }, []);

  const effective = resolveEffectiveTheme(stored, systemPref);

  // Applique data-theme côté DOM dès que `effective` change. Le SSR
  // a déjà posé la valeur initiale via ThemeScript, donc cet effect
  // est un no-op au premier rendu — il n'agit que sur les changements
  // ultérieurs.
  useEffect(() => {
    applyEffectiveTheme(effective);
  }, [effective]);

  const setStored = useCallback((next: StoredTheme): void => {
    setStoredState(next);
    setPending(true);
    startTransition(() => {
      void saveThemePreference(next).finally(() => {
        setPending(false);
      });
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ stored, effective, setStored, pending }),
    [stored, effective, setStored, pending],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
