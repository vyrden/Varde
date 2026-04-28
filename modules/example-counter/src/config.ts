import type { ConfigUi, ModuleId } from '@varde/contracts';
import { z } from 'zod';

/**
 * Schéma de configuration du module. Les `default()` garantissent
 * qu'un `configSchema.parse({})` produit un objet complet — le
 * runtime n'a donc jamais à gérer le cas « pas encore de config ».
 *
 * `excludedChannelIds` est stocké comme array dans la base mais saisi
 * comme texte (un id par ligne) côté dashboard, parce que le V1
 * du `configUi` n'expose pas encore de widget « picker de salons ».
 * Le pré-traitement (`z.preprocess`) transforme la chaîne saisie en
 * tableau d'ids non vides.
 */
export const configSchema = z.object({
  enabled: z.boolean().default(true),
  excludedChannelIds: z
    .preprocess(
      (input) => {
        if (Array.isArray(input)) return input;
        if (typeof input === 'string') {
          return input
            .split(/[\n,]/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
        }
        return [];
      },
      z.array(z.string().regex(/^\d{17,20}$/, 'ID Discord invalide')),
    )
    .default([]),
});

export type ExampleCounterConfig = z.infer<typeof configSchema>;

/**
 * Métadonnées de rendu pour la page dashboard. Le dashboard utilise
 * `configUi.fields` pour générer le formulaire de configuration.
 */
export const configUi: ConfigUi = {
  fields: [
    {
      path: 'enabled',
      label: 'Compteur actif',
      widget: 'toggle',
      description:
        'Quand désactivé, le module n incrémente plus le compteur mais conserve les valeurs déjà comptées.',
      order: 1,
    },
    {
      path: 'excludedChannelIds',
      label: 'Salons ignorés (un ID par ligne)',
      widget: 'textarea',
      description:
        'Les messages envoyés dans ces salons ne seront pas comptés. Coller les IDs Discord (clic droit sur un salon → Copier l identifiant en mode développeur), un par ligne.',
      placeholder: '123456789012345678\n234567890123456789',
      order: 2,
    },
  ],
};

const MODULE_ID = 'example-counter' as ModuleId;

/**
 * Lit la config du module depuis un snapshot `guild_config` brut et
 * la normalise. Tolère l'absence de la ligne ou du sous-objet.
 */
export function resolveConfig(raw: unknown): ExampleCounterConfig {
  const asObj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const modules = (asObj['modules'] ?? {}) as Record<string, unknown>;
  const own = modules[MODULE_ID] ?? {};
  return configSchema.parse(own);
}
