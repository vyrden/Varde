/**
 * Types UI normalisés réutilisables entre réponses d'interaction
 * (factory `ctx.ui.*`) et envois proactifs (`ctx.discord.sendEmbed`).
 *
 * Ces types décrivent la surface Discord sans en dépendre : le rendu
 * concret (EmbedBuilder, AttachmentBuilder) vit côté `apps/bot`, où
 * discord.js est la seule dépendance autorisée à entrer dans le
 * périmètre.
 *
 * Les constantes `DISCORD_*_LIMIT` sont figées par Discord et servent
 * de bornes dures aux formatters côté modules. Elles apparaissent
 * ici pour que les modules n'aient qu'une seule source.
 */

/** Limite de caractères du titre d'un embed Discord. */
export const DISCORD_EMBED_TITLE_LIMIT = 256;
/** Limite de caractères du nom de l'auteur d'un embed Discord. */
export const DISCORD_EMBED_AUTHOR_NAME_LIMIT = 256;
/** Limite de caractères de la description d'un embed Discord. */
export const DISCORD_EMBED_DESCRIPTION_LIMIT = 4096;
/** Limite de caractères du nom d'un field Discord. */
export const DISCORD_EMBED_FIELD_NAME_LIMIT = 256;
/** Limite de caractères de la valeur d'un field Discord. */
export const DISCORD_EMBED_FIELD_VALUE_LIMIT = 1024;
/** Limite de caractères du texte du footer Discord. */
export const DISCORD_EMBED_FOOTER_TEXT_LIMIT = 2048;
/** Nombre max de fields dans un embed Discord. */
export const DISCORD_EMBED_MAX_FIELDS = 25;
/** Total caractères max d'un embed (somme title+description+fields+footer+author). */
export const DISCORD_EMBED_TOTAL_LIMIT = 6000;
/**
 * Plafond conservateur pour la taille d'un attachement uploadé par le
 * bot (25 MB). Discord autorise jusqu'à 10 MB sur guild non-boostée et
 * plus sur guilds boostées ; on n'essaie pas d'uploader au-delà de
 * cette borne pour rester compatible avec la majorité des serveurs.
 */
export const DISCORD_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Field d'un embed Discord. `inline` défaut false côté rendu. */
export interface UIEmbedField {
  readonly name: string;
  readonly value: string;
  readonly inline?: boolean;
}

/** Auteur d'un embed Discord. */
export interface UIEmbedAuthor {
  readonly name: string;
  readonly iconUrl?: string;
  readonly url?: string;
}

/** Footer d'un embed Discord. */
export interface UIEmbedFooter {
  readonly text: string;
  readonly iconUrl?: string;
}

/**
 * Embed Discord normalisé. Toutes les propriétés sont optionnelles
 * sauf qu'un embed "vide" (aucun champ) sera rejeté au rendu côté
 * bot (discord.js refuse). Il n'y a pas de validation de longueur ici
 * — c'est la responsabilité du formatter qui produit l'embed
 * (cf. `modules/logs/src/formatters/common.ts` en PR 4.1c).
 */
export interface UIEmbed {
  readonly title?: string;
  readonly description?: string;
  readonly url?: string;
  /** Couleur au format `0xRRGGBB`. */
  readonly color?: number;
  /** Timestamp ISO-8601. */
  readonly timestamp?: string;
  readonly author?: UIEmbedAuthor;
  readonly footer?: UIEmbedFooter;
  readonly fields?: readonly UIEmbedField[];
  readonly thumbnailUrl?: string;
  readonly imageUrl?: string;
}

/**
 * Pièce jointe attachée à un message (typiquement un `content.txt`
 * produit par un formatter `logs` quand le contenu utilisateur
 * dépasse `DISCORD_EMBED_FIELD_VALUE_LIMIT`).
 */
export interface UIAttachment {
  /** Nom affiché côté Discord, ex. "content.txt", "before.txt". */
  readonly filename: string;
  /** Mime type, ex. "text/plain; charset=utf-8". */
  readonly contentType: string;
  /** Contenu binaire prêt à uploader. */
  readonly data: Buffer;
}
