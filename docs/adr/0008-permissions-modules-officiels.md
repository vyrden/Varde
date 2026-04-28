# 0008. Symétrie des permissions officiels/tiers et seeding par onboarding

Date: 2026-04-22
Statut: accepted

## Contexte

À l'ouverture du jalon 4, cinq modules officiels (`logs`, `welcome`,
`roles`, `moderation`, `onboarding-presets`) vont contribuer chacun
plusieurs permissions applicatives. Chaque module déclare ses
`PermissionDefinition` dans son manifeste, et le core les persiste dans
`permissions_registry` au chargement. À l'exécution, `PermissionService`
consulte `permission_bindings` (permission → rôles Discord) pour
décider si un user peut exécuter une action.

Deux questions se posent avant la première PR du jalon :

1. Les modules officiels jouent-ils sous exactement les mêmes règles
   que les modules tiers, ou bénéficient-ils d'un chemin privilégié ?
2. Sur une guild fraîche, qui pose les bindings initiaux (par défaut,
   `moderation.warn.execute` est lié à quel rôle ?) — sinon l'admin
   hérite de modules installés dont aucune action n'est exécutable tant
   qu'il n'a pas tout configuré à la main.

Contrainte non-négociable du projet : **aucun privilège pour les
modules officiels**. Un module officiel n'utilise que les API publiques
du core. Si une API manque, on l'ajoute, on ne contourne pas la règle.
Autre contrainte : **explicit over implicit**. Pas de magie, pas de
convention cachée.

État existant du code au moment de cet ADR :

- [packages/contracts/src/manifest.ts](../../packages/contracts/src/manifest.ts)
  valide que chaque module déclare ses permissions sous sa propre forme
  `PermissionDefinition` (id, category, defaultLevel, description).
- [packages/core/src/permissions.ts](../../packages/core/src/permissions.ts)
  enforce que pour un acteur de type `module`, seule une permission
  préfixée par `<moduleId>.` est autorisée (`moduleOwnsPermission`).
  Aucun code ne distingue un module officiel d'un module tiers.
- `permissions_registry` et `permission_bindings` sont posés dans
  l'ADR 0001.

## Décision

### Ratification de la symétrie

La symétrie officiel/tiers **déjà en place dans le code** devient une
règle versionnée. Concrètement :

- Tout module (officiel comme tiers) déclare ses permissions via
  `manifest.permissions: PermissionDefinition[]`. Le namespace imposé
  est `<moduleId>.<category>.<verb>` (ex.
  `moderation.warn.execute`, `logs.channels.configure`).
- Le core **ne connaît aucune liste** de modules « officiels ». Aucun
  flag, aucun champ manifeste, aucun chemin de code conditionnel.
- Un module officiel qui aurait besoin d'une primitive non exposée
  publiquement par `ctx` ne l'obtient pas par contournement : la
  primitive est ajoutée à `ctx` et devient disponible à tous les
  modules.
- Les tests d'intégration du core incluent, pour chaque extension de
  `ctx` introduite par le jalon 4, un cas où un module tiers fictif
  exerce la même surface qu'un module officiel. Si un module tiers
  ne peut pas faire ce qu'un officiel fait, c'est un bug.

### Seeding des bindings initiaux

Deux chemins, l'un nominal, l'autre filet de sécurité.

**A — Chemin nominal : seeding par l'onboarding.** Le schéma
`PresetDefinition` de `@varde/presets` gagne un champ optionnel :

```ts
interface PresetPermissionBinding {
  permissionId: PermissionId;   // ex. "moderation.warn.execute"
  roleLocalId: string;          // ref locale vers un PresetRole
}

interface PresetDefinition {
  // ... champs existants
  permissionBindings: readonly PresetPermissionBinding[];
}
```

Une nouvelle action d'onboarding `bindPermission` (enregistrée par le
core, `undo` = suppression de la ligne) est générée automatiquement
par le serializer du builder après que `createRole` a résolu le
snowflake du rôle référencé par `roleLocalId`. Les bindings apparaissent
dans la preview de l'onboarding au même titre que les rôles et salons ;
l'admin peut les éditer ou les retirer avant apply.

Les presets hand-curés du jalon 3 sont mis à jour pour porter les
bindings correspondant aux modules officiels qu'ils activent. Un
preset qui n'active aucun module laisse `permissionBindings` vide,
sans incidence.

**C — Filet de sécurité : bandeau dashboard.** À l'enable d'un module
en dehors de l'onboarding (page `Modules`), le dashboard compare
`manifest.permissions` à `permission_bindings[guildId]`. Pour chaque
permission sans binding, un bandeau "N permissions non liées" s'affiche
en tête de la page de config du module, avec un CTA qui ouvre
directement l'écran de liage des permissions (pré-existant depuis
jalon 1).

