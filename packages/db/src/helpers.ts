import type { Iso8601DateTime } from '@varde/contracts';
import { ValidationError } from '@varde/contracts';

/**
 * Normalise une valeur de date arbitraire vers une forme ISO 8601 UTC
 * canonique (`YYYY-MM-DDTHH:MM:SS.sssZ`). Accepte :
 * - un `Date`
 * - un timestamp numérique (millisecondes epoch)
 * - une chaîne parseable par `new Date(value)`
 *
 * @throws ValidationError si la valeur ne représente pas une date valide.
 */
export function toCanonicalDate(value: Date | string | number): Iso8601DateTime {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('toCanonicalDate : valeur de date invalide', {
      metadata: { value: String(value) },
    });
  }
  return date.toISOString() as Iso8601DateTime;
}

/**
 * Convertit une valeur canonique ISO 8601 en `Date`. Miroir de
 * `toCanonicalDate`, utile pour normaliser le retour de lecture de
 * colonnes SQLite (stockées en `TEXT`) avant comparaison.
 */
export function fromCanonicalDate(value: Iso8601DateTime | string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('fromCanonicalDate : valeur de date invalide', {
      metadata: { value },
    });
  }
  return date;
}
