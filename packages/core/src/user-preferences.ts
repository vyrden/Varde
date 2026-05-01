import { type GuildId, type UserId, ValidationError } from '@varde/contracts';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema, toCanonicalDate } from '@varde/db';
import { and, eq } from 'drizzle-orm';

/**
 * `userPreferencesService` (jalon 7 PR 7.4.1). Préférences utilisateur
 * globales et par-guild.
 *
 * Backé par les tables `user_preferences` et `user_guild_preferences`
 * (cf. PR 7.4.0). Deux échelles séparées :
 *
 * - **Global** (`user_preferences`) : `theme` ∈ `'system' | 'light' |
 *   'dark'`, `locale` (V1 : 'fr' | 'en' mais le service ne contraint
 *   pas — c'est l'API qui valide). Une ligne par user. Les défauts
 *   ne sont **pas persistés** : un user qui n'a jamais touché ses
 *   préférences voit `getPreferences` retourner les valeurs par
 *   défaut sans écriture DB.
 *
 * - **Par-guild** (`user_guild_preferences`) : `pinnedModules` —
 *   liste ordonnée `{ moduleId, position }` (max 8, sans doublon de
 *   moduleId ni de position, positions entières positives). FK guild
 *   ON DELETE CASCADE — une guild qui disparaît emporte ses
 *   préférences user-scopées.
 *
 * Cache LRU+TTL identique à `guildPermissionsService` (cf. PR 7.3) :
 * désactivable, TTL court (60 s en prod). Invalidation à l'écriture
 * sur la clé concernée.
 *
 * Validation côté service uniquement — l'API peut faire des checks
 * supplémentaires (existence des modules sur la guild, niveau de
 * permission requis, etc.).
 */

const ALLOWED_THEMES = ['system', 'light', 'dark'] as const;

/** Thème UI choisi par l'utilisateur. */
export type UserTheme = (typeof ALLOWED_THEMES)[number];

/** Préférences globales d'un user. */
export interface UserPreferences {
  readonly theme: UserTheme;
  readonly locale: string;
}

const DEFAULT_PREFERENCES: UserPreferences = { theme: 'system', locale: 'fr' };

/** Patch partiel sur les préférences globales. */
export interface UserPreferencesPatch {
  readonly theme?: UserTheme;
  readonly locale?: string;
}

/** Une épingle de module dans la sidebar serveur. */
export interface PinnedModule {
  readonly moduleId: string;
  readonly position: number;
}

/** Préférences d'un user pour une guild donnée. */
export interface UserGuildPreferences {
  readonly pinnedModules: readonly PinnedModule[];
}

/** Plafond du nombre d'épingles par couple (user, guild). */
export const PINNED_MODULES_MAX = 8;

export interface UserPreferencesService {
  readonly getPreferences: (userId: UserId) => Promise<UserPreferences>;
  readonly updatePreferences: (
    userId: UserId,
    patch: UserPreferencesPatch,
  ) => Promise<UserPreferences>;
  readonly getGuildPreferences: (userId: UserId, guildId: GuildId) => Promise<UserGuildPreferences>;
  readonly updatePinnedModules: (
    userId: UserId,
    guildId: GuildId,
    pinnedModules: readonly PinnedModule[],
  ) => Promise<UserGuildPreferences>;
  /** Invalide toutes les entrées de cache pour un user. */
  readonly invalidateUser: (userId: UserId) => void;
  /** Invalide les entrées par-guild d'un user (sans toucher au global). */
  readonly invalidateUserGuild: (userId: UserId, guildId: GuildId) => void;
}

/**
 * Configuration du cache LRU+TTL. Mêmes contraintes que pour
 * `guildPermissionsService` : désactivable, TTL court en prod.
 */
export interface UserPreferencesCacheConfig {
  readonly maxSize: number;
  readonly ttlMs: number;
  readonly now?: () => number;
}

export interface CreateUserPreferencesServiceOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
  readonly cache?: UserPreferencesCacheConfig;
}

