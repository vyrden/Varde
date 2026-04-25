import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

/**
 * Service minimal de persistance des images de fond welcome/goodbye.
 * Stockage : système de fichiers sous `VARDE_UPLOADS_DIR` (défaut
 * `<cwd>/uploads`). Chaque guild a son propre sous-dossier ; les
 * fichiers sont nommés de manière déterministe (`welcome-bg.<ext>` /
 * `goodbye-bg.<ext>`) — pas d'utilisateur-supplied filename.
 *
 * Le module `welcome` lit ces fichiers au moment du rendu de carte :
 * ce service expose donc à la fois `save`, `delete` et `read`.
 *
 * Limites V1 :
 * - 5 Mo max par image
 * - PNG / JPEG / WEBP uniquement
 * - 1 image par cible (welcome ou goodbye), écrasée au prochain upload
 */

export type WelcomeBackgroundTarget = 'welcome' | 'goodbye';

const MIME_TO_EXT: Readonly<Record<string, string>> = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
});

const MAX_BYTES = 5 * 1024 * 1024;
const SNOWFLAKE = /^\d{17,19}$/;

export class WelcomeUploadError extends Error {
  readonly reason:
    | 'invalid-guild'
    | 'invalid-target'
    | 'invalid-mime'
    | 'invalid-base64'
    | 'too-large'
    | 'fs-error';
  constructor(reason: WelcomeUploadError['reason'], message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface WelcomeUploadsService {
  /**
   * Persiste une image. Retourne le chemin relatif à `uploadsDir`
   * (à stocker dans la config) ainsi que le chemin absolu (pour
   * retour API ou rendu local).
   */
  readonly save: (
    guildId: string,
    target: WelcomeBackgroundTarget,
    dataUrl: string,
  ) => Promise<{ readonly relativePath: string; readonly absolutePath: string }>;

  /** Supprime l'image éventuellement présente pour la cible. */
  readonly delete: (guildId: string, target: WelcomeBackgroundTarget) => Promise<void>;

  /** Lit une image depuis son chemin relatif. Retourne null si absente. */
  readonly read: (
    relativePath: string,
  ) => Promise<{ readonly bytes: Buffer; readonly mime: string } | null>;

  /** Résout un chemin relatif en chemin absolu (utilisé par le renderer). */
  readonly resolveAbsolute: (relativePath: string) => string;
}

/**
 * Décode un dataURL `data:image/<type>;base64,<payload>`. Lève si
 * mime/format/taille invalides.
 */
const decodeDataUrl = (dataUrl: string): { bytes: Buffer; mime: string } => {
  const match = /^data:([a-z]+\/[a-z0-9+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw new WelcomeUploadError('invalid-base64', 'dataUrl malformé');
  }
  const mime = (match[1] ?? '').toLowerCase();
  if (!(mime in MIME_TO_EXT)) {
    throw new WelcomeUploadError(
      'invalid-mime',
      `Type MIME ${mime} non supporté (png, jpeg, webp uniquement)`,
    );
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(match[2] ?? '', 'base64');
  } catch (error) {
    throw new WelcomeUploadError(
      'invalid-base64',
      `Décodage base64 échoué : ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (bytes.length === 0) {
    throw new WelcomeUploadError('invalid-base64', 'payload base64 vide');
  }
  if (bytes.length > MAX_BYTES) {
    throw new WelcomeUploadError('too-large', `Image trop lourde (${bytes.length} > ${MAX_BYTES})`);
  }
  return { bytes, mime };
};

const guildDir = (uploadsDir: string, guildId: string): string =>
  join(uploadsDir, 'welcome', guildId);

const findExistingFile = async (
  uploadsDir: string,
  guildId: string,
  target: WelcomeBackgroundTarget,
): Promise<string | null> => {
  const dir = guildDir(uploadsDir, guildId);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const prefix = `${target}-bg.`;
  const match = entries.find((name) => name.startsWith(prefix));
  return match ?? null;
};

export function createWelcomeUploadsService(uploadsDir: string): WelcomeUploadsService {
  return {
    async save(guildId, target, dataUrl) {
      if (!SNOWFLAKE.test(guildId)) {
        throw new WelcomeUploadError('invalid-guild', 'guildId doit être un snowflake Discord');
      }
      if (target !== 'welcome' && target !== 'goodbye') {
        throw new WelcomeUploadError('invalid-target', "target doit être 'welcome' ou 'goodbye'");
      }
      const { bytes, mime } = decodeDataUrl(dataUrl);
      const ext = MIME_TO_EXT[mime] as string;
      const dir = guildDir(uploadsDir, guildId);

      // Nettoie l'éventuelle image existante pour la cible (extension
      // potentiellement différente — png puis jpg par ex.).
      const existing = await findExistingFile(uploadsDir, guildId, target);
      if (existing !== null) {
        try {
          await unlink(join(dir, existing));
        } catch {
          /* déjà absente, on ignore */
        }
      }

      try {
        await mkdir(dir, { recursive: true });
        const filename = `${target}-bg.${ext}`;
        const absolutePath = join(dir, filename);
        await writeFile(absolutePath, bytes);
        return {
          absolutePath,
          relativePath: join('welcome', guildId, filename),
        };
      } catch (error) {
        throw new WelcomeUploadError(
          'fs-error',
          `Écriture échouée : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },

    async delete(guildId, target) {
      if (!SNOWFLAKE.test(guildId)) return;
      const existing = await findExistingFile(uploadsDir, guildId, target);
      if (existing === null) return;
      try {
        await unlink(join(guildDir(uploadsDir, guildId), existing));
      } catch {
        /* idempotent */
      }
    },

    async read(relativePath) {
      // Sécurité : on refuse les chemins qui sortent de uploadsDir.
      if (relativePath.includes('..')) return null;
      const absolutePath = join(uploadsDir, relativePath);
      let bytes: Buffer;
      try {
        bytes = await readFile(absolutePath);
      } catch {
        return null;
      }
      const ext = extname(absolutePath).slice(1).toLowerCase();
      const mime =
        ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'jpg' || ext === 'jpeg'
              ? 'image/jpeg'
              : 'application/octet-stream';
      return { bytes, mime };
    },

    resolveAbsolute(relativePath) {
      return join(uploadsDir, relativePath);
    },
  };
}
