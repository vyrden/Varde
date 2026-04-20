import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Varde',
  description: 'Dashboard du projet Varde.',
};

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
