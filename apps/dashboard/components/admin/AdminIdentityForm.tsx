'use client';

import type { ReactElement } from 'react';
import { useActionState, useState } from 'react';

import type { AdminIdentityDto } from '../../lib/admin-api';
import { type AdminActionState, submitAdminIdentity } from '../../lib/admin-identity-actions';
import { ImageDropZone, type ImageDropZoneCopy } from '../ImageDropZone';

/**
 * Formulaire admin de modification de l'identité du bot (jalon 7
 * PR 7.2 sub-livrable 7b ; drop zones avec drag & drop ajoutées en
 * PR 7.7 ; bannière en PR 7.8).
 *
 * Layout 2 colonnes : à gauche les champs `name`, `avatar`,
 * `bannière`, `description` ; à droite un aperçu temps-réel qui rejoue
 * le rendu d'un message Discord (bannière + avatar rond + name +
 * description) et donc permet de juger de la cohérence visuelle avant
 * de soumettre.
 *
 * Persistance Discord répond avec des hashes CDN — on rebascule les
 * aperçus sur les URLs CDN dès que l'API répond avec succès.
 *
 * Rate limit Discord (PATCH /applications/@me ~ 2 req/min) : on
 * affiche `retryAfterMs` quand l'API renvoie `429 rate_limited`,
 * en plus du message d'erreur générique.
 */

export interface AdminIdentityFormCopy {
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  readonly avatar: ImageDropZoneCopy;
  readonly banner: ImageDropZoneCopy;
  readonly descriptionLabel: string;
  readonly descriptionPlaceholder: string;
  readonly submit: string;
  readonly reset: string;
  readonly previewHeading: string;
  readonly previewEmptyName: string;
  readonly previewEmptyDescription: string;
  readonly success: string;
  readonly rateLimited: string;
  readonly errors: Readonly<Record<string, string>>;
}

const initial: AdminActionState<AdminIdentityDto> = { kind: 'idle' };

export interface AdminIdentityFormProps {
  readonly initial: AdminIdentityDto;
  readonly copy: AdminIdentityFormCopy;
}

