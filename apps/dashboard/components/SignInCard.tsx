import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@varde/ui';
import { getTranslations } from 'next-intl/server';
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
export async function SignInCard(): Promise<ReactElement> {
  const t = await getTranslations('auth.signIn');
  return (
    <div className="mx-auto mt-20 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              'use server';
              await signIn('discord', { redirectTo: '/' });
            }}
          >
            <Button type="submit" className="w-full">
              {t('button')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
