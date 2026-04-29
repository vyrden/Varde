import { randomUUID } from 'node:crypto';

import type { Logger, UserId } from '@varde/contracts';
import {
  type AdditionalUrl,
  INSTANCE_AUDIT_ACTIONS,
  type InstanceAuditService,
  type InstanceConfigService,
  type OwnershipService,
} from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireOwner } from '../middleware/require-owner.js';

/**
 * Routes `/admin/urls/*` (jalon 7 PR 7.2). Surface admin pour
 * gérer les URLs d'accès au dashboard :
 *
 * - `baseUrl` : URL principale persistée. Par défaut `null` —
 *   l'instance retombe alors sur la valeur d'environnement
 *   (`BASE_URL` ou auto-détection localhost). Une fois posée par
 *   l'admin, elle prime.
 * - `additionalUrls` : URLs additionnelles d'accès (LAN, second
 *   domaine, tunnel). Chaque entrée a un id généré côté serveur,
 *   une URL et un label optionnel.
 *
 * Endpoints :
 *
 * - `GET    /admin/urls`               — liste persistée
 * - `PUT    /admin/urls/base`          — change la baseUrl
 * - `POST   /admin/urls`               — ajoute une URL additionnelle
 * - `DELETE /admin/urls/:id`           — retire une URL additionnelle
 * - `GET    /admin/urls/redirect-uris` — toutes les redirect URIs
 *                                        (à coller dans le portail
 *                                        Discord OAuth2)
 *
 * **Note importante** : ces routes ne touchent pas à la résolution
 * effective de `baseUrl` côté Auth.js / setup. La whitelist
 * dynamique côté Auth.js est portée par sub-livrable 6 — pour
 * cette PR, on persiste seulement, et le sub-livrable suivant
 * branchera la résolution côté login/callback.
 *
 * **Validation URL** : on accepte uniquement `http://` et
 * `https://`. Pas de fragment, pas de query, pas de slash final
 * (normalisé par `URL.toString()` puis stripping). On laisse les
 * domaines internes (`http://localhost:3000`, `http://192.168.x.x`)
 * passer — c'est précisément un cas d'usage de cette page.
 */

const REDIRECT_PATH = '/api/auth/callback/discord';

const urlSchema = z
  .string()
  .min(1)
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'URL invalide' });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'protocole http(s) requis',
      });
    }
  });

const baseBodySchema = z.object({
  baseUrl: urlSchema,
});

const additionalBodySchema = z.object({
  url: urlSchema,
  label: z.string().min(1).max(80).optional(),
});

/**
 * Normalise une URL : strip slash final pour éviter les doublons
 * `https://x.com` vs `https://x.com/`. Conserve le path s'il y a
 * autre chose qu'un `/` final (ex. `https://x.com/varde`).
 */
const normalizeUrl = (raw: string): string => {
  const u = new URL(raw);
  const out = u.toString();
  return out.endsWith('/') && u.pathname === '/' ? out.slice(0, -1) : out;
};

/** Forme retournée par `GET /admin/urls` et `PUT /admin/urls/base`. */
export interface AdminUrlsResponse {
  readonly baseUrl: string | null;
  readonly additionalUrls: readonly AdditionalUrl[];
}

/** Forme retournée par `GET /admin/urls/redirect-uris`. */
export interface AdminRedirectUrisResponse {
  readonly redirectUris: readonly string[];
}

/** Options de construction. */
export interface RegisterAdminUrlsRoutesOptions {
  readonly ownership: OwnershipService;
  readonly instanceConfig: InstanceConfigService;
  readonly logger: Logger;
  /**
   * Valeur d'environnement de `baseUrl` — utilisée comme fallback
   * dans la liste des redirect URIs quand `instance_config.base_url`
   * vaut `null`. Permet à l'UI d'afficher au moins une redirect URI
   * pour le principal sans dépendre d'une mutation admin préalable.
   */
  readonly envBaseUrl: string;
  /** Service d'audit instance-scoped. Optionnel. */
  readonly instanceAudit?: InstanceAuditService;
}

