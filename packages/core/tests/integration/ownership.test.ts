import { ConflictError } from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createOwnershipService } from '../../src/ownership.js';

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  return client;
};

describe('createOwnershipService — état initial', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('getOwners retourne une liste vide sur DB vide', async () => {
    const service = createOwnershipService({ client });
    expect(await service.getOwners()).toEqual([]);
  });

  it('isOwner retourne false pour n importe quel user sur DB vide', async () => {
    const service = createOwnershipService({ client });
    expect(await service.isOwner('111111111111111111')).toBe(false);
  });
});

describe('createOwnershipService — claimFirstOwnership', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('ajoute le user en owner si la table est vide', async () => {
    const service = createOwnershipService({ client });
    const result = await service.claimFirstOwnership('111111111111111111');

    expect(result.claimed).toBe(true);
    expect(await service.isOwner('111111111111111111')).toBe(true);
  });

  it('persiste grantedBy à null pour le premier owner auto-assigné', async () => {
    const service = createOwnershipService({ client });
    await service.claimFirstOwnership('111111111111111111');

    const owners = await service.getOwners();
    expect(owners).toHaveLength(1);
    expect(owners[0]?.discordUserId).toBe('111111111111111111');
    expect(owners[0]?.grantedByDiscordUserId).toBeNull();
  });

  it('no-op si la table contient déjà au moins un owner (claim ne double pas)', async () => {
    const service = createOwnershipService({ client });
    await service.claimFirstOwnership('111111111111111111');
    const result = await service.claimFirstOwnership('222222222222222222');

    expect(result.claimed).toBe(false);
    expect(await service.isOwner('222222222222222222')).toBe(false);

    const owners = await service.getOwners();
    expect(owners).toHaveLength(1);
    expect(owners[0]?.discordUserId).toBe('111111111111111111');
  });
});

describe('createOwnershipService — addOwner', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('ajoute un owner avec son grantedBy', async () => {
    const service = createOwnershipService({ client });
    await service.claimFirstOwnership('111111111111111111');
    await service.addOwner('222222222222222222', '111111111111111111');

    expect(await service.isOwner('222222222222222222')).toBe(true);
    const owners = await service.getOwners();
    expect(owners).toHaveLength(2);
    const second = owners.find((o) => o.discordUserId === '222222222222222222');
    expect(second?.grantedByDiscordUserId).toBe('111111111111111111');
  });

  it('idempotent : un second appel ne duplique pas la ligne', async () => {
    const service = createOwnershipService({ client });
    await service.claimFirstOwnership('111111111111111111');
    await service.addOwner('222222222222222222', '111111111111111111');
    await service.addOwner('222222222222222222', '111111111111111111');

    const owners = await service.getOwners();
    expect(owners).toHaveLength(2);
  });

  it('idempotent : préserve le grantedBy original (ne le réécrit pas)', async () => {
    const service = createOwnershipService({ client });
    await service.claimFirstOwnership('111111111111111111');
    await service.addOwner('222222222222222222', '111111111111111111');
    await service.addOwner('222222222222222222', '333333333333333333');

    const owners = await service.getOwners();
    const second = owners.find((o) => o.discordUserId === '222222222222222222');
    expect(second?.grantedByDiscordUserId).toBe('111111111111111111');
  });
});

describe('createOwnershipService — removeOwner', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('retire un owner quand il y en a plusieurs', async () => {
    const service = createOwnershipService({ client });
    await service.claimFirstOwnership('111111111111111111');
    await service.addOwner('222222222222222222', '111111111111111111');
    await service.removeOwner('222222222222222222');

    expect(await service.isOwner('222222222222222222')).toBe(false);
    expect(await service.isOwner('111111111111111111')).toBe(true);
  });

  it('refuse de retirer le dernier owner (ConflictError)', async () => {
    const service = createOwnershipService({ client });
    await service.claimFirstOwnership('111111111111111111');

    await expect(service.removeOwner('111111111111111111')).rejects.toBeInstanceOf(ConflictError);
    expect(await service.isOwner('111111111111111111')).toBe(true);
  });

  it('no-op silencieux si le user n est pas owner', async () => {
    const service = createOwnershipService({ client });
    await service.claimFirstOwnership('111111111111111111');
    await service.removeOwner('999999999999999999');

    const owners = await service.getOwners();
    expect(owners).toHaveLength(1);
  });
});

describe('createOwnershipService — getOwners', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('retourne les owners ordonnés par grantedAt croissant', async () => {
    const service = createOwnershipService({ client });
    await service.claimFirstOwnership('111111111111111111');
    // Petit délai pour que `grantedAt` diffère sur SQLite
    // (timestamp en seconds par défaut côté driver).
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.addOwner('222222222222222222', '111111111111111111');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.addOwner('333333333333333333', '111111111111111111');

    const owners = await service.getOwners();
    expect(owners.map((o) => o.discordUserId)).toEqual([
      '111111111111111111',
      '222222222222222222',
      '333333333333333333',
    ]);
  });

  it('grantedAt est une Date valide pour chaque owner', async () => {
    const service = createOwnershipService({ client });
    await service.claimFirstOwnership('111111111111111111');

    const owners = await service.getOwners();
    expect(owners[0]?.grantedAt).toBeInstanceOf(Date);
    expect(Number.isFinite(owners[0]?.grantedAt?.getTime())).toBe(true);
  });

  it('lit directement la DB (pas de cache invalidé incohérent)', async () => {
    const service = createOwnershipService({ client });
    await service.claimFirstOwnership('111111111111111111');

    // Insertion brute : si le service mettait du cache sans
    // l'invalider, getOwners ne verrait pas la nouvelle ligne.
    await client.db
      .insert(sqliteSchema.instanceOwners)
      .values({
        discordUserId: '444444444444444444',
        grantedByDiscordUserId: '111111111111111111',
      })
      .run();

    const owners = await service.getOwners();
    expect(owners).toHaveLength(2);
  });
});
