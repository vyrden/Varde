import type { WelcomeConfigClient } from '../../lib/welcome-actions';

/**
 * Types client partagés pour le module welcome — extraits de
 * `WelcomeConfigEditor.tsx` et de `lib/welcome-actions` pour faciliter
 * la composition entre sections et tests.
 *
 * `WelcomeConfigClient` reste défini dans `lib/welcome-actions` (proche
 * de l'API), on le ré-export ici pour pouvoir importer depuis un seul
 * point côté composants.
 */

export type { WelcomeConfigClient } from '../../lib/welcome-actions';

export type WelcomeBlock = WelcomeConfigClient['welcome'];
export type GoodbyeBlock = WelcomeConfigClient['goodbye'];
export type AnyBlock = WelcomeBlock | GoodbyeBlock;

export type WelcomeVariant = 'welcome' | 'goodbye';

export interface ChannelOption {
  readonly id: string;
  readonly name: string;
}

export interface RoleOption {
  readonly id: string;
  readonly name: string;
}

export interface FeedbackBanner {
  readonly kind: 'success' | 'error';
  readonly title: string;
  readonly message: string;
}
