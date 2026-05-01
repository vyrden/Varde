import type { PinnedModuleDto } from './api-client';

/**
 * Pur helper : déplace `activeId` à la position de `overId` dans la
 * liste, puis renumérote les positions de 0 à N-1 (jalon 7 PR 7.4.5).
 *
 * Sert à la fois au DnD souris (`onDragEnd` de @dnd-kit) et au
 * réordonnancement clavier (KeyboardSensor → mêmes événements
 * `active`/`over`).
 *
 * Garanties :
 *
 * - Pure : ne mute jamais l'entrée.
 * - Idempotente sur un no-op : `activeId === overId` → liste
 *   inchangée (même tableau renvoyé). Idem si l'un des deux n'est
 *   pas dans la liste.
 * - Renumérote toujours les positions de 0 à N-1, même si les
 *   positions sources sont non-consécutives.
 *
 * Pas de validation du plafond (max 8) ici — la liste épinglée a déjà
 * été contrainte par le service serveur côté écriture précédente.
 */
export function reorderPinnedModules(
  current: readonly PinnedModuleDto[],
  activeModuleId: string,
  overModuleId: string,
): readonly PinnedModuleDto[] {
  if (activeModuleId === overModuleId) return current;
  const fromIdx = current.findIndex((p) => p.moduleId === activeModuleId);
  const toIdx = current.findIndex((p) => p.moduleId === overModuleId);
  if (fromIdx === -1 || toIdx === -1) return current;

  const items = [...current];
  const [moved] = items.splice(fromIdx, 1);
  if (moved === undefined) return current;
  items.splice(toIdx, 0, moved);

  return items.map((pin, index) => ({ moduleId: pin.moduleId, position: index }));
}
