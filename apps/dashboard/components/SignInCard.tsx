import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@varde/ui';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { signIn } from '../auth';
import { SignInRedirectHint } from './SignInRedirectHint';

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
 *
 * Architecture du contenu : on contextualise explicitement l'étape
 * (« la config d'instance est OK, on est juste à l'étape suivante »)
 * pour éviter la confusion qu'un utilisateur peut avoir entre
 *  (a) le compte du *bot* (token configuré au wizard d'instance) et
 *  (b) son compte Discord *humain* (login OAuth pour gérer le bot).
 *
 * On expose aussi un encart pliable avec la redirect URI exacte à
 * coller dans le portail Discord — Auth.js renvoie l'utilisateur
 * vers Discord avec un `redirect_uri` qui DOIT être enregistré côté
 * portail OAuth2, sinon Discord rejette avec « redirect_uri non
 * valide » sans contexte. L'URI est calculée depuis les headers de
 * la requête (avec `trustHost: true` côté Auth.js, c'est aussi
 * comme ça qu'Auth.js la dérive lui-même → match garanti).
 */
export async function SignInCard(): Promise<ReactElement> {
  const t = await getTranslations('auth.signIn');

  const requestHeaders = await headers();
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const host = requestHeaders.get('host') ?? 'localhost:3000';
  const redirectUri = `${proto}://${host}/api/auth/callback/discord`;

  return (
    <div className="mx-auto mt-20 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p
              className="rounded-md border border-border-muted bg-card-muted/40 px-3 py-2 text-sm text-muted-foreground"
              data-testid="signin-step-explainer"
            >
              <span className="font-medium text-success">{t('setupCompleteBadge')}</span>{' '}
              {t('stepExplainer')}
            </p>

            <p className="text-sm text-muted-foreground" data-testid="signin-account-distinction">
              {t('accountDistinction')}
            </p>

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

            <SignInRedirectHint
              redirectUri={redirectUri}
              copy={{
                heading: t('redirectHint.heading'),
                cause: t('redirectHint.cause'),
                uriLabel: t('redirectHint.uriLabel'),
                copy: t('redirectHint.copy'),
                copied: t('redirectHint.copied'),
                portalLabel: t('redirectHint.portalLabel'),
                instruction: t('redirectHint.instruction'),
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
