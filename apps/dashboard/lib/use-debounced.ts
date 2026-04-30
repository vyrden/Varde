'use client';

import { useEffect, useState } from 'react';

/**
 * Debounce une valeur : retourne la dernière valeur observée stable
 * pendant `delay` ms. Utilisé par les formulaires du wizard pour
 * laisser l'utilisateur finir de taper avant de déclencher la
 * validation Discord (jalon 7 PR 7.7 — auto-validation et auto-save).
 *
 * Cleanup : le `setTimeout` précédent est annulé à chaque changement
 * de `value`, donc les frappes successives ne génèrent qu'un seul
 * fire après `delay` ms d'inactivité.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