const httpError = (
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Error & { statusCode: number; code: string; details?: unknown } => {
  const err = new Error(message) as Error & {
    statusCode: number;
    code: string;
    details?: unknown;
  };
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
};

const buildRedirectUri = (origin: string): string =>
  `${origin.replace(/\/+$/u, '')}${REDIRECT_PATH}`;

export function registerAdminUrlsRoutes(
  app: FastifyInstance,
  options: RegisterAdminUrlsRoutesOptions,
): void {
  const { ownership, instanceConfig, logger, envBaseUrl, instanceAudit } = options;
  const log = logger.child({ component: 'admin-urls' });

  app.get('/admin/urls', async (request): Promise<AdminUrlsResponse> => {
    await requireOwner(app, request, ownership);
    const config = await instanceConfig.getConfig();
    return {
      baseUrl: config.baseUrl,
      additionalUrls: config.additionalUrls,
    };
  });

  app.get('/admin/urls/redirect-uris', async (request): Promise<AdminRedirectUrisResponse> => {
    await requireOwner(app, request, ownership);
    const config = await instanceConfig.getConfig();
    const principal = config.baseUrl ?? envBaseUrl;
    const all = [principal, ...config.additionalUrls.map((u) => u.url)];
    // De-dupe en préservant l'ordre — l'admin peut avoir ajouté
    // une URL identique au baseUrl, on n'en garde qu'une.
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const origin of all) {
      const uri = buildRedirectUri(origin);
      if (!seen.has(uri)) {
        seen.add(uri);
        unique.push(uri);
      }
    }
    return { redirectUris: unique };
  });

  app.put('/admin/urls/base', async (request): Promise<AdminUrlsResponse> => {
    const session = await requireOwner(app, request, ownership);
    const parsed = baseBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
    }
    const baseUrl = normalizeUrl(parsed.data.baseUrl);

    const config = await instanceConfig.getConfig();
    await instanceConfig.setStep(config.setupStep, { baseUrl });
    log.warn('Admin updated base URL', { ownerId: session.userId, baseUrl });
    await instanceAudit?.log({
      action: INSTANCE_AUDIT_ACTIONS.BASE_URL_UPDATED,
      actor: { type: 'user', id: session.userId as UserId },
      severity: 'warn',
      metadata: { baseUrl },
    });

    const after = await instanceConfig.getConfig();
    return { baseUrl: after.baseUrl, additionalUrls: after.additionalUrls };
  });

  app.post('/admin/urls', async (request): Promise<AdminUrlsResponse> => {
    const session = await requireOwner(app, request, ownership);
    const parsed = additionalBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
    }
    const url = normalizeUrl(parsed.data.url);

    const config = await instanceConfig.getConfig();
    if (config.additionalUrls.some((u) => u.url === url)) {
      throw httpError(409, 'url_already_exists', 'Cette URL est déjà enregistrée.');
    }
    const entry: AdditionalUrl = {
      id: randomUUID(),
      url,
      ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
    };
    const next = [...config.additionalUrls, entry];
    await instanceConfig.setStep(config.setupStep, { additionalUrls: next });
    log.warn('Admin added access URL', {
      ownerId: session.userId,
      id: entry.id,
      url: entry.url,
    });
    await instanceAudit?.log({
      action: INSTANCE_AUDIT_ACTIONS.URL_ADDED,
      actor: { type: 'user', id: session.userId as UserId },
      severity: 'info',
      target: { type: 'url', id: entry.id },
      metadata: { url: entry.url, ...(entry.label !== undefined ? { label: entry.label } : {}) },
    });

    const after = await instanceConfig.getConfig();
    return { baseUrl: after.baseUrl, additionalUrls: after.additionalUrls };
  });

  app.delete<{ Params: { id: string } }>(
    '/admin/urls/:id',
    async (request): Promise<AdminUrlsResponse> => {
      const session = await requireOwner(app, request, ownership);
      const { id } = request.params;
      const config = await instanceConfig.getConfig();
      const next = config.additionalUrls.filter((u) => u.id !== id);
      if (next.length === config.additionalUrls.length) {
        throw httpError(404, 'url_not_found', 'Aucune URL avec cet id.');
      }
      await instanceConfig.setStep(config.setupStep, { additionalUrls: next });
      log.warn('Admin removed access URL', { ownerId: session.userId, id });
      await instanceAudit?.log({
        action: INSTANCE_AUDIT_ACTIONS.URL_REMOVED,
        actor: { type: 'user', id: session.userId as UserId },
        severity: 'info',
        target: { type: 'url', id },
      });
      const after = await instanceConfig.getConfig();
      return { baseUrl: after.baseUrl, additionalUrls: after.additionalUrls };
    },
  );
}
