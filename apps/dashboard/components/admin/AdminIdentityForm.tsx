'use client';

import type { ChangeEvent, ReactElement } from 'react';
import { useActionState, useRef, useState } from 'react';

import type { AdminIdentityDto } from '../../lib/admin-api';
import { type AdminActionState, submitAdminIdentity } from '../../lib/admin-identity-actions';

/**
 * Formulaire admin de modification de l'identité du bot (jalon 7
 * PR 7.2 sub-livrable 7b).
 *
 * Layout 2 colonnes : à gauche les champs `name`, `avatar`,
 * `description` ; à droite un aperçu temps-réel qui rejoue le
 * rendu d'un message Discord (avatar rond + name + description).
 *
 * Avatar : data URI lu côté navigateur. Persistance Discord
 * répond avec un hash CDN — on rebascule l'aperçu sur l'URL CDN
 * dès que l'API répond avec succès, pour ne pas faire mentir
 * l'aperçu après save.
 *
 * Rate limit Discord (PATCH /applications/@me ~ 2 req/min) : on
 * affiche `retryAfterMs` quand l'API renvoie `429 rate_limited`,
 * en plus du message d'erreur générique.
 */

export interface AdminIdentityFormCopy {
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  readonly avatarLabel: string;
  readonly avatarHint: string;
  readonly avatarRemove: string;
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

const readFileAsDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader.result n est pas une string'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader a échoué'));
    reader.readAsDataURL(file);
  });

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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialIdentity.avatarUrl);
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quand l'API confirme une mutation, on rebascule l'aperçu sur
  // l'URL CDN qu'elle a retournée — la data URI temporaire ne
  // reflète plus la vérité Discord.
  const stateAvatarUrl =
    state.kind === 'success' && state.data.avatarUrl !== null ? state.data.avatarUrl : null;
  const effectivePreviewUrl = stateAvatarUrl ?? avatarPreview;

  const errorMessage = state.kind === 'error' ? (copy.errors[state.code] ?? state.message) : null;
  const rateLimitMs = state.kind === 'error' ? state.retryAfterMs : undefined;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      setAvatarDataUri(null);
      setAvatarPreview(initialIdentity.avatarUrl);
      return;
    }
    try {
      const dataUri = await readFileAsDataUri(file);
      setAvatarDataUri(dataUri);
      setAvatarPreview(dataUri);
    } catch {
      setAvatarDataUri(null);
    }
  };

  const handleRemoveAvatar = (): void => {
    setAvatarDataUri(null);
    setAvatarPreview(initialIdentity.avatarUrl);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReset = (): void => {
    setName(initialIdentity.name ?? '');
    setDescription(initialIdentity.description ?? '');
    handleRemoveAvatar();
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <form action={action} className="space-y-4">
        <input type="hidden" name="initialName" value={initialIdentity.name ?? ''} />
        <input type="hidden" name="initialDescription" value={initialIdentity.description ?? ''} />
        <input type="hidden" name="avatar" value={avatarDataUri ?? ''} />

        <div className="space-y-1.5">
          <label
            htmlFor="admin-identity-name"
            className="block text-sm font-medium text-foreground"
          >
            {copy.nameLabel}
          </label>
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

        <div className="space-y-1.5">
          <label
            htmlFor="admin-identity-avatar-file"
            className="block text-sm font-medium text-foreground"
          >
            {copy.avatarLabel}
          </label>
          <input
            ref={fileInputRef}
            id="admin-identity-avatar-file"
            type="file"
            accept="image/png,image/jpeg,image/gif"
            onChange={handleFileChange}
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-secondary/80"
          />
          {avatarDataUri !== null ? (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {copy.avatarRemove}
            </button>
          ) : null}
          <p className="text-xs text-muted-foreground">{copy.avatarHint}</p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="admin-identity-description"
            className="block text-sm font-medium text-foreground"
          >
            {copy.descriptionLabel}
          </label>
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
        className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
        aria-label={copy.previewHeading}
      >
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {copy.previewHeading}
        </h3>
        <div className="flex items-start gap-3">
          {effectivePreviewUrl !== null ? (
            // biome-ignore lint/performance/noImgElement: data URI / CDN preview, not Next-optimizable
            <img
              src={effectivePreviewUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full border border-border-muted object-cover"
              data-testid="admin-identity-preview-avatar"
            />
          ) : (
            <div className="h-12 w-12 shrink-0 rounded-full border border-border-muted bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {name.length > 0 ? name : copy.previewEmptyName}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {description.length > 0 ? description : copy.previewEmptyDescription}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
