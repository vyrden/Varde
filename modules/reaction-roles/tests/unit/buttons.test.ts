import type { ButtonInteractionInput, ModuleContext, UIMessage } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import { buildButtonCustomId, handleButtonClick, parseButtonCustomId } from '../../src/buttons.js';

const GUILD = '111111111111111111' as never;
const CHANNEL = '222222222222222222' as never;
const MESSAGE = '333333333333333333' as never;
const USER = '444444444444444444' as never;
const ROLE_EU = '555555555555555555' as never;
const ROLE_AS = '666666666666666666' as never;

const ENTRY_ID = '00000000-0000-4000-8000-000000000001';

const baseEntry = {
  id: ENTRY_ID,
  label: 'Continents',
  channelId: CHANNEL,
  messageId: MESSAGE,
  message: '',
  kind: 'buttons' as const,
  mode: 'normal' as const,
  feedback: 'ephemeral' as const,
  pairs: [
    {
      emoji: { type: 'unicode' as const, value: '🇪🇺' },
      roleId: ROLE_EU,
      label: 'Europe',
      style: 'primary' as const,
    },
    {
      emoji: { type: 'unicode' as const, value: '🌏' },
      roleId: ROLE_AS,
      label: 'Asie',
      style: 'primary' as const,
    },
  ],
};

const successUI = (message: string): UIMessage => ({
  kind: 'success',
  payload: { message },
});

const errorUI = (message: string): UIMessage => ({
  kind: 'error',
  payload: { message },
});

interface MakeCtxOptions {
  readonly memberHas?: (roleId: string) => boolean;
  readonly entry?: typeof baseEntry;
}

const makeCtx = (options: MakeCtxOptions = {}): ModuleContext => {
  const memberHas = options.memberHas ?? (() => false);
  const entry = options.entry ?? baseEntry;
  return {
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
    config: {
      get: vi
        .fn()
        .mockResolvedValue({ modules: { 'reaction-roles': { version: 1, messages: [entry] } } }),
    },
    discord: {
      addMemberRole: vi.fn().mockResolvedValue(undefined),
      removeMemberRole: vi.fn().mockResolvedValue(undefined),
      memberHasRole: vi.fn(async (_g, _u, roleId) => memberHas(roleId as string)),
      sendDirectMessage: vi.fn().mockResolvedValue(true),
      getGuildName: vi.fn().mockReturnValue('Test Guild'),
      getRoleName: vi.fn().mockReturnValue('Test Role'),
    },
    audit: { log: vi.fn().mockResolvedValue(undefined) },
    ui: {
      success: (msg: string) => successUI(msg),
      error: (msg: string) => errorUI(msg),
    },
  } as unknown as ModuleContext;
};

const inputFor = (customId: string): ButtonInteractionInput => ({
  guildId: GUILD,
  channelId: CHANNEL,
  messageId: MESSAGE,
  userId: USER,
  customId,
});

describe('parseButtonCustomId / buildButtonCustomId', () => {
  it('round-trip un customId valide', () => {
    const built = buildButtonCustomId(ENTRY_ID, ROLE_EU);
    expect(built).toBe(`rr:${ENTRY_ID}:${ROLE_EU}`);
    expect(parseButtonCustomId(built)).toEqual({ entryId: ENTRY_ID, roleId: ROLE_EU });
  });

  it('refuse les customIds qui ne commencent pas par `rr:`', () => {
    expect(parseButtonCustomId('foo:bar:baz')).toBeNull();
  });

  it('refuse un format mal formé (séparateur manquant)', () => {
    expect(parseButtonCustomId('rr:onlyone')).toBeNull();
    expect(parseButtonCustomId('rr::role')).toBeNull();
    expect(parseButtonCustomId(`rr:${ENTRY_ID}:`)).toBeNull();
  });
});

describe('handleButtonClick — toggle de rôle', () => {
  it("ajoute le rôle si l'utilisateur ne l'a pas, retourne success ephemeral", async () => {
    const ctx = makeCtx({ memberHas: () => false });
    const result = await handleButtonClick(ctx, inputFor(buildButtonCustomId(ENTRY_ID, ROLE_EU)));
    expect(ctx.discord.addMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE_EU);
    expect(ctx.discord.removeMemberRole).not.toHaveBeenCalled();
    expect(result?.kind).toBe('success');
    expect(ctx.audit.log).toHaveBeenCalled();
  });

  it("retire le rôle si l'utilisateur l'a déjà", async () => {
    const ctx = makeCtx({ memberHas: (rid) => rid === ROLE_EU });
    const result = await handleButtonClick(ctx, inputFor(buildButtonCustomId(ENTRY_ID, ROLE_EU)));
    expect(ctx.discord.removeMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE_EU);
    expect(ctx.discord.addMemberRole).not.toHaveBeenCalled();
    expect(result?.kind).toBe('success');
  });

  it('mode unique : retire les autres rôles du set quand on en ajoute un', async () => {
    const ctx = makeCtx({
      entry: { ...baseEntry, mode: 'unique' as const },
      memberHas: (rid) => rid === ROLE_AS,
    });
    await handleButtonClick(ctx, inputFor(buildButtonCustomId(ENTRY_ID, ROLE_EU)));
    expect(ctx.discord.addMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE_EU);
    expect(ctx.discord.removeMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE_AS);
  });

  it('feedback `dm` : envoie un DM et retourne null (pas de reply ephemeral)', async () => {
    const ctx = makeCtx({ entry: { ...baseEntry, feedback: 'dm' as const } });
    const result = await handleButtonClick(ctx, inputFor(buildButtonCustomId(ENTRY_ID, ROLE_EU)));
    expect(result).toBeNull();
    expect(ctx.discord.sendDirectMessage).toHaveBeenCalledOnce();
  });

  it('feedback `none` : silence complet', async () => {
    const ctx = makeCtx({ entry: { ...baseEntry, feedback: 'none' as const } });
    const result = await handleButtonClick(ctx, inputFor(buildButtonCustomId(ENTRY_ID, ROLE_EU)));
    expect(result).toBeNull();
    expect(ctx.discord.sendDirectMessage).not.toHaveBeenCalled();
  });

  it("retourne null silencieusement quand l'entrée est introuvable (bouton orphelin)", async () => {
    const ctx = makeCtx();
    const result = await handleButtonClick(
      ctx,
      inputFor(buildButtonCustomId('00000000-0000-4000-8000-000000000999', ROLE_EU)),
    );
    expect(result).toBeNull();
    expect(ctx.discord.addMemberRole).not.toHaveBeenCalled();
  });

  it("retourne null quand l'entrée existe mais en kind: 'reactions' (bouton ne devrait pas exister)", async () => {
    const ctx = makeCtx({
      entry: { ...baseEntry, kind: 'reactions' as const, feedback: 'dm' as const },
    });
    const result = await handleButtonClick(ctx, inputFor(buildButtonCustomId(ENTRY_ID, ROLE_EU)));
    expect(result).toBeNull();
    expect(ctx.discord.addMemberRole).not.toHaveBeenCalled();
  });

  it('retourne un UIMessage `error` ephemeral quand discord.addMemberRole échoue', async () => {
    const ctx = makeCtx();
    (ctx.discord.addMemberRole as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('missing-permission'),
    );
    const result = await handleButtonClick(ctx, inputFor(buildButtonCustomId(ENTRY_ID, ROLE_EU)));
    expect(result?.kind).toBe('error');
  });
});
