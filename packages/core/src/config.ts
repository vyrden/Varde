import {
  type ConfigChangedEvent,
  type ConfigService,
  type GuildId,
  NotFoundError,
  type UserId,
  ValidationError,
} from '@varde/contracts';
import {
  type DbClient,
  type DbDriver,
  pgSchema,
  sqliteSchema,
  toCanonicalDate,
  withTransaction,
} from '@varde/db';
import { eq } from 'drizzle-orm';

/**
 * ConfigService : lit et écrit la configuration applicative d'un
 * serveur. Une ligne par guild dans `guild_config` avec :
 * - `config` : snapshot JSON hiérarchique `{ core: {...}, modules: {...} }`.
 * - `version` : entier monotone incrémenté à chaque écriture,
 *   utilisable pour les migrations de config à venir (PR 1.5).
 * - `updatedBy` : ID Discord de l'auteur de la dernière écriture
 *   (`null` si écriture système).
 *
 * `set(guildId, patch)` fusionne profondément `patch` dans la config
 * existante (objets fusionnés par clé, les tableaux et primitives
 * écrasent), incrémente la version, persiste, puis notifie via le
 * callback `onChanged` optionnel. Le chaînage vers l'EventBus sera
 * posé en PR 1.4.
 */

export type ConfigObject = Readonly<Record<string, unknown>>;

/** Callback invoqué après toute écriture réussie. */
export type ConfigChangedListener = (event: ConfigChangedEvent) => Promise<void> | void;

/** Options de construction. */
export interface CreateConfigServiceOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  /** Acteur par défaut si aucun `updatedBy` n'est fourni explicitement. */
  readonly defaultUpdatedBy?: UserId | null;
  readonly onChanged?: ConfigChangedListener;
}

/** Options d'une écriture ponctuelle. */
export interface SetConfigOptions {
  readonly updatedBy?: UserId | null;
  /** Portée affectée (ex: `core`, `modules.moderation`). */
  readonly scope?: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Fusion profonde : les sous-objets sont fusionnés clé par clé. */
export const deepMerge = (
  base: ConfigObject,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };
  for (const [key, next] of Object.entries(patch)) {
    const current = result[key];
    if (isPlainObject(current) && isPlainObject(next)) {
      result[key] = deepMerge(current, next);
    } else {
      result[key] = next;
    }
  }
  return result;
};

interface StoredConfigRow {
  readonly config: ConfigObject;
  readonly version: number;
  readonly updatedBy: UserId | null;
}

const emptyRow: StoredConfigRow = { config: {}, version: 0, updatedBy: null };

const selectRow = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
): Promise<StoredConfigRow | null> => {
  if (client.driver === 'pg') {
    const { guildConfig } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select({
        config: guildConfig.config,
        version: guildConfig.version,
        updatedBy: guildConfig.updatedBy,
      })
      .from(guildConfig)
      .where(eq(guildConfig.guildId, guildId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      config: (row.config as ConfigObject) ?? {},
      version: row.version,
      updatedBy: (row.updatedBy as UserId | null) ?? null,
    };
  }
  const { guildConfig } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const row = sqlite.db
    .select({
      config: guildConfig.config,
      version: guildConfig.version,
      updatedBy: guildConfig.updatedBy,
    })
    .from(guildConfig)
    .where(eq(guildConfig.guildId, guildId))
    .limit(1)
    .get();
  if (!row) return null;
  return {
    config: (row.config as ConfigObject) ?? {},
    version: row.version,
    updatedBy: (row.updatedBy as UserId | null) ?? null,
  };
};

const upsertRow = async <D extends DbDriver>(
  client: DbClient<D>,
  guildId: GuildId,
  next: StoredConfigRow,
  updatedAtIso: string,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { guildConfig } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .insert(guildConfig)
      .values({
        guildId,
        config: next.config,
        version: next.version,
        updatedBy: next.updatedBy,
        updatedAt: new Date(updatedAtIso),
      })
      .onConflictDoUpdate({
        target: guildConfig.guildId,
        set: {
          config: next.config,
          version: next.version,
          updatedBy: next.updatedBy,
          updatedAt: new Date(updatedAtIso),
        },
      });
    return;
  }
  const { guildConfig } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  await sqlite.db
    .insert(guildConfig)
    .values({
      guildId,
      config: next.config,
      version: next.version,
      updatedBy: next.updatedBy,
      updatedAt: updatedAtIso,
    })
    .onConflictDoUpdate({
      target: guildConfig.guildId,
      set: {
        config: next.config,
        version: next.version,
        updatedBy: next.updatedBy,
        updatedAt: updatedAtIso,
      },
    });
};

