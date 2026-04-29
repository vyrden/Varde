import { ConflictError } from '@varde/contracts';
import {
  type DbClient,
  type DbDriver,
  fromCanonicalDate,
  pgSchema,
  sqliteSchema,
  toCanonicalDate,
} from '@varde/db';
import { asc, count, eq } from 'drizzle-orm';

/**
 * `ownershipService` : gère la liste des owners de l'instance Varde
 * (jalon 7 PR 7.2). Les owners sont les utilisateurs Discord
 * autorisés à accéder à `/admin/*` côté dashboard et
 * `/api/admin/*` côté API.
 *
 * Modèle :
 *
 * - **First-login claim** (`claimFirstOwnership`) : le premier user
 *   qui se logue après que `instance_config.setup_completed_at` est
 *   posé devient automatiquement owner. Le hook Auth.js v5 appelle
 *   cette méthode à chaque login et c'est un no-op idempotent si la
 *   table contient déjà au moins un owner.
 * - **Ajout par owner existant** (`addOwner`) : exclusivement via
 *   l'API admin protégée par `requireOwner`. Le `grantedBy` est
 *   tracé pour l'audit.
 * - **Retrait** (`removeOwner`) : refuse explicitement de retirer le
 *   dernier owner — sinon l'instance n'a plus d'admin et personne
 *   ne peut récupérer la main sans accès au filesystem du serveur.
 *
 * Pas de cache mémoire : les owners changent rarement, les
 * lectures sont peu nombreuses (une par check `requireOwner`), et
 * le coût d'une lecture DB est inférieur au coût de gérer
 * l'invalidation de cache à travers les processus (la PR 2 du
 * chantier 2 verra l'API rendre la main au middleware Next.js qui
 * vit dans un autre process). On reverra si besoin.
 */

/** Forme publique d'un owner — discord_user_id + métadata grant. */
export interface InstanceOwner {
  readonly discordUserId: string;
  readonly grantedAt: Date;
  /**
   * `null` pour le premier owner auto-assigné via
   * `claimFirstOwnership`. Sinon snowflake de l'owner qui a
   * accordé l'accès.
   */
  readonly grantedByDiscordUserId: string | null;
}

/** Résultat de `claimFirstOwnership` — explicite si le claim a eu lieu. */
export interface ClaimFirstOwnershipResult {
  /** `true` si la table était vide et que le user vient d'être ajouté. */
  readonly claimed: boolean;
}

/** Surface publique du service. */
export interface OwnershipService {
  readonly getOwners: () => Promise<readonly InstanceOwner[]>;
  readonly isOwner: (discordUserId: string) => Promise<boolean>;
  readonly addOwner: (discordUserId: string, grantedBy: string) => Promise<void>;
  readonly removeOwner: (discordUserId: string) => Promise<void>;
  readonly claimFirstOwnership: (discordUserId: string) => Promise<ClaimFirstOwnershipResult>;
}

/** Options de construction. */
export interface CreateOwnershipServiceOptions<D extends DbDriver> {
  readonly client: DbClient<D>;
}

interface RawRow {
  readonly discordUserId: string;
  readonly grantedAt: Date | string;
  readonly grantedByDiscordUserId: string | null;
}

const decodeRow = (row: RawRow): InstanceOwner => ({
  discordUserId: row.discordUserId,
  grantedAt: row.grantedAt instanceof Date ? row.grantedAt : fromCanonicalDate(row.grantedAt),
  grantedByDiscordUserId: row.grantedByDiscordUserId,
});

const selectAll = async <D extends DbDriver>(client: DbClient<D>): Promise<readonly RawRow[]> => {
  if (client.driver === 'pg') {
    const { instanceOwners } = pgSchema;
    const pg = client as DbClient<'pg'>;
    return pg.db.select().from(instanceOwners).orderBy(asc(instanceOwners.grantedAt));
  }
  const { instanceOwners } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  return sqlite.db.select().from(instanceOwners).orderBy(asc(instanceOwners.grantedAt)).all();
};

