import type { ManifestStatic, ModuleId } from '@varde/contracts';

/**
 * Manifeste du module témoin `onboarding-test`. Vise à prouver que le
 * contrat d'extension onboarding (PR 3.13) est utilisable par un
 * module tiers :
 *
 * - `ctx.onboarding.registerAction(def)` — contribue une action
 *   custom `onboarding-test.setup-gaming-commands` au registre de
 *   l'executor. Un admin qui ajoute cette action à son draft
 *   déclenchera la création d'un salon dédié + un patch config du
 *   module à l'apply ; le rollback supprimera le salon.
 * - `ctx.onboarding.contributeHint(hint)` — pose une suggestion
 *   hand-curée pour le builder (salon #gaming-commands).
 *
 * Le module ne déclare aucune permission ni aucune commande : sa
 * surface publique passe entièrement par les hooks onboarding.
 */
export const manifest: ManifestStatic = {
  id: 'onboarding-test' as ModuleId,
  name: 'Onboarding Test',
  version: '1.0.0',
  coreVersion: '^1.0.0',
  description:
    "Module témoin qui exerce le contrat d'extension onboarding (registerAction + contributeHint).",
  author: { name: 'Mainteneur' },
  license: 'Apache-2.0',
  schemaVersion: 0,
  permissions: [],
  events: {
    listen: [],
    emit: [],
  },
};
