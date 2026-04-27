import {
  type ButtonInteractionInput,
  type ChannelId,
  type GuildId,
  type MessageId,
  ModuleError,
  type ModuleId,
  type UIMessage,
  type UserId,
} from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createInteractionsRegistry } from '../../src/interactions.js';

const MOD_A = 'mod-a' as ModuleId;
const MOD_B = 'mod-b' as ModuleId;

const inputFor = (customId: string): ButtonInteractionInput => ({
  guildId: 'guild' as GuildId,
  channelId: 'channel' as ChannelId,
  messageId: 'msg' as MessageId,
  userId: 'user' as UserId,
  customId,
});

const successUI = (message: string): UIMessage => ({
  kind: 'success',
  payload: { message },
});

describe('createInteractionsRegistry', () => {
  it('dispatch un click vers le handler dont le préfixe matche', async () => {
    const reg = createInteractionsRegistry();
    const handler = vi.fn(async () => successUI('ok'));
    reg.registerButton(MOD_A, 'rr:', handler);

    const result = await reg.dispatchButton(inputFor('rr:msg-1:role-2'));
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]?.customId).toBe('rr:msg-1:role-2');
    expect(result).toEqual(successUI('ok'));
  });

  it('retourne null si aucun handler ne matche', async () => {
    const reg = createInteractionsRegistry();
    reg.registerButton(MOD_A, 'rr:', vi.fn());

    const result = await reg.dispatchButton(inputFor('other:foo'));
    expect(result).toBeNull();
  });

  it('le préfixe le plus spécifique gagne en cas de chevauchement', async () => {
    const reg = createInteractionsRegistry();
    const generic = vi.fn(async () => successUI('generic'));
    const specific = vi.fn(async () => successUI('specific'));
    reg.registerButton(MOD_A, 'rr:', generic);
    reg.registerButton(MOD_A, 'rr:msg-1:', specific);

    const result = await reg.dispatchButton(inputFor('rr:msg-1:role-2'));
    expect(result).toEqual(successUI('specific'));
    expect(specific).toHaveBeenCalledOnce();
    expect(generic).not.toHaveBeenCalled();
  });

  it('refuse un préfixe déjà utilisé par un autre module', () => {
    const reg = createInteractionsRegistry();
    reg.registerButton(MOD_A, 'rr:', vi.fn());
    expect(() => reg.registerButton(MOD_B, 'rr:', vi.fn())).toThrow(ModuleError);
  });

  it('autorise le ré-enregistrement par le même module (remplace)', async () => {
    const reg = createInteractionsRegistry();
    const first = vi.fn(async () => successUI('first'));
    const second = vi.fn(async () => successUI('second'));
    reg.registerButton(MOD_A, 'rr:', first);
    reg.registerButton(MOD_A, 'rr:', second);

    const result = await reg.dispatchButton(inputFor('rr:foo'));
    expect(result).toEqual(successUI('second'));
    expect(first).not.toHaveBeenCalled();
  });

  it('refuse les préfixes vides', () => {
    const reg = createInteractionsRegistry();
    expect(() => reg.registerButton(MOD_A, '', vi.fn())).toThrow(ModuleError);
  });

  it('la désouscription retire le handler et est idempotente', async () => {
    const reg = createInteractionsRegistry();
    const handler = vi.fn(async () => successUI('ok'));
    const unsub = reg.registerButton(MOD_A, 'rr:', handler);
    unsub();
    unsub(); // idempotent
    const result = await reg.dispatchButton(inputFor('rr:foo'));
    expect(result).toBeNull();
  });

  it('unregisterModule retire tous les handlers du module', async () => {
    const reg = createInteractionsRegistry();
    reg.registerButton(
      MOD_A,
      'rr:',
      vi.fn(async () => successUI('a1')),
    );
    reg.registerButton(
      MOD_A,
      'foo:',
      vi.fn(async () => successUI('a2')),
    );
    reg.registerButton(
      MOD_B,
      'bar:',
      vi.fn(async () => successUI('b1')),
    );

    reg.unregisterModule(MOD_A);

    expect(await reg.dispatchButton(inputFor('rr:x'))).toBeNull();
    expect(await reg.dispatchButton(inputFor('foo:x'))).toBeNull();
    expect(await reg.dispatchButton(inputFor('bar:x'))).toEqual(successUI('b1'));
  });

  it('convertit `void` / `undefined` retourné par le handler en null', async () => {
    const reg = createInteractionsRegistry();
    const handler = vi.fn(async () => undefined);
    reg.registerButton(MOD_A, 'rr:', handler);

    const result = await reg.dispatchButton(inputFor('rr:foo'));
    expect(result).toBeNull();
  });

  it('serviceFor scope les enregistrements au moduleId fourni', async () => {
    const reg = createInteractionsRegistry();
    const svcA = reg.serviceFor(MOD_A);
    svcA.onButton(
      'rr:',
      vi.fn(async () => successUI('from A')),
    );

    const result = await reg.dispatchButton(inputFor('rr:foo'));
    expect(result).toEqual(successUI('from A'));

    const svcB = reg.serviceFor(MOD_B);
    expect(() => svcB.onButton('rr:', vi.fn())).toThrow(ModuleError);
  });
});