/**
 * Variante typée de `ConfigService` exposée au core : offre en plus
 * un `setWith(guildId, patch, { updatedBy, scope })` pour choisir
 * l'acteur et la portée portés par l'événement `config.changed`. La
 * signature publique `set(guildId, patch)` reste celle du contrat.
 */
export interface CoreConfigService extends ConfigService {
  readonly setWith: <T extends ConfigObject = ConfigObject>(
    guildId: GuildId,
    patch: Partial<T>,
    options?: SetConfigOptions,
  ) => Promise<void>;
  readonly ensureGuild: (guildId: GuildId) => Promise<void>;
}

/**
 * Construit un `CoreConfigService`. La lecture `get` lève
 * `NotFoundError` quand aucune ligne n'existe encore pour la guild —
 * charge au core d'appeler `ensureGuild` au moment de l'installation
 * (lifecycle `guild.join`, à câbler en PR 1.6).
 */
export function createConfigService<D extends DbDriver>(
  options: CreateConfigServiceOptions<D>,
): CoreConfigService {
  const { client, onChanged, defaultUpdatedBy = null } = options;

  const write = async <T extends ConfigObject>(
    guildId: GuildId,
    patch: Partial<T>,
    setOptions: SetConfigOptions,
  ): Promise<void> => {
    if (!isPlainObject(patch)) {
      throw new ValidationError('ConfigService.set : patch doit être un objet', {
        metadata: { guildId, got: typeof patch },
      });
    }
    const now = new Date();
    const updatedAtIso = toCanonicalDate(now);
    const updatedAtEpoch = now.getTime();
    const updatedBy = setOptions.updatedBy === undefined ? defaultUpdatedBy : setOptions.updatedBy;
    const scope = setOptions.scope ?? 'core';

    const { versionBefore, versionAfter } = await withTransaction(client, async () => {
      const existing = (await selectRow(client, guildId)) ?? emptyRow;
      const merged: StoredConfigRow = {
        config: deepMerge(existing.config, patch as Readonly<Record<string, unknown>>),
        version: existing.version + 1,
        updatedBy,
      };
      await upsertRow(client, guildId, merged, updatedAtIso);
      return { versionBefore: existing.version, versionAfter: merged.version };
    });

    if (onChanged) {
      await onChanged({
        type: 'config.changed',
        guildId,
        scope,
        versionBefore,
        versionAfter,
        updatedBy,
        updatedAt: updatedAtEpoch,
      });
    }
  };

  return {
    async get(guildId) {
      const row = await selectRow(client, guildId);
      if (!row) {
        throw new NotFoundError('ConfigService.get : aucune config pour cette guild', {
          metadata: { guildId },
        });
      }
      return row.config as never;
    },

    async set(guildId, patch) {
      await write(guildId, patch, {});
    },

    async setWith(guildId, patch, setOptions = {}) {
      await write(guildId, patch, setOptions);
    },

    async ensureGuild(guildId) {
      const existing = await selectRow(client, guildId);
      if (existing) {
        return;
      }
      const updatedAtIso = toCanonicalDate(new Date());
      await upsertRow(client, guildId, { config: {}, version: 1, updatedBy: null }, updatedAtIso);
    },
  };
}
