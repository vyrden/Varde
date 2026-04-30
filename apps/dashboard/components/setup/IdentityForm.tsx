'use client';

import Link from 'next/link';
import type { ChangeEvent, ReactElement } from 'react';
import { useActionState, useRef, useState } from 'react';

import { type SetupActionState, submitIdentity } from '../../lib/setup-actions';
import type { IdentityResponse } from '../../lib/setup-client';
import { setupStepHref } from '../../lib/setup-steps';

/**
 * Formulaire client de l'étape « Identité du bot » du wizard.
 * Étape facultative — l'admin peut soumettre un body vide via le
 * bouton « Passer » qui n'envoie aucun champ (l'API skip alors
 * l'appel Discord et bumpe juste `setup_step`).
 *
 * Avatar : champ `<input type="file">` qui lit le fichier en data
 * URI côté navigateur. Pas de drag&drop ni de contrôle magic bytes
 * dans cette PR — l'API forward le data URI à `PATCH
 * /applications/@me`, et Discord refuse les non-images.
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
  readonly submit: string;
  readonly continueLabel: string;
  readonly previous: string;
  readonly success: string;
  readonly errors: Readonly<Record<string, string>>;
}

export interface IdentityFormProps {
  readonly copy: IdentityFormCopy;
  /** Valeurs déjà persistées en DB (PR 7.6 — persistance form). */
  readonly initialName?: string | null;
  readonly initialDescription?: string | null;
  readonly initialAvatarUrl?: string | null;
}

const initial: SetupActionState<IdentityResponse> = { kind: 'idle' };

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

export function IdentityForm({
  copy,
  initialName,
  initialDescription,
  initialAvatarUrl,
}: IdentityFormProps): ReactElement {
  const [state, action, pending] = useActionState(submitIdentity, initial);
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const errorMessage = state.kind === 'error' ? (copy.errors[state.code] ?? state.message) : null;
  const success = state.kind === 'success' ? state.data : null;

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

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
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
            defaultValue={initialName ?? ''}
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
              {/*
               * Preview en data URI inline — pas un asset externe à
               * optimiser. Image de Next.js exige un loader pour les
               * data URIs et la perf gain est nulle ici.
               */}
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
          <input type="hidden" name="avatar" value={avatarDataUri ?? ''} />
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
            defaultValue={initialDescription ?? ''}
            className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

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
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? '…' : copy.submit}
            </button>
          </div>
        </div>
      </form>

      {errorMessage !== null ? (
        <div
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          data-testid="identity-error"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      {success !== null ? (
        <div className="space-y-3 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm text-emerald-100" data-testid="identity-success">
            {copy.success}
          </p>
          <Link
            href={setupStepHref('summary')}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {copy.continueLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
