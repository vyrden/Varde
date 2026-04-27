// apps/dashboard/components/logs/event-catalog.ts

/**
 * Catalogue des 12 events `guild.*` couverts par le module logs,
 * groupés par famille pour le rendu UI. Source de vérité unique
 * partagée entre mode simple (grille de cases à cocher) et mode
 * avancé (libellés dans la table des routes).
 *
 * Les meta-events `guild.join` / `guild.leave` (cycle de vie du bot
 * dans une guild) sont volontairement exclus — non-loggables côté
 * produit.
 */

export interface LogEventDefinition {
  /** Identifiant canonique du CoreEvent, ex. "guild.memberJoin". */
  readonly id: string;
  /** Libellé FR affiché à l'admin. */
  readonly label: string;
  /** Annotation optionnelle affichée entre parenthèses, ex. "bruyant". */
  readonly hint?: string;
}

export interface LogEventGroup {
  readonly id: 'members' | 'messages' | 'channels' | 'roles';
  readonly label: string;
  readonly events: readonly LogEventDefinition[];
}

export const EVENT_GROUPS: readonly LogEventGroup[] = [
  {
    id: 'members',
    label: 'Membres',
    events: [
      { id: 'guild.memberJoin', label: 'Arrivée membre' },
      { id: 'guild.memberLeave', label: 'Départ membre' },
      { id: 'guild.memberUpdate', label: 'Modification membre' },
    ],
  },
  {
    id: 'messages',
    label: 'Messages',
    events: [
      { id: 'guild.messageDelete', label: 'Message supprimé' },
      { id: 'guild.messageEdit', label: 'Message édité' },
      { id: 'guild.messageCreate', label: 'Message envoyé', hint: 'bruyant' },
    ],
  },
  {
    id: 'channels',
    label: 'Salons',
    events: [
      { id: 'guild.channelCreate', label: 'Salon créé' },
      { id: 'guild.channelUpdate', label: 'Salon modifié' },
      { id: 'guild.channelDelete', label: 'Salon supprimé' },
    ],
  },
  {
    id: 'roles',
    label: 'Rôles',
    events: [
      { id: 'guild.roleCreate', label: 'Rôle créé' },
      { id: 'guild.roleUpdate', label: 'Rôle modifié' },
      { id: 'guild.roleDelete', label: 'Rôle supprimé' },
    ],
  },
] as const;

/** Liste à plat des 12 event ids, dans l'ordre d'affichage groupes → events. */
export const ALL_EVENT_IDS: readonly string[] = EVENT_GROUPS.flatMap((g) =>
  g.events.map((e) => e.id),
);

/** Map `eventId → label FR` pour lookup rapide (mode avancé, renderer table). */
export const EVENT_LABEL: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(EVENT_GROUPS.flatMap((g) => g.events.map((e) => [e.id, e.label]))),
);
