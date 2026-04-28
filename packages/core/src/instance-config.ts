import { DependencyFailureError, type Logger, ValidationError } from '@varde/contracts';
import {
  type DbClient,
  type DbDriver,
  fromCanonicalDate,
  pgSchema,
  sqliteSchema,
  toCanonicalDate,
  withTransaction,
} from '@varde/db';
import { eq } from 'drizzle-orm';
import { type EncryptedBlob, encryptString, tryDecryptString } from './keystore.js';

/**
 * `instanceConfigService` : configuration globale de l'instance Varde.
 * Backée par la table singleton `instance_config` (voir
 * `packages/db/src/schema/{pg,sqlite}.ts`).
 *
 * Sert le wizard de setup initial (jalon 7 PR 7.1) : persiste les
 * credentials Discord chiffrés au repos (AES-256-GCM, même contrat que
 * le keystore), suit l'avancement du wizard via `setupStep`, et
 * matérialise la fin du setup via `setupCompletedAt`.
 *
 * Cache mémoire : une seule ligne en DB, lue à chaque démarrage et au
 * besoin. Toute écriture invalide le cache pour rester cohérent. Les
 * lectures concurrentes via le service après une écriture verront la
 * version fraîche.
 *
 * Évènement `ready` : `complete()` notifie les abonnés via `onReady()`
 * uniquement lors de la transition NULL → renseigné de
 * `setup_completed_at`. Les appels suivants sont des no-op (pas de
 * double-fire). Les erreurs des handlers sont isolées et journalisées
 * — un handler buggé ne bloque pas le démarrage de l'instance.
 */

/** Tailles AES-256-GCM (mêmes constantes que le keystore). */
const KEY_BYTES = 32;

/** Identifiant fixe de la ligne singleton. */
const SINGLETON_ID = 'singleton';

/** Vue résumée du statut, suffisante pour les middlewares de routage. */
export interface InstanceConfigStatus {
  /** `true` dès lors que `setup_completed_at` n'est plus `null`. */
  readonly configured: boolean;
  /** Étape la plus avancée atteinte par le wizard (≥ 1). */
  readonly currentStep: number;
}

/**
 * Snapshot complet déchiffré de la configuration de l'instance. Réservé
 * à l'admin et au runtime (login bot, callback OAuth) — ne JAMAIS le
 * sérialiser dans une réponse d'API non-admin.
 */
export interface InstanceConfig {
  readonly discordAppId: string | null;
  readonly discordPublicKey: string | null;
  readonly discordBotToken: string | null;
  readonly discordClientSecret: string | null;
  readonly botName: string | null;
  readonly botAvatarUrl: string | null;
  readonly botDescription: string | null;
  readonly setupStep: number;
  readonly setupCompletedAt: Date | null;
}

/**
 * Patch partiel passé à `setStep`. Tous les champs sont optionnels : un
 * `setStep(n, {})` se contente d'avancer le compteur d'étape.
 */
export interface InstanceConfigPatch {
  readonly discordAppId?: string;
  readonly discordPublicKey?: string;
  readonly discordBotToken?: string;
  readonly discordClientSecret?: string;
  readonly botName?: string;
  readonly botAvatarUrl?: string;
  readonly botDescription?: string;
}

/** Handler invoqué au passage en `configured = true`. */
export type InstanceReadyHandler = () => Promise<void> | void;

/** Surface publique du service. */
export interface InstanceConfigService {
  readonly getStatus: () => Promise<InstanceConfigStatus>;
  readonly getConfig: () => Promise<InstanceConfig>;
  readonly setStep: (step: number, patch: InstanceConfigPatch) => Promise<void>;
  readonly complete: () => Promise<void>;
  readonly onReady: (handler: InstanceReadyHandler) => () => void;
}

/** Options de construction. */
export interface CreateInstanceConfigServiceOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly masterKey: Buffer;
  readonly logger: Logger;
}

const DEFAULT_CONFIG: InstanceConfig = {
  discordAppId: null,
  discordPublicKey: null,
  discordBotToken: null,
  discordClientSecret: null,
  botName: null,
  botAvatarUrl: null,
  botDescription: null,
  setupStep: 1,
  setupCompletedAt: null,
};

const assertKey = (key: Buffer): void => {
  if (key.length !== KEY_BYTES) {
    throw new ValidationError(
      'instanceConfigService.masterKey : clé AES-256-GCM attendue sur 32 octets',
      { metadata: { got: key.length } },
    );
  }
};

const asBuffer = (value: Buffer | Uint8Array): Buffer =>
  Buffer.isBuffer(value) ? value : Buffer.from(value);

