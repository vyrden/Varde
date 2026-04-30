'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { useActionState, useState } from 'react';

import { type SetupActionState, submitOAuth } from '../../lib/setup-actions';
import type { OAuthResponse } from '../../lib/setup-client';
import { setupStepHref } from '../../lib/setup-steps';
import { SecretField } from './SecretField';

/**
 * Formulaire client de l'étape « OAuth » du wizard. Soumet la clé
 * secrète à `POST /setup/oauth`, qui valide via un échange
 * `client_credentials` côté Discord. L'API distingue secret invalide
 * (`valid: false, reason: 'invalid_secret'`) d'une vraie erreur HTTP
 * — l'UI surface chacun de manière distincte.
 *
 * **Persistance (PR 7.6 sub-livrable 4).** Quand la clé secrète est
 * déjà persistée (retour en arrière dans le wizard), on n'affiche
 * pas l'input par défaut. À la place, un encart « ✓ Clé secrète
 * enregistrée » avec « Continuer » et « Saisir une nouvelle clé ».
 * Voir BotTokenForm pour la même UX appliquée au token bot.
 */

export interface OAuthFormCopy {
  readonly secretLabel: string;
  readonly secretPlaceholder: string;
  readonly secretHint: string;
  readonly secretShow: string;
  readonly secretHide: string;
  readonly submit: string;
  readonly continueLabel: string;
  readonly previous: string;
  readonly success: string;
  readonly invalidSecret: string;
  readonly savedBannerLabel: string;
  readonly savedBannerEdit: string;
  readonly savedBannerKeep: string;
  readonly errors: Readonly<Record<string, string>>;
}

export interface OAuthFormProps {
  readonly copy: OAuthFormCopy;
  /**
   * `true` quand la clé secrète OAuth est déjà persistée en DB
   * (retour en arrière dans le wizard).
   */
  readonly secretAlreadySaved?: boolean;
}

const initial: SetupActionState<OAuthResponse> = { kind: 'idle' };

export function OAuthForm({ copy, secretAlreadySaved }: OAuthFormProps): ReactElement {
  const [state, action, pending] = useActionState(submitOAuth, initial);
  const [isEditing, setIsEditing] = useState(!secretAlreadySaved);
  const errorMessage = state.kind === 'error' ? (copy.errors[state.code] ?? state.message) : null;
  const valid = state.kind === 'success' && state.data.valid;
  const invalid = state.kind === 'success' && !state.data.valid;

  return (
    <div className="space-y-6">
      {!isEditing ? (
        <div
          className="space-y-3 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3"
          data-testid="oauth-saved-banner"
        >
          <p className="flex items-center gap-2 text-sm text-emerald-100">
            <span aria-hidden="true">✓</span>
            <span>{copy.savedBannerLabel}</span>
          </p>
          <div className="flex flex-wrap items-center gap-3 border-t border-emerald-500/30 pt-3">
            <Link
              href={setupStepHref('bot-token')}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copy.previous}
            </Link>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="oauth-edit-button"
            >
              {copy.savedBannerEdit}
            </button>
            <Link
              href={setupStepHref('identity')}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              data-testid="oauth-keep-button"
            >
              {copy.savedBannerKeep}
            </Link>
          </div>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <SecretField
            name="clientSecret"
            label={copy.secretLabel}
            placeholder={copy.secretPlaceholder}
            hint={copy.secretHint}
            required
            showLabel={copy.secretShow}
            hideLabel={copy.secretHide}
          />
          <div className="flex items-center justify-between gap-3 border-t border-border-muted pt-4">
            <Link
              href={setupStepHref('bot-token')}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copy.previous}
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? '…' : copy.submit}
            </button>
          </div>
        </form>
      )}

      {errorMessage !== null ? (
        <div
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          data-testid="oauth-error"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      {invalid ? (
        <div
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          data-testid="oauth-invalid"
          role="alert"
        >
          {copy.invalidSecret}
        </div>
      ) : null}

      {valid ? (
        <div className="space-y-3 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm text-emerald-100" data-testid="oauth-success">
            {copy.success}
          </p>
          <Link
            href={setupStepHref('identity')}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {copy.continueLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
