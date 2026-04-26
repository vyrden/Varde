import type {
  Logger,
  ModuleCommand,
  ModuleCommandOption,
  ModuleCommandOptionType,
} from '@varde/contracts';
import type { Client } from 'discord.js';

/**
 * Enregistrement REST des slash commands auprès de Discord.
 *
 * Discord exige qu'une commande soit enregistrée via `PUT
 * /applications/{appId}/commands` (global, propagation 1h) ou `PUT
 * /applications/{appId}/guilds/{guildId}/commands` (guild-scoped,
 * propagation immédiate). Notre déploiement est self-hosted multi-
 * guildes avec un set de modules par guild — on prend l'option
 * guild-scoped et on fait un PUT par guild après chaque load. Coût
 * ≈ 1 round-trip / guild / boot, négligeable.
 *
 * Le PUT remplace **l'intégralité** des commandes de la guild ; les
 * commandes que le bot ne déclare plus sont retirées. C'est le
 * comportement voulu : la source de vérité est le code.
 *
 * Pas de retry / dedup ici — Discord rate-limit côté serveur. Une
 * panne réseau au boot émet un warn mais n'interrompt pas le
 * lifecycle (les commandes existantes côté Discord restent en place
 * jusqu'au prochain boot réussi).
 */

/** Mapping `ModuleCommandOptionType` → `ApplicationCommandOptionType` Discord. */
const OPTION_TYPE_TO_DISCORD: Readonly<Record<ModuleCommandOptionType, number>> = Object.freeze({
  string: 3,
  integer: 4,
  boolean: 5,
  user: 6,
  channel: 7,
  role: 8,
  number: 10,
});

/**
 * Forme JSON envoyée à Discord pour une option (sous-ensemble de
 * `RESTPostAPIApplicationCommandOption`). On garde le strict
 * minimum — pas de support sub-command / autocomplete / channel
 * types en V1.
 */
interface DiscordCommandOptionPayload {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  min_length?: number;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  choices?: ReadonlyArray<{ readonly name: string; readonly value: string }>;
}

/**
 * Forme JSON envoyée à Discord pour une commande (sous-ensemble de
 * `RESTPostAPIChatInputApplicationCommandsJSONBody`).
 */
export interface DiscordCommandPayload {
  name: string;
  description: string;
  options?: ReadonlyArray<DiscordCommandOptionPayload>;
}

/**
 * Traduit une option déclarée par un module en payload Discord.
 * Exporté pour les tests ; utilisé internement par `toCommandPayload`.
 */
export const toOptionPayload = (option: ModuleCommandOption): DiscordCommandOptionPayload => {
  const out: DiscordCommandOptionPayload = {
    type: OPTION_TYPE_TO_DISCORD[option.type],
    name: option.name,
    description: option.description,
  };
  if (option.required !== undefined) out.required = option.required;
  if (option.minLength !== undefined) out.min_length = option.minLength;
  if (option.maxLength !== undefined) out.max_length = option.maxLength;
  if (option.minValue !== undefined) out.min_value = option.minValue;
  if (option.maxValue !== undefined) out.max_value = option.maxValue;
  if (option.choices !== undefined) {
    out.choices = option.choices.map((c) => ({ name: c.name, value: c.value }));
  }
  return out;
};

/**
 * Traduit une `ModuleCommand` en payload Discord. Pas de filtre :
 * toutes les commandes déclarées sont enregistrées (la permission
 * applicative est vérifiée côté handler après l'invocation).
 */
export const toCommandPayload = (command: ModuleCommand): DiscordCommandPayload => {
  const out: DiscordCommandPayload = {
    name: command.name,
    description: command.description,
  };
  if (command.options !== undefined && command.options.length > 0) {
    out.options = command.options.map(toOptionPayload);
  }
  return out;
};

/**
 * Forme minimale du `Client` discord.js dont on a besoin pour le
 * PUT REST. `application` n'est disponible qu'après l'événement
 * `ready` — appeler `registerSlashCommandsForGuild` avant lèvera.
 */
export interface SlashRegistrationClient {
  readonly application: {
    readonly id: string;
    readonly commands: {
      readonly set: (
        commands: ReadonlyArray<DiscordCommandPayload>,
        guildId: string,
      ) => Promise<unknown>;
    };
  } | null;
}

/**
 * PUT toutes les commandes du registre pour une guild donnée. À
 * appeler après `client.ready` et après que tous les modules sont
 * chargés. Idempotent : Discord remplace l'intégralité des
 * commandes de la guild à chaque appel.
 *
 * Si `commands` est vide, Discord retire toutes les commandes
 * existantes de la guild — comportement voulu si plus aucun module
 * n'expose de commandes.
 */
export async function registerSlashCommandsForGuild(
  client: Client | SlashRegistrationClient,
  guildId: string,
  commands: ReadonlyArray<ModuleCommand>,
  logger: Logger,
): Promise<void> {
  const application = (client as SlashRegistrationClient).application;
  if (!application) {
    logger.warn('slash-registration : application Discord non prête, skip', { guildId });
    return;
  }
  const payloads = commands.map(toCommandPayload);
  try {
    await application.commands.set(payloads, guildId);
    logger.info('slash-registration : commandes enregistrées', {
      guildId,
      count: payloads.length,
      names: payloads.map((p) => p.name),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('slash-registration : PUT a échoué (commandes existantes conservées)', {
      guildId,
      error: message,
    });
  }
}