/**
 * Reconstruit un blob AES-256-GCM à partir de trois colonnes binaires.
 * Retourne `null` si l'une des trois est absente — protège contre des
 * lignes partielles écrites hors service.
 */
const blobFromColumns = (
  ciphertext: Buffer | Uint8Array | null | undefined,
  iv: Buffer | Uint8Array | null | undefined,
  authTag: Buffer | Uint8Array | null | undefined,
): EncryptedBlob | null => {
  if (!ciphertext || !iv || !authTag) {
    return null;
  }
  return {
    ciphertext: asBuffer(ciphertext),
    iv: asBuffer(iv),
    authTag: asBuffer(authTag),
  };
};

/** Forme commune retournée par les deux variants de SELECT (PG/SQLite). */
interface RawRow {
  readonly discordAppId: string | null;
  readonly discordPublicKey: string | null;
  readonly discordBotTokenCiphertext: Buffer | Uint8Array | null;
  readonly discordBotTokenIv: Buffer | Uint8Array | null;
  readonly discordBotTokenAuthTag: Buffer | Uint8Array | null;
  readonly discordClientSecretCiphertext: Buffer | Uint8Array | null;
  readonly discordClientSecretIv: Buffer | Uint8Array | null;
  readonly discordClientSecretAuthTag: Buffer | Uint8Array | null;
  readonly botName: string | null;
  readonly botAvatarUrl: string | null;
  readonly botDescription: string | null;
  readonly setupStep: number;
  readonly setupCompletedAt: Date | string | null;
}

const selectRow = async <D extends DbDriver>(client: DbClient<D>): Promise<RawRow | null> => {
  if (client.driver === 'pg') {
    const { instanceConfig } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select()
      .from(instanceConfig)
      .where(eq(instanceConfig.id, SINGLETON_ID))
      .limit(1);
    return rows[0] ?? null;
  }
  const { instanceConfig } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const row = sqlite.db
    .select()
    .from(instanceConfig)
    .where(eq(instanceConfig.id, SINGLETON_ID))
    .limit(1)
    .get();
  return row ?? null;
};

/**
 * Décode un timestamp lu depuis l'une ou l'autre des deux variantes :
 * PG renvoie un `Date`, SQLite un texte ISO8601 (canonique).
 */
const decodeTimestamp = (value: Date | string | null): Date | null => {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  return fromCanonicalDate(value);
};

const rowToConfig = (row: RawRow, masterKey: Buffer): InstanceConfig => {
  const tokenBlob = blobFromColumns(
    row.discordBotTokenCiphertext,
    row.discordBotTokenIv,
    row.discordBotTokenAuthTag,
  );
  const secretBlob = blobFromColumns(
    row.discordClientSecretCiphertext,
    row.discordClientSecretIv,
    row.discordClientSecretAuthTag,
  );

  const decryptOrThrow = (blob: EncryptedBlob | null, label: string): string | null => {
    if (!blob) {
      return null;
    }
    const plaintext = tryDecryptString(masterKey, blob);
    if (plaintext === null) {
      throw new DependencyFailureError(
        `instance_config : déchiffrement AES-256-GCM refusé pour ${label}`,
        { metadata: { label } },
      );
    }
    return plaintext;
  };

  return {
    discordAppId: row.discordAppId,
    discordPublicKey: row.discordPublicKey,
    discordBotToken: decryptOrThrow(tokenBlob, 'discord_bot_token'),
    discordClientSecret: decryptOrThrow(secretBlob, 'discord_client_secret'),
    botName: row.botName,
    botAvatarUrl: row.botAvatarUrl,
    botDescription: row.botDescription,
    setupStep: row.setupStep,
    setupCompletedAt: decodeTimestamp(row.setupCompletedAt),
  };
};

/** Valeurs à écrire dans la ligne lors d'un upsert (forme commune). */
interface WriteValues {
  setupStep: number;
  discordAppId?: string;
  discordPublicKey?: string;
  discordBotTokenCiphertext?: Buffer;
  discordBotTokenIv?: Buffer;
  discordBotTokenAuthTag?: Buffer;
  discordClientSecretCiphertext?: Buffer;
  discordClientSecretIv?: Buffer;
  discordClientSecretAuthTag?: Buffer;
  botName?: string;
  botAvatarUrl?: string;
  botDescription?: string;
}

