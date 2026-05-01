# @varde/ui

Design system du dashboard : tokens, composants, thème.
Consommé exclusivement par `@varde/dashboard` et les pages dashboard
contribuées par les modules.

La référence active du design system est
[`docs/design-system/`](../../docs/design-system/) — principes,
cartographie des écrans, règles mascotte, grammaire d'animation,
anti-patterns, journal de décisions. Ce README documente uniquement
l'**implémentation** des tokens et des composants ; les choix de
design sont arbitrés là-bas.

## Tokens

Tous les tokens sont définis dans [`src/theme.css`](./src/theme.css)
sous la forme de variables CSS, avec un mapping Tailwind 4 (`@theme
inline`) qui les expose comme classes utilitaires.

### Convention impérative

Un composant lit toujours via les **rôles abstraits**
(`var(--bg-surface-2)`, `var(--fg-primary)`, `var(--border-default)`),
jamais directement les paliers de palette (`var(--ash-700)`,
`var(--paper-200)`). Les rôles sont la frontière entre le système et
l'UI — ils basculent en mode clair via `[data-theme="light"]` sans
réécrire les composants.

Pas de hardcode de couleur, radius, ombre ou taille de police dans
un composant. Si un token manque, l'ajouter dans `theme.css` plutôt
que d'inliner un hex.

Une seule exception documentée : `DiscordMessagePreview` qui mime un
vrai message Discord et garde les couleurs Discord exactes
indépendamment du thème.

### Couleurs — palettes brutes

Deux palettes neutres (cf. [02-tokens.md](../../docs/design-system/02-tokens.md)) :

- **`ash-50` → `ash-950`** (11 paliers) : palette dark, du texte le
  plus clair (`#f6f7f8`) au scrim le plus sombre (`#0c0e10`).
  Référence visuelle : marketing discord.com (palette plus neutre que
  le client Discord).
- **`paper-50` → `paper-950`** (11 paliers) : palette light,
  symétrique. Posée à blanc même si le câblage applicatif vient en
  PR 7.4.9 (cf. décision D-06).

Une palette primaire :

- **`iris-100` → `iris-900`** : couleur de marque, dérivée du blurple
  Discord (`#5865F2`) avec une saturation +6 %, luminance +2 % →
  `iris-500 = #5b6cff`. Reconnaissable comme « famille Discord » sans
  être un copier-coller (cf. décision D-02).

Quatre palettes sémantiques (3 paliers chacune) : `success-*`,
`warning-*`, `danger-*`, `info-*`, avec `bg`, `border`, `text`. Ces
couleurs ne servent **que** leur sémantique — pas de décor.

### Couleurs — rôles abstraits (à consommer)

| Rôle                | Dark (ash)        | Light (paper)     | Usage                                   |
|---------------------|-------------------|-------------------|-----------------------------------------|
| `--bg-page`         | `--ash-900`       | `--paper-50`      | Fond de page                            |
| `--bg-rail`         | `--ash-950`       | `--paper-100`     | Sidebar gauche, rail de navigation      |
| `--bg-surface-1`    | `--ash-800`       | `--paper-100`     | Zone de contenu principale              |
| `--bg-surface-2`    | `--ash-700`       | `--paper-200`     | Cards, popovers, inputs                 |
| `--bg-surface-3`    | `--ash-600`       | `--paper-300`     | Surface élevée hover, dropdowns ouverts |
| `--bg-overlay`      | ash-950 / 80%     | paper-900 / 40%   | Scrim derrière modal                    |
| `--fg-primary`      | `--ash-100`       | `--paper-800`     | Texte primaire                          |
| `--fg-secondary`    | `--ash-200`       | `--paper-700`     | Sous-titres, valeurs                    |
| `--fg-muted`        | `--ash-300`       | `--paper-500`     | Métadonnées, placeholders               |
| `--fg-disabled`     | `--ash-400`       | `--paper-600`     | États désactivés                        |
| `--fg-on-accent`    | `--ash-50`        | `--paper-50`      | Texte sur fond iris ou sémantique       |
| `--border-subtle`   | `--ash-700`       | `--paper-300`     | Bordure de carte au repos               |
| `--border-default`  | `--ash-600`       | `--paper-400`     | Bordure d'input, séparateur fort        |
| `--border-strong`   | `--ash-500`       | `--paper-500`     | Hover bordure, focus ring atténué       |

