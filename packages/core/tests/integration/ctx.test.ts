import { randomBytes } from 'node:crypto';

import {
  type ActionId,
  defineModule,
  type GuildId,
  type ModuleId,
  type RoleId,
  type UserId,
} from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuditService } from '../../src/audit.js';
import { createConfigService } from '../../src/config.js';
import { createCtxFactory } from '../../src/ctx.js';
import { createEventBus } from '../../src/events.js';
import { createPluginLoader } from '../../src/loader.js';
import { createLogger } from '../../src/logger.js';
import { createPermissionService } from '../../src/permissions.js';

const GUILD: GuildId = '111' as GuildId;
const USER: UserId = '42' as UserId;
const MODERATOR_ROLE: RoleId = 'role-mod' as RoleId;
const HELLO: ModuleId = 'hello-world' as ModuleId;

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const seed = async (client: DbClient<'sqlite'>): Promise<void> => {
  await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  await client.db
    .insert(sqliteSchema.modulesRegistry)
    .values({ id: HELLO, version: '1.0.0', manifest: {}, schemaVersion: 1 })
    .run();
};

const baseManifest = {
  id: HELLO,
  name: 'Hello World',
  version: '1.0.0',
  coreVersion: '^1.0.0',
  description: 'Module témoin.',
  author: { name: 'Mainteneur' },
  license: 'Apache-2.0',
  schemaVersion: 1,
  permissions: [
    {
      id: 'hello-world.ping',
      category: 'utility',
      defaultLevel: 'member' as const,
      description: 'Permet de ping.',
    },
  ],
  events: {
    listen: ['guild.memberJoin'],
    emit: ['hello-world.greeted'],
  },
};

describe('createCtxFactory — composition minimale', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('produit un ModuleContext complet et figé', async () => {
    const logger = silentLogger();
    const eventBus = createEventBus({ logger });
    const config = createConfigService({ client });
    const permissions = createPermissionService({
      client,
      resolveMemberContext: async () => null,
    });
    const { factory, shutdown } = createCtxFactory({
      client,
      loggerRoot: logger,
      eventBus,
      config,
      permissions,
      keystoreMasterKey: randomBytes(32),
    });

    try {
      const ctx = factory({ id: HELLO, version: '1.0.0' });
      expect(ctx.module).toEqual({ id: HELLO, version: '1.0.0' });
      expect(ctx.events).toBe(eventBus);
      expect(ctx.config).toBe(config);
      expect(ctx.permissions).toBe(permissions);
      expect(ctx.db).toEqual({ __scoped: true });
      expect(ctx.ai).toBeNull();
      expect(typeof ctx.logger.info).toBe('function');
      expect(typeof ctx.ui.embed).toBe('function');
      expect(typeof ctx.audit.log).toBe('function');
      expect(typeof ctx.scheduler.in).toBe('function');
      expect(typeof ctx.keystore.put).toBe('function');
      expect(typeof ctx.i18n.t).toBe('function');
      expect(Object.isFrozen(ctx)).toBe(true);
    } finally {
      await shutdown();
    }
  });

  it('mémoïse les services scopés (même instance pour le même module)', async () => {
    const logger = silentLogger();
    const { factory, shutdown } = createCtxFactory({
      client,
      loggerRoot: logger,
      eventBus: createEventBus({ logger }),
      config: createConfigService({ client }),
      permissions: createPermissionService({
        client,
        resolveMemberContext: async () => null,
      }),
      keystoreMasterKey: randomBytes(32),
    });

    try {
      const first = factory({ id: HELLO, version: '1.0.0' });
      const second = factory({ id: HELLO, version: '1.0.0' });
      expect(first.scheduler).toBe(second.scheduler);
      expect(first.audit).toBe(second.audit);
      expect(first.keystore).toBe(second.keystore);
    } finally {
      await shutdown();
    }
  });

  it('stubs : discord.sendMessage et modules.query jettent explicitement', async () => {
    const logger = silentLogger();
    const { factory, shutdown } = createCtxFactory({
      client,
      loggerRoot: logger,
      eventBus: createEventBus({ logger }),
      config: createConfigService({ client }),
      permissions: createPermissionService({
        client,
        resolveMemberContext: async () => null,
      }),
      keystoreMasterKey: randomBytes(32),
    });
    try {
      const ctx = factory({ id: HELLO, version: '1.0.0' });
      await expect(ctx.discord.sendMessage('chan' as never, 'hi')).rejects.toThrow(/Discord/);
      await expect(ctx.modules.query(HELLO, 'q', {})).rejects.toThrow(/Modules/);
      expect(await ctx.modules.isEnabled(GUILD, HELLO)).toBe(false);
    } finally {
      await shutdown();
    }
  });

  it("discord.sendEmbed throw explicitement quand aucun DiscordService n'est câblé", async () => {
    const logger = silentLogger();
    const { factory, shutdown } = createCtxFactory({
      client,
      loggerRoot: logger,
      eventBus: createEventBus({ logger }),
      config: createConfigService({ client }),
      permissions: createPermissionService({
        client,
        resolveMemberContext: async () => null,
      }),
      keystoreMasterKey: randomBytes(32),
    });
    try {
      const ctx = factory({ id: HELLO, version: '1.0.0' });
      await expect(
        ctx.discord.sendEmbed('channel-id' as never, {
          kind: 'embed',
          payload: { title: 'test' },
        }),
      ).rejects.toThrowError(/DiscordService non câblé/);
    } finally {
      await shutdown();
    }
  });
});

