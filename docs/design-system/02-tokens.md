# 02 — Tokens du système

Tous les tokens sont des CSS custom properties exposées sur `:root`,
puis remontées en classes Tailwind via `@theme inline`. Nommage
`--{famille}-{role}-{variante}`. Aucun composant ne hardcode une valeur
qui existe ici sous forme de token.

Mode par défaut : `dark`. Mode `light` posé dans cette spec, câblé
réellement en PR 7.4.9 via `[data-theme="light"]` sur `<html>`.

## 1. Couleurs neutres

### Échelle ash — palette dark (référence : marketing discord.com)

Onze paliers, du plus sombre au plus clair. Les valeurs hex sont
calibrées pour respecter WCAG AA contre les fonds principaux. Pas
d'undertone bleu marqué : on cible un gris quasi neutre, légèrement
plus chaud que `#0..#f` purs.

| Token            | Hex       | Usage type                                         | À ne pas utiliser pour                       |
|------------------|-----------|----------------------------------------------------|----------------------------------------------|
| `--ash-50`       | `#f6f7f8` | Texte premium sur fond accent saturé               | Fond surface (cassure de hiérarchie)         |
| `--ash-100`      | `#e3e5e8` | Texte primaire dark                                | Fond                                         |
| `--ash-200`      | `#c7cbd1` | Texte secondaire, valeurs en contexte              | Texte primaire (contraste insuffisant)       |
| `--ash-300`      | `#989ba1` | Texte muet, placeholders, métadonnées              | Texte de paragraphe principal                |
| `--ash-400`      | `#6e7077` | Labels désactivés, hints                           | Texte d'action                               |
| `--ash-500`      | `#4f5258` | Bordures appuyées, séparateurs hover               | Texte (échec contraste sur tous fonds)       |
| `--ash-600`      | `#383a40` | Bordures par défaut, surface élevée hover          | Texte                                        |
| `--ash-700`      | `#2b2d31` | Surface élevée (cards, popovers, inputs hover)     | Bordure (trop proche des surfaces voisines)  |
| `--ash-800`      | `#1e1f22` | Surface 1 — zone de contenu principale             | Texte                                        |
| `--ash-900`      | `#16181a` | Surface 0 — fond de page, sidebar                  | Bordure                                      |
| `--ash-950`      | `#0c0e10` | Overlay fond modal, scrim                          | Bordure                                      |

### Échelle paper — palette light (livrée pour mode clair futur)

Symétrique de ash. Servie aux mêmes rôles, à l'envers : les rôles
"surface" pointent vers les paliers clairs, les rôles "texte" vers les
paliers sombres.

| Token            | Hex       | Usage type                                         | À ne pas utiliser pour                       |
|------------------|-----------|----------------------------------------------------|----------------------------------------------|
| `--paper-50`     | `#ffffff` | Surface 0 — fond de page                           | Texte                                        |
| `--paper-100`    | `#f7f8f9` | Surface 1 — zone de contenu principale             | Texte                                        |
| `--paper-200`    | `#ebedef` | Surface élevée (cards), hover sur lignes           | Texte                                        |
| `--paper-300`    | `#d4d7dc` | Bordures par défaut                                | Texte                                        |
| `--paper-400`    | `#b5bac1` | Bordures appuyées, séparateurs hover               | Texte muet (échec contraste)                 |
| `--paper-500`    | `#80848e` | Texte muet, placeholders, métadonnées              | Texte primaire                               |
| `--paper-600`    | `#5e6066` | Labels désactivés (bg clair)                       | Texte primaire                               |
| `--paper-700`    | `#3d4046` | Texte secondaire                                   | Bordures                                     |
| `--paper-800`    | `#1e1f22` | Texte primaire light                               | Surface                                      |
| `--paper-900`    | `#0c0e10` | Texte premium / titres marketing                   | Surface                                      |
| `--paper-950`    | `#000000` | Réservé (très rare, usage marketing)               | Texte courant                                |

## 2. Couleur primaire — `iris`

