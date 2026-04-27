import type { GoodbyeBlock, WelcomeBlock, WelcomeConfigClient } from './types';

/**
 * Helpers purs pour la config welcome côté client. Validation,
 * détection de configuration avancée, traduction des codes d'erreur
 * de test. Tout est testable sans React.
 */

/**
 * Section accueil incomplète : activée mais sans salon (alors qu'un
 * salon est requis selon la destination).
 */
export function isWelcomeIncomplete(block: WelcomeBlock): boolean {
  if (!block.enabled) return false;
  // DM uniquement → pas besoin de salon.
  if (block.destination === 'dm') return false;
  return block.channelId === null;
}

/**
 * Section départ incomplète : activée mais sans salon (goodbye est
 * channel-only).
 */
export function isGoodbyeIncomplete(block: GoodbyeBlock): boolean {
  if (!block.enabled) return false;
  return block.channelId === null;
}

export interface WelcomeValidity {
  /** La config peut être sauvegardée (aucune section activée n'est incomplète). */
  readonly canSave: boolean;
  /** Détail des incompléts pour l'UI. */
  readonly welcomeIncomplete: boolean;
  readonly goodbyeIncomplete: boolean;
}

export function evaluateWelcomeValidity(config: WelcomeConfigClient): WelcomeValidity {
  const welcomeIncomplete = isWelcomeIncomplete(config.welcome);
  const goodbyeIncomplete = isGoodbyeIncomplete(config.goodbye);
  return {
    canSave: !welcomeIncomplete && !goodbyeIncomplete,
    welcomeIncomplete,
    goodbyeIncomplete,
  };
}

/**
 * Indique si la config a au moins un réglage avancé actif. Sert à
 * décider si la section « Configuration avancée » doit s'auto-ouvrir
 * au mount.
 */
export function isAdvancedConfig(config: WelcomeConfigClient): boolean {
  if (config.autorole.enabled) return true;
  if (config.accountAgeFilter.enabled) return true;
  return false;
}

/**
 * Traduit un code d'erreur de test welcome en phrase française. Mêmes
 * codes que le runtime côté API, on les reproduit ici plutôt que de
 * dépendre du module bot (cohérent avec `templates.ts` qui duplique
 * pour éviter la dépendance napi-rs/canvas côté client).
 */
export function formatTestReason(reason: string): string {
  switch (reason) {
    case 'service-indisponible':
      return 'Le bot Discord est indisponible.';
    case 'welcome-désactivé':
      return "Active d'abord la section « Message d'accueil » avant de tester.";
    case 'goodbye-désactivé':
      return "Active d'abord la section « Message de départ » avant de tester.";
    case 'channel-requis':
      return 'Choisis un salon avant de tester.';
    case 'draft-invalide':
      return 'Le brouillon contient une erreur de validation.';
    case 'send-failed':
      return "L'envoi du message a échoué côté Discord.";
    case 'autorole-désactivé':
      return "Active l'auto-rôle avec au moins un rôle avant de tester.";
    case 'all-roles-failed':
      return 'Aucun rôle n’a pu être attribué (permissions / hiérarchie).';
    default:
      return reason.startsWith('http-') ? `Erreur HTTP ${reason.slice(5)}.` : `Erreur : ${reason}`;
  }
}

/**
 * Variables d'exemple pour le live preview — données fictives qui
 * permettent à l'admin de visualiser le rendu sans avoir un vrai
 * membre qui rejoint. Cohérent avec ce qu'utilise le module welcome
 * côté runtime quand il rend la carte.
 */
export const SAMPLE_PREVIEW_VARIABLES: Readonly<Record<string, string | number>> = {
  user: 'Alice',
  'user.mention': '<@123456789012345678>',
  'user.tag': 'Alice',
  guild: 'Aperçu',
  memberCount: 42,
  accountAgeDays: 365,
};