describe('createCtxFactory — bout en bout avec le loader', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await seed(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('charge un module, le branche sur un événement, audite, planifie', async () => {
    const logger = silentLogger();
    const eventBus = createEventBus({ logger });
    const config = createConfigService({ client });
    const permissions = createPermissionService({
      client,
      resolveMemberContext: async () => ({
        roles: [MODERATOR_ROLE],
        isOwner: false,
        isAdministrator: false,
      }),
    });
    const { factory, shutdown } = createCtxFactory({
      client,
      loggerRoot: logger,
      eventBus,
      config,
      permissions,
      keystoreMasterKey: randomBytes(32),
    });

    const scheduledHandler = vi.fn();
    let receivedUserId: UserId | null = null;

    const helloModule = defineModule({
      manifest: baseManifest,
      onLoad: async (ctx) => {
        ctx.events.on('guild.memberJoin', async (event) => {
          receivedUserId = event.userId;
          await ctx.audit.log({
            guildId: event.guildId,
            action: 'hello-world.greeted.issued' as ActionId,
            actor: { type: 'module', id: HELLO },
            severity: 'info',
            metadata: { userId: event.userId },
          });
          await ctx.scheduler.in(0, `hello-world:welcome:${event.userId}`, scheduledHandler);
        });
      },
    });

    const loader = createPluginLoader({
      coreVersion: '1.0.0',
      logger,
      ctxFactory: factory,
    });

    try {
      loader.register(helloModule);
      await loader.loadAll();

      await eventBus.emit({
        type: 'guild.memberJoin',
        guildId: GUILD,
        userId: USER,
        joinedAt: Date.now(),
      });

      expect(receivedUserId).toBe(USER);

      // Audit persisté.
      const audits = await createAuditService({ client }).query({ guildId: GUILD });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.action).toBe('hello-world.greeted.issued');
      expect(audits[0]?.moduleId).toBe(HELLO);

      // Tâche planifiée puis exécutée.
      const scheduler = loader.get(HELLO) ? null : null;
      void scheduler;
      const ctx = factory({ id: HELLO, version: '1.0.0' });
      const ran = await ctx.scheduler.runOnce();
      expect(ran).toBe(1);
      expect(scheduledHandler).toHaveBeenCalledTimes(1);
    } finally {
      await loader.unloadAll();
      await shutdown();
    }
  });
});
