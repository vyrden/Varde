import { Badge } from '@varde/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import { ModuleEnabledToggle } from '../ModuleEnabledToggle';
import { PinButton } from '../modules-grid/PinButton';
import { moduleIcon } from '../shell/module-icons';

/**
 * En-tête commun aux pages de configuration de modules (jalon 7 PR
 * 7.4.8). Pose une présentation cohérente que tous les modules
 * peuvent réutiliser quel que soit leur formulaire interne :
 *
 * - Breadcrumb : `Modules › <NomDuModule>`. Lien retour explicite
 *   vers la grille `/guilds/[id]/modules` (PR 7.4.7).
 * - Icône module + nom + badge actif/inactif sémantique.
 * - Description courte (shortDescription si présente, sinon
 *   description longue).
 * - Actions à droite : bouton pin (toggle épingle, optimistic) +
 *   toggle on/off (réutilise `ModuleEnabledToggle`).
 *
 * Le bouton « Documentation » prévu dans la spec PR 7.4 §10 n'est
 * pas livré ici — il nécessite l'extension du manifeste avec un
 * champ `documentationUrl`, sujet de PR à part. À ajouter quand le
 * champ sera défini.
 *
 * Composant client : le PinButton et le ModuleEnabledToggle ont
 * leur propre état local optimistic. La page parent reste server
 * component.
 */

export interface ModuleConfigHeaderProps {
  readonly guildId: string;
  readonly module: {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly shortDescription: string | null;
    readonly enabled: boolean;
    readonly isPinned: boolean;
  };
  /**
   * Callback pour remonter une erreur du PinButton (max 8 dépassé,
   * etc.). Le composant parent peut afficher un toast. Si omis,
   * les erreurs restent silencieuses.
   */
  readonly onPinError?: (code: string, message: string) => void;
}

export function ModuleConfigHeader({
  guildId,
  module,
  onPinError,
}: ModuleConfigHeaderProps): ReactElement {
  const t = useTranslations('moduleConfig.header');
  const subtitle = module.shortDescription ?? module.description;

  return (
    <header className="border-b border-border bg-surface px-6 py-5">
      <nav aria-label={t('breadcrumbLabel')} className="mb-3 text-xs">
        <ol className="flex items-center gap-1.5 text-muted-foreground">
          <li>
            <Link
              href={`/guilds/${guildId}/modules`}
              className="hover:text-foreground hover:underline"
            >
              {t('breadcrumbModules')}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li className="font-medium text-foreground">{module.name}</li>
        </ol>
      </nav>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={`flex size-12 shrink-0 items-center justify-center rounded-lg ${
              module.enabled
                ? 'bg-primary/15 text-primary'
                : 'bg-bg-surface-3 text-muted-foreground'
            }`}
          >
            {moduleIcon(module.id, 22)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
                {module.name}
              </h1>
              <Badge variant={module.enabled ? 'active' : 'inactive'}>
                {module.enabled ? t('badgeActive') : t('badgeInactive')}
              </Badge>
              <span className="text-xs font-mono text-muted-foreground">v{module.version}</span>
            </div>
            {subtitle.length > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PinButton
            guildId={guildId}
            moduleId={module.id}
            moduleName={module.name}
            initialPinned={module.isPinned}
            {...(onPinError ? { onError: onPinError } : {})}
          />
          <ModuleEnabledToggle
            guildId={guildId}
            moduleId={module.id}
            moduleName={module.name}
            initialEnabled={module.enabled}
          />
        </div>
      </div>
    </header>
  );
}
