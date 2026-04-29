'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';

/**
 * Sous-bloc « Redirect URIs à configurer dans Discord » de
 * `/admin/urls` (jalon 7 PR 7.2 sub-livrable 7d).
 *
 * Liste pré-calculée côté API par `/admin/urls/redirect-uris`
 * (déduplique baseUrl + additional avec env fallback). Bouton
 * « Copier toutes » place les URIs séparées par des sauts de
 * ligne dans le presse-papier — format adapté au champ multi-ligne
 * du portail Discord OAuth2.
 */

export interface AdminRedirectUrisCopy {
  readonly heading: string;
  readonly description: string;
  readonly copyAll: string;
  readonly copied: string;
  readonly portalLink: string;
  readonly portalLabel: string;
}

const PORTAL_URL = 'https://discord.com/developers/applications';

export interface AdminRedirectUrisSectionProps {
  readonly redirectUris: readonly string[];
  readonly copy: AdminRedirectUrisCopy;
}

export function AdminRedirectUrisSection({
  redirectUris,
  copy,
}: AdminRedirectUrisSectionProps): ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(redirectUris.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
      aria-labelledby="admin-urls-redirect-heading"
    >
      <header className="mb-3">
        <h2 id="admin-urls-redirect-heading" className="text-base font-semibold text-foreground">
          {copy.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </header>

      <div className="space-y-3">
        <ul
          className="divide-y divide-border-muted rounded-md border border-border-muted"
          data-testid="admin-redirect-uris-list"
        >
          {redirectUris.map((uri) => (
            <li key={uri} className="px-3 py-2 font-mono text-xs text-foreground break-all">
              {uri}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href={PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.portalLabel} →
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            data-testid="admin-redirect-uris-copy"
          >
            {copied ? copy.copied : copy.copyAll}
          </button>
        </div>
      </div>
    </section>
  );
}
