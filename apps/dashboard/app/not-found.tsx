import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@varde/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

/**
 * Page 404 globale du dashboard. Next.js l'utilise dès qu'une route
 * n'est pas trouvée ou qu'un server component appelle `notFound()`.
 * On propose un lien explicite vers l'accueil — c'est plus fiable que
 * de compter sur le bouton « Précédent » du navigateur, dont le
 * comportement dans Next 16 est sujet à surprises quand un
 * `redirect()` est dans la pile d'historique.
 */
export default async function NotFound(): Promise<ReactElement> {
  const t = await getTranslations('notFound');
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/"
            className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('backHome')}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