Les **aliases historiques** (anciens tokens shadcn et Discord)
restent exposés pour ne pas casser les composants existants — ils
pointent vers les rôles abstraits :

- shadcn : `--background`, `--foreground`, `--card`, `--popover`,
  `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`,
  `--success`, `--warning`, `--info`, `--border`, `--input`, `--ring`.
- Discord : `--rail`, `--sidebar`, `--surface`, `--surface-hover`,
  `--surface-active`.

Pour le code nouveau, préférer les rôles abstraits — la prochaine
PR de migration progressive remplacera les usages aliases.

### Espacement

Échelle 4 px de base, étendue (cf. décision D-08). 14 paliers :

| Token         | rem      | px  | Usage type                                   |
|---------------|----------|-----|----------------------------------------------|
| `--space-0`   | 0        | 0   | Annulation explicite                         |
| `--space-0-5` | 0.125    | 2   | Ajustement icône / label aligné optiquement  |
| `--space-1`   | 0.25     | 4   | Padding interne tight (badge)                |
| `--space-1-5` | 0.375    | 6   | Gap micro-éléments                           |
| `--space-2`   | 0.5      | 8   | Padding bouton sm, gap label/icône           |
| `--space-3`   | 0.75     | 12  | Padding input, gap items liste dense         |
| `--space-4`   | 1        | 16  | Gap items standard, padding card sm          |
| `--space-5`   | 1.25     | 20  | Padding card md                              |
| `--space-6`   | 1.5      | 24  | Padding card lg, gap inter-cartes            |
| `--space-8`   | 2        | 32  | Marges de bloc                               |
| `--space-10`  | 2.5      | 40  | Espacement vertical entre sections           |
| `--space-12`  | 3        | 48  | Padding vertical de page                     |
| `--space-16`  | 4        | 64  | Marge de section large                       |
| `--space-24`  | 6        | 96  | Padding hero marketing                       |

### Typographie

Stack — Inter pour le texte courant, **`--font-display`** pour les
titres (pointe sur Inter aujourd'hui ; bascule vers Inter Display
quand une variant optique distincte sera injectée par
`apps/dashboard`). Self-host via `next/font/google` (cf. décision
D-04).

Échelle modulaire ratio 1.25 (Major Third), 10 tailles :

| Token             | rem      | px   | line-height       | Usage type                              |
|-------------------|----------|------|-------------------|-----------------------------------------|
| `--text-caption`  | 0.6875   | 11   | 1rem (16)         | Eyebrow, badge, mention légale          |
| `--text-xs`       | 0.75     | 12   | 1rem (16)         | Métadonnée, helper sous champ           |
| `--text-sm`       | 0.875    | 14   | 1.25rem (20)      | Corps dense, label, valeur              |
| `--text-base`     | 1        | 16   | 1.5rem (24)       | Corps standard                          |
| `--text-lg`       | 1.125    | 18   | 1.75rem (28)      | Lead de section                         |
| `--text-xl`       | 1.25     | 20   | 1.75rem (28)      | Titre de carte, h3                      |
| `--text-2xl`      | 1.5      | 24   | 2rem (32)         | Titre de section, h2                    |
| `--text-3xl`      | 1.875    | 30   | 2.25rem (36)      | Titre de page, h1                       |
| `--text-4xl`      | 2.5      | 40   | 2.75rem (44)      | Hero secondaire                         |
| `--text-display`  | 3.75     | 60   | 4rem (64)         | Hero principal (page marketing future)  |

Les anciens noms `--font-size-xs/.../-3xl` restent comme aliases
pour compat.

### Rayons et ombres

| Token             | Valeur     | Usage type                                |
|-------------------|------------|-------------------------------------------|
| `--radius-none`   | 0          | Bandes pleine largeur, séparateurs        |
| `--radius-xs`     | 0.1875rem  | Boutons compacts (legacy Discord)         |
| `--radius-sm`     | 0.25rem    | Inputs, panels denses                     |
| `--radius-md`     | 0.5rem     | Boutons standards, cards, popovers        |
| `--radius-lg`     | 0.75rem    | Cards marketing, modal, tooltip           |
| `--radius-xl`     | 1rem       | Hero blocks, illustrations encadrées      |
| `--radius-full`   | 9999px     | Avatars, badges pill, indicateurs         |

