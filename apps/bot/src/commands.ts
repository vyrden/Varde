import {
  type CommandInteractionInput,
  type GuildId,
  type ModuleCommand,
  type ModuleCommandMap,
  type ModuleContext,
  ModuleError,
  type ModuleId,
  type PermissionId,
  type UIMessage,
} from '@varde/contracts';
import type { ModuleRef } from '@varde/core';
import { isUIMessage } from '@varde/core';

/**
 * Registre de slash commands + routage des interactions.
 *
 * Le registre est indexé par nom de commande (globalement unique V1 :
 * un conflit entre deux modules est refusé). Chaque entrée porte le
 * `ModuleRef` (id + version) et la définition de la commande. Le
 * routage construit le `ctx` du module via un `ctxFactory`, vérifie
 * la permission applicative déclarée puis invoque le handler avec
 * `(input, ctx)` et valide que son retour est bien un `UIMessage`
 * produit par la factory (via `isUIMessage`).
 */

interface RegisteredCommand {
  readonly moduleRef: ModuleRef;
  readonly command: ModuleCommand;
}

/** Registre public. */
export interface CommandRegistry {
  /**
   * Enregistre toutes les commandes d'un module. Refuse si un nom est
   * déjà pris par un autre module. Idempotent pour le même moduleId :
   * ré-enregistrer remplace les commandes précédentes.
   */
  readonly register: (ref: ModuleRef, commands: ModuleCommandMap) => void;
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
    register(ref, commands) {
      clearModule(ref.id);
      const names = new Set<string>();
      for (const [name, command] of Object.entries(commands)) {
        if (byName.has(name)) {
          const conflict = byName.get(name);
          throw new ModuleError(
            `CommandRegistry : nom "${name}" déjà pris par le module "${conflict?.moduleRef.id}"`,
            ref.id,
            { metadata: { name, conflict: conflict?.moduleRef.id } },
          );
        }
        byName.set(name, { moduleRef: ref, command });
        names.add(name);
      }
      if (names.size > 0) {
        byModule.set(ref.id, names);
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

/**
 * Sonde d'activation des modules. Le routage refuse une commande
 * dont le module auteur n'est pas activé sur la guild — défense
 * en profondeur si Discord a gardé la commande en cache plus
 * longtemps que prévu après un toggle off.
 */
export interface ModuleEnablementCheck {
  readonly isEnabled: (moduleId: ModuleId, guildId: GuildId) => boolean;
}

/** Factory de ctx invoquée par le routage pour chaque interaction. */
export type CommandCtxFactory = (ref: ModuleRef, input: CommandInteractionInput) => ModuleContext;

/** Options de `routeCommandInteraction`. */
export interface RouteCommandOptions {
  readonly registry: CommandRegistry;
  readonly ctxFactory: CommandCtxFactory;
  readonly permissions?: CommandPermissionsPort;
  /**
   * Sonde d'activation. Si fournie, le routage refuse les commandes
   * de modules désactivés pour la guild (réponse `ui.error`).
   * Optionnel : sans sonde, toutes les commandes du registry sont
   * routées sans filtrage runtime.
   */
  readonly enablementCheck?: ModuleEnablementCheck;
}

/**
 * Applique les règles de routage sur une interaction :
 * 1. Résout la commande dans le registre ; si inconnue, construit un
 *    UIService jetable pour répondre `ui.error(...)` sans impliquer
 *    de module.
 * 2. Construit le `ctx` du module via `ctxFactory(ref, input)`.
 * 3. Si la commande déclare `defaultPermission`, interroge
 *    `permissions.canInGuild` ; refus → `ctx.ui.error(...)`.
 * 4. Invoque le handler avec `(input, ctx)`, vérifie que le retour
 *    est un `UIMessage` frozen issu de `ctx.ui.*` via `isUIMessage`.
 *    Un retour invalide lève `ModuleError`.
 */
export async function routeCommandInteraction(
  input: CommandInteractionInput,
  options: RouteCommandOptions,
): Promise<UIMessage> {
  const { registry, ctxFactory, permissions, enablementCheck } = options;
  const hit = registry.resolve(input.commandName);
  if (!hit) {
    // Pas de module → message d'erreur minimal sans passer par un ctx.
    return Object.freeze<UIMessage>({
      kind: 'error',
      payload: Object.freeze({ message: `Commande "${input.commandName}" inconnue.` }),
    });
  }
  // Defense in depth : si le module est désactivé pour cette guild,
  // refus avant même de construire un ctx (évite tout side effect).
  if (enablementCheck && !enablementCheck.isEnabled(hit.moduleRef.id, input.guildId)) {
    return Object.freeze<UIMessage>({
      kind: 'error',
      payload: Object.freeze({
        message: `Le module "${hit.moduleRef.id}" n'est pas activé sur ce serveur.`,
      }),
    });
  }
  const ctx = ctxFactory(hit.moduleRef, input);
  const required = hit.command.defaultPermission;
  if (required && permissions) {
    const ok = await permissions.canInGuild(input, required);
    if (!ok) {
      return ctx.ui.error('Permission refusée.');
    }
  }
  const result = await hit.command.handler(input, ctx);
  if (!isUIMessage(result)) {
    throw new ModuleError(
      `handler de "${input.commandName}" n'a pas retourné un UIMessage produit par ctx.ui.*`,
      hit.moduleRef.id,
      { metadata: { commandName: input.commandName } },
    );
  }
  return result;
}
