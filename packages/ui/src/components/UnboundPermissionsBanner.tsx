import type { ReactElement } from 'react';

/**
 * Bandeau informatif (ADR 0008) : affiche "N permissions non liées"
 * quand un module est activé mais que certaines de ses permissions
 * applicatives n'ont pas de `permission_bindings` posé sur la guild.
 *
 * Le bandeau est non-fermable (pas de bouton "ignorer") — l'intention
 * est que l'admin voie un état inopérant jusqu'à résolution.
 *
 * Réutilisable par tous les modules officiels et tiers.
 */

export interface UnboundPermission {
  readonly id: string;
  readonly description: string;
}

export interface UnboundPermissionsBannerProps {
  readonly permissions: readonly UnboundPermission[];
  readonly configureHref: string;
}

export function UnboundPermissionsBanner({
  permissions,
  configureHref,
}: UnboundPermissionsBannerProps): ReactElement | null {
  if (permissions.length === 0) return null;

  const singular = permissions.length === 1;
  const title = singular ? '1 permission non liée' : `${permissions.length} permissions non liées`;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm">
            Ce module a déclaré des permissions qui ne sont associées à aucun rôle. Les actions
            correspondantes seront refusées tant qu'un rôle n'aura pas été choisi.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {permissions.map((perm) => (
              <li key={perm.id}>
                <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">{perm.id}</code>
                {' — '}
                {perm.description}
              </li>
            ))}
          </ul>
        </div>
        <a
          href={configureHref}
          className="shrink-0 rounded-md bg-amber-900 px-3 py-2 text-sm font-medium text-amber-50 hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        >
          Configurer →
        </a>
      </div>
    </div>
  );
}
