import type { ConfigUi, ModuleId } from '@varde/contracts';
import { z } from 'zod';

/**
 * Schéma Zod de la config hello-world. Le `default(300)` sur
 * `welcomeDelayMs` garantit qu'un `configSchema.parse({})` retourne
 * un objet complet, ce qui évite à `onLoad` de gérer le cas « pas de
 * config en base encore ».
 */
export const configSchema = z.object({
  welcomeDelayMs: z.number().int().min(0).max(60_000).default(300),
});

export type HelloWorldConfig = z.infer<typeof configSchema>;

/**
 * Métadonnées de rendu pour le dashboard. `path` restreint aux clés
 * du `configSchema` ci-dessus. Le check de cohérence est fait par
 * `defineModule()` à la construction du module.
 */
export const configUi: ConfigUi = {
  fields: [
    {
      path: 'welcomeDelayMs',
      label: "Délai d'accueil (ms)",
      widget: 'number',
      description:
        'Délai entre l arrivée d un membre et l envoi du message de bienvenue. Entre 0 et 60 000 ms.',
      placeholder: '300',
      order: 1,
    },
  ],
};

const MODULE_ID = 'hello-world' as ModuleId;

/**
 * Lit la config de hello-world depuis un snapshot `guild_config` et
 * la normalise via le schéma Zod (applique les defaults). Tolère
 * l'absence de la ligne ou du sous-objet `modules['hello-world']`.
 */
export function resolveConfig(raw: unknown): HelloWorldConfig {
  const asObj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const modules = (asObj['modules'] ?? {}) as Record<string, unknown>;
  const own = modules[MODULE_ID] ?? {};
  return configSchema.parse(own);
}
