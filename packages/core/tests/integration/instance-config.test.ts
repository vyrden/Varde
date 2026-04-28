import { randomBytes } from 'node:crypto';

import { DependencyFailureError, ValidationError } from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInstanceConfigService } from '../../src/instance-config.js';
import { createLogger } from '../../src/logger.js';

const silentLogger = () =>
  createLogger({
    destination: { write: () => undefined },
    level: 'fatal',
  });

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  return client;
};

describe('createInstanceConfigService — état initial (DB vide)', () => {
  let client: DbClient<'sqlite'>;
  let masterKey: Buffer;

  beforeEach(async () => {
    client = await setupClient();
    masterKey = randomBytes(32);
  });

  afterEach(async () => {
    await client.close();
  });

  it('getStatus retourne configured=false et currentStep=1 sur DB vide', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    expect(await service.getStatus()).toEqual({ configured: false, currentStep: 1 });
  });

  it('getConfig retourne tous les champs sensibles à null sur DB vide', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    const config = await service.getConfig();
    expect(config.discordAppId).toBeNull();
    expect(config.discordPublicKey).toBeNull();
    expect(config.discordBotToken).toBeNull();
    expect(config.discordClientSecret).toBeNull();
    expect(config.botName).toBeNull();
    expect(config.botAvatarUrl).toBeNull();
    expect(config.botDescription).toBeNull();
    expect(config.setupStep).toBe(1);
    expect(config.setupCompletedAt).toBeNull();
  });
});

describe('createInstanceConfigService — setStep', () => {
  let client: DbClient<'sqlite'>;
  let masterKey: Buffer;

  beforeEach(async () => {
    client = await setupClient();
    masterKey = randomBytes(32);
  });

  afterEach(async () => {
    await client.close();
  });

  it('crée la ligne singleton et persiste les champs en clair', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    await service.setStep(3, {
      discordAppId: '987654321098765432',
      discordPublicKey: 'abcd1234',
    });

    const config = await service.getConfig();
    expect(config.discordAppId).toBe('987654321098765432');
    expect(config.discordPublicKey).toBe('abcd1234');
    expect(config.setupStep).toBe(3);
  });

  it('chiffre le bot token en DB (raw select ne révèle pas le plaintext)', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    const plaintext = 'bot.token.with.distinctive.marker.PLAIN_VISIBLE_STRING';
    await service.setStep(4, { discordBotToken: plaintext });

    const rows = await client.db
      .select({
        ciphertext: sqliteSchema.instanceConfig.discordBotTokenCiphertext,
        iv: sqliteSchema.instanceConfig.discordBotTokenIv,
        authTag: sqliteSchema.instanceConfig.discordBotTokenAuthTag,
      })
      .from(sqliteSchema.instanceConfig)
      .all();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row?.ciphertext || !row.iv || !row.authTag) {
      throw new Error('expected encrypted columns to be populated');
    }
    expect(Buffer.from(row.ciphertext).toString('utf8')).not.toContain('PLAIN_VISIBLE_STRING');
    expect(Buffer.from(row.iv)).toHaveLength(12);
    expect(Buffer.from(row.authTag)).toHaveLength(16);
  });

  it('chiffre le client secret en DB (raw select ne révèle pas le plaintext)', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    await service.setStep(5, {
      discordClientSecret: 'OAUTH_CLIENT_SECRET_PLAINTEXT_MARKER',
    });

    const rows = await client.db
      .select({
        ciphertext: sqliteSchema.instanceConfig.discordClientSecretCiphertext,
      })
      .from(sqliteSchema.instanceConfig)
      .all();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row?.ciphertext) {
      throw new Error('expected ciphertext to be populated');
    }
    expect(Buffer.from(row.ciphertext).toString('utf8')).not.toContain('PLAINTEXT_MARKER');
  });

  it('round-trip : getConfig déchiffre le bot token et le client secret', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    await service.setStep(4, { discordBotToken: 'tok.live.42' });
    await service.setStep(5, { discordClientSecret: 'sec.live.42' });

    const config = await service.getConfig();
    expect(config.discordBotToken).toBe('tok.live.42');
    expect(config.discordClientSecret).toBe('sec.live.42');
  });

  it('ne fait pas reculer setup_step (max monotone)', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    await service.setStep(5, {});
    await service.setStep(2, { discordAppId: '111111111111111111' });

    const status = await service.getStatus();
    expect(status.currentStep).toBe(5);
    const config = await service.getConfig();
    expect(config.discordAppId).toBe('111111111111111111');
  });

  it('upsert idempotent : ne touche pas les champs absents du patch', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    await service.setStep(4, {
      discordAppId: '111111111111111111',
      discordBotToken: 'tok-original',
    });
    await service.setStep(5, { discordClientSecret: 'sec' });

    const config = await service.getConfig();
    expect(config.discordAppId).toBe('111111111111111111');
    expect(config.discordBotToken).toBe('tok-original');
    expect(config.discordClientSecret).toBe('sec');
  });

  it('persiste botName, botAvatarUrl et botDescription', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    await service.setStep(6, {
      botName: 'Varde',
      botAvatarUrl: 'https://cdn.example.com/avatar.png',
      botDescription: 'Bot communautaire',
    });

    const config = await service.getConfig();
    expect(config.botName).toBe('Varde');
    expect(config.botAvatarUrl).toBe('https://cdn.example.com/avatar.png');
    expect(config.botDescription).toBe('Bot communautaire');
  });
});

