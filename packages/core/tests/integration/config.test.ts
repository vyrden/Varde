import type { ConfigChangedEvent, GuildId, UserId } from '@varde/contracts';
import { NotFoundError } from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConfigService, deepMerge } from '../../src/config.js';

const GUILD: GuildId = '111' as GuildId;
const ACTOR: UserId = '42' as UserId;

const seedGuild = async (client: DbClient<'sqlite'>): Promise<void> => {
  await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
};

describe('deepMerge', () => {
  it('fusionne profondément deux objets', () => {
    const base = { core: { locale: 'en', retention: 30 }, modules: { mod: { x: 1 } } };
    const patch = { core: { locale: 'fr' }, modules: { mod: { y: 2 } } };
    expect(deepMerge(base, patch)).toEqual({
      core: { locale: 'fr', retention: 30 },
      modules: { mod: { x: 1, y: 2 } },
    });
  });

  it('remplace les tableaux au lieu de les fusionner', () => {
    const base = { tags: ['a', 'b'] };
    const patch = { tags: ['c'] };
    expect(deepMerge(base, patch)).toEqual({ tags: ['c'] });
  });

  it('remplace une valeur par null quand le patch porte null', () => {
    const base = { key: 'value' };
    expect(deepMerge(base, { key: null })).toEqual({ key: null });
  });
});

describe('createConfigService', () => {
  let client: DbClient<'sqlite'>;
  let events: ConfigChangedEvent[];

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seedGuild(client);
    events = [];
  });

  afterEach(async () => {
    await client.close();
  });

  it("lève NotFoundError si aucune config n'a été initialisée", async () => {
    const config = createConfigService({ client });
    await expect(config.get(GUILD)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('ensureGuild crée une config vide en version 1', async () => {
    const config = createConfigService({ client });
    await config.ensureGuild(GUILD);
    expect(await config.get(GUILD)).toEqual({});
  });

  it('set crée la ligne si absente et incrémente la version', async () => {
    const config = createConfigService({ client });
    await config.set(GUILD, { core: { locale: 'fr' } });
    await config.set(GUILD, { core: { retention: 90 } });

    const [row] = await client.db.select().from(sqliteSchema.guildConfig).all();
    expect(row).toMatchObject({
      guildId: GUILD,
      version: 2,
      config: { core: { locale: 'fr', retention: 90 } },
    });
  });

  it("setWith porte l'acteur et la portée de l'événement config.changed", async () => {
    const config = createConfigService({
      client,
      onChanged: async (event) => {
        events.push(event);
      },
    });
    await config.setWith(
      GUILD,
      { modules: { moderation: { threshold: 5 } } },
      { updatedBy: ACTOR, scope: 'modules.moderation' },
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'config.changed',
      guildId: GUILD,
      scope: 'modules.moderation',
      versionBefore: 0,
      versionAfter: 1,
      updatedBy: ACTOR,
    });
  });

  it('rollback sur erreur dans le callback n annule pas l écriture persistée', async () => {
    const config = createConfigService({
      client,
      onChanged: () => {
        throw new Error('listener failed');
      },
    });
    await expect(config.set(GUILD, { core: { locale: 'fr' } })).rejects.toThrow('listener failed');
    const [row] = await client.db.select().from(sqliteSchema.guildConfig).all();
    expect(row?.config).toEqual({ core: { locale: 'fr' } });
    expect(row?.version).toBe(1);
  });

  it('persiste updatedBy = null par défaut pour une écriture système', async () => {
    const config = createConfigService({ client });
    await config.set(GUILD, { core: { locale: 'fr' } });
    const [row] = await client.db.select().from(sqliteSchema.guildConfig).all();
    expect(row?.updatedBy).toBeNull();
  });

  it('persiste updatedBy fourni via setWith', async () => {
    const config = createConfigService({ client });
    await config.setWith(GUILD, { core: { locale: 'fr' } }, { updatedBy: ACTOR });
    const [row] = await client.db.select().from(sqliteSchema.guildConfig).all();
    expect(row?.updatedBy).toBe(ACTOR);
  });
});
