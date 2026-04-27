import { defineModule } from '@varde/contracts';

import {
  configSchema,
  configUi,
  resolveConfig,
  type WelcomeConfig,
  welcomeConfigSchema,
} from './config.js';
import { registerWelcomeFonts } from './font-registry.js';
import { locales } from './locales.js';
import { manifest } from './manifest.js';
import { setWelcomeAutoroleAction, setWelcomeChannelAction } from './onboarding-actions.js';
import { handleMemberJoin, handleMemberLeave } from './runtime.js';
import { WELCOME_TEMPLATES, type WelcomeTemplate } from './templates.js';

/**
 * Module officiel `welcome`. Écoute `guild.memberJoin` /
 * `guild.memberLeave` pour poster un message d'accueil/départ,
 * appliquer un auto-rôle et filtrer les comptes neufs.
 */

const subscriptions = new Set<() => void>();

export const welcome = defineModule({
  manifest,
  configSchema,
  configUi,

  onLoad: async (ctx) => {
    ctx.logger.info('welcome : onLoad');
    subscriptions.clear();

    // Enregistrement des polices : embarquées + admin (uploads/fonts/).
    const uploadsDir = process.env['VARDE_UPLOADS_DIR'] ?? './uploads';
    await registerWelcomeFonts(uploadsDir);

    subscriptions.add(ctx.events.on('guild.memberJoin', async (e) => handleMemberJoin(ctx, e)));
    subscriptions.add(ctx.events.on('guild.memberLeave', async (e) => handleMemberLeave(ctx, e)));

    // Actions d'onboarding contribuées : permettent à un preset jalon 4
    // de câbler le module en réutilisant les rôles/salons créés en amont
    // de la séquence d'apply (cf. ADR 0007).
    ctx.onboarding.registerAction(setWelcomeChannelAction);
    ctx.onboarding.registerAction(setWelcomeAutoroleAction);
  },

  onUnload: async (ctx) => {
    ctx.logger.info('welcome : onUnload');
    for (const unsub of subscriptions) unsub();
    subscriptions.clear();
  },
});

export { type RenderCardOptions, renderWelcomeCard } from './card.js';
export { listRegisteredFonts, registerWelcomeFonts } from './font-registry.js';
export {
  type SetWelcomeAutoroleePayload,
  type SetWelcomeAutoroleResult,
  type SetWelcomeChannelPayload,
  type SetWelcomeChannelResult,
  setWelcomeAutoroleAction,
  setWelcomeChannelAction,
} from './onboarding-actions.js';
export { renderTemplate, TEMPLATE_VARIABLES, type TemplateVariables } from './template-render.js';
export type { WelcomeConfig, WelcomeTemplate };
export {
  configSchema,
  configUi,
  locales,
  manifest,
  resolveConfig,
  WELCOME_TEMPLATES,
  welcomeConfigSchema,
};
export default welcome;
