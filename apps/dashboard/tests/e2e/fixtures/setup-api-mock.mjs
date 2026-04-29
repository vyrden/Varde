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

const state = { configured: false };

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
};

const route = (method, url) => {
  const path = (url ?? '').split('?')[0] ?? '';
  return `${method ?? 'GET'} ${path}`;
};

const server = createServer(async (req, res) => {
  const handler = handlers[route(req.method, req.url)];
  if (!handler) {
    json(res, 404, { error: 'route_not_mocked', message: route(req.method, req.url) });
    return;
  }
  try {
    await handler(req, res);
  } catch (err) {
    json(res, 500, {
      error: 'mock_error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

const port = Number(process.env['PORT'] ?? 4002);
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`[setup-api-mock] listening on http://127.0.0.1:${port}\n`);
});
