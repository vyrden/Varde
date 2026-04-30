'use client';

import Link from 'next/link';
import type { ChangeEvent, ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import { type SetupActionState, submitIdentity } from '../../lib/setup-actions';
import type { IdentityResponse } from '../../lib/setup-client';
import { setupStepHref } from '../../lib/setup-steps';
import { useDebounced } from '../../lib/use-debounced';

/**
 * Formulaire client de l'étape « Identité du bot » du wizard, refondu
 * en auto-save (jalon 7 PR 7.7).
 *
 * Étape facultative — l'admin peut ne rien saisir et passer
 * directement. Si l'admin saisit quelque chose, ça se persiste tout
 * seul après 500 ms d'inactivité (PATCH `/applications/@me` côté
 * Discord, qui peut renvoyer une URL CDN pour l'avatar).
 *
 * Avatar : champ `<input type="file">` qui lit le fichier en data URI
 * côté navigateur. Le data URI est forwardé à l'API qui le
 * transmet à Discord. Pas de drag&drop ni de magic-bytes check —
 * Discord rejette les non-images, ça suffit.
 */

export interface IdentityFormCopy {
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  readonly avatarLabel: string;
  readonly avatarHint: string;
  readonly avatarRemove: string;
  readonly avatarSavedLabel: string;
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
}

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
}: IdentityFormProps): ReactElement {
  const [name, setName] = useState(initialName ?? '');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const debouncedName = useDebounced(name, 500);
  const debouncedDescription = useDebounced(description, 500);

  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const lastSavedRef = useRef<string>(`${name} ${description}`);

  // Auto-save sur changement stabilisé. On inclut l'avatar dans
  // la même boucle : sa sélection met setAvatarDataUri, ce qui
  // re-render et déclenche le submit ci-dessous.
  useEffect(() => {
    const fingerprint = `${debouncedName} ${debouncedDescription} ${avatarDataUri ?? ''}`;
    if (fingerprint === lastSavedRef.current) return;
    if (debouncedName.length === 0 && debouncedDescription.length === 0 && avatarDataUri === null) {
      // Tout est vide ET aucun avatar choisi : pas de persist.
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
  }, [debouncedName, debouncedDescription, avatarDataUri]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      setAvatarDataUri(null);
      return;
    }
    try {
      const dataUri = await readFileAsDataUri(file);
      setAvatarDataUri(dataUri);
    } catch {
      setAvatarDataUri(null);
    }
  };

  const handleRemoveAvatar = (): void => {
    setAvatarDataUri(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const errorMessage = save.kind === 'error' ? (copy.errors[save.code] ?? save.message) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="identity-name" className="block text-sm font-medium text-foreground">
            {copy.nameLabel}
          </label>
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

        <div className="space-y-1.5">
          <label
            htmlFor="identity-avatar-file"
            className="block text-sm font-medium text-foreground"
          >
            {copy.avatarLabel}
          </label>
          <input
            ref={fileInputRef}
            id="identity-avatar-file"
            type="file"
            accept="image/png,image/jpeg,image/gif"
            onChange={handleFileChange}
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-secondary/80"
          />
          {avatarDataUri !== null ? (
            <div className="flex items-center gap-3">
              {/* biome-ignore lint/performance/noImgElement: data URI preview, not an external asset */}
              <img
                src={avatarDataUri}
                alt=""
                className="h-12 w-12 rounded-full border border-border-muted object-cover"
                data-testid="identity-avatar-preview"
              />
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {copy.avatarRemove}
              </button>
            </div>
          ) : initialAvatarUrl !== null && initialAvatarUrl !== undefined ? (
            <div className="flex items-center gap-3" data-testid="identity-avatar-saved">
              {/* biome-ignore lint/performance/noImgElement: avatar Discord déjà servi par leur CDN, pas besoin du loader Next */}
              <img
                src={initialAvatarUrl}
                alt=""
                className="h-12 w-12 rounded-full border border-border-muted object-cover"
              />
              <span className="text-xs text-muted-foreground">{copy.avatarSavedLabel}</span>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{copy.avatarHint}</p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="identity-description"
            className="block text-sm font-medium text-foreground"
          >
            {copy.descriptionLabel}
          </label>
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
