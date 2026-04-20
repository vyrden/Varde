import { z } from 'zod';

import { isModuleId, isPermissionId, type ModuleId, type PermissionId } from './ids.js';

/**
 * Meta-schema Zod qui valide la partie déclarative (statique) du
 * manifeste d'un module. Les parties runtime (handlers de commandes,
 * hooks de cycle de vie, schémas Zod de config) ne sont pas validables
 * au niveau du manifeste — elles sont vérifiées à l'utilisation par
 * le plugin loader (cf. conception du core).
 *
 * Ce meta-schema est consommé par `defineModule()` pour garantir
 * qu'un module est bien formé avant chargement. Un module qui
 * échoue à valider son manifeste est refusé et journalisé.
 */

const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;

const moduleIdSchema = z.custom<ModuleId>(isModuleId);
const permissionIdSchema = z.custom<PermissionId>(isPermissionId);

/** Niveau par défaut d'une permission. */
export const permissionDefaultLevelSchema = z.enum(['admin', 'moderator', 'member', 'nobody']);

export type PermissionDefaultLevel = z.infer<typeof permissionDefaultLevelSchema>;

/** Définition d'une permission exposée par un module. */
export const permissionDefinitionSchema = z.object({
  id: permissionIdSchema,
  category: z.string().min(1),
  defaultLevel: permissionDefaultLevelSchema,
  description: z.string().min(1),
});

export type PermissionDefinition = z.infer<typeof permissionDefinitionSchema>;

/** Métadonnées de l'auteur du module. */
export const authorSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  email: z.string().email().optional(),
});

export type Author = z.infer<typeof authorSchema>;

/** Événements écoutés et émis par le module. */
export const eventsDeclarationSchema = z.object({
  listen: z.array(z.string()).readonly(),
  emit: z.array(z.string()).readonly(),
});

export type EventsDeclaration = z.infer<typeof eventsDeclarationSchema>;

/** Dépendances d'un module sur d'autres modules. */
export const dependenciesSchema = z.object({
  modules: z.array(moduleIdSchema).readonly(),
  optionalModules: z.array(moduleIdSchema).readonly(),
});

export type Dependencies = z.infer<typeof dependenciesSchema>;

/**
 * Partie statique du manifeste d'un module : ce qu'un outil externe
 * (site catalogue, lint de CI) peut lire sans exécuter de code.
 */
export const manifestStaticSchema = z.object({
  id: moduleIdSchema,
  name: z.string().min(1),
  version: z.string().regex(SEMVER_REGEX, 'version : semver strict attendu'),
  coreVersion: z.string().min(1),
  description: z.string(),
  author: authorSchema,
  license: z.string().min(1),
  schemaVersion: z.number().int().nonnegative(),
  permissions: z.array(permissionDefinitionSchema).readonly(),
  events: eventsDeclarationSchema,
  dependencies: dependenciesSchema.optional(),
});

export type ManifestStatic = z.infer<typeof manifestStaticSchema>;

/**
 * Parse et valide un manifeste statique.
 *
 * @throws {z.ZodError} Si le manifeste ne respecte pas le schéma.
 */
export function parseManifestStatic(value: unknown): ManifestStatic {
  return manifestStaticSchema.parse(value);
}

/**
 * Vérifie que chaque événement listé dans `events.emit` est préfixé
 * par l'id du module. Règle structurante du projet : un module ne
 * peut émettre que sous son propre namespace.
 */
export function validateEmitPrefix(
  manifest: ManifestStatic,
): { readonly valid: true } | { readonly valid: false; readonly offenders: readonly string[] } {
  const prefix = `${manifest.id}.`;
  const offenders = manifest.events.emit.filter((event) => !event.startsWith(prefix));
  return offenders.length === 0 ? { valid: true } : { valid: false, offenders };
}