const buildPatchValues = (
  patch: InstanceConfigPatch,
  masterKey: Buffer,
  effectiveStep: number,
): WriteValues => {
  const values: WriteValues = { setupStep: effectiveStep };
  if (patch.discordAppId !== undefined) {
    values.discordAppId = patch.discordAppId;
  }
  if (patch.discordPublicKey !== undefined) {
    values.discordPublicKey = patch.discordPublicKey;
  }
  if (patch.discordBotToken !== undefined) {
    const blob = encryptString(masterKey, patch.discordBotToken);
    values.discordBotTokenCiphertext = blob.ciphertext;
    values.discordBotTokenIv = blob.iv;
    values.discordBotTokenAuthTag = blob.authTag;
  }
  if (patch.discordClientSecret !== undefined) {
    const blob = encryptString(masterKey, patch.discordClientSecret);
    values.discordClientSecretCiphertext = blob.ciphertext;
    values.discordClientSecretIv = blob.iv;
    values.discordClientSecretAuthTag = blob.authTag;
  }
  if (patch.botName !== undefined) {
    values.botName = patch.botName;
  }
  if (patch.botAvatarUrl !== undefined) {
    values.botAvatarUrl = patch.botAvatarUrl;
  }
  if (patch.botDescription !== undefined) {
    values.botDescription = patch.botDescription;
  }
  return values;
};

const writePatch = async <D extends DbDriver>(
  client: DbClient<D>,
  values: WriteValues,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { instanceConfig } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const now = new Date();
    await pg.db
      .insert(instanceConfig)
      .values({
        id: SINGLETON_ID,
        ...values,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: instanceConfig.id,
        set: {
          ...values,
          updatedAt: now,
        },
      });
    return;
  }
  const { instanceConfig } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const now = toCanonicalDate(new Date());
  await sqlite.db
    .insert(instanceConfig)
    .values({
      id: SINGLETON_ID,
      ...values,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: instanceConfig.id,
      set: {
        ...values,
        updatedAt: now,
      },
    });
};

const writeCompletion = async <D extends DbDriver>(
  client: DbClient<D>,
  completedAt: Date,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { instanceConfig } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .insert(instanceConfig)
      .values({
        id: SINGLETON_ID,
        setupCompletedAt: completedAt,
        updatedAt: completedAt,
      })
      .onConflictDoUpdate({
        target: instanceConfig.id,
        set: { setupCompletedAt: completedAt, updatedAt: completedAt },
      });
    return;
  }
  const { instanceConfig } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const iso = toCanonicalDate(completedAt);
  await sqlite.db
    .insert(instanceConfig)
    .values({
      id: SINGLETON_ID,
      setupCompletedAt: iso,
      updatedAt: iso,
    })
    .onConflictDoUpdate({
      target: instanceConfig.id,
      set: { setupCompletedAt: iso, updatedAt: iso },
    });
};

/**
 * Construit un `instanceConfigService` adossé à la table singleton
 * `instance_config`. Voir le bloc-doc en tête du module pour le contrat
 * détaillé.
 */
export function createInstanceConfigService<D extends DbDriver>(
  options: CreateInstanceConfigServiceOptions<D>,
): InstanceConfigService {
  const { client, masterKey, logger } = options;
  assertKey(masterKey);
  const log = logger.child({ component: 'instance-config' });

  let cache: InstanceConfig | null = null;
  const readyHandlers = new Set<InstanceReadyHandler>();

  const loadConfig = async (): Promise<InstanceConfig> => {
    if (cache) {
      return cache;
    }
    const row = await selectRow(client);
    const config = row ? rowToConfig(row, masterKey) : DEFAULT_CONFIG;
    cache = config;
    return config;
  };

  const fireReady = async (): Promise<void> => {
    const invocations: Promise<void>[] = [];
    for (const handler of readyHandlers) {
      invocations.push(
        (async () => {
          try {
            await handler();
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            log.warn('ready handler failed', { error: err.message });
          }
        })(),
      );
    }
    await Promise.allSettled(invocations);
  };

  return {
    async getStatus() {
      const config = await loadConfig();
      return {
        configured: config.setupCompletedAt !== null,
        currentStep: config.setupStep,
      };
    },

    async getConfig() {
      return loadConfig();
    },

    async setStep(step, patch) {
      await withTransaction(client, async () => {
        const row = await selectRow(client);
        const currentStep = row?.setupStep ?? DEFAULT_CONFIG.setupStep;
        const effectiveStep = Math.max(currentStep, step);
        const values = buildPatchValues(patch, masterKey, effectiveStep);
        await writePatch(client, values);
      });
      cache = null;
    },

    async complete() {
      const before = await loadConfig();
      if (before.setupCompletedAt !== null) {
        return;
      }
      const completedAt = new Date();
      await writeCompletion(client, completedAt);
      cache = null;
      await fireReady();
    },

    onReady(handler) {
      readyHandlers.add(handler);
      return () => {
        readyHandlers.delete(handler);
      };
    },
  };
}
