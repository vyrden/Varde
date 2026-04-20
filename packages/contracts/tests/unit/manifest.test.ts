import { describe, expect, it } from 'vitest';

import {
  manifestStaticSchema,
  parseManifestStatic,
  validateEmitPrefix,
} from '../../src/manifest.js';

const validManifest = {
  id: 'hello-world',
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
      defaultLevel: 'member',
      description: 'Permet d appeler /ping.',
    },
  ],
  events: {
    listen: ['guild.memberJoin'],
    emit: ['hello-world.greeted'],
  },
};

describe('manifestStaticSchema — acceptation', () => {
  it('accepte un manifeste complet et minimal', () => {
    const parsed = manifestStaticSchema.parse(validManifest);
    expect(parsed.id).toBe('hello-world');
    expect(parsed.events.emit).toEqual(['hello-world.greeted']);
  });

  it('accepte un auteur avec url et email', () => {
    const parsed = manifestStaticSchema.parse({
      ...validManifest,
      author: {
        name: 'Mainteneur',
        url: 'https://example.com',
        email: 'maint@example.com',
      },
    });
    expect(parsed.author.url).toBe('https://example.com');
  });

  it('accepte un id préfixé par auteur', () => {
    const parsed = manifestStaticSchema.parse({
      ...validManifest,
      id: 'vyrden/custom',
    });
    expect(parsed.id).toBe('vyrden/custom');
  });

  it('accepte des dépendances optionnelles', () => {
    const parsed = manifestStaticSchema.parse({
      ...validManifest,
      dependencies: {
        modules: ['logs'],
        optionalModules: ['welcome'],
      },
    });
    expect(parsed.dependencies?.modules).toEqual(['logs']);
  });

  it('accepte un schéma de version à 0 (pré-migration)', () => {
    const parsed = manifestStaticSchema.parse({
      ...validManifest,
      schemaVersion: 0,
    });
    expect(parsed.schemaVersion).toBe(0);
  });
});

describe('manifestStaticSchema — rejets', () => {
  it('refuse un id non kebab-case', () => {
    const result = manifestStaticSchema.safeParse({
      ...validManifest,
      id: 'Hello_World',
    });
    expect(result.success).toBe(false);
  });

  it('refuse une version non semver strict', () => {
    const result = manifestStaticSchema.safeParse({
      ...validManifest,
      version: '1.0',
    });
    expect(result.success).toBe(false);
  });

  it('refuse un schemaVersion négatif', () => {
    const result = manifestStaticSchema.safeParse({
      ...validManifest,
      schemaVersion: -1,
    });
    expect(result.success).toBe(false);
  });

  it('refuse un auteur sans nom', () => {
    const result = manifestStaticSchema.safeParse({
      ...validManifest,
      author: { name: '' },
    });
    expect(result.success).toBe(false);
  });

  it('refuse une url d auteur invalide', () => {
    const result = manifestStaticSchema.safeParse({
      ...validManifest,
      author: { name: 'X', url: 'pas-une-url' },
    });
    expect(result.success).toBe(false);
  });

  it('refuse une permission avec id mal formé', () => {
    const result = manifestStaticSchema.safeParse({
      ...validManifest,
      permissions: [
        {
          id: 'invalide',
          category: 'x',
          defaultLevel: 'member',
          description: 'x',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('refuse un defaultLevel hors enum', () => {
    const result = manifestStaticSchema.safeParse({
      ...validManifest,
      permissions: [
        {
          id: 'hello-world.ping',
          category: 'x',
          defaultLevel: 'owner',
          description: 'x',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('refuse un manifeste où events manque', () => {
    const { events: _, ...withoutEvents } = validManifest;
    const result = manifestStaticSchema.safeParse(withoutEvents);
    expect(result.success).toBe(false);
  });
});

describe('parseManifestStatic', () => {
  it('renvoie la valeur typée en cas de succès', () => {
    const parsed = parseManifestStatic(validManifest);
    expect(parsed.name).toBe('Hello World');
  });

  it('lève une ZodError en cas d invalidité', () => {
    expect(() => parseManifestStatic({ ...validManifest, id: 'INVALID' })).toThrow();
  });
});

describe('validateEmitPrefix', () => {
  it('accepte quand tous les events émis sont préfixés par l id du module', () => {
    const parsed = parseManifestStatic(validManifest);
    const result = validateEmitPrefix(parsed);
    expect(result.valid).toBe(true);
  });

  it('rejette les events émis sous un autre namespace', () => {
    const parsed = parseManifestStatic({
      ...validManifest,
      events: {
        listen: [],
        emit: ['hello-world.ok', 'moderation.banned'],
      },
    });
    const result = validateEmitPrefix(parsed);
    if (result.valid) {
      throw new Error('validation aurait dû échouer');
    }
    expect(result.offenders).toEqual(['moderation.banned']);
  });

  it('accepte un manifeste sans événements émis', () => {
    const parsed = parseManifestStatic({
      ...validManifest,
      events: { listen: ['guild.memberJoin'], emit: [] },
    });
    const result = validateEmitPrefix(parsed);
    expect(result.valid).toBe(true);
  });
});
