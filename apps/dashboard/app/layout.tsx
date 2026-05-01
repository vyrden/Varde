import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { ReactElement, ReactNode } from 'react';

import { ThemeProvider } from '../components/theme/ThemeProvider';
import { ThemeScript, themeCookieName } from '../components/theme/ThemeScript';
import { normalizeStoredTheme } from '../lib/resolve-theme';

import './globals.css';

/**
 * Stack typo du dashboard — Inter pour le texte courant, Inter
 * (variant Display via la même famille) pour les titres. Décision
 * tracée dans `docs/design-system/decisions.md` D-04 :
 *
 * - Famille unique avec deux variantes optiques pour un couplage sans
 *   friction entre titre et corps.
 * - Self-host via `next/font/google` — bundle ≈ 80 KB woff2 sous-ensemble
 *   latin avec poids 400/500/600/700.
 * - Licence SIL Open Font, conforme au principe self-host first
 *   (D-04, principe 7 du design system).
 *
 * `display: 'swap'` évite le FOIT en gardant la substitution système
 * immédiate (cf. globals.css fallback chain dans `--font-sans`).
 *
 * Note transitoire : Next.js 16 expose Inter avec `variable: '--font-inter'`.
 * `Inter Display` n'est pas (encore) une famille séparée chez Google
 * Fonts ; le hint optique 28+ se fait via `font-feature-settings` ou
 * via une distribution dédiée à charger plus tard. Le token CSS
 * `--font-display` pointe sur `--font-inter` aujourd'hui — bascule
 * automatique le jour où on injecte une variable distincte.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Varde',
  description: 'Dashboard du projet Varde.',
};

export default async function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactElement> {
  // La locale est résolue par `i18n/request.ts` à partir du cookie
  // `NEXT_LOCALE` ou de l'en-tête `Accept-Language`. `getMessages`
  // charge le JSON correspondant côté serveur.
  const locale = await getLocale();
  const messages = await getMessages();

  // Thème (jalon 7 PR 7.4.9). On lit la préférence brute depuis le
  // cookie ; le `<ThemeScript>` injecté dans `<head>` la résout
  // contre `prefers-color-scheme` côté client avant le premier paint
  // pour éviter le flash. Le `ThemeProvider` qui enveloppe l'arbre
  // tient ensuite l'état React et la persistance.
  const cookieStore = await cookies();
  const storedTheme = normalizeStoredTheme(cookieStore.get(themeCookieName)?.value);

  // `dataTheme` initial côté server : on applique uniquement quand le
  // user a explicitement choisi `light`. Pour `system` ou `dark`, on
  // n'applique rien — `dark` est le défaut CSS, `system` est résolu
  // par le ThemeScript juste après que `<head>` soit parsé. Cette
  // logique évite un attribut `data-theme="dark"` redondant.
  const initialDataTheme = storedTheme === 'light' ? 'light' : undefined;

  return (
    <html
      lang={locale}
      className={`${inter.variable} dark`}
      {...(initialDataTheme !== undefined ? { 'data-theme': initialDataTheme } : {})}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider initialStored={storedTheme}>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
