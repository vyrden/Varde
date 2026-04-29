'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { useActionState } from 'react';

import { type SetupActionState, submitDiscordApp } from '../../lib/setup-actions';
import type { DiscordAppResponse } from '../../lib/setup-client';
import { setupStepHref } from '../../lib/setup-steps';

/**
 * Formulaire client de l'étape « Discord App » du wizard. Branche le
 * server action `submitDiscordApp` via `useActionState`, affiche le
 * nom de l'application détectée par Discord en cas de succès, et
 * surface les erreurs (Zod 400, 404 application introuvable, 502
 * Discord injoignable).
 */

export interface DiscordAppFormCopy {
  readonly appIdLabel: string;
  readonly appIdPlaceholder: string;
  readonly publicKeyLabel: string;
  readonly publicKeyPlaceholder: string;
  readonly submit: string;
  readonly continueLabel: string;
  readonly previous: string;
  readonly successPrefix: string;
  readonly errors: Readonly<Record<string, string>>;
}

const initial: SetupActionState<DiscordAppResponse> = { kind: 'idle' };

export function DiscordAppForm({ copy }: { readonly copy: DiscordAppFormCopy }): ReactElement {
  const [state, action, pending] = useActionState(submitDiscordApp, initial);
  const errorMessage = state.kind === 'error' ? (copy.errors[state.code] ?? state.message) : null;
  const success = state.kind === 'success' ? state.data : null;

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="discord-app-id" className="block text-sm font-medium text-foreground">
            {copy.appIdLabel}
          </label>
          <input
            id="discord-app-id"
            name="appId"
            type="text"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder={copy.appIdPlaceholder}
            className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="discord-public-key" className="block text-sm font-medium text-foreground">
            {copy.publicKeyLabel}
          </label>
          <input
            id="discord-public-key"
            name="publicKey"
            type="text"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder={copy.publicKeyPlaceholder}
            className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border-muted pt-4">
          <Link
            href={setupStepHref('system-check')}
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
      {errorMessage !== null ? (
        <div
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          data-testid="discord-app-error"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}
      {success !== null ? (
        <div className="space-y-3 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm text-emerald-100" data-testid="discord-app-success">
            {copy.successPrefix} <strong className="font-semibold">{success.appName}</strong>
          </p>
          <Link
            href={setupStepHref('bot-token')}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {copy.continueLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
