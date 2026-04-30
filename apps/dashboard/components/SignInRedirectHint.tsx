'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';

/**
 * Encart d'aide affiché sous le bouton de login. Le portail Discord
 * refuse le `signIn` OAuth2 tant que la redirect URI demandée par
 * Auth.js n'est pas enregistrée dans l'app — l'utilisateur tombe
 * alors sur « redirect_uri OAuth2 non valide » sans contexte.
 *
 * On expose ici l'URI exacte (calculée côté serveur depuis les
 * headers de la requête, donc identique à celle qu'Auth.js émet)
 * + un bouton de copie + un lien vers le portail dev. La même URI
 * a été montrée à l'étape OAuth du wizard, mais l'admin l'a peut-
 * être loupée.
 */

export interface SignInRedirectHintCopy {
  readonly heading: string;
  readonly cause: string;
  readonly uriLabel: string;
  readonly copy: string;
  readonly copied: string;
  readonly portalLabel: string;
  readonly instruction: string;
}

const PORTAL_URL = 'https://discord.com/developers/applications';

export interface SignInRedirectHintProps {
  readonly redirectUri: string;
  readonly copy: SignInRedirectHintCopy;
}

export function SignInRedirectHint({ redirectUri, copy }: SignInRedirectHintProps): ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <details className="rounded-md border border-border-muted bg-card-muted/40 px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none font-medium text-foreground">
        {copy.heading}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">{copy.cause}</p>

        <div>
          <span className="block text-xs font-medium text-muted-foreground">{copy.uriLabel}</span>
          <code
            data-testid="signin-redirect-uri"
            className="mt-1 block break-all rounded border border-border-muted bg-background px-2 py-1.5 font-mono text-xs text-foreground"
          >
            {redirectUri}
          </code>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <a
            href={PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.portalLabel} →
          </a>
          <button
            type="button"
            onClick={handleCopy}
            data-testid="signin-redirect-copy"
            className="inline-flex h-8 items-center justify-center rounded-md border border-border-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            {copied ? copy.copied : copy.copy}
          </button>
        </div>

        <p className="text-xs text-muted-foreground">{copy.instruction}</p>
      </div>
    </details>
  );
}
