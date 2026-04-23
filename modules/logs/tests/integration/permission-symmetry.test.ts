import type { GuildId, ModuleId, PermissionId } from '@varde/contracts';
import { createPermissionService, type MemberContextResolver } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { manifest as logsManifest } from '../../src/manifest.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const GUILD = 'g1' as GuildId;
const LOGS = 'logs' as ModuleId;
const LOGS_TIERS = 'logs-tiers' as ModuleId;
const LOGS_MANAGE: PermissionId = 'logs.config.manage' as PermissionId;
const LOGS_TIERS_MANAGE: PermissionId = 'logs-tiers.config.manage' as PermissionId;

// ---------------------------------------------------------------------------
// Manifeste tiers fictif — construit inline, pas de fichier externe.
// ---------------------------------------------------------------------------

const logsTiersPermissions = [
  {
    id: LOGS_TIERS_MANAGE,
    category: 'config',
    defaultLevel: 'admin' as const,
    description: 'Configurer le module tiers fictif (test ADR 0008).',
  },
];

// ---------------------------------------------------------------------------
// Helper : résolveur de contexte Discord — inutile pour les acteurs module
// mais requis par l'API createPermissionService.
// ---------------------------------------------------------------------------

const noopResolver: MemberContextResolver = async () => null;

// ---------------------------------------------------------------------------
// Régression ADR 0008 — symétrie permissions officiel / tiers
//
// Garantie : un module ne peut exercer que ses propres permissions (celles
// dont l'id est préfixé par son propre id). Le fait qu'un module soit
// « officiel » (présent dans le repo) ne lui confère aucun privilège
// supplémentaire par rapport à un module tiers.
// ---------------------------------------------------------------------------

describe('ADR 0008 : symétrie permissions officiel/tiers', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    // Enregistrer les deux modules dans modules_registry (contrainte FK
    // de permissions_registry → modules_registry).
    await client.db
      .insert(sqliteSchema.modulesRegistry)
      .values([
        { id: LOGS, version: '1.0.0', manifest: {}, schemaVersion: 0 },
        { id: LOGS_TIERS, version: '1.0.0', manifest: {}, schemaVersion: 0 },
      ])
      .run();
  });

  afterEach(async () => {
    await client.close();
  });

  it('logs et logs-tiers enregistrent leurs permissions symétriquement', async () => {
    const svc = createPermissionService({ client, resolveMemberContext: noopResolver });

    // Enregistrer les permissions des deux modules dans permissions_registry.
    await svc.registerPermissions(
      logsManifest.permissions.map((p) => ({
        id: p.id,
        moduleId: logsManifest.id,
        description: p.description,
        category: p.category,
        defaultLevel: p.defaultLevel,
        createdAt: new Date().toISOString() as never,
      })),
    );

    await svc.registerPermissions(
      logsTiersPermissions.map((p) => ({
        id: p.id,
        moduleId: LOGS_TIERS,
        description: p.description,
        category: p.category,
        defaultLevel: p.defaultLevel,
        createdAt: new Date().toISOString() as never,
      })),
    );

    // Un module peut exercer ses propres permissions.
    expect(
      await svc.canInGuild(GUILD, { type: 'module', id: LOGS }, LOGS_MANAGE),
      'logs doit pouvoir exercer logs.config.manage',
    ).toBe(true);

    expect(
      await svc.canInGuild(GUILD, { type: 'module', id: LOGS_TIERS }, LOGS_TIERS_MANAGE),
      'logs-tiers doit pouvoir exercer logs-tiers.config.manage',
    ).toBe(true);

    // Un module NE PEUT PAS exercer les permissions d'un autre module —
    // qu'il soit officiel ou tiers.
    expect(
      await svc.canInGuild(GUILD, { type: 'module', id: LOGS }, LOGS_TIERS_MANAGE),
      'logs (officiel) NE DOIT PAS exercer logs-tiers.config.manage',
    ).toBe(false);

    expect(
      await svc.canInGuild(GUILD, { type: 'module', id: LOGS_TIERS }, LOGS_MANAGE),
      'logs-tiers NE DOIT PAS exercer logs.config.manage',
    ).toBe(false);
  });
});
