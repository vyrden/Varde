import {
  type CommandInteractionInput,
  type ModuleCommand,
  type ModuleCommandMap,
  ModuleError,
  type ModuleId,
  type PermissionId,
  type UIMessage,
  type UIService,
} from '@varde/contracts';
import { isUIMessage } from '@varde/core';

/**
 * Registre de slash commands + routage des interactions.
 *
 * Le registre est indexé par nom de commande (globalement unique V1 :
 * un conflit entre deux modules est refusé). Chaque entrée porte le
 * module d'origine et la définition de la commande. Le routage vérifie
 * la permission applicative déclarée puis invoque le handler et valide
 * que son retour est bien un `UIMessage` produit par la factory.
 */

interface RegisteredCommand {
  readonly moduleId: ModuleId;
  readonly command: ModuleCommand;
}

/** Registre public. */
export interface CommandRegistry {
  /**
   * Enregistre toutes les commandes d'un module. Refuse si un nom est
   * déjà pris par un autre module. Idempotent pour le même moduleId :
   * ré-enregistrer remplace les commandes précédentes.
   */
  readonly register: (moduleId: ModuleId, commands: ModuleCommandMap) => void;
  /** Retire les commandes d'un module (au `onUnload` / `onDisable`). */
  readonly unregister: (moduleId: ModuleId) => void;
  /** Résout une commande par nom. */
  readonly resolve: (commandName: string) => RegisteredCommand | null;
  /** Liste toutes les commandes enregistrées, tri stable par nom. */
  readonly list: () => readonly RegisteredCommand[];
}

export function createCommandRegistry(): CommandRegistry {
  const byName = new Map<string, RegisteredCommand>();
  const byModule = new Map<ModuleId, Set<string>>();

  const clearModule = (moduleId: ModuleId): void => {
    const names = byModule.get(moduleId);
    if (!names) return;
    for (const name of names) byName.delete(name);
    byModule.delete(moduleId);
  };

  return {
    register(moduleId, commands) {
      // Remplace les commandes d'un éventuel enregistrement antérieur du même module.
      clearModule(moduleId);
      const names = new Set<string>();
      for (const [name, command] of Object.entries(commands)) {
        if (byName.has(name)) {
          const conflict = byName.get(name);
          throw new ModuleError(
            `CommandRegistry : nom "${name}" déjà pris par le module "${conflict?.moduleId}"`,
            moduleId,
            { metadata: { name, conflict: conflict?.moduleId } },
          );
        }
        byName.set(name, { moduleId, command });
        names.add(name);
      }
      if (names.size > 0) {
        byModule.set(moduleId, names);
      }
    },
    unregister(moduleId) {
      clearModule(moduleId);
    },
    resolve(commandName) {
      return byName.get(commandName) ?? null;
    },
    list() {
      return Array.from(byName.values()).sort((a, b) =>
        a.command.name.localeCompare(b.command.name),
      );
    },
  };
}

/** Minimum surface du service de permissions utilisée par le routage. */
export interface CommandPermissionsPort {
  readonly canInGuild: (
    input: CommandInteractionInput,
    permission: PermissionId,
  ) => Promise<boolean>;
}

/** Options de `routeCommandInteraction`. */
export interface RouteCommandOptions {
  readonly registry: CommandRegistry;
  readonly ui: UIService;
  readonly permissions?: CommandPermissionsPort;
}

/**
 * Applique les règles de routage sur une interaction :
 * 1. Résout la commande dans le registre ; si inconnue, renvoie
 *    `ui.error(...)` sans lever.
 * 2. Si la commande déclare `defaultPermission`, interroge
 *    `permissions.canInGuild` ; refus → `ui.error(...)`.
 * 3. Invoque le handler, vérifie que le retour est un `UIMessage`
 *    issu de la factory via `isUIMessage`. Un retour invalide lève
 *    (le bot applique ce garde-fou en dev ; prod transformera en
 *    journalisation côté middleware, PR 1.6.d).
 *
 * Retourne toujours un `UIMessage` prêt à être renvoyé à Discord.
 */
export async function routeCommandInteraction(
  input: CommandInteractionInput,
  options: RouteCommandOptions,
): Promise<UIMessage> {
  const { registry, ui, permissions } = options;
  const hit = registry.resolve(input.commandName);
  if (!hit) {
    return ui.error(`Commande "${input.commandName}" inconnue.`);
  }
  const required = hit.command.defaultPermission;
  if (required && permissions) {
    const ok = await permissions.canInGuild(input, required);
    if (!ok) {
      return ui.error('Permission refusée.');
    }
  }
  const result = await hit.command.handler(input);
  if (!isUIMessage(result)) {
    throw new ModuleError(
      `handler de "${input.commandName}" n'a pas retourné un UIMessage produit par ctx.ui.*`,
      hit.moduleId,
      { metadata: { commandName: input.commandName } },
    );
  }
  return result;
}
