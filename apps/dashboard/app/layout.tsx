import type { Metadata } from 'next';
import { Noto_Sans } from 'next/font/google';
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

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <html lang="fr" className={`${notoSans.variable} dark`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
