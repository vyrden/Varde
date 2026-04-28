/**
 * Constantes et helpers pour les 7 étapes du wizard de setup
 * (jalon 7 PR 7.1, sous-livrable 5).
 *
 * L'ordre déclaré ici est autoritatif : c'est le seul fichier où il
 * apparaît, le reste du wizard (composants, pages, progress bar,
 * navigation prev/next) en dérive. Ajouter une étape demande de
 * l'insérer ici, écrire la page, ajouter les clés i18n.
 */

/** Liste ordonnée des étapes, telle que rendue dans la progress bar. */
export const SETUP_STEPS = [
  'welcome',
  'system-check',
  'discord-app',
  'bot-token',
  'oauth',
  'identity',
  'summary',
] as const;

export type SetupStepKey = (typeof SETUP_STEPS)[number];

/**
 * Index 1-based de l'étape, pour l'affichage utilisateur (« Étape
 * 3 sur 7 »). welcome=1, summary=7.
 */
export function setupStepIndex(key: SetupStepKey): number {
  return SETUP_STEPS.indexOf(key) + 1;
}

/**
 * Inverse de `setupStepIndex`. Retourne `null` hors plage [1, 7]
 * pour que l'appelant traite explicitement le cas (ex. valeur DB
 * corrompue ou hors-spec).
 */
export function setupStepFromIndex(index: number): SetupStepKey | null {
  if (!Number.isInteger(index) || index < 1 || index > SETUP_STEPS.length) {
    return null;
  }
  return SETUP_STEPS[index - 1] ?? null;
}

/** Chemin URL de l'étape, sous l'arborescence `/setup/*`. */
export function setupStepHref(key: SetupStepKey): string {
  return `/setup/${key}`;
}

/** Étape suivante, ou `null` si on est sur la dernière (`summary`). */
export function nextSetupStep(key: SetupStepKey): SetupStepKey | null {
  const idx = SETUP_STEPS.indexOf(key);
  if (idx < 0 || idx >= SETUP_STEPS.length - 1) return null;
  return SETUP_STEPS[idx + 1] ?? null;
}

/** Étape précédente, ou `null` si on est sur la première (`welcome`). */
export function previousSetupStep(key: SetupStepKey): SetupStepKey | null {
  const idx = SETUP_STEPS.indexOf(key);
  if (idx <= 0) return null;
  return SETUP_STEPS[idx - 1] ?? null;
}
