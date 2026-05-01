import type { GuildId, UserId } from '@varde/contracts';
import { ValidationError } from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createUserPreferencesService } from '../../src/user-preferences.js';

const GUILD_A: GuildId = '111' as GuildId;
const GUILD_B: GuildId = '222' as GuildId;
const USER: UserId = '900' as UserId;
const USER_OTHER: UserId = '901' as UserId;

const seedGuilds = async (client: DbClient<'sqlite'>): Promise<void> => {
  await client.db
    .insert(sqliteSchema.guilds)
    .values([
      { id: GUILD_A, name: 'Alpha' },
      { id: GUILD_B, name: 'Bravo' },
    ])
    .run();
};

describe('userPreferencesService — getPreferences / updatePreferences', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it("retourne les défauts si l'utilisateur n'a aucune préférence", async () => {
    const service = createUserPreferencesService({ client });
    const prefs = await service.getPreferences(USER);
    expect(prefs.theme).toBe('system');
    expect(prefs.locale).toBe('fr');
  });

  it("ne persiste pas les défauts (lecture pure quand l'utilisateur n'a jamais écrit)", async () => {
    const service = createUserPreferencesService({ client });
    await service.getPreferences(USER);
    const rows = await client.db.select().from(sqliteSchema.userPreferences).all();
    expect(rows).toHaveLength(0);
  });

  it('persiste un patch partiel et préserve les valeurs non touchées', async () => {
    const service = createUserPreferencesService({ client });
    await service.updatePreferences(USER, { theme: 'dark' });
    const after = await service.getPreferences(USER);
    expect(after.theme).toBe('dark');
    expect(after.locale).toBe('fr');
    await service.updatePreferences(USER, { locale: 'en' });
    const final = await service.getPreferences(USER);
    expect(final.theme).toBe('dark');
    expect(final.locale).toBe('en');
  });

  it('refuse un theme hors enum', async () => {
    const service = createUserPreferencesService({ client });
    await expect(
      service.updatePreferences(USER, { theme: 'rainbow' as 'system' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('isole les préférences entre utilisateurs', async () => {
    const service = createUserPreferencesService({ client });
    await service.updatePreferences(USER, { theme: 'dark' });
    await service.updatePreferences(USER_OTHER, { theme: 'light' });
    const a = await service.getPreferences(USER);
    const b = await service.getPreferences(USER_OTHER);
    expect(a.theme).toBe('dark');
    expect(b.theme).toBe('light');
  });
});

describe('userPreferencesService — getGuildPreferences / updatePinnedModules', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seedGuilds(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('retourne pinnedModules vide quand pas de préférence pour le couple', async () => {
    const service = createUserPreferencesService({ client });
    const prefs = await service.getGuildPreferences(USER, GUILD_A);
    expect(prefs.pinnedModules).toEqual([]);
  });

  it('persiste une liste de pins valides et les relit dans l ordre', async () => {
    const service = createUserPreferencesService({ client });
    await service.updatePinnedModules(USER, GUILD_A, [
      { moduleId: 'moderation', position: 0 },
      { moduleId: 'welcome', position: 1 },
      { moduleId: 'logs', position: 2 },
    ]);
    const after = await service.getGuildPreferences(USER, GUILD_A);
    expect(after.pinnedModules).toEqual([
      { moduleId: 'moderation', position: 0 },
      { moduleId: 'welcome', position: 1 },
      { moduleId: 'logs', position: 2 },
    ]);
  });

  it('remplace la liste en bloc à chaque update (pas de merge)', async () => {
    const service = createUserPreferencesService({ client });
    await service.updatePinnedModules(USER, GUILD_A, [
      { moduleId: 'moderation', position: 0 },
      { moduleId: 'welcome', position: 1 },
    ]);
    await service.updatePinnedModules(USER, GUILD_A, [{ moduleId: 'logs', position: 0 }]);
    const after = await service.getGuildPreferences(USER, GUILD_A);
    expect(after.pinnedModules).toEqual([{ moduleId: 'logs', position: 0 }]);
  });

  it('isole les préférences entre guilds pour un même user', async () => {
    const service = createUserPreferencesService({ client });
    await service.updatePinnedModules(USER, GUILD_A, [{ moduleId: 'moderation', position: 0 }]);
    await service.updatePinnedModules(USER, GUILD_B, [{ moduleId: 'welcome', position: 0 }]);
    const a = await service.getGuildPreferences(USER, GUILD_A);
    const b = await service.getGuildPreferences(USER, GUILD_B);
    expect(a.pinnedModules).toEqual([{ moduleId: 'moderation', position: 0 }]);
    expect(b.pinnedModules).toEqual([{ moduleId: 'welcome', position: 0 }]);
  });

  it('refuse plus de 8 pins', async () => {
    const service = createUserPreferencesService({ client });
    const tooMany = Array.from({ length: 9 }, (_, i) => ({
      moduleId: `module-${i}`,
      position: i,
    }));
    await expect(service.updatePinnedModules(USER, GUILD_A, tooMany)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('accepte exactement 8 pins (limite haute incluse)', async () => {
    const service = createUserPreferencesService({ client });
    const exactlyEight = Array.from({ length: 8 }, (_, i) => ({
      moduleId: `module-${i}`,
      position: i,
    }));
    await service.updatePinnedModules(USER, GUILD_A, exactlyEight);
    const after = await service.getGuildPreferences(USER, GUILD_A);
    expect(after.pinnedModules).toHaveLength(8);
  });

  it('refuse un moduleId dupliqué dans la liste', async () => {
    const service = createUserPreferencesService({ client });
    await expect(
      service.updatePinnedModules(USER, GUILD_A, [
        { moduleId: 'moderation', position: 0 },
        { moduleId: 'moderation', position: 1 },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuse une position négative ou non-entière', async () => {
    const service = createUserPreferencesService({ client });
    await expect(
      service.updatePinnedModules(USER, GUILD_A, [{ moduleId: 'moderation', position: -1 }]),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.updatePinnedModules(USER, GUILD_A, [{ moduleId: 'moderation', position: 1.5 }]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuse des positions dupliquées', async () => {
    const service = createUserPreferencesService({ client });
    await expect(
      service.updatePinnedModules(USER, GUILD_A, [
        { moduleId: 'moderation', position: 0 },
        { moduleId: 'welcome', position: 0 },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepte une liste vide (désépinglage total)', async () => {
    const service = createUserPreferencesService({ client });
    await service.updatePinnedModules(USER, GUILD_A, [{ moduleId: 'moderation', position: 0 }]);
    await service.updatePinnedModules(USER, GUILD_A, []);
    const after = await service.getGuildPreferences(USER, GUILD_A);
    expect(after.pinnedModules).toEqual([]);
  });
});

describe('userPreferencesService — cache', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seedGuilds(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('invalide le cache après écriture (theme dark immédiatement visible)', async () => {
    const service = createUserPreferencesService({
      client,
      cache: { maxSize: 100, ttlMs: 60_000 },
    });
    await service.getPreferences(USER); // hit DB → cache MISS résolue en défaut
    await service.updatePreferences(USER, { theme: 'dark' });
    const after = await service.getPreferences(USER);
    expect(after.theme).toBe('dark');
  });

  it('invalide le cache des pins après update', async () => {
    const service = createUserPreferencesService({
      client,
      cache: { maxSize: 100, ttlMs: 60_000 },
    });
    await service.getGuildPreferences(USER, GUILD_A);
    await service.updatePinnedModules(USER, GUILD_A, [{ moduleId: 'moderation', position: 0 }]);
    const after = await service.getGuildPreferences(USER, GUILD_A);
    expect(after.pinnedModules).toEqual([{ moduleId: 'moderation', position: 0 }]);
  });
});
