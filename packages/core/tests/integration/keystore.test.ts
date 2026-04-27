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

  it('procédure SECURITY.md complète — rotation E2E avec plusieurs secrets', async () => {
    // Reproduit pas à pas la procédure documentée dans SECURITY.md
    // §« Rotation de la master key (chiffrement keystore) ».
    // Couvre le critère de sortie jalon 5 « Master key rotation
    // testée bout-en-bout ».

    const oldKey = randomBytes(32);
    const newKey = randomBytes(32);

    // Étape 0 — état initial : keystore avec `oldKey` seule, plusieurs
    // secrets persistés.
    const before = createKeystoreService({ client, moduleId: MODULE, masterKey: oldKey });
    await before.put(GUILD, 'ai-key', 'sk-ai-12345');
    await before.put(GUILD, 'webhook-secret', 'whk_abcdef');
    await before.put(GUILD, 'api-token', 'tok_xyz789');

    // Étape 1+2+3 — admin a généré une nouvelle clé, redéclaré
    // l'ancienne en `previousMasterKey`, redémarré le process. Le
    // keystore doit pouvoir lire les secrets existants (chiffrés
    // sous oldKey) ET écrire les nouveaux sous newKey.
    const transitional = createKeystoreService({
      client,
      moduleId: MODULE,
      masterKey: newKey,
      previousMasterKey: oldKey,
    });

    // Lire un secret existant : déchiffre via fallback oldKey, et
    // déclenche une réécriture paresseuse sous newKey.
    const aiKey = await transitional.get(GUILD, 'ai-key');
    expect(aiKey).toBe('sk-ai-12345');

    // Écrire un nouveau secret pendant la transition : direct sous
    // newKey, pas de double-chiffrement.
    await transitional.put(GUILD, 'fresh-secret', 'just_added');

    // Étape 4 — la ré-encryption est paresseuse. Les secrets non
    // encore lus restent sous oldKey jusqu'au prochain `get`.
    // On simule un keystore qui n'a PLUS l'ancienne clé pour
    // vérifier l'état post-transition partiel : `ai-key` et
    // `fresh-secret` doivent être lisibles (déjà sous newKey),
    // les deux autres doivent échouer.
    const intermediate = createKeystoreService({
      client,
      moduleId: MODULE,
      masterKey: newKey,
    });
    expect(await intermediate.get(GUILD, 'ai-key')).toBe('sk-ai-12345');
    expect(await intermediate.get(GUILD, 'fresh-secret')).toBe('just_added');
    await expect(intermediate.get(GUILD, 'webhook-secret')).rejects.toBeInstanceOf(
      DependencyFailureError,
    );
    await expect(intermediate.get(GUILD, 'api-token')).rejects.toBeInstanceOf(
      DependencyFailureError,
    );

    // L'admin lance la ré-encryption complète en touchant chaque
    // secret via le keystore transitional (équivalent d'un
    // `rekey()` futur ou d'une boucle scriptée).
    await transitional.get(GUILD, 'webhook-secret');
    await transitional.get(GUILD, 'api-token');

    // Étape 5 — admin retire `previousMasterKey` et redémarre. Tous
    // les secrets doivent être lisibles avec newKey seule.
    const after = createKeystoreService({ client, moduleId: MODULE, masterKey: newKey });
    expect(await after.get(GUILD, 'ai-key')).toBe('sk-ai-12345');
    expect(await after.get(GUILD, 'webhook-secret')).toBe('whk_abcdef');
    expect(await after.get(GUILD, 'api-token')).toBe('tok_xyz789');
    expect(await after.get(GUILD, 'fresh-secret')).toBe('just_added');

    // Et le keystore avec UNIQUEMENT l'ancienne clé doit tout
    // refuser — preuve que la rotation est complète, oldKey peut
    // être détruite en sécurité.
    const oldOnly = createKeystoreService({ client, moduleId: MODULE, masterKey: oldKey });
    await expect(oldOnly.get(GUILD, 'ai-key')).rejects.toBeInstanceOf(DependencyFailureError);
    await expect(oldOnly.get(GUILD, 'webhook-secret')).rejects.toBeInstanceOf(
      DependencyFailureError,
    );
    await expect(oldOnly.get(GUILD, 'api-token')).rejects.toBeInstanceOf(DependencyFailureError);
    await expect(oldOnly.get(GUILD, 'fresh-secret')).rejects.toBeInstanceOf(DependencyFailureError);
  });

  it("procédure interrompue : un get() de transition rate-coupé n'invalide rien", async () => {
    // Cas d'un crash entre put et la fin du get/rewrite : on
    // vérifie qu'un get() pendant la transition ne corrompt pas le
    // payload chiffré (atomicité de l'upsert).
    const oldKey = randomBytes(32);
    const newKey = randomBytes(32);

    const before = createKeystoreService({ client, moduleId: MODULE, masterKey: oldKey });
    await before.put(GUILD, 'token', 'secret-value');

    // Plusieurs lectures concurrentes via le keystore de transition.
    // Toutes doivent retourner la valeur claire ; la dernière
    // écriture gagne mais toutes valident le déchiffrement
    // d'origine.
    const transitional = createKeystoreService({
      client,
      moduleId: MODULE,
      masterKey: newKey,
      previousMasterKey: oldKey,
    });
    const reads = await Promise.all([
      transitional.get(GUILD, 'token'),
      transitional.get(GUILD, 'token'),
      transitional.get(GUILD, 'token'),
    ]);
    expect(reads).toEqual(['secret-value', 'secret-value', 'secret-value']);

    // Après les reads concurrents, la valeur doit être lisible avec
    // newKey seule.
    const newOnly = createKeystoreService({ client, moduleId: MODULE, masterKey: newKey });
    expect(await newOnly.get(GUILD, 'token')).toBe('secret-value');
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