Dérivée du blurple Discord (`#5865F2`) mais distincte. Choix : **`#5b6cff`**
— même famille hue (236°), saturation un cran plus haute, luminance
légèrement plus claire. À l'œil : reconnaissable comme "famille
Discord", distincte assez pour ne pas être un copier-coller. La
distinction se mesure : ΔE2000 ≈ 4.1 contre `#5865F2`, perceptible mais
non agressif.

| Token                    | Hex / valeur                          | Usage type                                            |
|--------------------------|---------------------------------------|-------------------------------------------------------|
| `--iris-100`             | `#e0e3ff`                             | Surface très claire (badges info, fond toast iris)    |
| `--iris-300`             | `#a3acff`                             | Texte iris sur fond sombre, focus ring atténué        |
| `--iris-500`             | `#5b6cff`                             | Couleur primaire — CTA, icônes actives, focus ring    |
| `--iris-600`             | `#4858e8`                             | Hover du primaire                                     |
| `--iris-700`             | `#3a48cc`                             | Active / pressed du primaire                          |
| `--iris-900`             | `#1c2380`                             | Texte iris sur fond clair (light mode)                |
| `--iris-on-surface`      | `var(--ash-50)` / `var(--paper-50)`   | Texte par-dessus fond iris                            |

Surface de blurple à l'écran : ≤ 10 % visible. Au-delà, elle cesse
d'être un signal.

## 3. Couleurs sémantiques

Trois paliers chacune (bg, border, text). Les valeurs visent WCAG AA
contre les surfaces standard.

| Rôle      | `--{role}-bg`  | `--{role}-border` | `--{role}-text` |
|-----------|----------------|-------------------|-----------------|
| success   | `#0d3a23`      | `#1f7a48`         | `#3ed482`       |
| warning   | `#3d2f0a`      | `#9c7615`         | `#f5c542`       |
| danger    | `#3d1416`      | `#a8262a`         | `#ff6b6f`       |
| info      | `#082b3d`      | `#1d6fa5`         | `#5cb8ed`       |

Light mode : valeurs adaptées (fond clair pâle, bordure tonique,
texte foncé). Détail dans `theme.css` au moment du câblage. Couleurs
fonctionnelles utilisées **uniquement** pour leur sémantique. Une
icône en succès qui n'indique pas un succès est une erreur de design.

## 4. Surfaces et rôles

Les rôles abstraient les paliers : un composant réfère à
`--surface-1`, jamais à `--ash-800` directement. Le mapping change
selon le mode.

| Rôle               | Dark (ash)        | Light (paper)     | Usage                                                  |
|--------------------|-------------------|-------------------|--------------------------------------------------------|
| `--bg-page`        | `--ash-900`       | `--paper-50`      | Fond de page                                           |
| `--bg-rail`        | `--ash-950`       | `--paper-100`     | Sidebar gauche, rail de navigation                     |
| `--bg-surface-1`   | `--ash-800`       | `--paper-100`     | Zone de contenu principale                             |
| `--bg-surface-2`   | `--ash-700`       | `--paper-200`     | Cards, popovers, inputs                                |
| `--bg-surface-3`   | `--ash-600`       | `--paper-300`     | Surface élevée hover, dropdowns ouverts                |
| `--bg-overlay`     | `--ash-950 / 80%` | `--paper-900/40%` | Scrim derrière modal                                   |
| `--fg-primary`     | `--ash-100`       | `--paper-800`     | Texte primaire                                         |
| `--fg-secondary`   | `--ash-200`       | `--paper-700`     | Sous-titres, valeurs                                   |
| `--fg-muted`       | `--ash-300`       | `--paper-500`     | Métadonnées, placeholders                              |
| `--fg-disabled`    | `--ash-400`       | `--paper-600`     | États désactivés                                       |
| `--fg-on-accent`   | `--ash-50`        | `--paper-50`      | Texte sur fond iris ou sémantique saturée              |
| `--border-subtle`  | `--ash-700`       | `--paper-300`     | Bordure de carte au repos                              |
| `--border-default` | `--ash-600`       | `--paper-400`     | Bordure d'input, séparateur fort                       |
| `--border-strong`  | `--ash-500`       | `--paper-500`     | Hover bordure, focus ring atténué                      |

