import type {
  ActionId,
  AuditService,
  GuildId,
  Logger,
  SchedulerService,
  Ulid,
} from '@varde/contracts';
import { type DbClient, type DbDriver, pgSchema, sqliteSchema } from '@varde/db';
import { eq } from 'drizzle-orm';
import { updateSession } from './onboarding-repo.js';
import { autoExpireJobKey, buildAutoExpireHandler } from './routes/onboarding.js';

/**
 * Réconciliation au démarrage du serveur : scanne les sessions
 * `applied` et rattrape les jobs auto-expire manqués pendant l'arrêt
 * du process.
 *
 * - Si `expiresAt` est déjà dépassée au boot : la session passe
 *   directement en `expired` (l'admin a perdu sa fenêtre).
 * - Si `expiresAt` est à venir : on réenregistre le handler dans le
 *   scheduler avec la même `jobKey` que celle posée par `/apply`,
 *   pour que le tick à l'échéance fasse bien la transition.
 *
 * Les sessions `draft`, `previewing`, `applying`, ou terminales
 * (`rolled_back`, `expired`, `failed`) sont laissées telles quelles
 * — seules `applied` portent un job one-shot à rescheduler.
 *
 * La fonction est idempotente : peut être relancée sur un process
 * déjà reconcilié, les upserts de scheduler et le updateSession
 * vers `expired` convergent.
 */
export async function reconcileOnboardingSessions<D extends DbDriver>(options: {
  readonly client: DbClient<D>;
  readonly scheduler: SchedulerService;
  readonly logger: Logger;
  /** AuditService optionnel pour tracer les expirations rattrapées au boot. */
  readonly audit?: AuditService;
  readonly now?: () => Date;
}): Promise<{ readonly reenqueued: number; readonly expired: number }> {
  const { client, scheduler, logger, audit } = options;
  const now = options.now ?? (() => new Date());
  const tickAt = now();

  const rows = await selectAppliedSessions(client);

  let reenqueued = 0;
  let expired = 0;

  for (const row of rows) {
    const expiresAt = row.expiresAt;
    if (!expiresAt) continue; // anomalie : status=applied sans expiresAt → skip silencieux
    if (expiresAt.getTime() <= tickAt.getTime()) {
      await updateSession(client, row.id, { status: 'expired' });
      expired += 1;
      logger.info('reconcile: session applied expirée au boot', { sessionId: row.id });
      if (audit) {
        await audit.log({
          guildId: row.guildId,
          action: 'onboarding.session.expired' as ActionId,
          actor: { type: 'system' },
          severity: 'info',
          metadata: {
            sessionId: row.id,
            expiresAt: expiresAt.toISOString(),
            reason: 'boot-reconcile',
          },
        });
      }
      continue;
    }
    const handler = buildAutoExpireHandler(client, row.id, logger, audit);
    await scheduler.at(expiresAt, autoExpireJobKey(row.id), handler);
    reenqueued += 1;
  }

  if (reenqueued > 0 || expired > 0) {
    logger.info('reconcile onboarding terminé', { reenqueued, expired });
  }
  return { reenqueued, expired };
}

interface AppliedRow {
  readonly id: Ulid;
  readonly guildId: GuildId;
  readonly expiresAt: Date | null;
}

const parseSqliteDate = (raw: string | null): Date | null => {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const selectAppliedSessions = async <D extends DbDriver>(
  client: DbClient<D>,
): Promise<readonly AppliedRow[]> => {
  if (client.driver === 'pg') {
    const { onboardingSessions } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select({
        id: onboardingSessions.id,
        guildId: onboardingSessions.guildId,
        expiresAt: onboardingSessions.expiresAt,
      })
      .from(onboardingSessions)
      .where(eq(onboardingSessions.status, 'applied'));
    return rows.map((r) => ({
      id: r.id as Ulid,
      guildId: r.guildId as GuildId,
      expiresAt: r.expiresAt,
    }));
  }
  const { onboardingSessions } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const rows = sqlite.db
    .select({
      id: onboardingSessions.id,
      guildId: onboardingSessions.guildId,
      expiresAt: onboardingSessions.expiresAt,
    })
    .from(onboardingSessions)
    .where(eq(onboardingSessions.status, 'applied'))
    .all();
  return rows.map((r) => ({
    id: r.id as Ulid,
    guildId: r.guildId as GuildId,
    expiresAt: parseSqliteDate(r.expiresAt),
  }));
};
