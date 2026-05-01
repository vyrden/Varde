/**
 * Compte le nombre de champs qui ont changé entre deux états plats
 * de formulaire (jalon 7 PR 7.4.8). Sert au compteur « N modifications
 * non sauvegardées » de la sticky save bar.
 *
 * Convention :
 *
 * - `''` (string vide) et `undefined` sont considérés équivalents :
 *   un champ optionnel laissé vide ne compte pas comme un changement
 *   par rapport à l'absence du champ côté initial. Sinon le compteur
 *   clignoterait dès qu'on touche un champ optionnel.
 * - `false` reste une vraie valeur (toggle explicitement off ≠ absent).
 * - Comparaison stricte sur les autres types (string, boolean, number).
 *
 * Pure : ne mute aucune des deux entrées.
 */
export function countFieldChanges(
  initial: Readonly<Record<string, string | boolean>>,
  current: Readonly<Record<string, string | boolean>>,
): number {
  const allKeys = new Set([...Object.keys(initial), ...Object.keys(current)]);
  let count = 0;
  for (const key of allKeys) {
    const a = initial[key];
    const b = current[key];
    if (isVoid(a) && isVoid(b)) continue;
    if (a !== b) count += 1;
  }
  return count;
}

const isVoid = (value: string | boolean | undefined): boolean =>
  value === undefined || value === '';
