import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@varde/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';

/**
 * Page 404 globale du dashboard. Next.js l'utilise dès qu'une route
 * n'est pas trouvée ou qu'un server component appelle `notFound()`.
 * On propose un lien explicite vers l'accueil — c'est plus fiable que
 * de compter sur le bouton « Précédent » du navigateur, dont le
 * comportement dans Next 16 est sujet à surprises quand un
 * `redirect()` est dans la pile d'historique.
 */
export default function NotFound(): ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Page introuvable</CardTitle>
          <CardDescription>
            La page demandée n'existe pas ou vous n'y avez pas accès.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/"
            className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Retour à mes serveurs
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