Cinq paliers d'ombre (`--shadow-xs` à `--shadow-xl`), valeurs
distinctes dark / light. `--shadow-glow-iris` réservé aux CTAs
primaires et focus rings prononcés (alias historique
`--shadow-glow-primary`).

### Motion

Cinq durées et cinq easings, alignés sur la grammaire d'animation
(cf. [05-motion-grammar.md](../../docs/design-system/05-motion-grammar.md)) :

- Durées : `--duration-instant` (0), `--duration-fast` (120 ms),
  `--duration-base` (180 ms), `--duration-slow` (260 ms),
  `--duration-deliberate` (360 ms).
- Easings : `--ease-standard` (par défaut), `--ease-accelerate`
  (sortie), `--ease-decelerate` (entrée), `--ease-emphasized`
  (narrative marquée), `--ease-spring` (toggles).
- Aliases historiques : `--ease-out` pointe sur `--ease-standard`.

### Z-index

Échelle plate, six paliers — pas de valeur arbitraire :
`--z-base` (0), `--z-elevated` (10), `--z-dropdown` (100),
`--z-overlay` (200), `--z-modal` (300), `--z-toast` (400),
`--z-tooltip` (500).

## Mode clair / sombre

Dark par défaut. Le mode clair est posé en tokens (palette `paper-*`,
override des rôles abstraits sous `[data-theme="light"]`) mais le
câblage applicatif (sélecteur, persistance par utilisateur, provider
SSR-safe sans flash) arrive en PR 7.4.9 (cf. décision D-06).

Pour qu'un composant bascule automatiquement, il doit consommer les
**rôles abstraits**, pas les paliers. Les composants déjà conformes
(consommation via `bg-background`, `bg-card`, etc.) basculent
gratuitement parce que ces aliases pointent sur les rôles.

## Composants

28 composants couvrent les besoins courants du dashboard :

- **Primitives** : `Button`, `Input`, `Textarea`, `Label`, `Select`,
  `Toggle`, `Separator`.
- **Conteneurs** : `Card`, `Sidebar`, `Header`, `PageHeader`,
  `PageTitle`, `PageBreadcrumb`, `Drawer`, `Tabs`, `Skeleton`.
- **Feedback** : `Badge`, `EmptyState`, `Toaster`, `Tooltip`,
  `Progress`, `InlineConfirm`, `UnboundPermissionsBanner`.
- **Patterns module** : `CollapsibleSection`, `ExpandablePanel`,
  `StickyActionBar`, `ReadonlySwitch`, `DiscordMessagePreview`.

Chaque composant est typé strictement et accepte un `className`
override quand il a du sens (composants atomiques) ou refuse
l'override quand il est opinioné (composants pattern).

## Ajouter un nouveau token

1. Définir la variable dans `:root` au début de `theme.css`. Si elle
   doit basculer en mode clair, l'override sous `[data-theme="light"]`.
2. Si le token doit être consommé en classe Tailwind, l'exposer
   sous `@theme inline` plus bas.
3. Mettre à jour ce README dans la section concernée.
4. Si la décision est non évidente (couleur, ratio), ajouter une
   entrée dans `docs/design-system/decisions.md`.

## Ajouter un nouveau composant

1. Créer `src/components/<Nom>.tsx`. Pas de fichiers de styles
   séparés : tout passe par les tokens et Tailwind.
2. Exporter depuis `src/index.ts`.
3. Lire les couleurs et tailles via les **rôles abstraits**
   (`bg-bg-surface-2`, `text-fg-primary`, `border-border-default`)
   ou les aliases équivalents (`bg-card`, `text-foreground`,
   `border-border`). Pas de hex en dur.
4. Si le composant introduit un nouveau pattern, ajouter une note
   dans la section *Composants* ci-dessus.
5. Tests unitaires dans `tests/unit/<Nom>.test.tsx`.