class LruWithTtl<V> {
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(config: UserPreferencesCacheConfig) {
    this.maxSize = config.maxSize;
    this.ttlMs = config.ttlMs;
    this.now = config.now ?? (() => Date.now());
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt < this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}

const isValidTheme = (theme: string): theme is UserTheme =>
  (ALLOWED_THEMES as readonly string[]).includes(theme);

const validatePatch = (patch: UserPreferencesPatch): void => {
  if (patch.theme !== undefined && !isValidTheme(patch.theme)) {
    throw new ValidationError(
      `userPreferencesService : theme "${patch.theme}" hors enum (${ALLOWED_THEMES.join(', ')})`,
    );
  }
  if (patch.locale !== undefined && patch.locale.length === 0) {
    throw new ValidationError('userPreferencesService : locale ne peut pas être vide');
  }
};

const validatePinnedModules = (pins: readonly PinnedModule[]): void => {
  if (pins.length > PINNED_MODULES_MAX) {
    throw new ValidationError(
      `userPreferencesService : maximum ${PINNED_MODULES_MAX} modules épinglés (reçu : ${pins.length})`,
    );
  }
  const moduleIds = new Set<string>();
  const positions = new Set<number>();
  for (const pin of pins) {
    if (pin.moduleId.length === 0) {
      throw new ValidationError('userPreferencesService : moduleId vide dans pinnedModules');
    }
    if (!Number.isInteger(pin.position) || pin.position < 0) {
      throw new ValidationError(
        `userPreferencesService : position "${pin.position}" invalide (entier ≥ 0 attendu)`,
        { metadata: { moduleId: pin.moduleId } },
      );
    }
    if (moduleIds.has(pin.moduleId)) {
      throw new ValidationError(
        `userPreferencesService : moduleId "${pin.moduleId}" en doublon dans pinnedModules`,
      );
    }
    if (positions.has(pin.position)) {
      throw new ValidationError(
        `userPreferencesService : position "${pin.position}" en doublon dans pinnedModules`,
      );
    }
    moduleIds.add(pin.moduleId);
    positions.add(pin.position);
  }
};

interface RawPreferencesRow {
  readonly theme: UserTheme;
  readonly locale: string;
}

interface RawGuildPreferencesRow {
  readonly pinnedModules: readonly PinnedModule[];
}

const selectPreferencesRow = async <D extends DbDriver>(
  client: DbClient<D>,
  userId: UserId,
): Promise<RawPreferencesRow | null> => {
  if (client.driver === 'pg') {
    const { userPreferences } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select({ theme: userPreferences.theme, locale: userPreferences.locale })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }
  const { userPreferences } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const row = sqlite.db
    .select({ theme: userPreferences.theme, locale: userPreferences.locale })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)
    .get();
  return row ?? null;
};

const upsertPreferencesRow = async <D extends DbDriver>(
  client: DbClient<D>,
  userId: UserId,
  next: UserPreferences,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { userPreferences } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const now = new Date();
    await pg.db
      .insert(userPreferences)
      .values({ userId, theme: next.theme, locale: next.locale, updatedAt: now })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { theme: next.theme, locale: next.locale, updatedAt: now },
      });
    return;
  }
  const { userPreferences } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const now = toCanonicalDate(new Date());
  await sqlite.db
    .insert(userPreferences)
    .values({ userId, theme: next.theme, locale: next.locale, updatedAt: now })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { theme: next.theme, locale: next.locale, updatedAt: now },
    });
};

const selectGuildPreferencesRow = async <D extends DbDriver>(
  client: DbClient<D>,
  userId: UserId,
  guildId: GuildId,
): Promise<RawGuildPreferencesRow | null> => {
  if (client.driver === 'pg') {
    const { userGuildPreferences } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select({ pinnedModules: userGuildPreferences.pinnedModules })
      .from(userGuildPreferences)
      .where(
        and(eq(userGuildPreferences.userId, userId), eq(userGuildPreferences.guildId, guildId)),
      )
      .limit(1);
    return rows[0] ?? null;
  }
  const { userGuildPreferences } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const row = sqlite.db
    .select({ pinnedModules: userGuildPreferences.pinnedModules })
    .from(userGuildPreferences)
    .where(and(eq(userGuildPreferences.userId, userId), eq(userGuildPreferences.guildId, guildId)))
    .limit(1)
    .get();
  return row ?? null;
};

