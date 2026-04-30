'use client';

import type { ChangeEvent, DragEvent, ReactElement } from 'react';
import { useActionState, useRef, useState } from 'react';

import type { AdminIdentityDto } from '../../lib/admin-api';
import { type AdminActionState, submitAdminIdentity } from '../../lib/admin-identity-actions';

/**
 * Formulaire admin de modification de l'identité du bot (jalon 7
 * PR 7.2 sub-livrable 7b, drop zone + feedback ajoutés en PR 7.7).
 *
 * Layout 2 colonnes : à gauche les champs `name`, `avatar`,
 * `description` ; à droite un aperçu temps-réel qui rejoue le
 * rendu d'un message Discord (avatar rond + name + description).
 *
 * Avatar : drop zone qui accepte clic OU glisser-déposer. Une fois
 * un fichier choisi, on affiche son nom + sa taille pour confirmer
 * visuellement le chargement (sans ça, l'admin ne sait pas s'il a
 * effectivement uploadé). Persistance Discord répond avec un hash
 * CDN — on rebascule l'aperçu sur l'URL CDN dès que l'API répond
 * avec succès.
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
  readonly avatarDropPrompt: string;
  readonly avatarLoadedTemplate: string;
  readonly avatarErrorUnsupportedType: string;
  readonly avatarErrorTooLarge: string;
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

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif']);

/**
 * Plafond côté client. Discord limite les avatars à 8 Mo, mais
 * 2 Mo suffisent largement pour un PNG ou un GIF d'avatar — au-delà,
 * la data URI base64 alourdit la requête HTTP au point de pouvoir
 * timeout ou crasher le worker Next.js. Le filtre côté client évite
 * que l'utilisateur upload un fichier de 20 Mo et fige le dashboard.
 */
const MAX_BYTES = 2 * 1024 * 1024;

type FileError =
  | { readonly kind: 'unsupported_type' }
  | { readonly kind: 'too_large'; readonly size: number };

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
  const [avatarFileMeta, setAvatarFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [fileError, setFileError] = useState<FileError | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stateAvatarUrl =
    state.kind === 'success' && state.data.avatarUrl !== null ? state.data.avatarUrl : null;
  const effectivePreviewUrl = stateAvatarUrl ?? avatarPreview;

  const errorMessage = state.kind === 'error' ? (copy.errors[state.code] ?? state.message) : null;
  const rateLimitMs = state.kind === 'error' ? state.retryAfterMs : undefined;

  const ingestFile = async (file: File): Promise<void> => {
    if (!ACCEPTED_TYPES.has(file.type)) {
      setAvatarDataUri(null);
      setAvatarFileMeta(null);
      setFileError({ kind: 'unsupported_type' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setAvatarDataUri(null);
      setAvatarFileMeta(null);
      setFileError({ kind: 'too_large', size: file.size });
      return;
    }
    try {
      const dataUri = await readFileAsDataUri(file);
      setAvatarDataUri(dataUri);
      setAvatarPreview(dataUri);
      setAvatarFileMeta({ name: file.name, size: file.size });
      setFileError(null);
    } catch {
      setAvatarDataUri(null);
      setAvatarFileMeta(null);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      setAvatarDataUri(null);
      setAvatarPreview(initialIdentity.avatarUrl);
      setAvatarFileMeta(null);
      return;
    }
    await ingestFile(file);
  };

  const handleDrop = async (event: DragEvent<HTMLButtonElement>): Promise<void> => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await ingestFile(file);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleRemoveAvatar = (): void => {
    setAvatarDataUri(null);
    setAvatarPreview(initialIdentity.avatarUrl);
    setAvatarFileMeta(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReset = (): void => {
    setName(initialIdentity.name ?? '');
    setDescription(initialIdentity.description ?? '');
    handleRemoveAvatar();
  };

  const dropZoneClass = `flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
    isDragging
      ? 'border-primary bg-primary/10'
      : avatarDataUri !== null
        ? 'border-emerald-500/60 bg-emerald-500/10'
        : 'border-border-muted bg-card-muted/30 hover:border-primary hover:bg-card-muted/50'
  }`;

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
          <span className="block text-sm font-medium text-foreground">{copy.avatarLabel}</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`${dropZoneClass} w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            data-testid="admin-identity-avatar-dropzone"
          >
            {avatarDataUri !== null && avatarFileMeta !== null ? (
              <>
                <span aria-hidden="true" className="text-2xl text-emerald-500">
                  ✓
                </span>
                <span className="text-sm font-medium text-foreground">
                  {copy.avatarLoadedTemplate
                    .replace('{name}', avatarFileMeta.name)
                    .replace('{size}', formatFileSize(avatarFileMeta.size))}
                </span>
              </>
            ) : (
              <>
                <span aria-hidden="true" className="text-2xl text-muted-foreground">
                  📎
                </span>
                <span className="text-sm text-muted-foreground">{copy.avatarDropPrompt}</span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            id="admin-identity-avatar-file"
            type="file"
            accept="image/png,image/jpeg,image/gif"
            onChange={handleFileChange}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
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
          {fileError !== null ? (
            <p
              className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
              role="alert"
              data-testid="admin-identity-avatar-file-error"
            >
              {fileError.kind === 'unsupported_type'
                ? copy.avatarErrorUnsupportedType
                : copy.avatarErrorTooLarge.replace('{size}', formatFileSize(fileError.size))}
            </p>
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
