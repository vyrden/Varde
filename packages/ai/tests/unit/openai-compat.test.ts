import { describe, expect, it, vi } from 'vitest';

import { AIProviderError, createOpenAICompatibleProvider } from '../../src/index.js';

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
      model: 'gpt-4o-mini',
      choices: [
        {
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 300, total_tokens: 420 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('createOpenAICompatibleProvider — options', () => {
  it('refuse une apiKey vide', () => {
    expect(() =>
      createOpenAICompatibleProvider({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKey: '',
      }),
    ).toThrow(AIProviderError);
  });

  it('injecte Authorization Bearer et extraHeaders', async () => {
    const fetchMock = vi.fn(async () =>
      buildChatResponse(
        JSON.stringify({
          preset: validPreset,
          rationale: 'ok',
          confidence: 0.5,
        }),
      ),
    );
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-3-haiku',
      apiKey: 'sk-test-123',
      fetch: fetchMock as unknown as typeof fetch,
      extraHeaders: { 'http-referer': 'https://varde.local' },
    });

    await provider.generatePreset({ description: 'x', locale: 'fr', hints: [] });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const headers = (init as { headers: Record<string, string> }).headers;
    expect(headers['authorization']).toBe('Bearer sk-test-123');
    expect(headers['http-referer']).toBe('https://varde.local');
  });

  it('inclut response_format json_object par défaut, et pas si useJsonMode=false', async () => {
    const fetchMock = vi.fn(async () =>
      buildChatResponse(JSON.stringify({ preset: validPreset, rationale: 'ok', confidence: 0.5 })),
    );

    const providerDefault = createOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await providerDefault.generatePreset({ description: 'x', locale: 'fr', hints: [] });
    const bodyDefault = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as {
      response_format?: { type: string };
    };
    expect(bodyDefault.response_format).toEqual({ type: 'json_object' });

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(
      buildChatResponse(JSON.stringify({ preset: validPreset, rationale: 'ok', confidence: 0.5 })),
    );

    const providerNoJson = createOpenAICompatibleProvider({
      baseUrl: 'http://localhost:8080/v1',
      model: 'local-model',
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
      useJsonMode: false,
    });
    await providerNoJson.generatePreset({ description: 'x', locale: 'fr', hints: [] });
    const bodyNoJson = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as {
      response_format?: unknown;
    };
    expect(bodyNoJson.response_format).toBeUndefined();
  });
});

describe('createOpenAICompatibleProvider — generatePreset nominal', () => {
  it('retourne un PresetProposal valide et extrait depuis choices[0].message', async () => {
    const fetchMock = vi.fn(async () =>
      buildChatResponse(
        JSON.stringify({
          preset: validPreset,
          rationale: 'Raison concise.',
          confidence: 0.7,
        }),
      ),
    );
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const r = await provider.generatePreset({
      description: 'commu tech',
      locale: 'fr',
      hints: [],
    });
    expect(r.preset.id).toBe('gen-community');
    expect(r.rationale).toBe('Raison concise.');
    expect(r.confidence).toBe(0.7);
  });

  it('retry une fois sur sortie non-JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildChatResponse('hello world'))
      .mockResolvedValueOnce(
        buildChatResponse(
          JSON.stringify({ preset: validPreset, rationale: 'ok', confidence: 0.5 }),
        ),
      );
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'k',
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

describe('createOpenAICompatibleProvider — erreurs HTTP', () => {
  it('401 → AIProviderError unauthorized', async () => {
    const fetchMock = vi.fn(async () => new Response('invalid key', { status: 401 }));
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'bad',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.generatePreset({ description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('429 → AIProviderError quota_exceeded', async () => {
    const fetchMock = vi.fn(async () => new Response('rate limited', { status: 429 }));
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.generatePreset({ description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toMatchObject({ code: 'quota_exceeded' });
  });

  it('500 → AIProviderError unavailable', async () => {
    const fetchMock = vi.fn(async () => new Response('oops', { status: 500 }));
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.generatePreset({ description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toMatchObject({ code: 'unavailable' });
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
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
      requestTimeoutMs: 20,
    });
    await expect(
      provider.generatePreset({ description: 'x', locale: 'fr', hints: [] }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('createOpenAICompatibleProvider — testConnection', () => {
  it('ok=true quand /models liste le modèle', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }],
          }),
          { status: 200 },
        ),
    );
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const info = await provider.testConnection();
    expect(info.ok).toBe(true);
    expect(info.id).toBe('openai-compat');
  });

  it('ok=false quand /models ne liste pas le modèle', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }] }), { status: 200 }),
    );
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const info = await provider.testConnection();
    expect(info.ok).toBe(false);
    expect(info.details).toContain('introuvable');
  });

  it('ok=false sur 401', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 401 }));
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'bad',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const info = await provider.testConnection();
    expect(info.ok).toBe(false);
    expect(info.details).toContain('401');
  });

  it('tolère une shape /models non standard et retourne ok=true', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ models: [{ name: 'local' }] }), { status: 200 }),
    );
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      apiKey: 'none',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const info = await provider.testConnection();
    expect(info.ok).toBe(true);
    expect(info.details).toContain('non standard');
  });

  it('respecte providerId custom', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 }),
    );
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'm',
      apiKey: 'k',
      providerId: 'openrouter',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const info = await provider.testConnection();
    expect(info.id).toBe('openrouter');
  });
});
