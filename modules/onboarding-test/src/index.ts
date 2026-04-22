import { defineModule, type OnboardingHint } from '@varde/contracts';

import { setupGamingCommandsAction } from './actions.js';
import { manifest } from './manifest.js';

/**
 * Module témoin `onboarding-test`. Exerce en un seul endroit les deux
 * points d'extension du moteur d'onboarding (ADR 0007, PR 3.13) :
 *
 * - `ctx.onboarding.registerAction(def)` : ajoute l'action custom
 *   `onboarding-test.setup-gaming-commands` au registre de l'executor.
 * - `ctx.onboarding.contributeHint(hint)` : pose une suggestion
 *   hand-curée que le builder peut présenter à l'admin.
 *
 * Pas de commande Slash, pas de permission : la surface publique est
 * entièrement côté onboarding. Ce module sert de test vivant du
 * contrat plugin — tout changement cassant du contrat le fera
 * échouer au build / aux tests.
 */

const GAMING_CHANNEL_HINT: OnboardingHint = Object.freeze({
  id: 'onboarding-test.gaming-channel',
  kind: 'channel',
  label: 'Salon #gaming-commands',
  rationale:
    'Regroupe les commandes de jeu dans un salon dédié pour éviter de polluer les fils de discussion.',
  patch: {
    channels: [
      {
        localId: 'chan-gaming-commands',
        categoryLocalId: null,
        name: 'gaming-commands',
        type: 'text',
        slowmodeSeconds: 0,
        readableBy: [],
        writableBy: [],
      },
    ],
  },
});

export const onboardingTest = defineModule({
  manifest,

  onLoad: async (ctx) => {
    ctx.logger.info('onboarding-test : onLoad exécuté');
    ctx.onboarding.registerAction(setupGamingCommandsAction);
    ctx.onboarding.contributeHint(GAMING_CHANNEL_HINT);
  },

  onUnload: async (ctx) => {
    // L'executor n'expose pas `unregisterAction` en V1 — l'hôte
    // (server, harness) vit le temps du process et les contributions
    // restent valides. À poser si un cycle reload/dev hot arrive.
    ctx.logger.info('onboarding-test : onUnload exécuté');
  },
});

export {
  type SetupGamingCommandsPayload,
  type SetupGamingCommandsResult,
  setupGamingCommandsAction,
  setupGamingCommandsPayloadSchema,
} from './actions.js';
export { GAMING_CHANNEL_HINT, manifest };
export default onboardingTest;
