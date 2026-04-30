'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import { type SetupActionState, submitOAuth } from '../../lib/setup-actions';
import type { OAuthResponse } from '../../lib/setup-client';
import { setupStepHref } from '../../lib/setup-steps';
import { useDebounced } from '../../lib/use-debounced';
import { SecretField } from './SecretField';

/**
 * Formulaire client de l'étape « OAuth » du wizard, refondu en
 * auto-validation + auto-save (jalon 7 PR 7.7).
 *
 * Comportement identique à `BotTokenForm` mais pour la clé secrète
 * OAuth — voir le bloc-doc de `BotTokenForm` pour la sémantique.
 * Quand le format est correct, l'API valide auprès de Discord via
 * un échange `client_credentials` et persiste le secret en DB
 * chiffrée si OK.
 */

const SECRET_MIN_LENGTH = 30;
const SECRET_FORMAT_REGEX = new RegExp(`^\\S{${SECRET_MIN_LENGTH},}$`, 'u');

export interface OAuthFormCopy {
  readonly secretLabel: string;
  readonly secretPlaceholder: string;
  readonly secretHint: string;
  readonly secretFormatError: string;
  readonly secretShow: string;
  readonly secretHide: string;
  readonly continueLabel: string;
  readonly previous: string;
  readonly success: string;
  readonly invalidSecret: string;
  readonly validating: string;
  readonly savedBannerLabel: string;
  readonly savedBannerEdit: string;
  readonly savedBannerKeep: string;
  readonly errors: Readonly<Record<string, string>>;
}

export interface OAuthFormProps {
  readonly copy: OAuthFormCopy;
  readonly secretAlreadySaved?: boolean;
}

type ValidationState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'validating' }
  | { readonly kind: 'valid' }
  | { readonly kind: 'invalid'; readonly code: string; readonly message: string };

export function OAuthForm({ copy, secretAlreadySaved }: OAuthFormProps): ReactElement {
  const [isEditing, setIsEditing] = useState(!secretAlreadySaved);
  const [secret, setSecret] = useState('');
  const debouncedSecret = useDebounced(secret, 500);

  const [validation, setValidation] = useState<ValidationState>({ kind: 'idle' });
  const lastValidatedRef = useRef<string>('');

  useEffect(() => {
    if (!isEditing) return;
    if (debouncedSecret === lastValidatedRef.current) return;
    if (debouncedSecret.length === 0) {
      setValidation({ kind: 'idle' });
      return;
    }
    if (!SECRET_FORMAT_REGEX.test(debouncedSecret)) {
      setValidation({ kind: 'idle' });
      return;
    }
    setValidation({ kind: 'validating' });
    let cancelled = false;
    void (async () => {
      const formData = new FormData();
      formData.append('clientSecret', debouncedSecret);
      const result: SetupActionState<OAuthResponse> = await submitOAuth({ kind: 'idle' }, formData);
      if (cancelled) return;
      lastValidatedRef.current = debouncedSecret;
      if (result.kind === 'success') {
        if (result.data.valid) {
          setValidation({ kind: 'valid' });
        } else {
          setValidation({
            kind: 'invalid',
            code: 'invalid_secret',
            message: copy.invalidSecret,
          });
        }
      } else if (result.kind === 'error') {
        setValidation({ kind: 'invalid', code: result.code, message: result.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSecret, isEditing, copy.invalidSecret]);

  const formatStatus: 'neutral' | 'ko' =
    secret.length === 0 ? 'neutral' : SECRET_FORMAT_REGEX.test(secret) ? 'neutral' : 'ko';

  const errorMessage =
    validation.kind === 'invalid'
      ? validation.code === 'invalid_secret'
        ? copy.invalidSecret
        : (copy.errors[validation.code] ?? validation.message)
      : null;

  const canContinue = (!isEditing && secretAlreadySaved) || validation.kind === 'valid';

  return (
    <div className="space-y-6">
      {!isEditing && secretAlreadySaved ? (
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
        <>
          <SecretField
            name="clientSecret"
            label={copy.secretLabel}
            placeholder={copy.secretPlaceholder}
            hint={copy.secretHint}
            showLabel={copy.secretShow}
            hideLabel={copy.secretHide}
            onChange={(e) => setSecret(e.target.value)}
          />
          {formatStatus === 'ko' ? (
            <p className="text-xs text-rose-400" data-testid="oauth-format-error" role="alert">
              {copy.secretFormatError}
            </p>
          ) : null}

          {validation.kind === 'validating' ? (
            <p
              className="rounded-md border border-border-muted bg-card-muted/40 px-3 py-2 text-sm text-muted-foreground"
              data-testid="oauth-validating"
              role="status"
            >
              {copy.validating}
            </p>
          ) : null}

          {validation.kind === 'valid' ? (
            <p
              className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
              data-testid="oauth-success"
              role="status"
            >
              {copy.success}
            </p>
          ) : null}

          {errorMessage !== null ? (
            <p
              className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
              data-testid="oauth-error"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-border-muted pt-4">
            <Link
              href={setupStepHref('bot-token')}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copy.previous}
            </Link>
            {canContinue ? (
              <Link
                href={setupStepHref('identity')}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="oauth-continue"
              >
                {copy.continueLabel}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-md bg-primary/40 px-5 text-sm font-medium text-primary-foreground opacity-60"
                data-testid="oauth-continue-disabled"
              >
                {copy.continueLabel}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