Aucune action du module qui requiert une permission non liée n'est
bloquée silencieusement : le `PermissionService` retourne `false`, le
handler concerné remonte une erreur typée (`PermissionDeniedError`),
et le dashboard l'affiche dans l'audit log avec lien vers l'écran de
liage.

### Pas de seeding implicite

Il est explicitement **interdit** au core et aux modules officiels de :

- Déduire des bindings à partir du nom d'un rôle Discord (matching
  `@Moderator` → `moderation.*`).
- Utiliser le fait qu'un user a la permission Discord `Administrator`
  comme raccourci silencieux d'une permission applicative manquante.
  Le bypass `Administrator` du `PermissionService` existe (option
  `bypassAdministrator`, défaut `true`) mais il est déjà **explicite**
  et documenté : il s'applique à la résolution runtime, pas au
  seeding.
- Écrire dans `permission_bindings` depuis le code d'un module (les
  seules entrées qui écrivent sont : l'action onboarding
  `bindPermission` et l'UI dashboard de liage).

## Alternatives considérées

### B — Seeding par le module via `defaultBindings` dans le manifeste

Le module déclarerait des bindings à des rôles *canoniques*
(`"role:moderator"`) que le core résoudrait à l'enable en cherchant un
rôle par nom dans la guild. Rejetée :

- Fragile à l'i18n : un admin francophone qui a nommé son rôle
  `@Modération` ne matchera pas `role:moderator`.
- Implicite : l'admin ne voit pas ce qui a été seedé tant qu'il ne va
  pas consulter la page de liage.
- Déplace la décision « quel rôle = quel pouvoir » du produit vers
  une heuristique opaque, mal alignée avec le principe « humain
  dispose » — ici ce n'est même pas de l'IA, c'est du string matching
  qui décide à la place de l'admin.

### Privilège implicite pour les modules officiels

Les modules officiels recevraient une whitelist qui les autoriserait à
court-circuiter `PermissionService` pour certaines actions. Rejetée :
viole frontalement la règle « aucun privilège officiel ». Rend
impossible le remplacement d'un module officiel par un fork ou un
module tiers.

### Seeding auto sur `@Administrator` par défaut

Lier toutes les permissions d'un nouveau module à la permission
Discord `Administrator` tant qu'aucun rôle n'est choisi. Rejetée : le
bypass `Administrator` du `PermissionService` couvre déjà ce cas au
runtime (un admin peut toujours tout faire). Poser un binding
artificiel sur `@everyone-qui-est-admin` brouille l'audit et crée des
lignes DB qui ne veulent rien dire.

## Conséquences

### Positives

- La règle « aucun privilège officiel » devient vérifiable par du
  code (test d'intégration jalon 4 : un module tiers exerce tout ce
  qu'un officiel exerce).
- Un admin qui fait un onboarding standard obtient une instance
  fonctionnelle immédiatement — les bindings initiaux sont posés
  avec le reste de la configuration, dans le même flow.
- Un admin qui enable un module à la main voit exactement ce qu'il
  lui reste à faire. Zéro action silencieusement inopérante.
- Le schéma `permission_bindings` (ADR 0001) reste inchangé ; seule
  la surface `PresetDefinition` s'étend.
- Un module tiers installé post-V1 bénéficie du même filet (bandeau
  dashboard) que les officiels, sans travail supplémentaire du core.

### Négatives et points de vigilance

- `@varde/presets` gagne un champ, donc une zone à tester (validator
  cross-field : `roleLocalId` référencé doit exister dans
  `preset.roles`). Coût borné par un test unitaire ajouté au
  `presets/validator.ts`.
- Les cinq presets existants du jalon 3 doivent être enrichis au
  cours du jalon 4 au fur et à mesure que les modules officiels
  posent leurs permissions. Rupture mineure du catalogue : les
  presets du jalon 3 restent valides avec `permissionBindings: []`,
  aucune migration forcée.
- Le bandeau « permissions non liées » ajoute une surface UI dans le
  dashboard Modules. À traiter dans la PR logs (le premier module
  qui déclare des permissions) avec un composant réutilisable par
  les quatre suivants.
- Une action `bindPermission` qu'on `undo` doit rester idempotente :
  si l'admin a modifié le binding entre l'apply et le rollback, on
  supprime la ligne que l'onboarding avait posée, pas celle que
  l'admin a écrite. L'invariant est porté par la comparaison
  `(permissionId, guildId, roleId)` exacte avant suppression.

## Références

- [ADR 0001 — Schéma DB du core](./0001-schema-db-core.md) — tables
  `permissions_registry` et `permission_bindings`.
- [ADR 0002 — Format des modules](./0002-format-modules.md) —
  manifeste, `PermissionDefinition`, règle de namespace.
- [ADR 0007 — Moteur d'onboarding pluggable](./0007-onboarding-ia-byo-llm.md)
  — actions composables, preview-avant-apply, rollback temporisé.
