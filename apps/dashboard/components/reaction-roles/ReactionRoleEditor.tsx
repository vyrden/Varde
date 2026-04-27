/**
 * Re-export thin du shell éditeur — l'implémentation a été éclatée
 * dans `editor/` lors de la refonte single-page builder.
 *
 * - Sections : `editor/GeneralInfoSection`, `editor/BehaviorSection`,
 *   `editor/ElementsSection`, `editor/PairRow`.
 * - Helpers purs : `editor/editor-helpers` (parseEmoji, isPairValid,
 *   factories de drafts, validation).
 * - Types internes : `editor/editor-types`.
 *
 * Le fichier conserve les exports historiques (`ReactionRoleEditor`,
 * `parseEmoji`, `isPairValid`) pour ne pas casser les imports
 * existants (notamment `ReactionRolesConfigEditor` et les tests
 * unitaires qui ciblent `parseEmoji` directement).
 */

export {
  isPairValid,
  parseEmoji,
} from './editor/editor-helpers';
export {
  ReactionRoleEditor,
  type ReactionRoleEditorProps,
} from './editor/ReactionRoleEditor';
