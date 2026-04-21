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
 * Limitations V1 (documentées côté UI builder, PR 3.5) :
 *
 * 1. Pas de résolution `categoryLocalId` → `parentId` Discord.
 *    Les salons sont créés à plat (sans parent) ; l'admin réorganise
 *    manuellement après apply. La résolution de refs sera posée
 *    en PR 3.12 via un mapping `localId → externalId` maintenu par
 *    l'executor pendant l'exécution.
 * 2. Pas d'application des `readableBy` / `writableBy` sur les
 *    channels. Les permissions overwrites par rôle seront ajoutées
 *    avec la même résolution de refs.
 *
 * Ces restrictions sont acceptées en V1 : elles n'entravent pas la
 * démonstration du moteur, et le scope est contenu. L'UI builder
 * affichera les relations prévues, mais le côté Discord reste plat.
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
      payload: { name: category.name, position: category.position },
    });
  }
  for (const channel of draft.channels) {
    requests.push({
      type: 'core.createChannel',
      payload: {
        name: channel.name,
        type: channel.type,
        ...(channel.topic !== undefined ? { topic: channel.topic } : {}),
        slowmodeSeconds: channel.slowmodeSeconds,
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
