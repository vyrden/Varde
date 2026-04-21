import type { ActionId, AuditLogRecord, GuildId, Ulid } from '@varde/contracts';
import type { CoreAuditService } from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Route `GET /guilds/:guildId/audit` — lecture paginée de l'audit log
 * pour la page audit du dashboard.
 *
 * Filtres : `action`, `actorType`, `severity`, `since`, `until`.
 * Pagination : cursor-based, sans offset. Le client passe le
 * `cursor` (ULID de la dernière ligne vue) ; le serveur répond avec
 * un `nextCursor` s'il existe probablement des lignes plus anciennes.
 *
 * Stratégie : on demande `limit + 1` au service ; si on reçoit
 * `limit + 1` lignes, c'est qu'il y a une page suivante — on tronque
 * à `limit` et on pose `nextCursor = items[limit - 1].id`. Sinon on
 * renvoie tout sans `nextCursor`. Gives exact pagination semantics.
 *
 * Le paramètre `limit` est borné à [1, 100], défaut 50.
 *
 * Sécurité : `requireGuildAdmin` (MANAGE_GUILD sur la guild) avant
 * toute lecture.
 */

const AUDIT_ACTOR_TYPES = ['user', 'system', 'module'] as const;
const AUDIT_SEVERITIES = ['info', 'warn', 'error'] as const;

const auditQuerySchema = z.object({
  action: z.string().min(1).optional(),
  actorType: z.enum(AUDIT_ACTOR_TYPES).optional(),
  severity: z.enum(AUDIT_SEVERITIES).optional(),
  since: z.iso.datetime().optional(),
  until: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

type AuditQueryParsed = z.infer<typeof auditQuerySchema>;

export interface AuditPageDto {
  readonly items: readonly AuditLogRecord[];
  readonly nextCursor?: string;
}

export interface RegisterAuditRoutesOptions {
  readonly audit: CoreAuditService;
  readonly discord: DiscordClient;
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

const buildAuditOptions = (
  guildId: string,
  parsed: AuditQueryParsed,
): Parameters<CoreAuditService['query']>[0] => {
  const options: {
    guildId: GuildId;
    limit: number;
    action?: ActionId;
    actorType?: 'user' | 'system' | 'module';
    severity?: 'info' | 'warn' | 'error';
    since?: Date;
    until?: Date;
    cursor?: Ulid;
  } = {
    guildId: guildId as GuildId,
    limit: parsed.limit + 1,
  };
  if (parsed.action !== undefined) options.action = parsed.action as ActionId;
  if (parsed.actorType !== undefined) options.actorType = parsed.actorType;
  if (parsed.severity !== undefined) options.severity = parsed.severity;
  if (parsed.since !== undefined) options.since = new Date(parsed.since);
  if (parsed.until !== undefined) options.until = new Date(parsed.until);
  if (parsed.cursor !== undefined) options.cursor = parsed.cursor as Ulid;
  return options;
};

export function registerAuditRoutes(
  app: FastifyInstance,
  options: RegisterAuditRoutesOptions,
): void {
  app.get<{
    Params: { guildId: string };
    Querystring: Record<string, string | undefined>;
  }>('/guilds/:guildId/audit', async (request): Promise<AuditPageDto> => {
    const { guildId } = request.params;
    await requireGuildAdmin(app, request, guildId, options.discord);

    const parseResult = auditQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      throw httpError(
        400,
        'invalid_query',
        'Paramètres de requête invalides.',
        parseResult.error.issues,
      );
    }
    const parsed = parseResult.data;

    const rows = await options.audit.query(buildAuditOptions(guildId, parsed));

    if (rows.length <= parsed.limit) {
      return { items: rows };
    }
    const items = rows.slice(0, parsed.limit);
    const last = items[items.length - 1];
    if (!last) {
      return { items };
    }
    return { items, nextCursor: last.id };
  });
}
