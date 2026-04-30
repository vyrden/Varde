'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { useActionState, useState } from 'react';

import { type SetupActionState, submitBotToken } from '../../lib/setup-actions';
import type { BotTokenResponse, PrivilegedIntentName } from '../../lib/setup-client';
import { setupStepHref } from '../../lib/setup-steps';
import { IntentsCheckList } from './IntentsCheckList';
import { SecretField } from './SecretField';

/**
 * Formulaire client de l'étape « Le Token du Bot et intents
 * privilégiés » du wizard.
 *
 * Workflow nominal (premier passage) :
 *
 * 1. L'admin colle son token depuis le portail Developer.
 * 2. On soumet à `POST /setup/bot-token` qui valide via Discord et
 *    renvoie `{ valid, botUser?, missingIntents? }`.
 * 3. Si `valid: false` → message ciblé « token refusé », pas
 *    d'avancement.
 * 4. Si `valid: true` → affichage du nom du bot + liste des 3
 *    intents privilégiés. Si l'un manque, le lien « Activer » pointe
 *    vers le portail. L'admin peut continuer même avec des intents
 *    manquants (certains modules tournent sans), avec un message
 *    explicite.
 *
 * **Persistance du token (PR 7.6 sub-livrable 4).** Quand le token
 * est déjà enregistré (retour en arrière dans le wizard), on n'affiche
 * pas l'input par défaut — le secret n'est jamais ré-affiché en clair,
 * même à l'admin qui l'a saisi. À la place, un encart « ✓ Token
 * enregistré » avec deux actions : « Continuer » (avance directement
 * à l'étape OAuth) et « Saisir un nouveau token » (révèle l'input
 * pour rotation).
 */

export interface BotTokenFormCopy {
  readonly tokenLabel: string;
  readonly tokenPlaceholder: string;
  readonly tokenHint: string;
  readonly secretShow: string;
  readonly secretHide: string;
  readonly submit: string;
  readonly continueLabel: string;
  readonly previous: string;
  readonly successPrefix: string;
  readonly invalidToken: string;
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
  /**
   * `true` quand le token est déjà persisté en DB (retour en arrière
   * dans le wizard). On affiche alors le banner « enregistré » plutôt
   * que l'input vide.
   */
  readonly tokenAlreadySaved?: boolean;
}

const initial: SetupActionState<BotTokenResponse> = { kind: 'idle' };

export function BotTokenForm({ copy, tokenAlreadySaved }: BotTokenFormProps): ReactElement {
  const [state, action, pending] = useActionState(submitBotToken, initial);
  const [isEditing, setIsEditing] = useState(!tokenAlreadySaved);

  const errorMessage = state.kind === 'error' ? (copy.errors[state.code] ?? state.message) : null;
  const validResult = state.kind === 'success' && state.data.valid ? state.data : null;
  const invalid = state.kind === 'success' && !state.data.valid;

  return (
    <div className="space-y-6">
      {!isEditing ? (
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
        <form action={action} className="space-y-4">
          <SecretField
            name="token"
            label={copy.tokenLabel}
            placeholder={copy.tokenPlaceholder}
            hint={copy.tokenHint}
            required
            showLabel={copy.secretShow}
            hideLabel={copy.secretHide}
          />
          <div className="flex items-center justify-between gap-3 border-t border-border-muted pt-4">
            <Link
              href={setupStepHref('discord-app')}
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
          data-testid="bot-token-error"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      {invalid ? (
        <div
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          data-testid="bot-token-invalid"
          role="alert"
        >
          {copy.invalidToken}
        </div>
      ) : null}

      {validResult !== null ? (
        <div className="space-y-4 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm text-emerald-100" data-testid="bot-token-success">
            {copy.successPrefix}{' '}
            <strong className="font-semibold">{validResult.botUser.username}</strong>
          </p>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
              {copy.intentsHeading}
            </h3>
            <IntentsCheckList
              missing={validResult.missingIntents}
              labels={copy.intentsLabels}
              enableLabel={copy.enableLabel}
              portalHref={copy.portalHref}
            />
            <p className="text-xs text-muted-foreground">
              {validResult.missingIntents.length === 0 ? copy.intentsAllOk : copy.intentsMissing}
            </p>
          </div>
          <Link
            href={setupStepHref('oauth')}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {copy.continueLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
