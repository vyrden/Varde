import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Fusionne des classes Tailwind en résolvant les conflits.
 *
 * `clsx` condense les falsy / conditionnels, `tailwind-merge`
 * arbitre les classes Tailwind qui s'opposent (ex. `px-2` + `px-4`
 * → garde la dernière). Utilisé par tous les composants du paquet
 * qui acceptent un `className` pour permettre l'override propre côté
 * consommateur.
 */
export function cn(...inputs: readonly ClassValue[]): string {
  return twMerge(clsx(inputs));
}
