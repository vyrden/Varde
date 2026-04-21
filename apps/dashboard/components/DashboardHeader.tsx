import { Button, Header } from '@varde/ui';
import type { ReactElement } from 'react';

export interface DashboardHeaderProps {
  readonly userName?: string | null | undefined;
}

/**
 * Entête du dashboard. Affiche le nom du user logué et un bouton
 * de déconnexion qui POST sur l'endpoint Auth.js (le form est
 * serveur-compatible pour marcher sans JS actif — important pour
 * l'accessibilité et les navigateurs avec JS désactivé).
 */
export function DashboardHeader({ userName }: DashboardHeaderProps): ReactElement {
  return (
    <Header
      brand={<span>Varde</span>}
      actions={
        <>
          {userName ? (
            <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
          ) : null}
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Se déconnecter
            </Button>
          </form>
        </>
      }
    />
  );
}
