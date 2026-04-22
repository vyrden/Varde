import type { OnboardingActionRequest, OnboardingDraft } from '@varde/contracts';
import type { PresetDefinition } from '@varde/presets';

/**
 * Helpers de conversion entre les trois shapes qui vivent autour du
 * builder d'onboarding :
 *
 * - `PresetDefinition` (structure hand-curated du catalogue
 *   `@varde/presets`) → `OnboardingDraft` (état éditable côté
 *   builder). Un preset est un point de départ, l'admin le
 *   modifie avant preview.
 * - `OnboardingDraft` → `OnboardingActionRequest[]` : sérialisation
 *   du draft en liste ordonnée d'actions à passer à l'executor.
 *
 * Les refs locales (`localId`, `categoryLocalId`, `readableBy`,
 * `writableBy`) sont propagées intactes sur les `OnboardingActionRequest`.
 * L'executor maintient une map `localId → externalId` pendant l'apply
 * et les actions (`core.createChannel` en particulier) consultent
 * `ctx.resolveLocalId` pour obtenir le snowflake Discord de la
 * catégorie parente et des rôles cibles des overwrites (PR 3.12a).
 */

export function presetToDraft(preset: PresetDefinition): OnboardingDraft {
  const locale: 'fr' | 'en' = preset.locale === 'en' ? 'en' : 'fr';
  return {
    locale,
    roles: preset.roles.map((r) => ({
      localId: r.localId,
      name: r.name,
      ...(r.nameFr !== undefined ? { nameFr: r.nameFr } : {}),
      ...(r.nameEn !== undefined ? { nameEn: r.nameEn } : {}),
      color: r.color,
      permissionPreset: r.permissionPreset,
      hoist: r.hoist,
      mentionable: r.mentionable,
    })),
    categories: preset.categories.map((c) => ({
      localId: c.localId,
      name: c.name,
      position: c.position,
    })),
    channels: preset.channels.map((c) => ({
      localId: c.localId,
      categoryLocalId: c.categoryLocalId,
      name: c.name,
      type: c.type,
      ...(c.topic !== undefined ? { topic: c.topic } : {}),
      slowmodeSeconds: c.slowmodeSeconds,
      readableBy: [...c.readableBy],
      writableBy: [...c.writableBy],
    })),
    modules: preset.modules.map((m) => ({
      moduleId: m.moduleId,
      enabled: m.enabled,
      config: { ...m.config },
    })),
  };
}

export function emptyDraft(locale: 'fr' | 'en' = 'fr'): OnboardingDraft {
  return {
    locale,
    roles: [],
    categories: [],
    channels: [],
    modules: [],
  };
}

export function serializeDraftToActions(draft: OnboardingDraft): OnboardingActionRequest[] {
  const requests: OnboardingActionRequest[] = [];
  for (const role of draft.roles) {
    requests.push({
      type: 'core.createRole',
      localId: role.localId,
      payload: {
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissionPreset: role.permissionPreset,
      },
    });
  }
  for (const category of draft.categories) {
    requests.push({
      type: 'core.createCategory',
      localId: category.localId,
      payload: { name: category.name, position: category.position },
    });
  }
  for (const channel of draft.channels) {
    requests.push({
      type: 'core.createChannel',
      localId: channel.localId,
      payload: {
        name: channel.name,
        type: channel.type,
        ...(channel.categoryLocalId !== null ? { parentLocalId: channel.categoryLocalId } : {}),
        ...(channel.topic !== undefined ? { topic: channel.topic } : {}),
        slowmodeSeconds: channel.slowmodeSeconds,
        readableRoleLocalIds: channel.readableBy,
        writableRoleLocalIds: channel.writableBy,
      },
    });
  }
  for (const modCfg of draft.modules) {
    requests.push({
      type: 'core.patchModuleConfig',
      payload: { moduleId: modCfg.moduleId, config: modCfg.config },
    });
  }
  return requests;
}
