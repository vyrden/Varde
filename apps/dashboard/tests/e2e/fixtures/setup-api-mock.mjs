import { createServer } from 'node:http';

/**
 * Mock HTTP minimaliste de l'API du wizard (jalon 7 PR 7.1) pour les
 * E2E Playwright. Sert à valider que les pages du dashboard rendent
 * correctement et que la navigation fonctionne, sans dépendance au
 * vrai `apps/server` ni à une DB Postgres.
 *
 * **Boundary** : on teste l'UI du wizard ET le contrat HTTP (forme
 * des réponses, codes d'erreur attendus). Le comportement métier de
 * l'API (chiffrement, persistance, validation Discord côté serveur)
 * est testé séparément par les 54 tests d'intégration de
 * `apps/api/tests/integration/setup-route.test.ts`.
 *
 * Volontairement écrit en `.mjs` plutôt qu'en TS — on évite la
 * dépendance à `tsx` côté CI, ce qui rend la startup déterministe
 * (pas de transpile au démarrage).
 */

// Mock admin state — étendu par sub-livrable 8 (E2E PR 7.2). Initialisé
// avec un owner « 111111111111111111 » qui sera matché par le JWT
// minted dans `tests/e2e/fixtures/admin-session.ts`.
const state = {
  configured: false,
  admin: {
    owners: [
      {
        discordUserId: '111111111111111111',
        grantedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
        grantedByDiscordUserId: null,
      },
    ],
    identity: { name: 'Mock Bot', description: 'Bot de test', avatarUrl: null },
    discord: {
      appId: '987654321098765432',
      publicKey: '0'.repeat(64),
      tokenLastFour: 'aaaa',
      hasClientSecret: true,
      intents: { presence: true, members: false, messageContent: false },
    },
    urls: {
      baseUrl: null,
      additionalUrls: [],
    },
    overview: {
      bot: { connected: false, latencyMs: null, uptime: 0, version: 'e2e' },
      guilds: { count: 0, totalMembers: null },
      modules: { installed: 0, active: 0 },
      db: { driver: 'sqlite', sizeBytes: null, lastMigration: null },
    },
  },
};

const isOwnerSession = (req) => {
  const cookieHeader = req.headers.cookie ?? '';
  // Le mock ne valide pas le JWT — il vérifie juste que le cookie
  // est présent et porte un payload qui décode en JSON avec un sub.
  // Le test pose un cookie `varde.session=<jwt>` minted par
  // `admin-session.ts`. Le runtime réel valide la signature ; ici
  // on fait confiance à l'environnement de test.
  const match = cookieHeader.match(/varde\.session=([^;]+)/);
  if (!match) return null;
  const token = match[1];
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
};

const requireOwner = (req, res) => {
  const sub = isOwnerSession(req);
  if (sub === null) {
    json(res, 401, { error: 'unauthenticated' });
    return null;
  }
  const isOwner = state.admin.owners.some((o) => o.discordUserId === sub);
  if (!isOwner) {
    json(res, 404, { error: 'not_found' });
    return null;
  }
  return sub;
};

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
};

