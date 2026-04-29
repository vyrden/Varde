import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

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
 * Le mock est lancé en parallèle du `webServer` Next.js par
 * `playwright.config.ts`. Les tests configurent les réponses
 * attendues via la variable d'env `MOCK_API_SCRIPT` (cas par
 * défaut : tout vert, setup non-configurée).
 */

interface MockState {
  /** Si `true`, le preHandler `requireUnconfigured` retourne 403. */
  configured: boolean;
}

const state: MockState = { configured: false };

const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
};

const handlers: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
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
    const body = (await readBody(req)) as { appId?: string; publicKey?: string };
    if (!body.appId || !body.publicKey) {
      json(res, 400, { error: 'invalid_body', message: 'champs manquants' });
      return;
    }
    json(res, 200, { appName: 'Mock Bot' });
  },
  'POST /setup/bot-token': async (req, res) => {
    const body = (await readBody(req)) as { token?: string };
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
    const body = (await readBody(req)) as { clientSecret?: string };
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

const route = (method: string | undefined, url: string | undefined): string => {
  const path = (url ?? '').split('?')[0] ?? '';
  return `${method ?? 'GET'} ${path}`;
};

export function createSetupApiMockServer(): Server {
  return createServer(async (req, res) => {
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
}

/**
 * Point d'entrée CLI quand le fichier est exécuté directement par
 * Playwright via la config `webServer`. Lit `PORT` depuis l'env
 * (défaut 4002).
 */
const isMain =
  process.argv[1]?.endsWith('setup-api-mock.ts') === true ||
  process.argv[1]?.endsWith('setup-api-mock.js') === true;
if (isMain) {
  const port = Number(process.env['PORT'] ?? 4002);
  const server = createSetupApiMockServer();
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`[setup-api-mock] listening on http://127.0.0.1:${port}\n`);
  });
}