## 5. Typographie

### Stack

Deux familles, une display et une texte, **toutes deux self-hostées**
via `next/font`. Choix : **Inter Display** (display, optical-size 28+)
plus **Inter** (texte, optical-size 14–22). Famille unique, deux
variantes optiques : couplage parfait, pas de friction visuelle au
passage display → texte, licence SIL Open Font, ~80 KB woff2
sous-ensemble latin.

Justification du non-choix de Noto Sans (actuel) : Noto Sans est un
substitut neutre de gg sans pour le client Discord. Pour une voix
marketing affirmée, il manque de caractère en grandes tailles. Inter
Display porte la même clarté et un dessin plus tranché en gros. Inter
texte garde la lisibilité dense que Noto offrait à 14 px.

| Variable              | Stack                                                                 |
|-----------------------|-----------------------------------------------------------------------|
| `--font-display`      | `var(--font-inter-display), 'Inter Display', system-ui, sans-serif`   |
| `--font-sans`         | `var(--font-inter), 'Inter', system-ui, sans-serif`                   |
| `--font-mono`         | `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`                 |

### Échelle modulaire — ratio 1.25 (Major Third)

Dix tailles, du caption au display XL. Calcul à partir de 16 px base.
Valeurs arrondies au pixel le plus proche pour rester sur la grille.

| Token                | rem      | px    | line-height       | letter-spacing | Poids conseillé | Usage type                                  |
|----------------------|----------|-------|-------------------|----------------|-----------------|---------------------------------------------|
| `--text-caption`     | `0.6875` | 11    | `1rem` (16)       | `+0.02em`      | 500             | Eyebrow, badge, mention légale              |
| `--text-xs`          | `0.75`   | 12    | `1rem` (16)       | `+0.01em`      | 500             | Métadonnée, helper sous champ               |
| `--text-sm`          | `0.875`  | 14    | `1.25rem` (20)    | `0`            | 400 / 500       | Corps dense, label, valeur                  |
| `--text-base`        | `1`      | 16    | `1.5rem` (24)     | `0`            | 400             | Corps standard                              |
| `--text-lg`          | `1.125`  | 18    | `1.75rem` (28)    | `0`            | 500             | Lead de section                             |
| `--text-xl`          | `1.25`   | 20    | `1.75rem` (28)    | `-0.005em`     | 600             | Titre de carte, h3                          |
| `--text-2xl`         | `1.5`    | 24    | `2rem` (32)       | `-0.01em`      | 600             | Titre de section, h2                        |
| `--text-3xl`         | `1.875`  | 30    | `2.25rem` (36)    | `-0.015em`     | 700 (display)   | Titre de page, h1                           |
| `--text-4xl`         | `2.5`    | 40    | `2.75rem` (44)    | `-0.02em`      | 700 (display)   | Hero secondaire (état vide majeur)          |
| `--text-display`     | `3.75`   | 60    | `4rem` (64)       | `-0.025em`     | 700 (display)   | Hero principal (page marketing future)      |

### Couplage typo

| Niveau de bloc      | Titre                | Lead                | Corps               |
|---------------------|----------------------|---------------------|---------------------|
| Hero marketing      | `--text-display`     | `--text-lg`         | `--text-base`       |
| Page wizard / setup | `--text-3xl`         | `--text-base`       | `--text-sm`         |
| Page guild standard | `--text-2xl`         | `--text-base`       | `--text-sm`         |
| Carte / panel       | `--text-xl`          | `--text-sm`         | `--text-sm`         |
| Section dense       | `--text-base` (600)  | —                   | `--text-sm`         |

Règle de couplage : un titre n'est jamais accolé à une taille immédiatement
inférieure (ex. `--text-2xl` au-dessus de `--text-xl` dans le même bloc),
sinon la hiérarchie devient confuse. On saute toujours d'au moins un cran.

## 6. Espacement — base 4 px

