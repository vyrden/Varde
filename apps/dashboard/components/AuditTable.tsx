import { Badge, EmptyState } from '@varde/ui';
import type { ReactElement } from 'react';

import type { AuditLogItemDto, AuditSeverity } from '../lib/api-client';

export interface AuditTableProps {
  readonly items: readonly AuditLogItemDto[];
}

const severityVariant = (severity: AuditSeverity): 'secondary' | 'warning' | 'destructive' => {
  if (severity === 'warn') return 'warning';
  if (severity === 'error') return 'destructive';
  return 'secondary';
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').replace('Z', 'Z');
};

const describeActor = (item: AuditLogItemDto): string => {
  if (item.actorType === 'system') return 'système';
  if (item.actorType === 'module') return `module ${item.actorId ?? '?'}`;
  return `user ${item.actorId ?? '?'}`;
};

const summarizeMetadata = (metadata: Readonly<Record<string, unknown>>): string => {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return '—';
  const preview = entries
    .slice(0, 3)
    .map(([k, v]) => {
      const serialized = typeof v === 'string' ? v : JSON.stringify(v);
      const trimmed = serialized.length > 40 ? `${serialized.slice(0, 37)}…` : serialized;
      return `${k}: ${trimmed}`;
    })
    .join(', ');
  return entries.length > 3 ? `${preview}, …` : preview;
};

/**
 * Table d'affichage des lignes d'audit. Server component : pas
 * d'interaction — l'interactivité (filtres, pagination) est
 * orchestrée via l'URL par `AuditFilters` et les liens cursor côté
 * page. On privilégie une table sémantique (balise `<table>`) pour
 * l'accessibilité ; si le besoin émerge de copier ou trier côté
 * client, on montera une variante client plus tard.
 */
export function AuditTable({ items }: AuditTableProps): ReactElement {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Aucune entrée d'audit"
        description="Aucun événement ne correspond aux filtres actuels. Élargissez la plage de dates ou réinitialisez."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Date
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Acteur
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Action
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Sévérité
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Détails
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-border align-top">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                {formatDate(item.createdAt)}
              </td>
              <td className="px-3 py-2">{describeActor(item)}</td>
              <td className="px-3 py-2 font-mono text-xs">{item.action}</td>
              <td className="px-3 py-2">
                <Badge variant={severityVariant(item.severity)}>{item.severity}</Badge>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {summarizeMetadata(item.metadata)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
