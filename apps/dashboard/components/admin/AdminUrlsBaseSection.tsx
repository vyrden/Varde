'use client';

import type { ReactElement } from 'react';
import { useActionState, useState } from 'react';

import type { AdminUrlsDto } from '../../lib/admin-api';
import { type AdminActionState, submitAdminBaseUrl } from '../../lib/admin-urls-actions';

/**
 * Sous-bloc « URL principale » de `/admin/urls` (jalon 7 PR 7.2
 * sub-livrable 7d). Affiche la valeur courante et permet de la
 * remplacer. Avertissement explicite : la modification impacte
 * tous les liens du bot et invalide les sessions actives sur les
 * autres origines.
 */

export interface AdminUrlsBaseCopy {
  readonly heading: string;
  readonly description: string;
  readonly currentLabel: string;
  readonly notSet: string;
  readonly editButton: string;
  readonly cancelButton: string;
  readonly inputLabel: string;
  readonly inputPlaceholder: string;
  readonly warning: string;
  readonly submit: string;
  readonly success: string;
  readonly errors: Readonly<Record<string, string>>;
}

const initial: AdminActionState<AdminUrlsDto> = { kind: 'idle' };

export interface AdminUrlsBaseSectionProps {
  readonly initial: AdminUrlsDto;
  readonly copy: AdminUrlsBaseCopy;
}

export function AdminUrlsBaseSection({
  initial: initialUrls,
  copy,
}: AdminUrlsBaseSectionProps): ReactElement {
  const [state, action, pending] = useActionState(submitAdminBaseUrl, initial);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialUrls.baseUrl ?? '');

  const currentBase = state.kind === 'success' ? state.data.baseUrl : initialUrls.baseUrl;
  const errorMessage = state.kind === 'error' ? (copy.errors[state.code] ?? state.message) : null;

  return (
    <section
      className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
      aria-labelledby="admin-urls-base-heading"
    >
      <header className="mb-3">
        <h2 id="admin-urls-base-heading" className="text-base font-semibold text-foreground">
          {copy.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </header>

      <div className="space-y-4">
        <div className="rounded-md border border-border-muted bg-background px-3 py-2 font-mono text-sm">
          {currentBase !== null ? (
            <span data-testid="admin-urls-base-current">{currentBase}</span>
          ) : (
            <span className="text-muted-foreground">{copy.notSet}</span>
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
                htmlFor="admin-urls-base-input"
                className="block text-sm font-medium text-foreground"
              >
                {copy.inputLabel}
              </label>
              <input
                id="admin-urls-base-input"
                name="baseUrl"
                type="url"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={copy.inputPlaceholder}
                className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300">{copy.warning}</p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setValue(currentBase ?? '');
                }}
                disabled={pending}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copy.cancelButton}
              </button>
              <button
                type="submit"
                disabled={pending || value.length === 0}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="admin-urls-base-submit"
              >
                {pending ? '…' : copy.submit}
              </button>
            </div>
          </form>
        )}

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
      </div>
    </section>
  );
}
