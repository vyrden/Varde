# 0012. Tokens design CSS-first dans `@varde/ui` consommés via Tailwind 4

Date: 2026-04-28
Statut: accepted

## Contexte

Le jalon 7 introduit une refonte UI/UX du dashboard. Avant de
toucher aux composants, il faut ancrer un système de tokens design
solide pour qu'aucun nouveau composant n'introduise de couleur, de
taille ou d'ombre en dur.

État au moment de l'ADR :

- `@varde/ui` expose déjà 28 composants, qui consomment des tokens
  CSS via `var(--*)` (palette Discord, sémantique shadcn, ombres,
  gradients).
- Tailwind 4 est configuré en mode CSS-first (`@import "tailwindcss"`
  dans la feuille d'entrée, mapping `@theme inline` qui expose les
  variables CSS comme classes utilitaires).
- Le `theme.css` est dark-only par décision produit. Pas de mode
  clair en V1, mais la possibilité doit rester ouverte sans demander
  de réécrire les composants.

Manques identifiés à l'ouverture du jalon 7 :

- Pas d'échelle d'espacement nommée. Les composants utilisent les
  classes Tailwind par défaut (`p-2`, `gap-3`) sans référence
  centrale documentée. Un revieweur n'a pas de baseline pour
  arbitrer une nouvelle valeur.
- Pas d'échelle typo formalisée. Les `text-xs`, `text-sm`, etc.
  sont utilisés sans cadrage des line-heights associées.
- Mécanique mode clair / sombre absente du fichier de tokens.

## Décision

### Tokens définis dans `:root` du `theme.css`

Toutes les variables CSS sont définies sous `:root` au début de
`packages/ui/src/theme.css`, exposées en classes Tailwind via
`@theme inline` plus bas. Trois familles de tokens :

- **Couleurs** : palette Discord (`--rail`, `--sidebar`, `--surface`,
  `--surface-hover`, `--surface-active`) + sémantiques shadcn
  (`--background`, `--foreground`, `--card`, `--popover`,
  `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`,
  `--success`, `--warning`, `--info`, `--border`, `--border-strong`,
  `--input`, `--ring`).
- **Espacement** (4px-base) : `--space-1` (4px) à `--space-12`
  (48px). Mêmes valeurs que les utilitaires Tailwind par défaut,
  exposées en variables pour les contextes hors-classes.
- **Typographie** : `--font-size-xs` (12px) à `--font-size-3xl`
  (30px) avec les `--line-height-*` correspondants.

Plus les tokens annexes : rayons (`--radius-sm` à `--radius-xl`),
ombres (`--shadow-sm` à `--shadow-lg` + `--shadow-glow-primary`),
courbes d'easing (`--ease-out`, `--ease-spring`), durées
(`--duration-fast`, `--duration-base`, `--duration-slow`).

### Mécanique mode clair posée à blanc

Un sélecteur `[data-theme="light"]` est défini dans le fichier,
vide en V1. Le câblage applicatif (sélecteur de thème, persistance
par utilisateur, provider SSR-safe) viendra dans la PR 7.4. Les
composants lisent toujours via `var(--*)`, donc l'override CSS
seul activera le mode clair sans réécriture.

### Convention « ne hardcode pas »

Documentée dans `packages/ui/README.md` :

> Ne jamais hardcoder une couleur, un radius, une ombre ou une
> taille de police dans un composant. Utiliser un token existant.
> Si aucun ne correspond, en ajouter un dans `theme.css` et
> l'exposer via `@theme inline`.

Les hardcodes existants sont conservés uniquement quand ils sont
**volontaires** — par exemple `DiscordMessagePreview` qui mime
un vrai message Discord et doit garder les couleurs Discord
exactes (`#5865f2`, `#4e5058`, etc.) indépendamment du thème de
l'app.

## Alternatives considérées

### Système de tokens via lib tierce (Tokens Studio, Style Dictionary)

Rejeté : surdimensionné pour un seul produit, complexité de build
ajoutée, pas de partage avec d'autres équipes / produits qui
justifierait l'outillage.

### Ne rien formaliser, garder Tailwind par défaut

Rejeté : pas de référence pour les revieweurs face à un PR qui
introduit une nouvelle valeur. La discussion glisse vers
« pourquoi 22px et pas 24px » à chaque review. La table de tokens
fixe ce débat une fois pour toutes.

### Mode clair câblé dès cette PR

Rejeté : la DA actuelle est dark-only, et le câblage applicatif
(provider SSR-safe sans flash, sélecteur, persistance) demande sa
propre PR (7.4). Poser la mécanique CSS sans la logique permet de
ne pas bloquer l'avenir tout en restant focus sur le pilote.

## Conséquences

### Positives

- Référence unique pour les revieweurs.
- Composants existants déjà conformes — pas de migration
  rétroactive nécessaire.
- Mode clair activable en PR 7.4 sans réécrire de composant.
- Tailwind 4 CSS-first reste la stack — pas de refactor de build.

### Négatives et points de vigilance

- Le doublon entre `--space-*` et les utilitaires Tailwind par
  défaut peut prêter à confusion (« j'utilise `p-2` ou
  `var(--space-2)` ? »). Convention : Tailwind dans le JSX, CSS
  variables dans les feuilles de style brutes.
- Quand le mode clair sera câblé en 7.4, il faudra vérifier que
  les hardcodes Discord (`DiscordMessagePreview` notamment)
  restent lisibles dans le thème clair — possible refactor pour
  garder le rendu Discord dark indépendamment du thème de l'app.
- L'échelle typo expose les line-heights — penser à mettre à jour
  les deux ensemble si on ajoute une taille intermédiaire.

## Références

- `packages/ui/src/theme.css` — implémentation des tokens.
- `packages/ui/README.md` — guide d'usage et convention « ne
  hardcode pas ».
