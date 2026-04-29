import type { Client } from 'discord.js';

/**
 * Holder mutable pour le `Client` discord.js, permettant le swap à
 * chaud du token bot via `discordReconnectService` (jalon 7 PR 7.2).
 *
 * Construit dans `apps/server/src/bin.ts` avec le client courant ;
 * passé aux constructeurs `createDiscordJsChannelSender`,
 * `createOnboardingDiscordBridge` et `createDiscordService` à la
 * place du `Client` direct. Lors d'une rotation de token, le
 * handler du reconnect service mute `holder.current` pour pointer
 * sur le nouveau client. Les services internes lisent toujours
 * `holder.current` au call-time, ils suivent donc le swap sans
 * être reconstruits.
 *
 * Les constructeurs acceptent à la fois `Client` direct (tests
 * unitaires, callers qui ne câblent pas le swap) et `DiscordClientHolder`
 * via `resolveDiscordClient()`.
 */
export interface DiscordClientHolder {
  current: Client;
}

/** Distingue un holder d'un Client par la présence de `current`. */
export const isDiscordClientHolder = (
  value: Client | DiscordClientHolder,
): value is DiscordClientHolder =>
  typeof value === 'object' && value !== null && 'current' in value;

/**
 * Resout en `Client` à partir d'un argument qui peut être direct
 * ou un holder. Lors du swap de token, les callers qui ont reçu
 * un holder verront automatiquement le nouveau client à chaque
 * appel — c'est précisément la propriété qu'on cherche à obtenir.
 */
export const resolveDiscordClient = (value: Client | DiscordClientHolder): Client =>
  isDiscordClientHolder(value) ? value.current : value;
