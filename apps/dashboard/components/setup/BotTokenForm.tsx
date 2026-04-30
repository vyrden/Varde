'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import { type SetupActionState, submitBotToken } from '../../lib/setup-actions';
import type { BotTokenResponse, PrivilegedIntentName } from '../../lib/setup-client';
import { setupStepHref } from '../../lib/setup-steps';
import { useDebounced } from '../../lib/use-debounced';
import { IntentsCheckList } from './IntentsCheckList';
import { SecretField } from './SecretField';

/**
 * Formulaire client de l'étape « Le Token du Bot et intents
 * privilégiés » du wizard, refondu en auto-validation + auto-save
 * (jalon 7 PR 7.7).
 *
 * Comportement :
 *
 * - **Token déjà persisté (`tokenAlreadySaved=true`).** Affiche un
 *   banner « ✓ Token enregistré » + boutons Précédent / Modifier /
 *   Continuer. Cliquer Modifier révèle l'input vide pour rotation.
 * - **Saisie du token.** Format check inline (longueur min). Quand
 *   le format est OK, après 500 ms d'inactivité, on appelle
 *   automatiquement `POST /setup/bot-token`. L'API valide via Discord
 *   et persiste si OK.
 * - **Pendant l'appel** : bandeau « Validation auprès de Discord… ».
 * - **Sur succès** : nom du bot détecté + checklist des intents
 *   privilégiés (avec lien « Activer dans le portail » pour ceux qui
 *   manquent) + bouton Continuer activé.
 * - **Sur échec** (token refusé) : bandeau rouge avec lien vers le
 *   portail pour re-générer un token.
 */

const TOKEN_MIN_LENGTH = 30;
const TOKEN_FORMAT_REGEX = new RegExp(`^\\S{${TOKEN_MIN_LENGTH},}$`, 'u');

export interface BotTokenFormCopy {
  readonly tokenLabel: string;
  readonly tokenPlaceholder: string;
  readonly tokenHint: string;
  readonly tokenFormatError: string;
  readonly secretShow: string;
  readonly secretHide: string;
  readonly continueLabel: string;
  readonly previous: string;
  readonly successPrefix: string;
  readonly invalidToken: string;
  readonly validating: string;
  readonly intentsHeading: string;
  readonly intentsAllOk: string;
  readonly intentsMissing: string;
  readonly intentsLabels: Readonly<Record<PrivilegedIntentName, string>>;
  readonly enableLabel: string;
  readonly portalHref: string;
  readonly savedBannerLabel: string;
  readonly savedBannerEdit: string;
  readonly savedBannerKeep: string;
  readonly errors: Readonly<Record<string, string>>;
}

export interface BotTokenFormProps {
  readonly copy: BotTokenFormCopy;
  readonly tokenAlreadySaved?: boolean;
}

type ValidationState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'validating' }
  | {
      readonly kind: 'valid';
      readonly botUser: { username: string };
      readonly missingIntents: readonly PrivilegedIntentName[];
    }
  | { readonly kind: 'invalid'; readonly code: string; readonly message: string };

