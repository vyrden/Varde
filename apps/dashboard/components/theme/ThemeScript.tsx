import type { ReactElement } from 'react';

/**
 * Script inline injecté dans `<head>` pour appliquer le thème
 * effectif **avant** le premier paint (jalon 7 PR 7.4.9). Évite le
 * flash de fond clair sur dark-mode et inversement.
 *
 * Le script :
 *
 * 1. Lit le cookie `varde.theme` côté client.
 * 2. Si `'system'` (ou absent), interroge `matchMedia
 *    '(prefers-color-scheme: light)'` pour résoudre.
 * 3. Pose `data-theme="light"` sur `<html>` si effective = light.
 *    Sinon (dark = défaut CSS), retire l'attribut.
 *
 * `THEME_COOKIE_NAME` est passé en variable plutôt qu'inliné pour
 * que le caller (la layout) le configure une fois et le partage
 * avec le ThemeProvider et la server action.
 */

const THEME_COOKIE_NAME = 'varde.theme';

const SCRIPT_TEMPLATE = `(function(){try{
  var c=document.cookie.split('; ').find(function(r){return r.indexOf('__NAME__=')===0});
  var v=c?c.split('=')[1]:'system';
  if(v==='system'){
    v=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
  }
  if(v==='light'){document.documentElement.setAttribute('data-theme','light');}
  else{document.documentElement.removeAttribute('data-theme');}
}catch(e){}})();`;

export function ThemeScript(): ReactElement {
  const code = SCRIPT_TEMPLATE.replace(/__NAME__/g, THEME_COOKIE_NAME);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: contenu littéral contrôlé, indispensable pour bloquer le flash avant l'hydratation React.
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export const themeCookieName = THEME_COOKIE_NAME;
