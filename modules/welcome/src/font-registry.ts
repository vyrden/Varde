import { readdir } from 'node:fs/promises';
import { dirname, join, parse, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GlobalFonts } from '@napi-rs/canvas';

/**
 * Registre des polices disponibles pour le rendu de carte.
 *
 * Trois sources :
 * - Familles génériques système : sans-serif / serif / monospace.
 *   Toujours disponibles via fontconfig (Linux) ou les équivalents OS.
 * - Polices embarquées : 4 polices OFL livrées dans `modules/welcome/fonts/`
 *   (Inter, Bebas Neue, Lobster, Playfair Display) qui couvrent une
 *   palette stylistique distinctive (UI moderne, display, script, serif
 *   élégant).
 * - Polices admin : tout fichier .ttf / .otf déposé dans
 *   `VARDE_UPLOADS_DIR/fonts/` est détecté au démarrage et enregistré
 *   sous son nom de fichier sans extension.
 */

const SYSTEM_FONTS = ['sans-serif', 'serif', 'monospace'] as const;

/** Polices embarquées : nom affiché côté UI → nom de fichier sous fonts/. */
const BUILTIN_FONTS: Readonly<Record<string, string>> = Object.freeze({
  Inter: 'Inter-Regular.ttf',
  'Bebas Neue': 'BebasNeue-Regular.ttf',
  Lobster: 'Lobster-Regular.ttf',
  'Playfair Display': 'PlayfairDisplay-Regular.ttf',
});

const registeredNames = new Set<string>(SYSTEM_FONTS);

/** Chemin absolu du dossier `fonts/` du module à partir du runtime compilé. */
const builtinFontsDir = (): string =>
  // dist/font-registry.js → ../fonts/
  resolvePath(dirname(fileURLToPath(import.meta.url)), '..', 'fonts');

/**
 * Enregistre les polices intégrées + les polices déposées par l'admin.
 * À appeler au `onLoad` du module. Idempotent — si une police a déjà
 * été enregistrée, l'appel est un no-op.
 */
export async function registerWelcomeFonts(uploadsDir: string | null): Promise<void> {
  const dir = builtinFontsDir();
  for (const [displayName, filename] of Object.entries(BUILTIN_FONTS)) {
    if (registeredNames.has(displayName)) continue;
    const path = join(dir, filename);
    try {
      GlobalFonts.registerFromPath(path, displayName);
      registeredNames.add(displayName);
    } catch {
      /* fichier manquant ou format invalide : on ignore et on continue */
    }
  }

  if (uploadsDir !== null) {
    const userFontsDir = join(uploadsDir, 'fonts');
    let entries: string[] = [];
    try {
      entries = await readdir(userFontsDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const ext = parse(entry).ext.toLowerCase();
      if (ext !== '.ttf' && ext !== '.otf') continue;
      const displayName = parse(entry).name;
      if (registeredNames.has(displayName)) continue;
      try {
        GlobalFonts.registerFromPath(join(userFontsDir, entry), displayName);
        registeredNames.add(displayName);
      } catch {
        /* idem : on tolère un fichier corrompu plutôt que de bloquer onLoad */
      }
    }
  }
}

/**
 * Liste les noms de polices que la carte sait rendre — système +
 * intégrées + admin. Utilisée par l'API et le dashboard pour peupler
 * le sélecteur de police.
 */
export function listRegisteredFonts(): readonly string[] {
  return Array.from(registeredNames).sort((a, b) => {
    // Système d'abord pour rester proche de l'ordre standard.
    const sysOrder = ['sans-serif', 'serif', 'monospace'];
    const ai = sysOrder.indexOf(a);
    const bi = sysOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}
