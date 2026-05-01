import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { ReactElement, ReactNode } from 'react';

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
  return (
    <html lang={locale} className={`${inter.variable} dark`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
