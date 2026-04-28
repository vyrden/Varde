import type { Metadata } from 'next';
import { Noto_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { ReactElement, ReactNode } from 'react';

import './globals.css';

/**
 * Police principale du dashboard — Noto Sans (substitut public à
 * gg sans qui n'est pas distribuable hors de Discord). Cf. DA.md §
 * Typographie. `display: 'swap'` évite le FOIT en gardant la
 * substitution système immédiate.
 */
const notoSans = Noto_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-noto-sans',
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
    <html lang={locale} className={`${notoSans.variable} dark`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
