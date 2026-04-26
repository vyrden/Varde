import type { Logger, ModuleCommand } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  registerSlashCommandsForGuild,
  type SlashRegistrationClient,
  toCommandPayload,
  toOptionPayload,
} from '../../src/slash-registration.js';

const noopLogger = (): Logger => {
  const noop = () => {};
  const logger: Logger = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => logger,
  };
  return logger;
};

describe('toOptionPayload', () => {
  it('mappe string → type 3 avec bornes optionnelles', () => {
    const payload = toOptionPayload({
      name: 'reason',
      description: 'Raison',
      type: 'string',
      required: false,
      maxLength: 512,
    });
    expect(payload).toEqual({
      type: 3,
      name: 'reason',
      description: 'Raison',
      required: false,
      max_length: 512,
    });
  });

  it('mappe integer → type 4 avec min/maxValue', () => {
    const payload = toOptionPayload({
      name: 'count',
      description: 'Nombre',
      type: 'integer',
      required: true,
      minValue: 1,
      maxValue: 100,
    });
    expect(payload).toEqual({
      type: 4,
      name: 'count',
      description: 'Nombre',
      required: true,
      min_value: 1,
      max_value: 100,
    });
  });

  it('mappe boolean → type 5', () => {
    const payload = toOptionPayload({ name: 'silent', description: 'X', type: 'boolean' });
    expect(payload.type).toBe(5);
  });

  it('mappe user/role/channel → 6/8/7', () => {
    expect(toOptionPayload({ name: 'm', description: 'm', type: 'user' }).type).toBe(6);
    expect(toOptionPayload({ name: 'r', description: 'r', type: 'role' }).type).toBe(8);
    expect(toOptionPayload({ name: 'c', description: 'c', type: 'channel' }).type).toBe(7);
  });

  it('mappe number → type 10', () => {
    expect(toOptionPayload({ name: 'n', description: 'n', type: 'number' }).type).toBe(10);
  });

  it('inclut les choices quand fournis', () => {
    const payload = toOptionPayload({
      name: 'severity',
      description: 'X',
      type: 'string',
      choices: [
        { name: 'Info', value: 'info' },
        { name: 'Warn', value: 'warn' },
      ],
    });
    expect(payload.choices).toEqual([
      { name: 'Info', value: 'info' },
      { name: 'Warn', value: 'warn' },
    ]);
  });
});

describe('toCommandPayload', () => {
  it('rend un payload minimal sans options', () => {
    const cmd: ModuleCommand = {
      name: 'ping',
      description: 'Pong',
      handler: () => ({ kind: 'success', payload: { message: '' } }) as never,
    };
    expect(toCommandPayload(cmd)).toEqual({ name: 'ping', description: 'Pong' });
  });

  it("inclut les options et préserve l'ordre déclaré", () => {
    const cmd: ModuleCommand = {
      name: 'warn',
      description: 'Avertir',
      options: [
        { name: 'member', description: 'Cible', type: 'user', required: true },
        { name: 'reason', description: 'Raison', type: 'string', maxLength: 512 },
      ],
      handler: () => ({ kind: 'success', payload: { message: '' } }) as never,
    };
    const payload = toCommandPayload(cmd);
    expect(payload.options).toBeDefined();
    expect(payload.options?.[0]?.name).toBe('member');
    expect(payload.options?.[1]?.name).toBe('reason');
  });

  it('omet le champ options quand le tableau est vide', () => {
    const cmd: ModuleCommand = {
      name: 'x',
      description: 'X',
      options: [],
      handler: () => ({ kind: 'success', payload: { message: '' } }) as never,
    };
    expect(toCommandPayload(cmd).options).toBeUndefined();
  });
});

describe('registerSlashCommandsForGuild', () => {
  it('PUT les payloads via application.commands.set(guild)', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const client: SlashRegistrationClient = {
      application: { id: 'app-1', commands: { set } },
    };
    const cmd: ModuleCommand = {
      name: 'ping',
      description: 'Pong',
      handler: () => ({ kind: 'success', payload: { message: '' } }) as never,
    };
    await registerSlashCommandsForGuild(client, '111', [cmd], noopLogger());
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith([{ name: 'ping', description: 'Pong' }], '111');
  });

  it('skip silencieux quand application est null (client pas ready)', async () => {
    const client: SlashRegistrationClient = { application: null };
    await registerSlashCommandsForGuild(client, '111', [], noopLogger());
    // pas d'erreur, pas de side effect — le warn est dans le logger noop
  });

  it('ne lève pas si Discord refuse — log un warn et continue', async () => {
    const set = vi.fn().mockRejectedValue(new Error('Network timeout'));
    const client: SlashRegistrationClient = {
      application: { id: 'app-1', commands: { set } },
    };
    await expect(
      registerSlashCommandsForGuild(client, '111', [], noopLogger()),
    ).resolves.toBeUndefined();
  });

  it('PUT vide quand aucune commande — Discord retire toutes les commandes existantes', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const client: SlashRegistrationClient = {
      application: { id: 'app-1', commands: { set } },
    };
    await registerSlashCommandsForGuild(client, '111', [], noopLogger());
    expect(set).toHaveBeenCalledWith([], '111');
  });
});