const handlers = {
  // Endpoint de contrôle pour les tests E2E : permet à un spec de
  // basculer le mock entre `configured: false` (mode wizard) et
  // `configured: true` (mode dashboard configuré). Sans ça, deux
  // suites de tests qui veulent des états différents se marchent
  // dessus au sein du même run Playwright.
  'POST /__test/configure': async (req, res) => {
    const body = await readBody(req);
    if (typeof body.configured === 'boolean') {
      state.configured = body.configured;
    }
    json(res, 200, { configured: state.configured });
  },
  'GET /setup/status': async (_req, res) => {
    if (state.configured) {
      json(res, 403, { error: 'setup_completed', message: 'setup déjà terminée' });
      return;
    }
    json(res, 200, { configured: false, currentStep: 1 });
  },
  'GET /setup/redirect-uri': async (_req, res) => {
    if (state.configured) {
      json(res, 403, { error: 'setup_completed' });
      return;
    }
    json(res, 200, { uri: 'http://localhost:3001/api/auth/callback/discord' });
  },
  'POST /setup/system-check': async (_req, res) => {
    json(res, 200, {
      checks: [
        { name: 'database', ok: true },
        { name: 'master_key', ok: true },
        { name: 'discord_connectivity', ok: true },
      ],
      detectedBaseUrl: 'http://localhost:3001',
    });
  },
  'POST /setup/discord-app': async (req, res) => {
    const body = await readBody(req);
    if (!body.appId || !body.publicKey) {
      json(res, 400, { error: 'invalid_body', message: 'champs manquants' });
      return;
    }
    json(res, 200, { appName: 'Mock Bot' });
  },
  'POST /setup/bot-token': async (req, res) => {
    const body = await readBody(req);
    if (!body.token) {
      json(res, 400, { error: 'invalid_body', message: 'token manquant' });
      return;
    }
    json(res, 200, {
      valid: true,
      botUser: { id: '111111111111111111', username: 'mock-bot' },
      missingIntents: [],
    });
  },
  'POST /setup/oauth': async (req, res) => {
    const body = await readBody(req);
    if (!body.clientSecret) {
      json(res, 400, { error: 'invalid_body' });
      return;
    }
    json(res, 200, { valid: true });
  },
  'POST /setup/identity': async (_req, res) => {
    json(res, 200, { name: null, description: null, avatarUrl: null });
  },
  'POST /setup/complete': async (_req, res) => {
    state.configured = true;
    json(res, 200, { ok: true });
  },

  // -- ADMIN MOCK (sub-livrable 8 PR 7.2) --

  'POST /__test/admin-state': async (req, res) => {
    const body = await readBody(req);
    if (body.owners) state.admin.owners = body.owners;
    if (body.identity) state.admin.identity = body.identity;
    if (body.discord) state.admin.discord = body.discord;
    if (body.urls) state.admin.urls = body.urls;
    if (body.overview) state.admin.overview = body.overview;
    json(res, 200, state.admin);
  },

  'GET /admin/overview': async (req, res) => {
    if (!requireOwner(req, res)) return;
    json(res, 200, state.admin.overview);
  },
  'GET /admin/identity': async (req, res) => {
    if (!requireOwner(req, res)) return;
    json(res, 200, state.admin.identity);
  },
  'PUT /admin/identity': async (req, res) => {
    if (!requireOwner(req, res)) return;
    const body = await readBody(req);
    if (body.name !== undefined) state.admin.identity.name = body.name;
    if (body.description !== undefined) state.admin.identity.description = body.description;
    if (body.avatar !== undefined) {
      state.admin.identity.avatarUrl = `https://cdn.discordapp.com/app-icons/mock/${Date.now()}.png`;
    }
    json(res, 200, state.admin.identity);
  },
  'GET /admin/discord': async (req, res) => {
    if (!requireOwner(req, res)) return;
    json(res, 200, state.admin.discord);
  },
  'GET /admin/urls': async (req, res) => {
    if (!requireOwner(req, res)) return;
    json(res, 200, state.admin.urls);
  },
  'POST /admin/urls': async (req, res) => {
    if (!requireOwner(req, res)) return;
    const body = await readBody(req);
    if (typeof body.url !== 'string') {
      json(res, 400, { error: 'invalid_body', message: 'URL absente' });
      return;
    }
    if (state.admin.urls.additionalUrls.some((u) => u.url === body.url)) {
      json(res, 409, { error: 'url_already_exists', message: 'URL déjà enregistrée' });
      return;
    }
    const entry = {
      id: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: body.url,
      ...(body.label ? { label: body.label } : {}),
    };
    state.admin.urls.additionalUrls.push(entry);
    json(res, 200, state.admin.urls);
  },
  'GET /admin/urls/redirect-uris': async (req, res) => {
    if (!requireOwner(req, res)) return;
    const principal = state.admin.urls.baseUrl ?? 'http://127.0.0.1:3001';
    const all = [principal, ...state.admin.urls.additionalUrls.map((u) => u.url)];
    const seen = new Set();
    const unique = [];
    for (const origin of all) {
      const uri = `${origin.replace(/\/+$/u, '')}/api/auth/callback/discord`;
      if (!seen.has(uri)) {
        seen.add(uri);
        unique.push(uri);
      }
    }
    json(res, 200, { redirectUris: unique });
  },
  'GET /admin/ownership': async (req, res) => {
    if (!requireOwner(req, res)) return;
    json(res, 200, { owners: state.admin.owners });
  },
  'POST /admin/ownership': async (req, res) => {
    if (!requireOwner(req, res)) return;
    const body = await readBody(req);
    if (typeof body.discordUserId !== 'string') {
      json(res, 400, { error: 'invalid_body', message: 'ID absent' });
      return;
    }
    if (!state.admin.owners.some((o) => o.discordUserId === body.discordUserId)) {
      state.admin.owners.push({
        discordUserId: body.discordUserId,
        grantedAt: new Date().toISOString(),
        grantedByDiscordUserId: '111111111111111111',
      });
    }
    json(res, 200, { added: true });
  },
};

// Routes paramétrées (suffixe variable). Évalués si le match exact
// `handlers[...]` n'a pas trouvé de cible. Chaque entrée porte un
// matcher `(method, path) => params | null` et un handler.
const paramHandlers = [
  {
    match: (method, path) => {
      if (method !== 'DELETE') return null;
      const m = path.match(/^\/admin\/urls\/([^/]+)$/);
      return m ? { id: decodeURIComponent(m[1]) } : null;
    },
    handler: async (req, res, params) => {
      if (!requireOwner(req, res)) return;
      const before = state.admin.urls.additionalUrls.length;
      state.admin.urls.additionalUrls = state.admin.urls.additionalUrls.filter(
        (u) => u.id !== params.id,
      );
      if (state.admin.urls.additionalUrls.length === before) {
        json(res, 404, { error: 'url_not_found' });
        return;
      }
      json(res, 200, state.admin.urls);
    },
  },
  {
    match: (method, path) => {
      if (method !== 'DELETE') return null;
      const m = path.match(/^\/admin\/ownership\/([^/]+)$/);
      return m ? { discordUserId: decodeURIComponent(m[1]) } : null;
    },
    handler: async (req, res, params) => {
      if (!requireOwner(req, res)) return;
      if (state.admin.owners.length <= 1) {
        json(res, 409, { error: 'last_owner', message: 'dernier owner' });
        return;
      }
      state.admin.owners = state.admin.owners.filter(
        (o) => o.discordUserId !== params.discordUserId,
      );
      json(res, 200, { removed: true });
    },
  },
];

const server = createServer(async (req, res) => {
  const path = (req.url ?? '').split('?')[0] ?? '';
  const method = req.method ?? 'GET';
  const handler = handlers[`${method} ${path}`];
  if (handler) {
    try {
      await handler(req, res);
    } catch (err) {
      json(res, 500, {
        error: 'mock_error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }
  for (const entry of paramHandlers) {
    const params = entry.match(method, path);
    if (params !== null) {
      try {
        await entry.handler(req, res, params);
      } catch (err) {
        json(res, 500, {
          error: 'mock_error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
  }
  json(res, 404, { error: 'route_not_mocked', message: `${method} ${path}` });
});

const port = Number(process.env['PORT'] ?? 4002);
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`[setup-api-mock] listening on http://127.0.0.1:${port}\n`);
});
