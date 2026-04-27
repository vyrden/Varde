import { describe, expect, it, vi } from 'vitest';

import { AIProviderError, createOllamaProvider } from '../../src/index.js';

/**
 * Tests de l'adapter Ollama avec `fetch` mocké. On couvre :
 * - cas nominal generatePreset + suggestCompletion,
 * - retry une fois sur sortie JSON invalide,
 * - timeout via AbortController (jamais résolu),
 * - 404 → AIProviderError('unavailable'),
 * - 401/403 → AIProviderError('unauthorized'),
 * - testConnection selon que le modèle est présent dans /api/tags.
 */

const validPreset = {
  id: 'gen-community',
  name: 'Commu gen',
  description: 'Description de test.',
  tags: ['test'],
  locale: 'fr',
  roles: [
    {
      localId: 'r-a',
      name: 'Mod',
      color: 0,
      permissionPreset: 'moderator-minimal',
      hoist: true,
      mentionable: true,
    },
  ],
  categories: [{ localId: 'c-a', name: 'info', position: 0 }],
  channels: [
    {
      localId: 'ch-a',
      categoryLocalId: 'c-a',
      name: 'annonces',
      type: 'text',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: [],
    },
  ],
  modules: [],
};

const buildChatResponse = (content: string): Response =>
  new Response(
    JSON.stringify({
      model: 'llama3.1:8b',
      message: { role: 'assistant', content },
      done: true,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('createOllamaProvider — generatePreset nominal', () => {
  it('retourne un PresetProposal valide depuis la réponse /api/chat', async () => {
    const fetchMock = vi.fn(async () =>
      buildChatResponse(
        JSON.stringify({
          preset: validPreset,
          rationale: 'Parce que.',
          confidence: 0.8,
        }),
      ),
    );
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const r = await provider.generatePreset({
      description: 'commu tech',
      locale: 'fr',
      hints: [],
    });
    expect(r.preset.id).toBe('gen-community');
    expect(r.rationale).toBe('Parce que.');
    expect(r.confidence).toBe(0.8);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe('http://localhost:11434/api/chat');
  });

  it('retry une fois en cas de sortie non-JSON, puis réussit', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildChatResponse('pas du json du tout'))
      .mockResolvedValueOnce(
        buildChatResponse(
          JSON.stringify({
            preset: validPreset,
            rationale: 'ok au 2e coup',
            confidence: 0.5,
          }),
        ),
      );
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const r = await provider.generatePreset({
      description: 'commu tech',
      locale: 'fr',
      hints: [],
    });
    expect(r.preset.id).toBe('gen-community');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throw invalid_response après deux sorties invalides', async () => {
    // Response body n'est consommable qu'une fois ; on en fabrique
    // une fresh à chaque appel.
    const fetchMock = vi.fn(async () => buildChatResponse('bibi la fouine'));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      provider.generatePreset({ description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retry quand la réponse parse mais échoue Zod', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildChatResponse(JSON.stringify({ preset: { id: 'INVALID_ID' } })))
      .mockResolvedValueOnce(
        buildChatResponse(
          JSON.stringify({
            preset: validPreset,
            rationale: 'ok',
            confidence: 0.5,
          }),
        ),
      );
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const r = await provider.generatePreset({
      description: 'x',
      locale: 'fr',
      hints: [],
    });
    expect(r.preset.id).toBe('gen-community');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('createOllamaProvider — suggestCompletion', () => {
  it('retourne la liste de suggestions depuis /api/chat', async () => {
    const suggestions = [
      { label: 'Salon #help', patch: { channels: [{ name: 'help' }] }, rationale: 'support' },
      {
        label: 'Salon #general',
        patch: { channels: [{ name: 'general' }] },
        rationale: 'bavardages',
      },
    ];
    const fetchMock = vi.fn(async () => buildChatResponse(JSON.stringify(suggestions)));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const r = await provider.suggestCompletion({ kind: 'channel', contextDraft: {} });
    expect(r).toHaveLength(2);
    expect(r[0]?.label).toBe('Salon #help');
  });
});

describe('createOllamaProvider — erreurs HTTP', () => {
  it('404 → AIProviderError unavailable', async () => {
    const fetchMock = vi.fn(async () => new Response('model not found', { status: 404 }));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'absent:7b',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.generatePreset({ description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('403 → AIProviderError unauthorized', async () => {
    const fetchMock = vi.fn(async () => new Response('forbidden', { status: 403 }));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.generatePreset({ description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('connection refused → AIProviderError unavailable', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.generatePreset({ description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toBeInstanceOf(AIProviderError);
  });

  it('timeout via AbortController → AIProviderError timeout', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
      requestTimeoutMs: 20,
    });
    await expect(
      provider.generatePreset({ description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('createOllamaProvider — testConnection', () => {
  it('ok=true quand le modèle est listé par /api/tags', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ models: [{ name: 'llama3.1:8b' }, { name: 'qwen2.5:7b' }] }),
          { status: 200 },
        ),
    );
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const info = await provider.testConnection();
    expect(info.ok).toBe(true);
    expect(info.id).toBe('ollama');
  });

  it('ok=false quand le modèle est absent des tags', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }] }), { status: 200 }),
    );
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const info = await provider.testConnection();
    expect(info.ok).toBe(false);
    expect(info.details).toContain('introuvable');
  });

  it('ok=false quand endpoint injoignable', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const info = await provider.testConnection();
    expect(info.ok).toBe(false);
    expect(info.details).toContain('ECONNREFUSED');
  });
});

describe('createOllamaProvider — classify', () => {
  it("n'envoie PAS format=json pour classify (label brut attendu, pas un wrapper JSON)", async () => {
    const fetchMock = vi.fn(async () => buildChatResponse('toxicity'));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.classify('truc', ['safe', 'toxicity']);
    expect(result).toBe('toxicity');
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as {
      format?: string;
    };
    expect(body.format).toBeUndefined();
  });

  it('fail-open vers safe quand le modèle répond hors-pool', async () => {
    const fetchMock = vi.fn(async () => buildChatResponse('je ne sais pas'));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:8b',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.classify('hi', ['safe', 'toxicity']);
    expect(result).toBe('safe');
  });
});
