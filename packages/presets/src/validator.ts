import { PRESET_OBJECT_BUDGET, type PresetDefinition, presetDefinitionSchema } from './types.js';

/**
 * Meta-validation cross-champs d'un preset. Complète la validation
 * structurelle Zod (`presetDefinitionSchema`) par des règles qui
 * touchent plusieurs champs ou des contraintes de domaine :
 *
 * - unicité des `localId` au sein de chaque scope (roles,
 *   categories, channels) ;
 * - chaque `channel.categoryLocalId` référence une catégorie qui
 *   existe dans le preset ;
 * - chaque `channel.readableBy` / `writableBy` référence un rôle
 *   qui existe dans le preset ;
 * - budget total d'objets borné à `PRESET_OBJECT_BUDGET` (R2) ;
 * - cohérence locale : si `locale === 'both'`, chaque objet nommé
 *   doit exposer `nameFr` et `nameEn` (et `topicFr` / `topicEn`
 *   quand un `topic` est renseigné côté channel).
 *
 * Retourne la liste des issues. Liste vide = preset valide.
 */
export interface PresetValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export type PresetValidationResult =
  | { readonly ok: true; readonly preset: PresetDefinition }
  | { readonly ok: false; readonly issues: readonly PresetValidationIssue[] };

const issue = (
  code: string,
  message: string,
  path: readonly (string | number)[],
): PresetValidationIssue => ({ code, message, path });

/** Valide un preset. Parse d'abord via Zod, puis applique les règles cross-champs. */
export function validatePreset(input: unknown): PresetValidationResult {
  const parsed = presetDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((iss) =>
        issue(iss.code, iss.message, iss.path as readonly (string | number)[]),
      ),
    };
  }
  const preset = parsed.data;
  const issues: PresetValidationIssue[] = [];

  const roleIds = new Set<string>();
  for (const [i, role] of preset.roles.entries()) {
    if (roleIds.has(role.localId)) {
      issues.push(
        issue('duplicate_role_id', `localId "${role.localId}" déjà utilisé`, [
          'roles',
          i,
          'localId',
        ]),
      );
    }
    roleIds.add(role.localId);
  }

  const categoryIds = new Set<string>();
  for (const [i, cat] of preset.categories.entries()) {
    if (categoryIds.has(cat.localId)) {
      issues.push(
        issue('duplicate_category_id', `localId "${cat.localId}" déjà utilisé`, [
          'categories',
          i,
          'localId',
        ]),
      );
    }
    categoryIds.add(cat.localId);
  }

  const channelIds = new Set<string>();
  for (const [i, chan] of preset.channels.entries()) {
    if (channelIds.has(chan.localId)) {
      issues.push(
        issue('duplicate_channel_id', `localId "${chan.localId}" déjà utilisé`, [
          'channels',
          i,
          'localId',
        ]),
      );
    }
    channelIds.add(chan.localId);

    if (chan.categoryLocalId !== null && !categoryIds.has(chan.categoryLocalId)) {
      issues.push(
        issue(
          'unknown_category_ref',
          `channel "${chan.localId}" référence une catégorie inconnue "${chan.categoryLocalId}"`,
          ['channels', i, 'categoryLocalId'],
        ),
      );
    }
    for (const [j, r] of chan.readableBy.entries()) {
      if (!roleIds.has(r)) {
        issues.push(
          issue(
            'unknown_role_ref',
            `channel "${chan.localId}" readableBy référence un rôle inconnu "${r}"`,
            ['channels', i, 'readableBy', j],
          ),
        );
      }
    }
    for (const [j, r] of chan.writableBy.entries()) {
      if (!roleIds.has(r)) {
        issues.push(
          issue(
            'unknown_role_ref',
            `channel "${chan.localId}" writableBy référence un rôle inconnu "${r}"`,
            ['channels', i, 'writableBy', j],
          ),
        );
      }
    }
  }

  // permissionBindings : roleLocalId référence un rôle existant +
  // pas de doublon exact.
  const seenBindings = new Set<string>();
  for (const [i, binding] of preset.permissionBindings.entries()) {
    if (!roleIds.has(binding.roleLocalId)) {
      issues.push(
        issue(
          'unknown_role_ref_binding',
          `permissionBindings[${i}] référence un rôle inconnu "${binding.roleLocalId}"`,
          ['permissionBindings', i, 'roleLocalId'],
        ),
      );
    }
    const key = `${binding.permissionId}::${binding.roleLocalId}`;
    if (seenBindings.has(key)) {
      issues.push(
        issue(
          'duplicate_binding',
          `permissionBindings[${i}] doublon exact de (${binding.permissionId}, ${binding.roleLocalId})`,
          ['permissionBindings', i],
        ),
      );
    }
    seenBindings.add(key);
  }

  const objectCount =
    preset.roles.length +
    preset.categories.length +
    preset.channels.length +
    preset.modules.length +
    preset.permissionBindings.length;
  if (objectCount > PRESET_OBJECT_BUDGET) {
    issues.push(
      issue(
        'budget_exceeded',
        `preset "${preset.id}" dépasse le budget ${PRESET_OBJECT_BUDGET} (${objectCount} objets)`,
        [],
      ),
    );
  }

  if (preset.locale === 'both') {
    for (const [i, role] of preset.roles.entries()) {
      if (!role.nameFr || !role.nameEn) {
        issues.push(
          issue(
            'missing_locale_name',
            `role "${role.localId}" : locale=both requiert nameFr et nameEn`,
            ['roles', i],
          ),
        );
      }
    }
    for (const [i, cat] of preset.categories.entries()) {
      if (!cat.nameFr || !cat.nameEn) {
        issues.push(
          issue(
            'missing_locale_name',
            `category "${cat.localId}" : locale=both requiert nameFr et nameEn`,
            ['categories', i],
          ),
        );
      }
    }
    for (const [i, chan] of preset.channels.entries()) {
      if (!chan.nameFr || !chan.nameEn) {
        issues.push(
          issue(
            'missing_locale_name',
            `channel "${chan.localId}" : locale=both requiert nameFr et nameEn`,
            ['channels', i],
          ),
        );
      }
      if (chan.topic !== undefined && (!chan.topicFr || !chan.topicEn)) {
        issues.push(
          issue(
            'missing_locale_topic',
            `channel "${chan.localId}" : locale=both + topic requiert topicFr et topicEn`,
            ['channels', i],
          ),
        );
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, preset };
}

/** Version assertive : throw au lieu de retourner un résultat. */
export function assertValidPreset(input: unknown): PresetDefinition {
  const result = validatePreset(input);
  if (!result.ok) {
    const first = result.issues[0];
    const suffix = result.issues.length > 1 ? ` (+${result.issues.length - 1} autres)` : '';
    throw new Error(
      `validatePreset : ${first?.code ?? 'unknown'} — ${first?.message ?? ''}${suffix}`,
    );
  }
  return result.preset;
}
