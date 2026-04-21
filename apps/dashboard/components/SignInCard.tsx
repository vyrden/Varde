import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@varde/ui';
import type { ReactElement } from 'react';

import { signIn } from '../auth';

/**
 * Carte de connexion affichée inline sur `/` quand il n'y a pas de
 * session valide. Remplace la redirection 307 vers `/api/auth/signin`
 * (l'UI par défaut d'Auth.js) qui polluait l'historique navigateur :
 * un bouton « Précédent » depuis une page protégée retombait sur ce
 * prompt built-in au lieu de la page d'avant.
 *
 * Le formulaire utilise une server action qui appelle directement
 * `signIn('discord')` exporté depuis `auth.ts` — ça gère le CSRF
 * token d'Auth.js automatiquement et redirige vers `/` après
 * consent Discord.
 */
export function SignInCard(): ReactElement {
  return (
    <div className="mx-auto mt-20 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Bienvenue sur Varde</CardTitle>
          <CardDescription>
            Connectez-vous avec Discord pour accéder à la configuration des serveurs sur lesquels
            vous avez les droits d'administration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              'use server';
              await signIn('discord', { redirectTo: '/' });
            }}
          >
            <Button type="submit" className="w-full">
              Se connecter avec Discord
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
