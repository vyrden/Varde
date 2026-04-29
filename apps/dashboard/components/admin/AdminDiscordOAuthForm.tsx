'use client';

import type { ReactElement } from 'react';
import { useActionState, useState } from 'react';

import type { AdminDiscordDto } from '../../lib/admin-api';
import { type AdminActionState, submitAdminDiscordOAuth } from '../../lib/admin-discord-actions';

/**
 * Sous-bloc « OAuth » de `/admin/discord` (jalon 7 PR 7.2
 * sub-livrable 7c). Modifie le Client Secret OAuth2 ; revalidé
 * via `client_credentials` côté API avant persistance.
 *
 * Avertissement explicite : la modification invalide les sessions
 * Auth.js actives — l'admin et les autres owners devront
 * re-loguer (mécanique câblée par sub-livrable 6).
 */

export interface AdminDiscordOAuthFormCopy {
  readonly heading: string;
  readonly description: string;
  readonly currentLabel: string;
  readonly secretAbsent: string;
  readonly editButton: string;
  readonly cancelButton: string;
  readonly secretLabel: string;
  readonly secretPlaceholder: string;
  readonly warning: string;
  readonly submit: string;
  readonly success: string;
  readonly errors: Readonly<Record<string, string>>;
}

const initial: AdminActionState<AdminDiscordDto> = { kind: 'idle' };

export interface AdminDiscordOAuthFormProps {
  readonly initial: AdminDiscordDto;
  readonly copy: AdminDiscordOAuthFormCopy;
}

export function AdminDiscordOAuthForm({
  initial: initialDiscord,
  copy,
}: AdminDiscordOAuthFormProps): ReactElement {
  const [state, action, pending] = useActionState(submitAdminDiscordOAuth, initial);
  const [editing, setEditing] = useState(false);
  const [secret, setSecret] = useState('');

  const errorMessage = state.kind === 'error' ? (copy.errors[state.code] ?? state.message) : null;

  return (
    <section
      className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
      aria-labelledby="admin-discord-oauth-heading"
    >
      <header className="mb-3">
        <h2 id="admin-discord-oauth-heading" className="text-base font-semibold text-foreground">
          {copy.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </header>

      <div className="space-y-4">
        <div className="rounded-md border border-border-muted bg-background px-3 py-2 text-sm">
          {initialDiscord.hasClientSecret ? (
            <span>
              {copy.currentLabel} :{' '}
              <span className="font-mono text-muted-foreground">••••••••••••</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{copy.secretAbsent}</span>
          )}
        </div>

        {!editing ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              {copy.editButton}
            </button>
          </div>
        ) : (
          <form
            action={action}
            className="space-y-3 rounded-md border border-border-muted bg-background p-4"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="admin-discord-oauth-secret"
                className="block text-sm font-medium text-foreground"
              >
                {copy.secretLabel}
              </label>
              <input
                id="admin-discord-oauth-secret"
                name="clientSecret"
                type="password"
                autoComplete="off"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={copy.secretPlaceholder}
                className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300">{copy.warning}</p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setSecret('');
                }}
                disabled={pending}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copy.cancelButton}
              </button>
              <button
                type="submit"
                disabled={pending || secret.length === 0}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="admin-discord-oauth-submit"
              >
                {pending ? '…' : copy.submit}
              </button>
            </div>

            {errorMessage !== null ? (
              <div
                className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
                role="alert"
              >
                {errorMessage}
              </div>
            ) : null}
            {state.kind === 'success' ? (
              <div
                className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
                role="status"
              >
                {copy.success}
              </div>
            ) : null}
          </form>
        )}
      </div>
    </section>
  );
}
