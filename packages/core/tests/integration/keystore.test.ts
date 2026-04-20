import { randomBytes } from 'node:crypto';

import {
  DependencyFailureError,
  type GuildId,
  type ModuleId,
  ValidationError,
} from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createKeystoreService } from '../../src/keystore.js';

const GUILD: GuildId = '111' as GuildId;
const MODULE: ModuleId = 'moderation' as ModuleId;

const seed = async (client: DbClient<'sqlite'>): Promise<void> => {
  await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  await client.db
    .insert(sqliteSchema.modulesRegistry)
    .values({ id: MODULE, version: '1.0.0', manifest: {}, schemaVersion: 1 })
    .run();
};

describe('createKeystoreService — round-trip', () => {
  let client: DbClient<'sqlite'>;
  let masterKey: Buffer;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
    masterKey = randomBytes(32);
  });

  afterEach(async () => {
    await client.close();
  });

  it('chiffre et retrouve une valeur', async () => {
    const keystore = createKeystoreService({ client, moduleId: MODULE, masterKey });
    await keystore.put(GUILD, 'discord_webhook', 'https://example.com/webhook/abcdef');
    const value = await keystore.get(GUILD, 'discord_webhook');
    expect(value).toBe('https://example.com/webhook/abcdef');
  });

  it('retourne null sur une clé absente', async () => {
    const keystore = createKeystoreService({ client, moduleId: MODULE, masterKey });
    expect(await keystore.get(GUILD, 'missing')).toBeNull();
  });

  it('écrase une valeur existante', async () => {
    const keystore = createKeystoreService({ client, moduleId: MODULE, masterKey });
    await keystore.put(GUILD, 'token', 'v1');
    await keystore.put(GUILD, 'token', 'v2');
    expect(await keystore.get(GUILD, 'token')).toBe('v2');
  });

  it('supprime une entrée', async () => {
    const keystore = createKeystoreService({ client, moduleId: MODULE, masterKey });
    await keystore.put(GUILD, 'token', 'secret');
    await keystore.delete(GUILD, 'token');
    expect(await keystore.get(GUILD, 'token')).toBeNull();
  });

  it('stocke le ciphertext en base (pas le plaintext)', async () => {
    const keystore = createKeystoreService({ client, moduleId: MODULE, masterKey });
    await keystore.put(GUILD, 'token', 'plaintext-visible-string');
    const [row] = await client.db.select().from(sqliteSchema.keystore).all();
    expect(row).toBeDefined();
    const buffer = Buffer.from(row?.ciphertext as Uint8Array);
    expect(buffer.toString('utf8')).not.toContain('plaintext-visible-string');
  });
});

describe('createKeystoreService — rotation', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it("relit une entrée écrite avec l'ancienne clé puis la ré-encrit avec la nouvelle", async () => {
    const oldKey = randomBytes(32);
    const newKey = randomBytes(32);

    const legacy = createKeystoreService({ client, moduleId: MODULE, masterKey: oldKey });
    await legacy.put(GUILD, 'token', 'classified');

    const rotated = createKeystoreService({
      client,
      moduleId: MODULE,
      masterKey: newKey,
      previousMasterKey: oldKey,
    });
    const value = await rotated.get(GUILD, 'token');
    expect(value).toBe('classified');

    const newOnly = createKeystoreService({ client, moduleId: MODULE, masterKey: newKey });
    const afterLazyRewrite = await newOnly.get(GUILD, 'token');
    expect(afterLazyRewrite).toBe('classified');
  });

  it('rejette une lecture quand aucune clé ne déchiffre', async () => {
    const realKey = randomBytes(32);
    const wrongKey = randomBytes(32);

    const good = createKeystoreService({ client, moduleId: MODULE, masterKey: realKey });
    await good.put(GUILD, 'token', 'secret');

    const bad = createKeystoreService({ client, moduleId: MODULE, masterKey: wrongKey });
    await expect(bad.get(GUILD, 'token')).rejects.toBeInstanceOf(DependencyFailureError);
  });
});

describe('createKeystoreService — validation', () => {
  it('refuse une clé maître de taille non conforme', async () => {
    const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    try {
      await applyMigrations(client);
      expect(() =>
        createKeystoreService({
          client,
          moduleId: MODULE,
          masterKey: Buffer.alloc(16),
        }),
      ).toThrow(ValidationError);
    } finally {
      await client.close();
    }
  });
});
