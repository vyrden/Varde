import type { ReactElement } from 'react';

/**
 * Sous-section « Limites techniques du module ». Bloc d'information
 * pure (pas d'interactivité) — caché derrière un `<details>` natif
 * pour rester très discret. À ne déployer qu'en cas de doute sur le
 * comportement du module.
 */
export function TechnicalLimitsSubsection(): ReactElement {
  return (
    <details className="rounded-md border border-border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer select-none font-medium text-muted-foreground">
        Limites techniques du module
      </summary>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          Contenu &gt; 1024 caractères → pièce jointe <code>.txt</code>.
        </li>
        <li>100 events bufferisés max par route cassée (bouton Rejouer pour vider).</li>
        <li>Rate-limit Discord appliqué automatiquement (50 msg/s/bot).</li>
      </ul>
    </details>
  );
}
