'use client';

import type { ReactElement } from 'react';
import { useActionState, useState } from 'react';

import type { AdminDiscordDto, AdminDiscordIntentsDto } from '../../lib/admin-api';
import {
  type AdminActionState,
  type RevealTokenState,
  revealAdminBotToken,
  submitAdminDiscordToken,
} from '../../lib/admin-discord-actions';

/**
 * Sous-bloc « Token bot » de `/admin/discord` (jalon 7 PR 7.2
 * sub-livrable 7c).
 *
 * Trois capacités :
 *
 * 1. **Révéler** le token actuel (`POST /admin/discord/reveal-token`).
 *    Bouton « Afficher » → demande explicite (`{ confirmation: true }`).
 *    Le résultat reste en mémoire client uniquement, jamais persisté.
 * 2. **Régénérer** : un champ texte apparaît, et le PUT /admin/discord/token
 *    valide via Discord puis persiste. Si l'app ID associé au nouveau
 *    token diffère, l'API renvoie `409 app_id_mismatch` ; un encart
 *    de confirmation s'affiche, l'admin re-soumet avec
 *    `confirmAppChange: true`.
 * 3. **Re-vérifier les intents** : actuellement, le payload `intents`
 *    vient d'un `GET /admin/discord` server-side. Pas de bouton
 *    explicite — l'admin recharge la page (la route ne cache pas).
 */

export interface AdminDiscordTokenFormCopy {
  readonly heading: string;
  readonly description: string;
  readonly currentLabel: string;
  readonly tokenAbsent: string;
  readonly revealButton: string;
  readonly hideButton: string;
  readonly rotateOpen: string;
  readonly rotateClose: string;
  readonly tokenLabel: string;
  readonly tokenPlaceholder: string;
  readonly submit: string;
  readonly intentsHeading: string;
  readonly intents: {
    readonly presence: string;
    readonly members: string;
    readonly messageContent: string;
  };
  readonly intentEnabled: string;
  readonly intentDisabled: string;
  readonly intentsUnknown: string;
  readonly appMismatchHeading: string;
  readonly appMismatchBody: string;
  readonly confirmRotation: string;
  readonly success: string;
  readonly errors: Readonly<Record<string, string>>;
}

const initialAction: AdminActionState<AdminDiscordDto> = { kind: 'idle' };
const initialReveal: RevealTokenState = { kind: 'idle' };

const intentRow = (
  label: string,
  enabled: boolean,
  copy: AdminDiscordTokenFormCopy,
): ReactElement => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-foreground">{label}</span>
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        enabled
          ? 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
      }`}
    >
      {enabled ? copy.intentEnabled : copy.intentDisabled}
    </span>
  </div>
);

export interface AdminDiscordTokenFormProps {
  readonly initial: AdminDiscordDto;
  readonly copy: AdminDiscordTokenFormCopy;
}

export function AdminDiscordTokenForm({
  initial: initialDiscord,
  copy,
}: AdminDiscordTokenFormProps): ReactElement {
  const [putState, putAction, putPending] = useActionState(submitAdminDiscordToken, initialAction);
  const [revealState, revealAction, revealPending] = useActionState(
    revealAdminBotToken,
    initialReveal,
  );

  const [showRotation, setShowRotation] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [pendingToken, setPendingToken] = useState('');

  const tokenLastFour =
    putState.kind === 'success' ? putState.data.tokenLastFour : initialDiscord.tokenLastFour;
  const intents: AdminDiscordIntentsDto | null =
    putState.kind === 'success' ? putState.data.intents : initialDiscord.intents;

  const errorMessage =
    putState.kind === 'error' ? (copy.errors[putState.code] ?? putState.message) : null;
  const isMismatch = putState.kind === 'error' && putState.code === 'app_id_mismatch';

  // À la première erreur app_id_mismatch, on capture le token saisi
  // pour pouvoir le ré-envoyer avec confirmAppChange:true sans
  // demander à l'admin de le retaper.
  if (isMismatch && !pendingConfirm) {
    setPendingConfirm(true);
  }

  return (
    <section
      className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
      aria-labelledby="admin-discord-token-heading"
    >
      <header className="mb-3">
        <h2 id="admin-discord-token-heading" className="text-base font-semibold text-foreground">
          {copy.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </header>

      <div className="space-y-4">
        <div className="rounded-md border border-border-muted bg-background px-3 py-2 font-mono text-sm">
          {revealState.kind === 'success' ? (
            <span data-testid="admin-discord-token-revealed">{revealState.token}</span>
          ) : tokenLastFour !== null ? (
            <span>
              {copy.currentLabel} : <span className="text-muted-foreground">••••••••</span>
              <span data-testid="admin-discord-token-last-four">{tokenLastFour}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{copy.tokenAbsent}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form action={revealAction}>
            <button
              type="submit"
              disabled={revealPending || tokenLastFour === null}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="admin-discord-reveal-token"
            >
              {revealState.kind === 'success' ? copy.hideButton : copy.revealButton}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setShowRotation((v) => !v)}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            {showRotation ? copy.rotateClose : copy.rotateOpen}
          </button>
        </div>

        {showRotation ? (
          <form
            action={putAction}
            className="space-y-3 rounded-md border border-border-muted bg-background p-4"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="admin-discord-token-input"
                className="block text-sm font-medium text-foreground"
              >
                {copy.tokenLabel}
              </label>
              <input
                id="admin-discord-token-input"
                name="token"
                type="password"
                autoComplete="off"
                value={pendingToken}
                onChange={(e) => {
                  setPendingToken(e.target.value);
                  setPendingConfirm(false);
                }}
                placeholder={copy.tokenPlaceholder}
                className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {isMismatch ? (
              <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <p className="font-semibold">{copy.appMismatchHeading}</p>
                <p>{copy.appMismatchBody}</p>
                <input type="hidden" name="confirmAppChange" value="true" />
              </div>
            ) : null}

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={putPending || pendingToken.length === 0}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="admin-discord-token-submit"
              >
                {putPending ? '…' : isMismatch ? copy.confirmRotation : copy.submit}
              </button>
            </div>

            {errorMessage !== null && !isMismatch ? (
              <div
                className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
                role="alert"
              >
                {errorMessage}
              </div>
            ) : null}
            {putState.kind === 'success' ? (
              <div
                className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
                role="status"
              >
                {copy.success}
              </div>
            ) : null}
          </form>
        ) : null}

        <div className="space-y-2 rounded-md border border-border-muted bg-background p-4">
          <h3 className="text-sm font-semibold text-foreground">{copy.intentsHeading}</h3>
          {intents !== null ? (
            <div className="space-y-1">
              {intentRow(copy.intents.presence, intents.presence, copy)}
              {intentRow(copy.intents.members, intents.members, copy)}
              {intentRow(copy.intents.messageContent, intents.messageContent, copy)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{copy.intentsUnknown}</p>
          )}
        </div>
      </div>
    </section>
  );
}
