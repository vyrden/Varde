import { notFound } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

import { AdminApiError, fetchAdminOverview } from '../../lib/admin-api';

/**
 * Layout du segment `/admin/*` (jalon 7 PR 7.2 sub-livrable 7).
 *
 * Garde-frontière owner : on tente un `GET /admin/overview` côté
 * API (protégé par `requireOwner`). Tout autre code que 200 →
 * `notFound()`, ce qui matérialise le « 404 sans révéler
 * l'existence de l'admin » exigé par le spec section 2 :
 *
 * - 401 (pas de session) → notFound : un user anonyme voit la
 *   même chose qu'une page inexistante.
 * - 404 (session non-owner) → notFound : pareil.
 * - 200 (session owner) → la page enfant est rendue.
 *
 * Le check vit dans le layout pour couvrir toutes les sous-pages
 * du segment d'un coup. Les pages enfants peuvent ensuite refaire
 * leurs propres fetchs sans dupliquer le guard — l'API les
 * protégera de toute façon.
 *
 * On ne pose pas le shell ici : chaque page enfant l'instancie
 * elle-même avec son `current` propre (sidebar active state). Le
 * coût de répétition est acceptable et préserve la composition
 * server-component idiomatique de Next.js sans hook `usePathname`
 * côté client.
 */
export default async function AdminLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactElement> {
  try {
    await fetchAdminOverview();
  } catch (err) {
    if (err instanceof AdminApiError) {
      notFound();
    }
    // Tout autre échec (réseau, 5xx) → notFound aussi : l'admin
    // ne doit pas voir l'arborescence quand l'API rame.
    notFound();
  }
  return <>{children}</>;
}