describe('createInstanceConfigService — complete & onReady', () => {
  let client: DbClient<'sqlite'>;
  let masterKey: Buffer;

  beforeEach(async () => {
    client = await setupClient();
    masterKey = randomBytes(32);
  });

  afterEach(async () => {
    await client.close();
  });

  it('complete pose setup_completed_at et getStatus retourne configured=true', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    await service.setStep(7, { discordBotToken: 'tok' });
    await service.complete();

    const status = await service.getStatus();
    expect(status.configured).toBe(true);
    const config = await service.getConfig();
    expect(config.setupCompletedAt).toBeInstanceOf(Date);
  });

  it('complete déclenche les handlers onReady', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    const handler = vi.fn();
    service.onReady(handler);

    await service.complete();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('complete est idempotent : second appel ne refire pas onReady', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    const handler = vi.fn();
    service.onReady(handler);

    await service.complete();
    await service.complete();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('onReady : la désinscription empêche le déclenchement', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    const handler = vi.fn();
    const off = service.onReady(handler);
    off();

    await service.complete();
    expect(handler).not.toHaveBeenCalled();
  });

  it('isole les erreurs : un handler qui jette ne bloque pas les autres', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    const crasher = vi.fn(() => {
      throw new Error('boom');
    });
    const survivor = vi.fn();
    service.onReady(crasher);
    service.onReady(survivor);

    await service.complete();
    expect(crasher).toHaveBeenCalledTimes(1);
    expect(survivor).toHaveBeenCalledTimes(1);
  });

  it('attend la résolution des handlers asynchrones', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    let resolved = false;
    service.onReady(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      resolved = true;
    });

    await service.complete();
    expect(resolved).toBe(true);
  });
});

describe('createInstanceConfigService — cache mémoire', () => {
  let client: DbClient<'sqlite'>;
  let masterKey: Buffer;

  beforeEach(async () => {
    client = await setupClient();
    masterKey = randomBytes(32);
  });

  afterEach(async () => {
    await client.close();
  });

  it('cache : un getStatus suivi d une mutation hors service rend l ancienne valeur', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    await service.setStep(3, { discordAppId: '123456789012345678' });
    // Premier getStatus : amorce le cache à partir de la DB.
    expect((await service.getStatus()).currentStep).toBe(3);

    // Mutation directe en DB, hors service. Si le cache fonctionne,
    // l'appel suivant retourne encore l'ancienne valeur — preuve qu'on
    // n'a pas re-tapé la DB.
    await client.db
      .update(sqliteSchema.instanceConfig)
      .set({ setupStep: 99 })
      .where(eq(sqliteSchema.instanceConfig.id, 'singleton'))
      .run();

    const status = await service.getStatus();
    expect(status.currentStep).toBe(3);
  });

  it('invalide le cache après setStep', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    await service.setStep(3, {});
    expect((await service.getStatus()).currentStep).toBe(3);

    await service.setStep(4, {});
    expect((await service.getStatus()).currentStep).toBe(4);
  });

  it('invalide le cache après complete', async () => {
    const service = createInstanceConfigService({
      client,
      masterKey,
      logger: silentLogger(),
    });
    await service.setStep(7, { discordBotToken: 'tok' });
    expect((await service.getStatus()).configured).toBe(false);

    await service.complete();
    expect((await service.getStatus()).configured).toBe(true);
  });
});

describe('createInstanceConfigService — validation', () => {
  it('refuse une masterKey de taille non conforme', async () => {
    const client = await setupClient();
    try {
      expect(() =>
        createInstanceConfigService({
          client,
          masterKey: Buffer.alloc(16),
          logger: silentLogger(),
        }),
      ).toThrow(ValidationError);
    } finally {
      await client.close();
    }
  });

  it('rejette getConfig si le bot token chiffré ne se déchiffre pas', async () => {
    const client = await setupClient();
    const masterKey = randomBytes(32);
    try {
      // Insertion brute d'une ligne avec un blob bidon : aucune clé ne
      // peut le déchiffrer, le service doit lever DependencyFailureError.
      await client.db.run(sql`
        INSERT INTO instance_config
          (id, setup_step, discord_bot_token_ciphertext, discord_bot_token_iv, discord_bot_token_auth_tag)
        VALUES
          ('singleton', 4, X'00112233', X'445566778899AABBCCDDEEFF', X'00000000000000000000000000000000')
      `);
      const service = createInstanceConfigService({
        client,
        masterKey,
        logger: silentLogger(),
      });
      await expect(service.getConfig()).rejects.toBeInstanceOf(DependencyFailureError);
    } finally {
      await client.close();
    }
  });
});
