import type { ReactElement, ReactNode } from 'react';

/**
 * Conteneur d'une étape du wizard. Pose le titre, le sous-titre, le
 * contenu (formulaire / liste de vérifs / récap) et le couple de
 * boutons d'action « Précédent / Suivant » en bas. Tient autant pour
 * les étapes purement informatives (welcome) que pour celles qui
 * appellent l'API (system-check et au-delà).
 *
 * Les actions sont volontairement passées en `ReactNode` plutôt
 * qu'en pré-construites (`primaryHref` etc.) : selon l'étape on
 * branche un Link de navigation simple, un bouton de submit
 * client-side, ou un formulaire avec server action. Le composant
 * n'a pas à connaître le mécanisme.
 */

export interface SetupStepProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Contenu principal — formulaire, liste, paragraphes. */
  readonly children?: ReactNode;
  /** Action principale (typiquement « Continuer »), placée à droite. */
  readonly primaryAction?: ReactNode;
  /** Action secondaire (typiquement « Précédent »), placée à gauche. */
  readonly secondaryAction?: ReactNode;
}

export function SetupStep({
  title,
  description,
  children,
  primaryAction,
  secondaryAction,
}: SetupStepProps): ReactElement {
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold leading-tight text-foreground">{title}</h1>
        {description !== undefined ? (
          <div className="text-base text-muted-foreground">{description}</div>
        ) : null}
      </header>
      {children !== undefined ? <section className="space-y-4">{children}</section> : null}
      {primaryAction !== undefined || secondaryAction !== undefined ? (
        <footer className="flex items-center justify-between border-t border-border-muted pt-6">
          <div>{secondaryAction}</div>
          <div>{primaryAction}</div>
        </footer>
      ) : null}
    </article>
  );
}
