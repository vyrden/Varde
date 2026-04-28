# 0005. `configUi` en sidecar de `ModuleDefinition`

Date: 2026-04-21
Statut: accepted

## Contexte

Un module déclare son `configSchema` (Zod) pour valider les valeurs
envoyées par le dashboard. Le dashboard a besoin d'une description
supplémentaire pour **rendre** un formulaire : libellés, widgets
(`text` / `textarea` / `number` / `toggle` / `select`), descriptions,
placeholders, groupes de champs, options pour les selects.

Deux emplacements naturels pour ces métadonnées :

- **Dans le `configSchema` Zod lui-même**, via `.meta()`/`.describe()`
  qui permettent d'attacher des annotations conservées par
  `z.toJSONSchema()`.
- **À côté**, comme un champ distinct `configUi` du
  `ModuleDefinition`, validé par son propre schéma Zod.

Chaque option a ses contraintes :

- Mettre les métadonnées UI dans `.meta()` couple la validation métier
  (bornes, required, types) et la présentation (widget, ordre, groupe).
  Toute évolution de la stratégie de rendu oblige à toucher des
  schémas de validation.
- Les annotations portées par `z.toJSONSchema()` ne survivent pas à
  toutes les constructions Zod (union discriminée, refinements
  custom). On aurait une surface de rendu dépendante de la forme du
  schéma plutôt que de l'intention métier.
- Un sidecar demande à l'auteur du module d'écrire deux objets
  cohérents — risque de dérive : un champ schema sans entrée
  `configUi` (invisible dans le dashboard) ou un `path` de `configUi`
  qui ne correspond à aucune clé du `configSchema`.

Ce risque de dérive est réel mais **mécanisable** via un
meta-validator côté `defineModule()`.

## Décision

Le `configUi` est un **champ distinct** du `ModuleDefinition`, typé
par l'interface `ConfigUi` de `@varde/contracts` :

```ts
interface ConfigUi {
  readonly fields: readonly ConfigFieldSpec[];
}

interface ConfigFieldSpec {
  readonly path: string;      // notation à points dans l'objet config
  readonly label: string;
  readonly widget: 'text' | 'textarea' | 'number' | 'toggle' | 'select';
  readonly description?: string;
  readonly placeholder?: string;
  readonly options?: readonly { value: string; label: string }[];
  readonly group?: string;
  readonly order?: number;
}
```

`defineModule()` vérifie la cohérence minimale :

- Chaque `path` de `configUi.fields` pointe bien sur une clé du
  `configSchema` (uniquement pour les Zod `object` imbriqués — les
  schémas union / tuple restent best-effort V1).
- Les `widget: 'select'` ont un tableau `options` non vide.

Le dashboard consomme `configUi.fields` pour rendre le formulaire,
`configSchema` converti en JSON Schema via `z.toJSONSchema()` pour la
validation client (Ajv) et serveur (Zod). Un champ déclaré dans
`configSchema` mais absent de `configUi` n'est **pas rendu** — c'est
une porte explicite pour garder des paramètres internes invisibles
côté admin.

## Alternatives considérées

### Métadonnées UI via `.meta()` dans le schéma Zod

Rejetée :

- Couplage fort entre validation et présentation. Une refonte UI
  obligerait à toucher les schémas de validation, avec risque de
  casser la surface API.
- `.meta()` est transmis à JSON Schema mais la représentation
  dépend de la forme du schéma (objets, unions, transforms) ; la
  surface de rendu deviendrait implicite et fragile.
- Difficile d'exprimer un widget `textarea` vs `text` sur un même
  `z.string()` — il faut quand même un champ dédié.

### `configUi` dérivé automatiquement du schéma

Rejetée : insuffisant en pratique. Un `z.string().max(200)` n'indique
pas s'il faut rendre un `input` ou un `textarea`. Un `z.enum(['fr',
'en'])` n'indique pas les libellés utilisateur des options. La dérive
automatique ne va jamais jusqu'au rendu acceptable.

### `configUi` hors du `ModuleDefinition`, dans un paquet séparé

Rejetée : rompt le principe que **tout ce qui concerne un module vit
dans le module**. La co-localisation facilite la revue et la
maintenance — un contributeur touche un seul fichier pour ajouter un
champ.

## Conséquences

### Positives

- Validation et présentation sont découplées. Les équipes modules
  peuvent itérer sur l'UI sans toucher aux schémas Zod.
- Le sidecar reste extensible : ajouter un widget (ex : `color`,
  `markdown`) consiste à étendre l'enum `ConfigFieldWidget` et les
  renderers côté dashboard, sans impact sur `z.toJSONSchema()`.
- Le contrôle de cohérence par `defineModule()` attrape les dérives
  en faisant remonter l'erreur au chargement du module, pas à la
  première modification depuis le dashboard.
- Les champs privés (non rendus côté dashboard) sont une conséquence
  naturelle du modèle, pas une exception.

### Négatives et points de vigilance

- Deux sources de vérité à tenir à jour pour un module. Compensé par
  le meta-validator, mais implique une discipline d'auteur.
- Le meta-validator ne couvre pas tous les cas (union, tuple,
  refinements). Si un module utilise un schéma complexe, la
  vérification path ↔ schema peut laisser passer une incohérence ;
  le dashboard retombera alors sur un champ texte par défaut et la
  validation côté serveur attrapera une mauvaise valeur — dégradé
  mais pas cassé.
- La conversion `z.toJSONSchema()` reste nécessaire pour la validation
  client. Toute limite de cette conversion devient une limite de la
  validation côté browser (le serveur, lui, utilise toujours le Zod
  original).

## Références

- [`packages/contracts/src/module.ts`](../../packages/contracts/src/module.ts)
  — `ConfigUi`, `ConfigFieldSpec`, `configUiSchema`.
- [`apps/dashboard/components/ConfigForm.tsx`](../../apps/dashboard/components/ConfigForm.tsx)
  — consommation côté rendu.
- [`apps/dashboard/lib/client-validation.ts`](../../apps/dashboard/lib/client-validation.ts)
  — validation client depuis le JSON Schema.
- [`modules/hello-world/src/config.ts`](../../modules/hello-world/src/config.ts)
  — premier exemple concret de `configSchema` + `configUi`.
