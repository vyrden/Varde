const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const FRENCH_MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

export interface RelativeDate {
  /** Texte lisible court (« Il y a 2h », « Hier à 18:04 », « 25 avr. à 14:32 »). */
  readonly primary: string;
  /** ISO original — utile en `title` ou `dateTime` pour l'a11y. */
  readonly iso: string;
}

/**
 * Format relatif humain à partir d'un ISO timestamp. Utilisé partout
 * où on affiche un timestamp dans le dashboard (audit, hub modules,
 * activité récente). Tous les seuils sont gardés ici pour rester
 * cohérents — modifier ici impacte toutes les pages.
 */
export function formatRelativeDate(iso: string): RelativeDate {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { primary: iso, iso };
  const delta = Date.now() - d.getTime();
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  if (delta < MINUTE_MS) return { primary: "À l'instant", iso };
  if (delta < HOUR_MS) {
    const min = Math.floor(delta / MINUTE_MS);
    return { primary: `Il y a ${min} min`, iso };
  }
  if (delta < DAY_MS) {
    const h = Math.floor(delta / HOUR_MS);
    return { primary: `Il y a ${h}h`, iso };
  }
  if (delta < 2 * DAY_MS) return { primary: `Hier à ${time}`, iso };

  const day = String(d.getDate()).padStart(2, '0');
  const month = FRENCH_MONTHS[d.getMonth()] ?? '';
  return { primary: `${day} ${month} à ${time}`, iso };
}
