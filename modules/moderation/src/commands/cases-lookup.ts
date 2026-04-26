import { isUlid, type ModuleCommand, type Ulid } from '@varde/contracts';

import { formatCaseLabel, PERM_CASES_READ } from '../audit-actions.js';
import { readStringOption, readUserIdOption } from './helpers.js';

/**
 * `/infractions @user` et `/case <id>` : lookup en lecture seule de
 * l'historique des sanctions. S'appuient sur `ctx.audit.query` /
 * `ctx.audit.get` introduits dans cette PR — auto-scopés au module
 * `moderation` côté core (un module ne peut pas lire les entrées
 * d'un autre).
 *
 * Le rendu reste minimal : un texte plat agrégeant les 10 dernières
 * entrées pour `/infractions`, le détail d'une entrée pour `/case`.
 * La page dashboard offre une vue plus riche (filtres, détail JSON).
 */

const MAX_CASES_DISPLAY = 10;

const formatTimestamp = (iso: string): string => {
  // YYYY-MM-DD HH:MM (UTC) — assez pour un affichage Discord.
  return iso.slice(0, 16).replace('T', ' ');
};

const formatReason = (metadata: Readonly<Record<string, unknown>>): string => {
  const r = metadata['reason'];
  return typeof r === 'string' && r.length > 0 ? ` — ${r}` : '';
};

const infractions: ModuleCommand = {
  name: 'infractions',
  description: 'Afficher l’historique des sanctions d’un membre.',
  defaultPermission: PERM_CASES_READ,
  options: [{ name: 'member', description: 'Membre à inspecter', type: 'user', required: true }],
  handler: async (input, ctx) => {
    const target = readUserIdOption(input, 'member');
    if (target === null) return ctx.ui.error('Option `member` requise.');

    const rows = await ctx.audit.query({
      guildId: input.guildId,
      targetType: 'user',
      targetId: target,
      limit: MAX_CASES_DISPLAY,
    });

    if (rows.length === 0) {
      const tag = input.resolved.users[target]?.tag ?? target;
      return ctx.ui.success(`Aucune sanction trouvée pour **${tag}**.`);
    }

    const tag = input.resolved.users[target]?.tag ?? target;
    const lines = rows.map((r) => {
      const label = formatCaseLabel(r.action);
      const date = formatTimestamp(r.createdAt);
      const actor = r.actorType === 'user' && r.actorId !== null ? `<@${r.actorId}>` : r.actorType;
      const reason = formatReason(r.metadata);
      return `\`${date}\` · **${label}** · par ${actor}${reason} · id=\`${r.id.slice(-8)}\``;
    });
    const header = `**${rows.length}** sanction${rows.length > 1 ? 's' : ''} pour **${tag}** (les ${MAX_CASES_DISPLAY} plus récentes) :`;
    return ctx.ui.success(`${header}\n${lines.join('\n')}`);
  },
};

const caseLookup: ModuleCommand = {
  name: 'case',
  description: 'Détail d’une sanction par identifiant ULID.',
  defaultPermission: PERM_CASES_READ,
  options: [
    {
      name: 'id',
      description: 'ULID de la sanction (visible dans /infractions ou la page audit)',
      type: 'string',
      required: true,
      maxLength: 64,
    },
  ],
  handler: async (input, ctx) => {
    const raw = readStringOption(input, 'id');
    if (raw === null) return ctx.ui.error('Option `id` requise.');
    if (!isUlid(raw)) {
      return ctx.ui.error(
        "L'identifiant fourni n'est pas un ULID valide (26 caractères Crockford base32).",
      );
    }

    const entry = await ctx.audit.get(raw as Ulid);
    if (!entry || entry.guildId !== input.guildId) {
      return ctx.ui.error('Sanction introuvable.');
    }

    const label = formatCaseLabel(entry.action);
    const date = formatTimestamp(entry.createdAt);
    const actor =
      entry.actorType === 'user' && entry.actorId !== null
        ? `<@${entry.actorId}>`
        : entry.actorType;
    const target =
      entry.targetType === 'user' && entry.targetId !== null
        ? `<@${entry.targetId}>`
        : `${entry.targetType ?? '—'} ${entry.targetId ?? ''}`;
    const reason = (entry.metadata['reason'] as string | undefined) ?? null;
    const duration = (entry.metadata['durationFormatted'] as string | undefined) ?? null;

    const lines = [
      `**${label}** · \`${entry.id}\``,
      `Date : \`${date}\` UTC`,
      `Cible : ${target}`,
      `Modérateur : ${actor}`,
    ];
    if (duration !== null) lines.push(`Durée : ${duration}`);
    if (reason !== null) lines.push(`Raison : ${reason}`);
    return ctx.ui.success(lines.join('\n'));
  },
};

export const casesLookupCommands: Record<string, ModuleCommand> = {
  infractions,
  case: caseLookup,
};

export { caseLookup, infractions };