export function AdminIdentityForm({
  initial: initialIdentity,
  copy,
}: AdminIdentityFormProps): ReactElement {
  const [state, action, pending] = useActionState(submitAdminIdentity, initial);

  const [name, setName] = useState(initialIdentity.name ?? '');
  const [description, setDescription] = useState(initialIdentity.description ?? '');
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);
  const [bannerDataUri, setBannerDataUri] = useState<string | null>(null);

  // Aperçu : data URI fraîche si l'admin vient d'uploader, sinon CDN
  // URL renvoyée par Discord après le dernier save, sinon l'URL CDN
  // initiale chargée par le server component.
  const stateAvatarUrl =
    state.kind === 'success' && state.data.avatarUrl !== null ? state.data.avatarUrl : null;
  const stateBannerUrl =
    state.kind === 'success' && state.data.bannerUrl !== null ? state.data.bannerUrl : null;
  const effectiveAvatarUrl = avatarDataUri ?? stateAvatarUrl ?? initialIdentity.avatarUrl;
  const effectiveBannerUrl = bannerDataUri ?? stateBannerUrl ?? initialIdentity.bannerUrl;

  const errorMessage = state.kind === 'error' ? (copy.errors[state.code] ?? state.message) : null;
  const rateLimitMs = state.kind === 'error' ? state.retryAfterMs : undefined;

  const handleReset = (): void => {
    setName(initialIdentity.name ?? '');
    setDescription(initialIdentity.description ?? '');
    setAvatarDataUri(null);
    setBannerDataUri(null);
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <form action={action} className="space-y-4">
        <input type="hidden" name="initialName" value={initialIdentity.name ?? ''} />
        <input type="hidden" name="initialDescription" value={initialIdentity.description ?? ''} />
        <input type="hidden" name="avatar" value={avatarDataUri ?? ''} />
        <input type="hidden" name="banner" value={bannerDataUri ?? ''} />

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="admin-identity-name"
              className="block text-sm font-medium text-foreground"
            >
              {copy.nameLabel}
            </label>
            <span
              className="text-xs tabular-nums text-muted-foreground"
              data-testid="admin-identity-name-counter"
              aria-live="polite"
            >
              {name.length} / 32
            </span>
          </div>
          <input
            id="admin-identity-name"
            name="name"
            type="text"
            maxLength={32}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={copy.namePlaceholder}
            className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <ImageDropZone
          testIdPrefix="admin-identity-avatar"
          aspect="square"
          copy={copy.avatar}
          onLoaded={(uri) => setAvatarDataUri(uri)}
          onCleared={() => setAvatarDataUri(null)}
        />

        <ImageDropZone
          testIdPrefix="admin-identity-banner"
          aspect="wide"
          copy={copy.banner}
          onLoaded={(uri) => setBannerDataUri(uri)}
          onCleared={() => setBannerDataUri(null)}
        />

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="admin-identity-description"
              className="block text-sm font-medium text-foreground"
            >
              {copy.descriptionLabel}
            </label>
            <span
              className="text-xs tabular-nums text-muted-foreground"
              data-testid="admin-identity-description-counter"
              aria-live="polite"
            >
              {description.length} / 400
            </span>
          </div>
          <textarea
            id="admin-identity-description"
            name="description"
            rows={3}
            maxLength={400}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={copy.descriptionPlaceholder}
            className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-muted pt-4">
          <button
            type="button"
            onClick={handleReset}
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copy.reset}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="admin-identity-submit"
          >
            {pending ? '…' : copy.submit}
          </button>
        </div>

        {errorMessage !== null ? (
          <div
            className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
            role="alert"
            data-testid="admin-identity-error"
          >
            <p>{errorMessage}</p>
            {rateLimitMs !== undefined ? (
              <p className="mt-1 text-xs text-rose-200">
                {copy.rateLimited.replace('{seconds}', Math.ceil(rateLimitMs / 1000).toString())}
              </p>
            ) : null}
          </div>
        ) : null}

        {state.kind === 'success' ? (
          <div
            className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
            role="status"
            data-testid="admin-identity-success"
          >
            {copy.success}
          </div>
        ) : null}
      </form>

      <aside
        className="overflow-hidden rounded-lg border border-border-muted bg-card shadow-sm"
        aria-label={copy.previewHeading}
      >
        <h3 className="px-5 pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {copy.previewHeading}
        </h3>
        {effectiveBannerUrl !== null ? (
          // biome-ignore lint/performance/noImgElement: data URI / CDN preview, not Next-optimizable
          <img
            src={effectiveBannerUrl}
            alt=""
            className="mt-3 h-24 w-full object-cover"
            data-testid="admin-identity-preview-banner"
          />
        ) : (
          <div
            className="mt-3 h-24 w-full bg-muted"
            data-testid="admin-identity-preview-banner-empty"
          />
        )}
        <div className="-mt-6 flex items-start gap-3 px-5 pb-5">
          {effectiveAvatarUrl !== null ? (
            // biome-ignore lint/performance/noImgElement: data URI / CDN preview, not Next-optimizable
            <img
              src={effectiveAvatarUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full border-4 border-card object-cover"
              data-testid="admin-identity-preview-avatar"
            />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-full border-4 border-card bg-muted" />
          )}
          <div className="min-w-0 flex-1 pt-7">
            <p
              className="truncate text-sm font-semibold text-foreground"
              data-testid="admin-identity-preview-name"
            >
              {name.length > 0 ? name : copy.previewEmptyName}
            </p>
            <p
              className="mt-1 whitespace-pre-wrap wrap-break-word text-sm text-muted-foreground"
              data-testid="admin-identity-preview-description"
            >
              {description.length > 0 ? description : copy.previewEmptyDescription}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
