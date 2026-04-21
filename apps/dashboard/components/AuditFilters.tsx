import { Button, cn, Input, Label } from '@varde/ui';
import Link from 'next/link';
import type { ReactElement } from 'react';

import type { AuditFilters as AuditFiltersValues } from '../lib/api-client';

export interface AuditFiltersProps {
  readonly guildId: string;
  readonly values: AuditFiltersValues;
  readonly knownActions: readonly string[];
}

/**
 * Barre de filtres de la page audit. Rendu comme un formulaire HTML
 * natif avec `method="get"` qui navigue vers la même page avec de
 * nouveaux query params. Avantages :
 * - pas de JS requis, la page est utilisable en server-rendered pur ;
 * - chaque soumission reset le cursor (on supprime le champ) pour
 *   éviter d'appliquer un cursor qui ne correspond plus aux filtres ;
 * - l'URL reflète l'état, donc copiable / partageable / bookmarkable.
 *
 * Le select `action` est peuplé à partir des actions déjà observées
 * sur la page courante (`knownActions`), plus un champ texte libre
 * si on veut filtrer sur une action pas encore rencontrée. Un vrai
 * endpoint `distinct actions` viendra post-V1 si le besoin monte.
 */
export function AuditFilters({ guildId, values, knownActions }: AuditFiltersProps): ReactElement {
  const selectClass = cn(
    'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );
  return (
    <form
      method="get"
      action={`/guilds/${guildId}/audit`}
      className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Filtres audit"
    >
      <div className="space-y-2">
        <Label htmlFor="filter-action">Action</Label>
        <Input
          id="filter-action"
          name="action"
          list="audit-action-suggestions"
          defaultValue={values.action ?? ''}
          placeholder="ex. core.config.updated"
        />
        <datalist id="audit-action-suggestions">
          {knownActions.map((action) => (
            <option key={action} value={action} />
          ))}
        </datalist>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-actor">Type d'acteur</Label>
        <select
          id="filter-actor"
          name="actorType"
          defaultValue={values.actorType ?? ''}
          className={selectClass}
        >
          <option value="">Tous</option>
          <option value="user">Utilisateur</option>
          <option value="system">Système</option>
          <option value="module">Module</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-severity">Sévérité</Label>
        <select
          id="filter-severity"
          name="severity"
          defaultValue={values.severity ?? ''}
          className={selectClass}
        >
          <option value="">Toutes</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-since">Depuis (ISO 8601)</Label>
        <Input
          id="filter-since"
          name="since"
          type="datetime-local"
          defaultValue={values.since ?? ''}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-until">Jusqu'à (ISO 8601)</Label>
        <Input
          id="filter-until"
          name="until"
          type="datetime-local"
          defaultValue={values.until ?? ''}
        />
      </div>

      <div className="flex items-end gap-2">
        <Button type="submit">Filtrer</Button>
        <Link
          href={`/guilds/${guildId}/audit`}
          className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Réinitialiser
        </Link>
      </div>
    </form>
  );
}