const selectOne = async <D extends DbDriver>(
  client: DbClient<D>,
  discordUserId: string,
): Promise<RawRow | null> => {
  if (client.driver === 'pg') {
    const { instanceOwners } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db
      .select()
      .from(instanceOwners)
      .where(eq(instanceOwners.discordUserId, discordUserId))
      .limit(1);
    return rows[0] ?? null;
  }
  const { instanceOwners } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const row = sqlite.db
    .select()
    .from(instanceOwners)
    .where(eq(instanceOwners.discordUserId, discordUserId))
    .limit(1)
    .get();
  return row ?? null;
};

const countRows = async <D extends DbDriver>(client: DbClient<D>): Promise<number> => {
  if (client.driver === 'pg') {
    const { instanceOwners } = pgSchema;
    const pg = client as DbClient<'pg'>;
    const rows = await pg.db.select({ value: count() }).from(instanceOwners);
    return Number(rows[0]?.value ?? 0);
  }
  const { instanceOwners } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  const row = sqlite.db.select({ value: count() }).from(instanceOwners).get();
  return Number(row?.value ?? 0);
};

const insertOwner = async <D extends DbDriver>(
  client: DbClient<D>,
  discordUserId: string,
  grantedBy: string | null,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { instanceOwners } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db
      .insert(instanceOwners)
      .values({
        discordUserId,
        ...(grantedBy !== null ? { grantedByDiscordUserId: grantedBy } : {}),
      })
      .onConflictDoNothing({ target: instanceOwners.discordUserId });
    return;
  }
  const { instanceOwners } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  await sqlite.db
    .insert(instanceOwners)
    .values({
      discordUserId,
      grantedAt: toCanonicalDate(new Date()),
      ...(grantedBy !== null ? { grantedByDiscordUserId: grantedBy } : {}),
    })
    .onConflictDoNothing({ target: instanceOwners.discordUserId })
    .run();
};

const deleteOwner = async <D extends DbDriver>(
  client: DbClient<D>,
  discordUserId: string,
): Promise<void> => {
  if (client.driver === 'pg') {
    const { instanceOwners } = pgSchema;
    const pg = client as DbClient<'pg'>;
    await pg.db.delete(instanceOwners).where(eq(instanceOwners.discordUserId, discordUserId));
    return;
  }
  const { instanceOwners } = sqliteSchema;
  const sqlite = client as DbClient<'sqlite'>;
  await sqlite.db
    .delete(instanceOwners)
    .where(eq(instanceOwners.discordUserId, discordUserId))
    .run();
};

/**
 * Construit un `OwnershipService`. Voir le bloc-doc en tête du
 * module pour le contrat détaillé.
 */
export function createOwnershipService<D extends DbDriver>(
  options: CreateOwnershipServiceOptions<D>,
): OwnershipService {
  const { client } = options;

  return {
    async getOwners() {
      const rows = await selectAll(client);
      return rows.map(decodeRow);
    },

    async isOwner(discordUserId) {
      const row = await selectOne(client, discordUserId);
      return row !== null;
    },

    async addOwner(discordUserId, grantedBy) {
      // `onConflictDoNothing` garantit l'idempotence : un second
      // appel ne duplique pas la ligne et ne réécrit pas le
      // `grantedBy` original (cf. test).
      await insertOwner(client, discordUserId, grantedBy);
    },

    async removeOwner(discordUserId) {
      const target = await selectOne(client, discordUserId);
      if (target === null) {
        // Pas owner, no-op silencieux. Le caller traite ça comme
        // un succès idempotent — utile au cas où l'admin clique
        // deux fois sur « Retirer ».
        return;
      }
      const total = await countRows(client);
      if (total <= 1) {
        throw new ConflictError(
          'Impossible de retirer le dernier owner de l instance — il faut au moins un owner pour gérer la page admin.',
          { metadata: { discordUserId } },
        );
      }
      await deleteOwner(client, discordUserId);
    },

    async claimFirstOwnership(discordUserId) {
      const total = await countRows(client);
      if (total > 0) {
        return { claimed: false };
      }
      await insertOwner(client, discordUserId, null);
      return { claimed: true };
    },
  };
}
