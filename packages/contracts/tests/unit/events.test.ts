import { describe, expect, it } from 'vitest';

import {
  configChangedSchema,
  coreEventSchema,
  guildChannelUpdateSchema,
  guildMemberJoinSchema,
  guildMessageCreateSchema,
  guildMessageEditSchema,
  guildMessageReactionAddSchema,
  guildMessageReactionRemoveSchema,
  guildRoleDeleteSchema,
  guildRoleUpdateSchema,
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
      attachments: [],
    };
    expect(guildMessageCreateSchema.parse(input)).toEqual(input);
  });

  it('accepte des attachments avec MIME et filename optionnels', () => {
    const result = guildMessageCreateSchema.safeParse({
      type: 'guild.messageCreate',
      guildId: SNOWFLAKE_A,
      channelId: SNOWFLAKE_B,
      messageId: SNOWFLAKE_C,
      authorId: SNOWFLAKE_D,
      content: 'photo',
      createdAt: 1,
      attachments: [
        { id: '1', url: 'https://cdn/x.png', filename: 'x.png', contentType: 'image/png' },
        { id: '2', url: 'https://cdn/y.mp4', contentType: null },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attachments).toHaveLength(2);
    }
  });

  it('attachments par défaut = [] si absent', () => {
    const result = guildMessageCreateSchema.safeParse({
      type: 'guild.messageCreate',
      guildId: SNOWFLAKE_A,
      channelId: SNOWFLAKE_B,
      messageId: SNOWFLAKE_C,
      authorId: SNOWFLAKE_D,
      content: 'no attachments',
      createdAt: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attachments).toEqual([]);
    }
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

describe('guildChannelUpdateSchema', () => {
  const baseInput = {
    type: 'guild.channelUpdate',
    guildId: SNOWFLAKE_A,
    channelId: SNOWFLAKE_B,
    nameBefore: 'général',
    nameAfter: 'général-archive',
    topicBefore: 'Discussions générales',
    topicAfter: 'Archivé',
    positionBefore: 0,
    positionAfter: 5,
    parentIdBefore: SNOWFLAKE_C,
    parentIdAfter: SNOWFLAKE_D,
    updatedAt: 1_700_000_000_000,
  };

  it('accepte un payload enrichi complet', () => {
    expect(guildChannelUpdateSchema.parse(baseInput)).toEqual(baseInput);
  });

  it('accepte topicBefore/topicAfter null (channel sans topic)', () => {
    const result = guildChannelUpdateSchema.safeParse({
      ...baseInput,
      topicBefore: null,
      topicAfter: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepte parentIdBefore/parentIdAfter null (hors catégorie)', () => {
    const result = guildChannelUpdateSchema.safeParse({
      ...baseInput,
      parentIdBefore: null,
      parentIdAfter: null,
    });
    expect(result.success).toBe(true);
  });

  it('refuse nameBefore manquant', () => {
    const { nameBefore, ...missingName } = baseInput;
    void nameBefore;
    const result = guildChannelUpdateSchema.safeParse(missingName);
    expect(result.success).toBe(false);
  });

  it('refuse positionBefore négatif', () => {
    const result = guildChannelUpdateSchema.safeParse({
      ...baseInput,
      positionBefore: -1,
    });
    expect(result.success).toBe(false);
  });

  it('refuse parentIdAfter non-snowflake', () => {
    const result = guildChannelUpdateSchema.safeParse({
      ...baseInput,
      parentIdAfter: 'pas un snowflake',
    });
    expect(result.success).toBe(false);
  });
});

describe('guildRoleUpdateSchema', () => {
  const baseInput = {
    type: 'guild.roleUpdate',
    guildId: SNOWFLAKE_A,
    roleId: SNOWFLAKE_B,
    nameBefore: 'Membre',
    nameAfter: 'Membre Vérifié',
    colorBefore: 0,
    colorAfter: 0xff0000,
    hoistBefore: false,
    hoistAfter: true,
    mentionableBefore: true,
    mentionableAfter: false,
    permissionsBefore: '0',
    permissionsAfter: '8',
    updatedAt: 1_700_000_000_000,
  };

  it('accepte un payload enrichi complet', () => {
    expect(guildRoleUpdateSchema.parse(baseInput)).toEqual(baseInput);
  });

  it('refuse permissionsBefore number (doit rester string pour fidélité bitfield)', () => {
    const result = guildRoleUpdateSchema.safeParse({
      ...baseInput,
      permissionsBefore: 0,
    });
    expect(result.success).toBe(false);
  });

  it('refuse colorBefore négatif', () => {
    const result = guildRoleUpdateSchema.safeParse({
      ...baseInput,
      colorBefore: -1,
    });
    expect(result.success).toBe(false);
  });

  it('refuse hoistBefore non-booléen', () => {
    const result = guildRoleUpdateSchema.safeParse({
      ...baseInput,
      hoistBefore: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('permet un narrowing exhaustif depuis coreEventSchema', () => {
    const parsed = coreEventSchema.parse(baseInput);
    if (parsed.type === 'guild.roleUpdate') {
      expect(parsed.nameAfter).toBe('Membre Vérifié');
      expect(parsed.permissionsAfter).toBe('8');
    } else {
      throw new Error('narrowing cassé');
    }
  });
});

describe('guildMessageReactionAddSchema et RemoveSchema', () => {
  const unicodePayload = {
    type: 'guild.messageReactionAdd',
    guildId: SNOWFLAKE_A,
    channelId: SNOWFLAKE_B,
    messageId: SNOWFLAKE_C,
    userId: SNOWFLAKE_D,
    emoji: { type: 'unicode', value: '🎉' },
    reactedAt: 1_700_000_000_000,
  };

  const customPayload = {
    type: 'guild.messageReactionAdd',
    guildId: SNOWFLAKE_A,
    channelId: SNOWFLAKE_B,
    messageId: SNOWFLAKE_C,
    userId: SNOWFLAKE_D,
    emoji: { type: 'custom', id: '123456789012345678', name: 'rocket', animated: false },
    reactedAt: 1_700_000_000_000,
  };

  it('accepte un payload valide avec emoji unicode', () => {
    expect(guildMessageReactionAddSchema.parse(unicodePayload)).toEqual(unicodePayload);
  });

  it('accepte un payload valide avec emoji custom', () => {
    expect(guildMessageReactionAddSchema.parse(customPayload)).toEqual(customPayload);
  });

  it('refuse un emoji sans discriminant type', () => {
    const bad = { ...unicodePayload, emoji: { value: '🎉' } };
    expect(guildMessageReactionAddSchema.safeParse(bad).success).toBe(false);
  });

  it('refuse un emoji unicode avec value vide', () => {
    const bad = { ...unicodePayload, emoji: { type: 'unicode', value: '' } };
    expect(guildMessageReactionAddSchema.safeParse(bad).success).toBe(false);
  });

  it('refuse un emoji custom avec id non-snowflake', () => {
    const bad = {
      ...customPayload,
      emoji: { type: 'custom', id: 'abc', name: 'x', animated: false },
    };
    expect(guildMessageReactionAddSchema.safeParse(bad).success).toBe(false);
  });

  it('refuse un userId non-snowflake', () => {
    const bad = { ...unicodePayload, userId: 'pas-un-snowflake' };
    expect(guildMessageReactionAddSchema.safeParse(bad).success).toBe(false);
  });

  it('guildMessageReactionRemoveSchema a la même forme (avec type différent)', () => {
    const payload = { ...unicodePayload, type: 'guild.messageReactionRemove' };
    expect(guildMessageReactionRemoveSchema.parse(payload)).toEqual(payload);
  });

  it('coreEventSchema accepte les 2 nouveaux events via la union', () => {
    expect(coreEventSchema.safeParse(unicodePayload).success).toBe(true);
    const removePayload = { ...unicodePayload, type: 'guild.messageReactionRemove' };
    expect(coreEventSchema.safeParse(removePayload).success).toBe(true);
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