export function BotTokenForm({ copy, tokenAlreadySaved }: BotTokenFormProps): ReactElement {
  const [isEditing, setIsEditing] = useState(!tokenAlreadySaved);
  const [token, setToken] = useState('');
  const debouncedToken = useDebounced(token, 500);

  const [validation, setValidation] = useState<ValidationState>({ kind: 'idle' });
  const lastValidatedRef = useRef<string>('');

  useEffect(() => {
    if (!isEditing) return;
    if (debouncedToken === lastValidatedRef.current) return;
    if (debouncedToken.length === 0) {
      setValidation({ kind: 'idle' });
      return;
    }
    if (!TOKEN_FORMAT_REGEX.test(debouncedToken)) {
      setValidation({ kind: 'idle' });
      return;
    }
    setValidation({ kind: 'validating' });
    let cancelled = false;
    void (async () => {
      const formData = new FormData();
      formData.append('token', debouncedToken);
      const result: SetupActionState<BotTokenResponse> = await submitBotToken(
        { kind: 'idle' },
        formData,
      );
      if (cancelled) return;
      lastValidatedRef.current = debouncedToken;
      if (result.kind === 'success') {
        if (result.data.valid) {
          setValidation({
            kind: 'valid',
            botUser: { username: result.data.botUser.username },
            missingIntents: result.data.missingIntents,
          });
        } else {
          setValidation({ kind: 'invalid', code: 'invalid_token', message: copy.invalidToken });
        }
      } else if (result.kind === 'error') {
        setValidation({ kind: 'invalid', code: result.code, message: result.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedToken, isEditing, copy.invalidToken]);

  const tokenFormatStatus: 'neutral' | 'ko' =
    token.length === 0 ? 'neutral' : TOKEN_FORMAT_REGEX.test(token) ? 'neutral' : 'ko';

  const errorMessage =
    validation.kind === 'invalid'
      ? validation.code === 'invalid_token'
        ? copy.invalidToken
        : (copy.errors[validation.code] ?? validation.message)
      : null;

  // Continuer accessible si :
  // - Token déjà persisté ET utilisateur n'a pas cliqué Modifier (banner mode)
  // - Modification en cours et validation Discord OK
  const canContinue = (!isEditing && tokenAlreadySaved) || validation.kind === 'valid';

  return (
    <div className="space-y-6">
      {!isEditing && tokenAlreadySaved ? (
        <div
          className="space-y-3 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3"
          data-testid="bot-token-saved-banner"
        >
          <p className="flex items-center gap-2 text-sm text-emerald-100">
            <span aria-hidden="true">✓</span>
            <span>{copy.savedBannerLabel}</span>
          </p>
          <div className="flex flex-wrap items-center gap-3 border-t border-emerald-500/30 pt-3">
            <Link
              href={setupStepHref('discord-app')}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copy.previous}
            </Link>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="bot-token-edit-button"
            >
              {copy.savedBannerEdit}
            </button>
            <Link
              href={setupStepHref('oauth')}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              data-testid="bot-token-keep-button"
            >
              {copy.savedBannerKeep}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <SecretField
            name="token"
            label={copy.tokenLabel}
            placeholder={copy.tokenPlaceholder}
            hint={copy.tokenHint}
            showLabel={copy.secretShow}
            hideLabel={copy.secretHide}
            onChange={(e) => setToken(e.target.value)}
          />
          {tokenFormatStatus === 'ko' ? (
            <p className="text-xs text-rose-400" data-testid="bot-token-format-error" role="alert">
              {copy.tokenFormatError}
            </p>
          ) : null}

          {validation.kind === 'validating' ? (
            <p
              className="rounded-md border border-border-muted bg-card-muted/40 px-3 py-2 text-sm text-muted-foreground"
              data-testid="bot-token-validating"
              role="status"
            >
              {copy.validating}
            </p>
          ) : null}

          {validation.kind === 'valid' ? (
            <div className="space-y-4 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3">
              <p className="text-sm text-emerald-100" data-testid="bot-token-success">
                {copy.successPrefix}{' '}
                <strong className="font-semibold">{validation.botUser.username}</strong>
              </p>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  {copy.intentsHeading}
                </h3>
                <IntentsCheckList
                  missing={validation.missingIntents}
                  labels={copy.intentsLabels}
                  enableLabel={copy.enableLabel}
                  portalHref={copy.portalHref}
                />
                <p className="text-xs text-muted-foreground">
                  {validation.missingIntents.length === 0 ? copy.intentsAllOk : copy.intentsMissing}
                </p>
              </div>
            </div>
          ) : null}

          {errorMessage !== null ? (
            <p
              className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
              data-testid="bot-token-error"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-border-muted pt-4">
            <Link
              href={setupStepHref('discord-app')}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copy.previous}
            </Link>
            {canContinue ? (
              <Link
                href={setupStepHref('oauth')}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="bot-token-continue"
              >
                {copy.continueLabel}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-md bg-primary/40 px-5 text-sm font-medium text-primary-foreground opacity-60"
                data-testid="bot-token-continue-disabled"
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