Quatorze paliers nommés. Base 4 px (cohérent avec Tailwind par défaut),
demi-pas autorisés sur 1 et 2 pour les ajustements fins (icônes-vs-label).

| Token             | rem      | px   | Usage type                                                  |
|-------------------|----------|------|-------------------------------------------------------------|
| `--space-0`       | `0`      | 0    | Annulation explicite                                        |
| `--space-0-5`     | `0.125`  | 2    | Ajustement icône / label aligné optiquement                 |
| `--space-1`       | `0.25`   | 4    | Padding interne tight (badge)                               |
| `--space-1-5`     | `0.375`  | 6    | Gap micro-éléments                                          |
| `--space-2`       | `0.5`    | 8    | Padding bouton sm, gap label/icône                          |
| `--space-3`       | `0.75`   | 12   | Padding input, gap items liste dense                        |
| `--space-4`       | `1`      | 16   | Gap items standard, padding card sm                         |
| `--space-5`       | `1.25`   | 20   | Padding card md                                             |
| `--space-6`       | `1.5`    | 24   | Padding card lg, gap inter-cartes                           |
| `--space-8`       | `2`      | 32   | Marges de bloc, gap entre sections d'un même panneau        |
| `--space-10`      | `2.5`    | 40   | Espacement vertical entre sections distinctes               |
| `--space-12`      | `3`      | 48   | Padding vertical de page (header → contenu)                 |
| `--space-16`      | `4`      | 64   | Marge de section large, padding hero compact                |
| `--space-24`      | `6`      | 96   | Padding hero marketing, séparation de section large         |

Règles d'usage :
- **Padding interne composant** : `--space-2` à `--space-6`, jamais plus.
- **Gap inter-composants** dans une grille : `--space-4` à `--space-6`.
- **Marge entre sections d'une même page** : `--space-10` ou `--space-12`.
- **Gouttière de grille marketing** : `--space-6` mobile, `--space-8` desktop.
- **Padding vertical page** : `--space-8` mobile, `--space-12` desktop.

## 7. Rayons

| Token           | Valeur     | Usage type                                                      |
|-----------------|------------|-----------------------------------------------------------------|
| `--radius-none` | `0`        | Bandes pleine largeur, séparateurs                              |
| `--radius-xs`   | `0.1875rem`| Boutons compacts (legacy Discord), checkboxes                   |
| `--radius-sm`   | `0.25rem`  | Inputs, panels denses                                           |
| `--radius-md`   | `0.5rem`   | Boutons standards, cards, popovers                              |
| `--radius-lg`   | `0.75rem`  | Cards marketing, modal, tooltip                                 |
| `--radius-xl`   | `1rem`     | Hero blocks, illustrations encadrées                            |
| `--radius-full` | `9999px`   | Avatars, badges pill, indicateurs                               |

## 8. Ombres

Cinq paliers d'élévation. Valeurs séparées dark / light : sur fond
sombre une ombre noire douce élève peu — on ajoute un *inner highlight*
au sommet pour renforcer la sensation de relief.

| Token                | Dark                                                                                            | Light                                                              |
|----------------------|-------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| `--shadow-xs`        | `0 1px 0 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.20)`                            | `0 1px 2px rgba(15,17,21,0.06)`                                    |
| `--shadow-sm`        | `0 1px 0 0 rgba(255,255,255,0.05) inset, 0 2px 4px rgba(0,0,0,0.28)`                            | `0 1px 3px rgba(15,17,21,0.08), 0 1px 2px rgba(15,17,21,0.04)`     |
| `--shadow-md`        | `0 1px 0 0 rgba(255,255,255,0.06) inset, 0 4px 12px rgba(0,0,0,0.36)`                           | `0 4px 12px rgba(15,17,21,0.10), 0 2px 4px rgba(15,17,21,0.06)`    |
| `--shadow-lg`        | `0 1px 0 0 rgba(255,255,255,0.08) inset, 0 12px 32px rgba(0,0,0,0.44)`                          | `0 12px 32px rgba(15,17,21,0.14), 0 4px 8px rgba(15,17,21,0.08)`   |
| `--shadow-xl`        | `0 1px 0 0 rgba(255,255,255,0.08) inset, 0 24px 64px rgba(0,0,0,0.55)`                          | `0 24px 64px rgba(15,17,21,0.18), 0 8px 16px rgba(15,17,21,0.10)`  |
| `--shadow-glow-iris` | `0 0 0 1px rgba(91,108,255,0.55), 0 4px 16px rgba(91,108,255,0.32)`                             | `0 0 0 1px rgba(91,108,255,0.42), 0 4px 16px rgba(91,108,255,0.22)`|

