import type { ReactionRoleButtonStyleClient, ReactionRolePairKindClient } from '../types';

/**
 * Brouillon local d'une paire pendant l'édition. L'emoji reste un
 * texte brut tant qu'il n'a pas été parsé (l'utilisateur peut coller
 * `<:nom:id>` ou taper un emoji unicode), et le rôle est soit choisi
 * dans la liste existante soit nommé pour création.
 */
export type PairDraft = {
  uid: string;
  kind: ReactionRolePairKindClient;
  emoji: string;
  /** Pour kind=button uniquement. */
  label: string;
  /** Pour kind=button uniquement. */
  style: ReactionRoleButtonStyleClient;
} & ({ roleMode: 'existing'; roleId: string } | { roleMode: 'create'; roleName: string });

export type EditorMode = 'normal' | 'unique' | 'verifier';
export type EditorFeedback = 'dm' | 'ephemeral' | 'none';

export interface FeedbackState {
  readonly kind: 'success' | 'error';
  readonly message: string;
}
