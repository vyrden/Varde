import type { UserId } from '@varde/contracts';
import { applyMigrations, createDbClient, type DbClient } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createInstanceAuditService, INSTANCE_AUDIT_ACTIONS } from '../../src/index.js';

const OWNER: UserId = '111111111111111111' as UserId;

describe('createInstanceAuditService', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('log() insère une entrée avec ULID + champs persistés', async () => {
    const audit = createInstanceAuditService({ client });
    const id = await audit.log({
      action: INSTANCE_AUDIT_ACTIONS.TOKEN_ROTATED,
      actor: { type: 'user', id: OWNER },
      severity: 'warn',
      metadata: { previousAppId: '987654321' },
    });
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const rows = await audit.query();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.id).toBe(id);
    expect(row?.action).toBe(INSTANCE_AUDIT_ACTIONS.TOKEN_ROTATED);
    expect(row?.actor).toEqual({ type: 'user', id: OWNER });
    expect(row?.severity).toBe('warn');
    expect(row?.metadata).toEqual({ previousAppId: '987654321' });
  });

  it('log() avec target persiste targetType + targetId', async () => {
    const audit = createInstanceAuditService({ client });
    await audit.log({
      action: INSTANCE_AUDIT_ACTIONS.OWNER_ADDED,
      actor: { type: 'user', id: OWNER },
      severity: 'info',
      target: { type: 'discord_user', id: '222222222222222222' },
    });
    const rows = await audit.query();
    expect(rows[0]?.target).toEqual({ type: 'discord_user', id: '222222222222222222' });
  });

  it('log() avec actor system → actorId null', async () => {
    const audit = createInstanceAuditService({ client });
    await audit.log({
      action: INSTANCE_AUDIT_ACTIONS.OWNER_CLAIMED,
      actor: { type: 'system' },
      severity: 'warn',
    });
    const rows = await audit.query();
    expect(rows[0]?.actor).toEqual({ type: 'system' });
  });

  it('query() filtre par action', async () => {
    const audit = createInstanceAuditService({ client });
    await audit.log({
      action: INSTANCE_AUDIT_ACTIONS.TOKEN_ROTATED,
      actor: { type: 'user', id: OWNER },
      severity: 'warn',
    });
    await audit.log({
      action: INSTANCE_AUDIT_ACTIONS.OWNER_ADDED,
      actor: { type: 'user', id: OWNER },
      severity: 'info',
    });
    const tokenRows = await audit.query({ action: INSTANCE_AUDIT_ACTIONS.TOKEN_ROTATED });
    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0]?.action).toBe(INSTANCE_AUDIT_ACTIONS.TOKEN_ROTATED);
  });

  it('query() filtre par actorType', async () => {
    const audit = createInstanceAuditService({ client });
    await audit.log({
      action: INSTANCE_AUDIT_ACTIONS.TOKEN_ROTATED,
      actor: { type: 'user', id: OWNER },
      severity: 'warn',
    });
    await audit.log({
      action: INSTANCE_AUDIT_ACTIONS.OWNER_CLAIMED,
      actor: { type: 'system' },
      severity: 'warn',
    });
    const userRows = await audit.query({ actorType: 'user' });
    expect(userRows).toHaveLength(1);
    expect(userRows[0]?.actor.type).toBe('user');
    const systemRows = await audit.query({ actorType: 'system' });
    expect(systemRows).toHaveLength(1);
    expect(systemRows[0]?.actor.type).toBe('system');
  });

  it('query() retourne ordre desc par ULID + supporte cursor', async () => {
    const audit = createInstanceAuditService({ client });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        await audit.log({
          action: INSTANCE_AUDIT_ACTIONS.URL_ADDED,
          actor: { type: 'user', id: OWNER },
          severity: 'info',
          target: { type: 'url', id: `url-${i}` },
        }),
      );
    }
    const all = await audit.query();
    expect(all.map((r) => r.id)).toEqual([ids[2], ids[1], ids[0]]);
    // Curseur — exclu strict.
    const afterFirst = await audit.query({ cursor: ids[2] });
    expect(afterFirst.map((r) => r.id)).toEqual([ids[1], ids[0]]);
  });

  it('query() respecte limit', async () => {
    const audit = createInstanceAuditService({ client });
    for (let i = 0; i < 5; i++) {
      await audit.log({
        action: INSTANCE_AUDIT_ACTIONS.URL_ADDED,
        actor: { type: 'user', id: OWNER },
        severity: 'info',
      });
    }
    const limited = await audit.query({ limit: 2 });
    expect(limited).toHaveLength(2);
  });
});
