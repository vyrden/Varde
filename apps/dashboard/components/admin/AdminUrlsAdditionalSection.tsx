'use client';

import type { ReactElement } from 'react';
import { useActionState, useState } from 'react';

import type { AdminAdditionalUrlDto, AdminUrlsDto } from '../../lib/admin-api';
import { type AdminActionState, addAdminUrl, removeAdminUrl } from '../../lib/admin-urls-actions';

/**
 * Sous-bloc « URLs additionnelles » de `/admin/urls` (jalon 7
 * PR 7.2 sub-livrable 7d). Liste avec ajout (URL + label optionnel)
 * et suppression. Chaque entrée a un id généré côté serveur (UUID).
 *
 * Layout simple : une `<ul>` listée + un formulaire d'ajout en
 * bas. Pas de modale : la suppression est un POST direct (l'admin
 * est seul concerné, on n'ajoute pas de confirm pour cette action
 * non-destructive — la liste se rebuild immédiatement).
 */

export interface AdminUrlsAdditionalCopy {
  readonly heading: string;
  readonly description: string;
  readonly empty: string;
  readonly removeButton: string;
  readonly addHeading: string;
  readonly urlLabel: string;
  readonly urlPlaceholder: string;
  readonly labelLabel: string;
  readonly labelPlaceholder: string;
  readonly submit: string;
  readonly errors: Readonly<Record<string, string>>;
}

const initialAdd: AdminActionState<AdminUrlsDto> = { kind: 'idle' };
const initialRemove: AdminActionState<AdminUrlsDto> = { kind: 'idle' };

export interface AdminUrlsAdditionalSectionProps {
  readonly initial: AdminUrlsDto;
  readonly copy: AdminUrlsAdditionalCopy;
}

export function AdminUrlsAdditionalSection({
  initial: initialUrls,
  copy,
}: AdminUrlsAdditionalSectionProps): ReactElement {
  const [addState, addAction, addPending] = useActionState(addAdminUrl, initialAdd);
  const [removeState, removeAction, removePending] = useActionState(removeAdminUrl, initialRemove);

  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  // Snapshot effectif après mutation : on prend le résultat de
  // la dernière action (add ou remove), sinon le payload server.
  const additionalUrls: readonly AdminAdditionalUrlDto[] =
    removeState.kind === 'success'
      ? removeState.data.additionalUrls
      : addState.kind === 'success'
        ? addState.data.additionalUrls
        : initialUrls.additionalUrls;

  const errorState =
    removeState.kind === 'error' ? removeState : addState.kind === 'error' ? addState : null;
  const errorMessage =
    errorState !== null ? (copy.errors[errorState.code] ?? errorState.message) : null;

  return (
    <section
      className="rounded-lg border border-border-muted bg-card p-5 shadow-sm"
      aria-labelledby="admin-urls-additional-heading"
    >
      <header className="mb-3">
        <h2 id="admin-urls-additional-heading" className="text-base font-semibold text-foreground">
          {copy.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </header>

      <div className="space-y-4">
        {additionalUrls.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="admin-urls-additional-empty">
            {copy.empty}
          </p>
        ) : (
          <ul className="divide-y divide-border-muted rounded-md border border-border-muted">
            {additionalUrls.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                data-testid={`admin-urls-additional-item-${entry.id}`}
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm text-foreground break-all">{entry.url}</p>
                  {entry.label ? (
                    <p className="text-xs text-muted-foreground">{entry.label}</p>
                  ) : null}
                </div>
                <form action={removeAction}>
                  <input type="hidden" name="id" value={entry.id} />
                  <button
                    type="submit"
                    disabled={removePending}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-rose-500/40 px-3 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid={`admin-urls-remove-${entry.id}`}
                  >
                    {copy.removeButton}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form
          action={addAction}
          className="space-y-3 rounded-md border border-border-muted bg-background p-4"
        >
          <h3 className="text-sm font-semibold text-foreground">{copy.addHeading}</h3>
          <div className="space-y-1.5">
            <label
              htmlFor="admin-urls-add-url"
              className="block text-sm font-medium text-foreground"
            >
              {copy.urlLabel}
            </label>
            <input
              id="admin-urls-add-url"
              name="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={copy.urlPlaceholder}
              data-testid="admin-urls-add-url-input"
              className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="admin-urls-add-label"
              className="block text-sm font-medium text-foreground"
            >
              {copy.labelLabel}
            </label>
            <input
              id="admin-urls-add-label"
              name="label"
              type="text"
              maxLength={80}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={copy.labelPlaceholder}
              data-testid="admin-urls-add-label-input"
              className="block w-full rounded-md border border-border-muted bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={addPending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="admin-urls-add-submit"
            >
              {addPending ? '…' : copy.submit}
            </button>
          </div>
        </form>

        {errorMessage !== null ? (
          <div
            className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}
      </div>
    </section>
  );
}
