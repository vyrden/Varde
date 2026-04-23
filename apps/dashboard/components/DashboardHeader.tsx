import { Button, Header } from '@varde/ui';
import type { ReactElement } from 'react';

import { signOut } from '../auth';

export interface DashboardHeaderProps {
  readonly userName?: string | null | undefined;
}

/**
 * Entête du dashboard. Affiche le nom du user logué et un bouton
 * de déconnexion. Utilise une server action qui appelle `signOut()`
 * exporté depuis `auth.ts` — Auth.js v5 gère le CSRF token
 * automatiquement, contrairement au POST direct sur
 * `/api/auth/signout` qui échoue silencieusement sans token.
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
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              Se déconnecter
            </Button>
          </form>
        </>
      }
    />
  );
}
