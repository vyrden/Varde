'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-déclenche le rendu serveur de la route courante chaque fois que
 * l'onglet redevient visible. `router.refresh()` ne reload pas la
 * page : il re-rend les server components (cache 'no-store' pour
 * `fetchAdminGuilds` côté layout) et patche le DOM avec le diff.
 *
 * Cas d'usage principal : l'admin clique sur le « + » du rail, va
 * inviter le bot sur Discord dans un nouvel onglet, puis revient sur
 * le dashboard — la nouvelle guild apparaît sans qu'il ait à recharger.
 *
 * Throttle 3 s pour éviter de spammer l'API si l'admin tabswitche
 * rapidement.
 */
export function RouterRefreshOnFocus(): null {
  const router = useRouter();

  useEffect(() => {
    let lastRefresh = 0;
    const THROTTLE_MS = 3000;

    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefresh < THROTTLE_MS) return;
      lastRefresh = now;
      router.refresh();
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [router]);

  return null;
}