const upsertGuildPreferencesRow = async <D extends DbDriver>(
  client: DbClient<D>,
  userId: UserId,
  guildId: GuildId,
  pins: readonly PinnedModule[],
): Promise<void> => {
  if (client.driver === 'pg') {
    const { userGuildPreferences } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const now = new Date();
    await pg.db
      .insert(userGuildPreferences)
      .values({ userId, guildId, pinnedModules: pins, updatedAt: now })
      .onConflictDoUpdate({
        target: [userGuildPreferences.userId, userGuildPreferences.guildId],
        set: { pinnedModules: pins, updatedAt: now },
      });
    return;
  }
  const { userGuildPreferences } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const now = toCanonicalDate(new Date());
  await sqlite.db
    .insert(userGuildPreferences)
    .values({ userId, guildId, pinnedModules: pins, updatedAt: now })
    .onConflictDoUpdate({
      target: [userGuildPreferences.userId, userGuildPreferences.guildId],
      set: { pinnedModules: pins, updatedAt: now },
    });
};

export function createUserPreferencesService<D extends DbDriver>(
  options: CreateUserPreferencesServiceOptions<D>,
): UserPreferencesService {
  const { client } = options;
  const prefsCache = options.cache ? new LruWithTtl<UserPreferences>(options.cache) : null;
  const guildCache = options.cache ? new LruWithTtl<UserGuildPreferences>(options.cache) : null;
  const userKey = (userId: UserId): string => userId;
  const guildKey = (userId: UserId, guildId: GuildId): string => `${userId}:${guildId}`;

  const readPreferences = async (userId: UserId): Promise<UserPreferences> => {
    const row = await selectPreferencesRow(client, userId);
    if (row === null) return DEFAULT_PREFERENCES;
    return { theme: row.theme, locale: row.locale };
  };

  const readGuildPreferences = async (
    userId: UserId,
    guildId: GuildId,
  ): Promise<UserGuildPreferences> => {
    const row = await selectGuildPreferencesRow(client, userId, guildId);
    if (row === null) return { pinnedModules: [] };
    return { pinnedModules: row.pinnedModules };
  };

  return {
    async getPreferences(userId) {
      const cached = prefsCache?.get(userKey(userId));
      if (cached !== undefined) return cached;
      const prefs = await readPreferences(userId);
      prefsCache?.set(userKey(userId), prefs);
      return prefs;
    },

    async updatePreferences(userId, patch) {
      validatePatch(patch);
      const current = await readPreferences(userId);
      const next: UserPreferences = {
        theme: patch.theme ?? current.theme,
        locale: patch.locale ?? current.locale,
      };
      await upsertPreferencesRow(client, userId, next);
      prefsCache?.delete(userKey(userId));
      return next;
    },

    async getGuildPreferences(userId, guildId) {
      const cached = guildCache?.get(guildKey(userId, guildId));
      if (cached !== undefined) return cached;
      const prefs = await readGuildPreferences(userId, guildId);
      guildCache?.set(guildKey(userId, guildId), prefs);
      return prefs;
    },

    async updatePinnedModules(userId, guildId, pinnedModules) {
      validatePinnedModules(pinnedModules);
      await upsertGuildPreferencesRow(client, userId, guildId, pinnedModules);
      guildCache?.delete(guildKey(userId, guildId));
      return { pinnedModules };
    },

    invalidateUser(userId) {
      prefsCache?.delete(userKey(userId));
      guildCache?.deleteByPrefix(`${userId}:`);
    },

    invalidateUserGuild(userId, guildId) {
      guildCache?.delete(guildKey(userId, guildId));
    },
  };
}
