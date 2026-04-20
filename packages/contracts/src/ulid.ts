import { decodeTime, monotonicFactory } from 'ulid';

/**
 * ULID stringifié : 26 caractères base32 Crockford, ordonné dans le
 * temps. Utilisé comme clé primaire applicative dans tout le projet.
 */

declare const ulidBrand: unique symbol;

/** Valeur ULID validée. */
export type Ulid = string & { readonly [ulidBrand]: 'Ulid' };

/**
 * Regex de validation d'un ULID : 26 caractères base32 Crockford
 * (alphabet sans I, L, O, U).
 */
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const generate = monotonicFactory();

/**
 * Génère un nouvel ULID. Monotone au sein d'un même processus même
 * lorsque plusieurs ULID sont générés dans la même milliseconde.
 */
export function newUlid(): Ulid {
  return generate() as Ulid;
}

/** Vérifie si `value` est un ULID valide. */
export function isUlid(value: unknown): value is Ulid {
  return typeof value === 'string' && ULID_REGEX.test(value);
}

/**
 * Parse une chaîne en {@link Ulid}. Renvoie `null` si le format est
 * invalide.
 */
export function parseUlid(value: string): Ulid | null {
  return isUlid(value) ? value : null;
}

/**
 * Extrait le timestamp en millisecondes encodé dans un ULID.
 *
 * @throws {Error} Si `value` n'est pas un ULID valide décodable.
 */
export function ulidTimestamp(value: Ulid): number {
  return decodeTime(value);
}
