/**
 * Types client partagés pour le module reaction-roles. Extraits de
 * `ReactionRolesConfigEditor.tsx` pour éviter le chaînage d'imports
 * cross-fichiers (le shell éditeur, les sections, le preview, la
 * landing et les tests partagent ces types).
 */

export type ReactionRolePairKindClient = 'reaction' | 'button';

export type ReactionRoleButtonStyleClient = 'primary' | 'secondary' | 'success' | 'danger';

export interface ReactionRolePairClient {
  /** Type de l'élément (réaction emoji ou bouton Discord). */
  readonly kind: ReactionRolePairKindClient;
  readonly emoji:
    | { type: 'unicode'; value: string }
    | { type: 'custom'; id: string; name: string; animated: boolean };
  readonly roleId: string;
  /** Texte du bouton (kind=button uniquement). */
  readonly label: string;
  /** Couleur du bouton (kind=button uniquement). */
  readonly style: ReactionRoleButtonStyleClient;
}

export interface ReactionRoleMessageClient {
  readonly id: string;
  readonly label: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly message: string;
  readonly mode: 'normal' | 'unique' | 'verifier';
  readonly feedback: 'dm' | 'ephemeral' | 'none';
  readonly pairs: readonly ReactionRolePairClient[];
}

export interface ChannelOption {
  readonly id: string;
  readonly name: string;
}

export interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface CustomEmojiOption {
  readonly id: string;
  readonly name: string;
  readonly animated: boolean;
  /** Présent uniquement pour les emojis externes (autres serveurs). */
  readonly guildName?: string;
}

export interface EmojiCatalog {
  readonly current: readonly CustomEmojiOption[];
  readonly external: readonly CustomEmojiOption[];
}
