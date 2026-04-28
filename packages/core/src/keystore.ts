import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import {
  DependencyFailureError,
  type GuildId,
  type KeystoreService,
  type ModuleId,
  ValidationError,
} from '@varde/contracts';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema, toCanonicalDate } from '@varde/db';
import { and, eq } from 'drizzle-orm';

/**
 * KeystoreService : persistance de secrets tiers chiffrés au repos par
 * AES-256-GCM (voir ADR 0001 `keystore`).
 *
 * Le service est scopé par module à la construction : l'ID du module
 * n'apparaît plus dans la signature publique (`put/get/delete`) pour
 * coller au contrat `ctx.keystore` exposé aux modules.
 *
 * Rotation de clé maître :
 * - `masterKey` = clé courante, utilisée pour toutes les écritures.
 * - `previousMasterKey` = clé retirée. Si définie, les lectures
 *   tentent d'abord `masterKey` puis retombent sur `previousMasterKey`.
 *   La ré-encryption est faite paresseusement : dès qu'un `get` est
 *   servi par la clé précédente, le service ré-encrit et persiste avec
 *   la nouvelle clé.
 *
 * Pas de log de plaintext, jamais : même en debug, le service n'émet
 * que des metadata non-sensibles (guildId, clé applicative, longueur
 * du ciphertext).
 */

/** Tailles en octets imposées par AES-256-GCM. */
const KEY_BYTES = 32;
const IV_BYTES = 12;

/** Options de construction. */
export interface CreateKeystoreServiceOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly moduleId: ModuleId;
  readonly masterKey: Buffer;
  readonly previousMasterKey?: Buffer;
}

const assertKey = (key: Buffer, label: string): void => {
  if (key.length !== KEY_BYTES) {
    throw new ValidationError(`${label} : clé AES-256-GCM attendue sur 32 octets`, {
      metadata: { got: key.length },
    });
  }
};

/**
 * Tuple AES-256-GCM produit par `encryptString` et consommé par
 * `tryDecryptString`. Exposé pour les services qui veulent stocker
 * des secrets dans leurs propres tables (ex. `instanceConfigService`)
 * tout en partageant le contrat de chiffrement du keystore.
 */
export interface EncryptedBlob {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly authTag: Buffer;
}

/**
 * Chiffre une chaîne UTF-8 avec une clé AES-256 (32 octets) via
 * AES-256-GCM. L'IV est généré aléatoirement à chaque appel — ne
 * jamais réutiliser un (key, IV) pour deux plaintexts différents.
 */
export const encryptString = (key: Buffer, value: string): EncryptedBlob => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
};

/**
 * Déchiffre un blob AES-256-GCM. Retourne `null` si la clé ne
 * correspond pas, si l'authTag est invalide, ou si le payload est
 * corrompu — utile au keystore pour tenter `previousMasterKey` en
 * fallback sans propager d'exception.
 */
export const tryDecryptString = (key: Buffer, blob: EncryptedBlob): string | null => {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, blob.iv);
    decipher.setAuthTag(blob.authTag);
    const plaintext = Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
};

// Aliases internes au module keystore — préservent les call sites
// existants sans renommer 50 lignes plus bas.
const encrypt = encryptString;
const tryDecrypt = tryDecryptString;

interface StoredRow {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly authTag: Buffer;
}

const asBuffer = (value: Buffer | Uint8Array): Buffer =>
  Buffer.isBuffer(value) ? value : Buffer.from(value);

const selectRow = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
  moduleId: ModuleId,
  key: string,
): Promise<StoredRow | null> => {
  if (client.driver === 'pg') {
    const { keystore } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select({
        ciphertext: keystore.ciphertext,
        iv: keystore.iv,
        authTag: keystore.authTag,
      })
      .from(keystore)
      .where(
        and(eq(keystore.guildId, guildId), eq(keystore.moduleId, moduleId), eq(keystore.key, key)),
      )
      .limit(1);
    const row = rows[0];
    return row ? { ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag } : null;
  }
  const { keystore } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const row = sqlite.db
    .select({
      ciphertext: keystore.ciphertext,
      iv: keystore.iv,
      authTag: keystore.authTag,
    })
    .from(keystore)
    .where(
      and(eq(keystore.guildId, guildId), eq(keystore.moduleId, moduleId), eq(keystore.key, key)),
    )
    .limit(1)
    .get();
  return row
    ? {
        ciphertext: asBuffer(row.ciphertext),
        iv: asBuffer(row.iv),
        authTag: asBuffer(row.authTag),
      }
    : null;
};

const upsertRow = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
  moduleId: ModuleId,
  key: string,
  blob: EncryptedBlob,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { keystore } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .insert(keystore)
      .values({
        guildId,
        moduleId,
        key,
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        authTag: blob.authTag,
      })
      .onConflictDoUpdate({
        target: [keystore.guildId, keystore.moduleId, keystore.key],
        set: {
          ciphertext: blob.ciphertext,
          iv: blob.iv,
          authTag: blob.authTag,
          updatedAt: new Date(),
        },
      });
    return;
  }
  const { keystore } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  await sqlite.db
    .insert(keystore)
    .values({
      guildId,
      moduleId,
      key,
      ciphertext: blob.ciphertext,
      iv: blob.iv,
      authTag: blob.authTag,
    })
    .onConflictDoUpdate({
      target: [keystore.guildId, keystore.moduleId, keystore.key],
      set: {
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        authTag: blob.authTag,
        updatedAt: toCanonicalDate(new Date()),
      },
    });
};

const deleteRow = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
  moduleId: ModuleId,
  key: string,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { keystore } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .delete(keystore)
      .where(
        and(eq(keystore.guildId, guildId), eq(keystore.moduleId, moduleId), eq(keystore.key, key)),
      );
    return;
  }
  const { keystore } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  await sqlite.db
    .delete(keystore)
    .where(
      and(eq(keystore.guildId, guildId), eq(keystore.moduleId, moduleId), eq(keystore.key, key)),
    );
};

/**
 * Construit un `KeystoreService` scopé sur `moduleId`. Toute opération
 * valide d'abord la taille des clés maîtres fournies.
 */
export function createKeystoreService<D extends DbDriver>(
  options: CreateKeystoreServiceOptions<D>,
): KeystoreService {
  const { client, moduleId, masterKey, previousMasterKey } = options;
  assertKey(masterKey, 'masterKey');
  if (previousMasterKey) {
    assertKey(previousMasterKey, 'previousMasterKey');
  }

  return {
    async put(guildId, key, value) {
      const blob = encrypt(masterKey, value);
      await upsertRow(client, guildId, moduleId, key, blob);
    },

    async get(guildId, key) {
      const row = await selectRow(client, guildId, moduleId, key);
      if (!row) {
        return null;
      }
      const primary = tryDecrypt(masterKey, row);
      if (primary !== null) {
        return primary;
      }
      if (previousMasterKey) {
        const secondary = tryDecrypt(previousMasterKey, row);
        if (secondary !== null) {
          const reencrypted = encrypt(masterKey, secondary);
          await upsertRow(client, guildId, moduleId, key, reencrypted);
          return secondary;
        }
      }
      throw new DependencyFailureError(
        'keystore : déchiffrement AES-256-GCM refusé par toutes les clés connues',
        { metadata: { guildId, key } },
      );
    },

    async delete(guildId, key) {
      await deleteRow(client, guildId, moduleId, key);
    },
  };
}
