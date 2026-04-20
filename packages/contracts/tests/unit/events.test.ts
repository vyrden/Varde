import { describe, expect, it } from 'vitest';

import {
  configChangedSchema,
  coreEventSchema,
  guildMemberJoinSchema,
  guildMessageCreateSchema,
  guildMessageEditSchema,
  guildRoleDeleteSchema,
  isCoreEvent,
  moduleLoadedSchema,
  parseCoreEvent,
} from '../../src/events.js';

const SNOWFLAKE_A = '123456789012345678';
const SNOWFLAKE_B = '223456789012345678';
const SNOWFLAKE_C = '323456789012345678';
const SNOWFLAKE_D = '423456789012345678';

describe('guildMemberJoinSchema', () => {
  it('accepte un payload minimal valide', () => {
    const input = {
      type: 'guild.memberJoin',
      guildId: SNOWFLAKE_A,
      userId: SNOWFLAKE_B,
      joinedAt: 1_700_000_000_000,
    };
    expect(guildMemberJoinSchema.parse(input)).toEqual(input);
  });

  it('accepte un inviterId optionnel', () => {
    const parsed = guildMemberJoinSchema.parse({
      type: 'guild.memberJoin',
      guildId: SNOWFLAKE_A,
      userId: SNOWFLAKE_B,
      joinedAt: 1_700_000_000_000,
      inviterId: SNOWFLAKE_C,
    });
    expect(parsed.inviterId).toBe(SNOWFLAKE_C);
  });

  it('refuse un userId invalide', () => {
    const result = guildMemberJoinSchema.safeParse({
      type: 'guild.memberJoin',
      guildId: SNOWFLAKE_A,
      userId: 'pas un snowflake',
      joinedAt: 1_700_000_000_000,
    });
    expect(result.success).toBe(false);
  });

  it('refuse un timestamp négatif', () => {
    const result = guildMemberJoinSchema.safeParse({
      type: 'guild.memberJoin',
      guildId: SNOWFLAKE_A,
      userId: SNOWFLAKE_B,
      joinedAt: -1,
    });
    expect(result.success).toBe(false);
  });

  it('refuse un champ type erroné', () => {
    const result = guildMemberJoinSchema.safeParse({
      type: 'guild.memberLeave',
      guildId: SNOWFLAKE_A,
      userId: SNOWFLAKE_B,
      joinedAt: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('guildMessageCreateSchema', () => {
  it('accepte un payload complet', () => {
    const input = {
      type: 'guild.messageCreate',
      guildId: SNOWFLAKE_A,
      channelId: SNOWFLAKE_B,
      messageId: SNOWFLAKE_C,
      authorId: SNOWFLAKE_D,
      content: 'Bonjour',
      createdAt: 1_700_000_000_000,
    };
    expect(guildMessageCreateSchema.parse(input)).toEqual(input);
  });

  it('accepte un contenu vide', () => {
    const result = guildMessageCreateSchema.safeParse({
      type: 'guild.messageCreate',
      guildId: SNOWFLAKE_A,
      channelId: SNOWFLAKE_B,
      messageId: SNOWFLAKE_C,
      authorId: SNOWFLAKE_D,
      content: '',
      createdAt: 1,
    });
    expect(result.success).toBe(true);
  });

  it('refuse un champ manquant', () => {
    const result = guildMessageCreateSchema.safeParse({
      type: 'guild.messageCreate',
      guildId: SNOWFLAKE_A,
      channelId: SNOWFLAKE_B,
      messageId: SNOWFLAKE_C,
      content: '',
      createdAt: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('guildMessageEditSchema', () => {
  it('autorise contentBefore null (premier diff non capturé)', () => {
    const result = guildMessageEditSchema.safeParse({
      type: 'guild.messageEdit',
      guildId: SNOWFLAKE_A,
      channelId: SNOWFLAKE_B,
      messageId: SNOWFLAKE_C,
      authorId: SNOWFLAKE_D,
      contentBefore: null,
      contentAfter: 'nouveau',
      editedAt: 1,
    });
    expect(result.success).toBe(true);
  });
});

describe('guildRoleDeleteSchema', () => {
  it('accepte un roleId valide', () => {
    const input = {
      type: 'guild.roleDelete',
      guildId: SNOWFLAKE_A,
      roleId: SNOWFLAKE_B,
      deletedAt: 1,
    };
    expect(guildRoleDeleteSchema.parse(input)).toEqual(input);
  });
});

describe('configChangedSchema', () => {
  it('accepte un changement core', () => {
    const input = {
      type: 'config.changed',
      guildId: SNOWFLAKE_A,
      scope: 'core',
      versionBefore: 1,
      versionAfter: 2,
      updatedBy: SNOWFLAKE_B,
      updatedAt: 1_700_000_000_000,
    };
    expect(configChangedSchema.parse(input)).toEqual(input);
  });

  it('accepte updatedBy null (changement système)', () => {
    const result = configChangedSchema.safeParse({
      type: 'config.changed',
      guildId: SNOWFLAKE_A,
      scope: 'modules.moderation',
      versionBefore: 0,
      versionAfter: 1,
      updatedBy: null,
      updatedAt: 1,
    });
    expect(result.success).toBe(true);
  });
});

describe('moduleLoadedSchema', () => {
  it('accepte un event chargement module', () => {
    const result = moduleLoadedSchema.safeParse({
      type: 'module.loaded',
      moduleId: 'moderation',
      version: '1.0.0',
      loadedAt: 1,
    });
    expect(result.success).toBe(true);
  });

  it('refuse un moduleId non kebab-case', () => {
    const result = moduleLoadedSchema.safeParse({
      type: 'module.loaded',
      moduleId: 'Moderation',
      version: '1.0.0',
      loadedAt: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('coreEventSchema (union discriminée)', () => {
  it('accepte un événement memberJoin via la union', () => {
    const input = {
      type: 'guild.memberJoin',
      guildId: SNOWFLAKE_A,
      userId: SNOWFLAKE_B,
      joinedAt: 1,
    };
    const parsed = coreEventSchema.parse(input);
    expect(parsed.type).toBe('guild.memberJoin');
  });

  it('refuse un type inconnu', () => {
    const result = coreEventSchema.safeParse({
      type: 'moderation.sanction.applied',
      guildId: SNOWFLAKE_A,
    });
    expect(result.success).toBe(false);
  });

  it('permet un narrowing exhaustif par type', () => {
    const event = coreEventSchema.parse({
      type: 'config.changed',
      guildId: SNOWFLAKE_A,
      scope: 'core',
      versionBefore: 0,
      versionAfter: 1,
      updatedBy: null,
      updatedAt: 1,
    });
    // Sert d'assertion de compilation : le narrow fonctionne.
    if (event.type === 'config.changed') {
      expect(event.scope).toBe('core');
    } else {
      throw new Error('narrowing cassé');
    }
  });
});

describe('isCoreEvent et parseCoreEvent', () => {
  const validEvent = {
    type: 'guild.memberLeave',
    guildId: SNOWFLAKE_A,
    userId: SNOWFLAKE_B,
    leftAt: 1,
  };

  it('isCoreEvent renvoie true sur événement valide', () => {
    expect(isCoreEvent(validEvent)).toBe(true);
  });

  it('isCoreEvent renvoie false sur objet non conforme', () => {
    expect(isCoreEvent({ type: 'guild.memberLeave' })).toBe(false);
    expect(isCoreEvent(null)).toBe(false);
    expect(isCoreEvent('string')).toBe(false);
  });

  it('parseCoreEvent renvoie l événement typé', () => {
    const parsed = parseCoreEvent(validEvent);
    expect(parsed).not.toBe(null);
    expect(parsed?.type).toBe('guild.memberLeave');
  });

  it('parseCoreEvent renvoie null sur invalide', () => {
    expect(parseCoreEvent({ type: 'inconnu' })).toBe(null);
    expect(parseCoreEvent(undefined)).toBe(null);
  });
});
