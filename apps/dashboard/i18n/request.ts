import { getRequestConfig } from 'next-intl/server';

import { resolveLocale } from './locale';

/**
 * Config server-side de `next-intl`. Lit la locale active depuis
 * le contexte de la requête (cookie ou Accept-Language) et charge
 * le fichier de messages correspondant.
 *
 * Référencé par `next.config.mjs` via le plugin `next-intl/plugin`,
 * et appelé automatiquement à chaque rendu Server Component.
 */
export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };
  return {
    locale,
    messages: messages.default,
  };
});
