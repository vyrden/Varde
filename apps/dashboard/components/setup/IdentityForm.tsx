'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import { type SetupActionState, submitIdentity } from '../../lib/setup-actions';
import type { IdentityResponse } from '../../lib/setup-client';
import { setupStepHref } from '../../lib/setup-steps';
import { useDebounced } from '../../lib/use-debounced';
import { ImageDropZone, type ImageDropZoneCopy } from '../ImageDropZone';

/**
 * Formulaire client de l'étape « Identité du bot » du wizard
 * (jalon 7 PR 7.1 sub-livrable 5 ; auto-save PR 7.7 ; bannière PR 7.8).
 *
 * Étape facultative — l'admin peut ne rien saisir et passer
 * directement. Si l'admin saisit quelque chose, ça se persiste tout
 * seul après 500 ms d'inactivité (PATCH `/users/@me` pour l'avatar
 * et la bannière, PATCH `/applications/@me` pour le name et la
 * description, cf. ADR Discord side dans setup.ts).
 */

export interface IdentityFormCopy {
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  readonly avatar: ImageDropZoneCopy;
  readonly avatarSavedLabel: string;
  readonly banner: ImageDropZoneCopy;
  readonly bannerSavedLabel: string;
  readonly descriptionLabel: string;
  readonly descriptionPlaceholder: string;
  readonly skip: string;
  readonly continueLabel: string;
  readonly previous: string;
  readonly saving: string;
  readonly saved: string;
  readonly errors: Readonly<Record<string, string>>;
}

export interface IdentityFormProps {
  readonly copy: IdentityFormCopy;
  readonly initialName?: string | null;
  readonly initialDescription?: string | null;
  readonly initialAvatarUrl?: string | null;
  readonly initialBannerUrl?: string | null;
}

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'error'; readonly code: string; readonly message: string };

export function IdentityForm({
  copy,
  initialName,
  initialDescription,
  initialAvatarUrl,
  initialBannerUrl,
}: IdentityFormProps): ReactElement {
  const [name, setName] = useState(initialName ?? '');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);
  const [bannerDataUri, setBannerDataUri] = useState<string | null>(null);

  const debouncedName = useDebounced(name, 500);
  const debouncedDescription = useDebounced(description, 500);

  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const lastSavedRef = useRef<string>(`${name} ${description}`);

  // Auto-save sur changement stabilisé. On inclut avatar et bannière
  // dans la même boucle : leur sélection met le state, ce qui
  // re-render et déclenche le submit ci-dessous.
  useEffect(() => {
    const fingerprint = `${debouncedName} ${debouncedDescription} ${avatarDataUri ?? ''} ${bannerDataUri ?? ''}`;
    if (fingerprint === lastSavedRef.current) return;
    if (
      debouncedName.length === 0 &&
      debouncedDescription.length === 0 &&
      avatarDataUri === null &&
      bannerDataUri === null
    ) {
      // Tout est vide : pas de persist.
      lastSavedRef.current = fingerprint;
      return;
    }
    setSave({ kind: 'saving' });
    let cancelled = false;
    void (async () => {
      const formData = new FormData();
      if (debouncedName.length > 0) formData.append('name', debouncedName);
      if (debouncedDescription.length > 0) formData.append('description', debouncedDescription);
      if (avatarDataUri !== null) formData.append('avatar', avatarDataUri);
      if (bannerDataUri !== null) formData.append('banner', bannerDataUri);
      const result: SetupActionState<IdentityResponse> = await submitIdentity(
        { kind: 'idle' },
        formData,
      );
      if (cancelled) return;
      lastSavedRef.current = fingerprint;
      if (result.kind === 'success') {
        setSave({ kind: 'saved' });
      } else if (result.kind === 'error') {
        setSave({ kind: 'error', code: result.code, message: result.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedName, debouncedDescription, avatarDataUri, bannerDataUri]);

  const errorMessage = save.kind === 'error' ? (copy.errors[save.code] ?? save.message) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="identity-name" className="block text-sm font-medium text-foreground">
              {copy.nameLabel}
            </label>
            <span
              className="text-xs tabular-nums text-muted-foreground"
              data-testid="identity-name-counter"
              aria-live="polite"
            >
              {name.length} / 32
            </span>
          </div>
          <input
            id="identity-name"
            name="name"
            type="text"
            maxLength={32}
            placeholder={copy.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <ImageDropZone
          testIdPrefix="identity-avatar"
          aspect="square"
          copy={copy.avatar}
          onLoaded={(uri) => setAvatarDataUri(uri)}
          onCleared={() => setAvatarDataUri(null)}
        />
        {avatarDataUri === null && initialAvatarUrl !== null && initialAvatarUrl !== undefined ? (
          <div
            className="-mt-3 flex items-center gap-3 rounded-md border border-border-muted bg-card-muted/30 px-3 py-2"
            data-testid="identity-avatar-saved"
          >
            {/* biome-ignore lint/performance/noImgElement: avatar Discord déjà servi par leur CDN */}
            <img
              src={initialAvatarUrl}
              alt=""
              className="h-12 w-12 rounded-full border border-border-muted object-cover"
            />
            <span className="text-xs text-muted-foreground">{copy.avatarSavedLabel}</span>
          </div>
        ) : null}

        <ImageDropZone
          testIdPrefix="identity-banner"
          aspect="wide"
          copy={copy.banner}
          onLoaded={(uri) => setBannerDataUri(uri)}
          onCleared={() => setBannerDataUri(null)}
        />
        {bannerDataUri === null && initialBannerUrl !== null && initialBannerUrl !== undefined ? (
          <div
            className="-mt-3 flex items-center gap-3 rounded-md border border-border-muted bg-card-muted/30 px-3 py-2"
            data-testid="identity-banner-saved"
          >
            {/* biome-ignore lint/performance/noImgElement: bannière Discord déjà servie par leur CDN */}
            <img
              src={initialBannerUrl}
              alt=""
              className="h-12 w-32 rounded-md border border-border-muted object-cover"
            />
            <span className="text-xs text-muted-foreground">{copy.bannerSavedLabel}</span>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="identity-description"
              className="block text-sm font-medium text-foreground"
            >
              {copy.descriptionLabel}
            </label>
            <span
              className="text-xs tabular-nums text-muted-foreground"
              data-testid="identity-description-counter"
              aria-live="polite"
            >
              {description.length} / 400
            </span>
          </div>
          <textarea
            id="identity-description"
            name="description"
            rows={3}
            maxLength={400}
            placeholder={copy.descriptionPlaceholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {save.kind === 'saving' ? (
        <p
          className="rounded-md border border-border-muted bg-card-muted/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="identity-saving"
          role="status"
        >
          {copy.saving}
        </p>
      ) : null}
      {save.kind === 'saved' ? (
        <p
          className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100"
          data-testid="identity-saved"
          role="status"
        >
          {copy.saved}
        </p>
      ) : null}
      {errorMessage !== null ? (
        <p
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
          data-testid="identity-error"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-muted pt-4">
        <Link
          href={setupStepHref('oauth')}
          className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copy.previous}
        </Link>
        <div className="flex gap-3">
          <Link
            href={setupStepHref('summary')}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copy.skip}
          </Link>
          <Link
            href={setupStepHref('summary')}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            data-testid="identity-continue"
          >
            {copy.continueLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
