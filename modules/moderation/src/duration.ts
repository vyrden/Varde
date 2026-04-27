/**
 * Parser de durée façon Discord (`30s`, `15m`, `2h`, `7d`). Accepte
 * une combinaison `1d2h30m` séparée ou non par espaces. Renvoie le
 * total en millisecondes ou `null` si la chaîne ne parse pas.
 *
 * Bornes pratiques : `tempban` Discord plafonne à 365 jours par
 * Discord, `tempmute` (timeout natif) à 28j — mais nous utilisons un
 * rôle muet, donc pas de plafond Discord, c'est le scheduler qui
 * porte la durée. On laisse les handlers borner à leur convenance ;
 * le parser reste neutre.
 */

const UNIT_S = 1_000;
const UNIT_M = 60_000;
const UNIT_H = 3_600_000;
const UNIT_D = 86_400_000;

const UNIT_MS: Readonly<Record<string, number>> = Object.freeze({
  s: UNIT_S,
  m: UNIT_M,
  h: UNIT_H,
  d: UNIT_D,
});

const TOKEN_RE = /(\d+)\s*([smhd])/gi;

export function parseDuration(input: string): number | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  // Vérifie que toute la chaîne est consommée par la regex (pas de
  // résidus type "5x" qui passeraient sinon silencieusement).
  const consumed = trimmed.replace(TOKEN_RE, '').replace(/\s+/g, '');
  if (consumed.length > 0) return null;

  let total = 0;
  let matched = false;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null = TOKEN_RE.exec(trimmed);
  while (m !== null) {
    const value = Number.parseInt(m[1] ?? '0', 10);
    const unit = (m[2] ?? '').toLowerCase();
    const factor = UNIT_MS[unit];
    if (factor === undefined || !Number.isFinite(value)) return null;
    total += value * factor;
    matched = true;
    m = TOKEN_RE.exec(trimmed);
  }
  return matched ? total : null;
}

/**
 * Formate une durée en millisecondes en chaîne lisible (`1d2h30m`,
 * `45s`). Inverse approximatif de `parseDuration` : la sortie est
 * re-parseable. Retourne `'0s'` pour 0.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const days = Math.floor(ms / UNIT_D);
  let rest = ms - days * UNIT_D;
  const hours = Math.floor(rest / UNIT_H);
  rest -= hours * UNIT_H;
  const minutes = Math.floor(rest / UNIT_M);
  rest -= minutes * UNIT_M;
  const seconds = Math.floor(rest / UNIT_S);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  return parts.length > 0 ? parts.join('') : '0s';
}
