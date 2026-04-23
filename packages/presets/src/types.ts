import { z } from 'zod';

/**
 * Types et schemas Zod du catalogue de presets (ADR 0007).
 *
 * Un preset est une structure de données pure, pas du code. Il
 * décrit un serveur « clé en main » (rôles + catégories + salons
 * + configs modules) que le builder matérialise en
 * `OnboardingDraft` éditable avant apply. L'admin reste libre de
 * tout ajuster avant preview — un preset n'est qu'un point de
 * départ.
 *
 * Règles :
 * - Les `localId` sont stables dans un preset, uniques par scope
 *   (roles / categories / channels). Ils servent à référencer des
 *   rôles depuis un salon (permissions readableBy / writableBy),
 *   à rattacher un salon à une catégorie, etc. Au moment de l'apply,
 *   le serializer du builder les résout vers les snowflakes Discord
 *   retournés par chaque action.
 * - Les noms sont livrés localisés : si `locale` vaut `both`, chaque
 *   objet doit exposer `nameFr` + `nameEn` ; si `fr` ou `en`,
 *   `nameFr` / `nameEn` sont optionnels et le champ `name` sert de
 *   source unique.
 * - Le budget total (rôles + catégories + salons + modules) est
 *   borné à 20 (R2 du plan jalon 3 : limite douce du rate-limit
 *   Discord par session d'onboarding).
 *
 * La meta-validation cross-champs est dans `./validator.ts`.
 */

const permissionPresetIds = [
  'moderator-full',
  'moderator-minimal',
  'member-default',
  'member-restricted',
] as const;
export type PermissionPresetId = (typeof permissionPresetIds)[number];

const channelTypes = ['text', 'voice', 'forum'] as const;
export type PresetChannelType = (typeof channelTypes)[number];

const presetLocales = ['fr', 'en', 'both'] as const;
export type PresetLocale = (typeof presetLocales)[number];

export const presetRoleSchema = z.object({
  localId: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  nameFr: z.string().min(1).max(100).optional(),
  nameEn: z.string().min(1).max(100).optional(),
  color: z.number().int().min(0).max(0xffffff).default(0),
  permissionPreset: z.enum(permissionPresetIds).default('member-default'),
  hoist: z.boolean().default(false),
  mentionable: z.boolean().default(false),
});
export type PresetRole = z.infer<typeof presetRoleSchema>;

export const presetCategorySchema = z.object({
  localId: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  nameFr: z.string().min(1).max(100).optional(),
  nameEn: z.string().min(1).max(100).optional(),
  position: z.number().int().min(0).default(0),
});
export type PresetCategory = z.infer<typeof presetCategorySchema>;

export const presetChannelSchema = z.object({
  localId: z.string().min(1).max(64),
  categoryLocalId: z.string().min(1).max(64).nullable(),
  name: z.string().min(1).max(100),
  nameFr: z.string().min(1).max(100).optional(),
  nameEn: z.string().min(1).max(100).optional(),
  type: z.enum(channelTypes).default('text'),
  topic: z.string().max(1024).optional(),
  topicFr: z.string().max(1024).optional(),
  topicEn: z.string().max(1024).optional(),
  slowmodeSeconds: z.number().int().min(0).max(21_600).default(0),
  readableBy: z
    .array(z.string().min(1))
    .default([])
    .describe('localIds de rôles autorisés à lire ; vide = tout le monde'),
  writableBy: z
    .array(z.string().min(1))
    .default([])
    .describe('localIds de rôles autorisés à écrire ; vide = tout le monde'),
});
export type PresetChannel = z.infer<typeof presetChannelSchema>;

/**
 * Binding initial d'une permission applicative vers un rôle local
 * du preset. Résolu à l'apply : le serializer du builder transforme
 * `roleLocalId` en snowflake Discord une fois que le `createRole`
 * correspondant a émis son résultat, puis émet une action
 * `core.bindPermission` qui écrit dans `permission_bindings`.
 *
 * Format du `permissionId` : `<moduleId>.<path>` (cf. règle de
 * namespace du meta-schema manifeste). Pas de validation sémantique
 * ici — on vérifie seulement la forme. La validation "le module
 * référencé existe et a déclaré cette permission" est faite au
 * chargement du module par le core.
 */
export const presetPermissionBindingSchema = z.object({
  permissionId: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9-]+\.[a-zA-Z0-9_.-]+$/,
      'permissionId doit contenir un point (format <moduleId>.<path>)',
    ),
  roleLocalId: z.string().min(1),
});
export type PresetPermissionBinding = z.infer<typeof presetPermissionBindingSchema>;

export const presetModuleConfigSchema = z.object({
  moduleId: z.string().min(1),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type PresetModuleConfig = z.infer<typeof presetModuleConfigSchema>;

export const presetDefinitionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9-]+$/, 'id doit matcher [a-z0-9-]+'),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(512),
  tags: z.array(z.string().min(1).max(64)).default([]),
  locale: z.enum(presetLocales),
  roles: z.array(presetRoleSchema).default([]),
  categories: z.array(presetCategorySchema).default([]),
  channels: z.array(presetChannelSchema).default([]),
  modules: z.array(presetModuleConfigSchema).default([]),
  permissionBindings: z.array(presetPermissionBindingSchema).default([]),
});
export type PresetDefinition = z.infer<typeof presetDefinitionSchema>;

/** Budget max d'objets par preset (R2 : rate-limit Discord par session). */
export const PRESET_OBJECT_BUDGET = 20;