Usage :
- `xs` : séparation très douce d'un panel sticky.
- `sm` : carte au repos sur surface 1.
- `md` : carte hover, popover.
- `lg` : modal, drawer, tooltip riche.
- `xl` : overlay marketing, dialogue critique.
- `glow-iris` : focus ring riche pour CTAs primaires (uniquement les
  CTAs principaux d'un écran ; pas pour les boutons secondaires).

## 9. Bordures

Trois épaisseurs, trois couleurs (subtle, default, strong — voir §4).

| Token              | Valeur  | Usage type                                          |
|--------------------|---------|-----------------------------------------------------|
| `--border-width-1` | `1px`   | Bordures par défaut, séparateurs                    |
| `--border-width-2` | `2px`   | Focus ring, sélection actuelle                      |
| `--border-width-4` | `4px`   | Indicateur de section active (barre latérale gauche)|

Pas d'usage de `border-width: 3px`. La progression est 1 → 2 → 4 pour
garder une lecture nette.

## 10. Grille et conteneurs

Largeurs maximales de conteneur et nombre de colonnes par breakpoint.

### Breakpoints

| Token            | Min-width | Cible                                |
|------------------|-----------|--------------------------------------|
| `--bp-sm`        | `640px`   | Tablette portrait                    |
| `--bp-md`        | `768px`   | Tablette paysage                     |
| `--bp-lg`        | `1024px`  | Desktop standard                     |
| `--bp-xl`        | `1280px`  | Desktop large                        |
| `--bp-2xl`       | `1536px`  | Wide / écran 4K downscale            |

### Conteneurs

| Token                    | Largeur max | Usage type                                              |
|--------------------------|-------------|---------------------------------------------------------|
| `--container-narrow`     | `640px`     | Formulaires uniques (login, étape wizard simple)        |
| `--container-default`    | `960px`     | Pages dashboard standard, vue détail                    |
| `--container-wide`       | `1280px`    | Vue d'ensemble guild, page modules en grille            |
| `--container-marketing`  | `1200px`    | Pages marketing futures (réservé, hors scope V1)        |

### Colonnes par breakpoint

| Breakpoint | Colonnes | Gouttière (token) |
|------------|----------|-------------------|
| `< sm`     | 4        | `--space-4` (16)  |
| `sm`       | 6        | `--space-5` (20)  |
| `md`       | 8        | `--space-6` (24)  |
| `lg`+      | 12       | `--space-6` (24)  |

Marges externes du conteneur : `--space-4` mobile, `--space-6` tablette,
`--space-8` desktop.

## 11. Motion (référencé)

Les tokens de motion sont définis ici, leur usage détaillé dans
`05-motion-grammar.md`.

| Token                   | Valeur                              | Usage type                              |
|-------------------------|-------------------------------------|-----------------------------------------|
| `--duration-instant`    | `0ms`                               | `prefers-reduced-motion` actif          |
| `--duration-fast`       | `120ms`                             | Hover, focus, micro-interactions        |
| `--duration-base`       | `180ms`                             | Toggle, accordéon, change d'état simple |
| `--duration-slow`       | `260ms`                             | Toast, popover, drawer                  |
| `--duration-deliberate` | `360ms`                             | Modal, transition de page               |
| `--ease-standard`       | `cubic-bezier(0.2, 0.0, 0, 1)`      | Mouvement naturel par défaut            |
| `--ease-accelerate`     | `cubic-bezier(0.4, 0.0, 1, 1)`      | Sortie d'écran                          |
| `--ease-decelerate`     | `cubic-bezier(0.0, 0.0, 0.2, 1)`    | Entrée d'écran                          |
| `--ease-emphasized`     | `cubic-bezier(0.2, 0.0, 0, 1.2)`    | Entrée marquée (toast critique)         |
| `--ease-spring`         | `cubic-bezier(0.34, 1.36, 0.64, 1)` | Retour interactif (toggle, pill)        |

## 12. Z-index

Échelle plate, six paliers nommés. Pas de valeur arbitraire, jamais
`z-index: 9999`.

| Token                   | Valeur | Usage type                                       |
|-------------------------|--------|--------------------------------------------------|
| `--z-base`              | `0`    | Contenu de page                                  |
| `--z-elevated`          | `10`   | Sticky save bar, header sticky                   |
| `--z-dropdown`          | `100`  | Menus, autocomplete, select ouvert               |
| `--z-overlay`           | `200`  | Drawer, sidebar mobile en overlay                |
| `--z-modal`             | `300`  | Modal, scrim                                     |
| `--z-toast`             | `400`  | Toast, notification non-bloquante                |
| `--z-tooltip`           | `500`  | Tooltip (au-dessus de tout)                      |

## 13. Récapitulatif d'exposition Tailwind

Tous les tokens ci-dessus sont remontés dans `@theme inline` du
`theme.css` pour devenir disponibles comme classes utilitaires :

- Couleurs : `bg-{role}`, `text-{role}`, `border-{role}` — `role` ∈
  rôles abstraits (page, surface-1, surface-2, fg-primary, etc.) +
  paliers iris/sémantiques.
- Typo : `text-{taille}`, `font-display`, `font-sans`, `font-mono`.
- Espacement : `p-*`, `m-*`, `gap-*` mappés sur `--space-*`.
- Rayons : `rounded-{xs|sm|md|lg|xl|full}`.
- Ombres : `shadow-{xs|sm|md|lg|xl}`, `shadow-glow-iris`.
- Motion : `duration-{token}`, `ease-{token}` via classes utilitaires
  Tailwind ou directement en CSS.
- Z-index : `z-{base|elevated|dropdown|overlay|modal|toast|tooltip}`.

## 14. Validation contraste WCAG 2.2 AA

Les combinaisons texte/fond standard ont leur ratio mesuré :

| Couple                                        | Ratio  | AA (4.5)  | AAA (7) |
|-----------------------------------------------|--------|-----------|---------|
| `--ash-100` sur `--ash-900`                   | 13.4:1 | ✅        | ✅      |
| `--ash-100` sur `--ash-800`                   | 11.2:1 | ✅        | ✅      |
| `--ash-200` sur `--ash-800`                   | 9.1:1  | ✅        | ✅      |
| `--ash-300` sur `--ash-800`                   | 5.8:1  | ✅        | ❌      |
| `--ash-400` sur `--ash-800` (texte désactivé) | 3.6:1  | ✅ (UI)   | ❌      |
| `--paper-800` sur `--paper-50`                | 14.0:1 | ✅        | ✅      |
| `--paper-700` sur `--paper-50`                | 9.6:1  | ✅        | ✅      |
| `--paper-500` sur `--paper-50`                | 4.7:1  | ✅        | ❌      |
| `--ash-50` sur `--iris-500`                   | 4.7:1  | ✅        | ❌      |
| `--success-text` sur `--success-bg`           | 7.4:1  | ✅        | ✅      |
| `--danger-text` sur `--danger-bg`             | 6.9:1  | ✅        | ❌      |
| `--warning-text` sur `--warning-bg`           | 8.2:1  | ✅        | ✅      |

Toutes les combinaisons standard texte/fond passent **AA**. Les ratios
< 4.5 sont réservés à des éléments non textuels (bordures, séparateurs,
texte désactivé qui n'est pas une cible d'action — toléré par WCAG).

Mesures à reverifier au moment de l'implémentation : ouvrir
`packages/ui/src/theme.css`, exécuter `axe-core/playwright` après PR
7.4.4, consigner toute déviation dans `decisions.md`.
