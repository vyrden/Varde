/**
 * Palette inspirée des rôles Discord typiques. Pas de violet (réservé à
 * `--primary`), pas de gris muet (réservé à « pas de rôle »).
 */
const ROLE_PALETTE: readonly string[] = [
  '#5865F2', // blurple
  '#3BA55C', // vert succès
  '#F0B232', // jaune ambre
  '#F23F43', // rouge
  '#EB459E', // rose
  '#0EA5E9', // bleu ciel
  '#22C55E', // vert
  '#A855F7', // violet
  '#F97316', // orange
  '#06B6D4', // cyan
  '#EC4899', // magenta
  '#14B8A6', // turquoise
];

/**
 * Hash FNV-1a 32 bits — déterministe, sans collisions trop fréquentes
 * sur des snowflakes Discord. Suffisant pour un index de palette.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Couleur stable dérivée de l'ID du rôle. Le DTO `GuildRoleDto` ne
 * porte pas la vraie couleur Discord — cette pastille reste donc
 * indicative. Future amélioration : étendre le DTO côté API pour
 * exposer la couleur réelle via `discord.js`.
 */
export function roleColorHex(roleId: string): string {
  const palette = ROLE_PALETTE;
  // safe: palette non-vide (lecture array de length n + modulo n)
  return palette[fnv1a(roleId) % palette.length] as string;
}
