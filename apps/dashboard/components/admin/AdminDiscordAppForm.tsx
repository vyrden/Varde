'use client';

import type { ReactElement } from 'react';
import { useActionState, useState } from 'react';

import type { AdminDiscordDto } from '../../lib/admin-api';
import { type AdminActionState, submitAdminDiscordApp } from '../../lib/admin-discord-actions';

/**
 * Sous-bloc « Application Discord » de `/admin/discord` (jalon 7
 * PR 7.2 sub-livrable 7c).
 *
 * Modifie l'App ID et la Public Key Ed25519. L'API
 * `PUT /admin/discord/app` revalide via le RPC public Discord
 * (`/applications/{id}/rpc`) avant persistance — un échec ne
 * touche pas la DB.
 */

export interface AdminDiscordAppFormCopy {
  readonly heading: string;
  readonly description: string;
  readonly appIdLabel: string;
  readonly appIdPlaceholder: string;
  readonly publicKeyLabel: string;
  readonly publicKeyPlaceholder: string;
  readonly submit: string;
  readonly success: string;
  readonly errors: Readonly<Record<string, string>>;
}

const initial: AdminActionState<AdminDiscordDto> = { kind: 'idle' };

export interface AdminDiscordAppFormProps {
  readonly initial: AdminDiscordDto;
  readonly copy: AdminDiscordAppFormCopy;
}

export function AdminDiscordAppForm({
  initial: initialDiscord,
  copy,
}: AdminDiscordAppFormProps): ReactElement {
  const [state, action, pending] = useActionState(submitAdminDiscordApp, initial);
  const [appId, setAppId] = useState(initialDiscord.appId ?? '');
  const [publicKey, setPublicKey] = useState(initialDiscord.publicKey ?? '');

  const errorMessage = state.kind === 'error' ? (copy.errors[state.code] ?? state.message) : null;

  return (
    <section
      className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
      aria-labelledby="admin-discord-app-heading"
    >
      <header className="mb-3">
        <h2 id="admin-discord-app-heading" className="text-base font-semibold text-foreground">
          {copy.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </header>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="admin-discord-app-id"
            className="block text-sm font-medium text-foreground"
          >
            {copy.appIdLabel}
          </label>
          <input
            id="admin-discord-app-id"
            name="appId"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder={copy.appIdPlaceholder}
            inputMode="numeric"
            className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="admin-discord-public-key"
            className="block text-sm font-medium text-foreground"
          >
            {copy.publicKeyLabel}
          </label>
          <input
            id="admin-discord-public-key"
            name="publicKey"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder={copy.publicKeyPlaceholder}
            className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="admin-discord-app-submit"
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
    </section>
  );
}
