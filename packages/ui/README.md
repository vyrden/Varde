# @varde/ui

Design system du dashboard : tokens, composants (shadcn/ui), thème.
Consommé exclusivement par `@varde/dashboard` et les pages dashboard
contribuées par les modules.

## Tokens

Tous les tokens sont définis dans [`src/theme.css`](./src/theme.css)
sous la forme de variables CSS, avec un mapping Tailwind 4 (`@theme
inline`) qui les expose comme classes utilitaires.

> **Convention.** Ne jamais hardcoder une couleur, un radius, une
> ombre ou une taille de police dans un composant. Utiliser un token
> existant. Si aucun ne correspond, en ajouter un dans `theme.css`
> et l'exposer via `@theme inline`.

### Couleurs

**Couches Discord** (les plus sombres en haut) :

| Token | Hex | Usage |
| --- | --- | --- |
| `--rail` | `#1e1f22` | Rail des guilds, inputs |
| `--sidebar` | `#2b2d31` | Sidebar nav, cards, popovers |
| `--surface` | `#313338` | Zone de contenu principale |
| `--surface-hover` | `#35373c` | Hover sur éléments de liste |
| `--surface-active` | `#404249` | Élément sélectionné / actif |

**Sémantiques** (compat shadcn/ui) :

| Token | Hex | Usage |
| --- | --- | --- |
| `--background`, `--foreground` | surface / `#dbdee1` | Fond et texte par défaut |
| `--card`, `--card-foreground` | sidebar / `#dbdee1` | Cartes |
| `--popover`, `--popover-foreground` | sidebar / `#dbdee1` | Tooltips, menus |
| `--primary`, `--primary-foreground` | `#5865F2` (blurple) / `#ffffff` | CTA, liens actifs |
| `--secondary`, `--secondary-foreground` | `#4e5058` / `#ffffff` | Action neutre |
| `--muted`, `--muted-foreground` | `#383a40` / `#80848e` | Zones de moindre importance |
| `--accent`, `--accent-foreground` | `#35373c` / `#dbdee1` | Hover discrets |
| `--destructive` | `#ed4245` | Actions destructives |
| `--success` | `#23a55a` | Validations |
| `--warning` | `#fee75c` | Avertissements |
| `--info` | `#00a8fc` | Informations |
| `--border`, `--border-strong` | `rgba(255,255,255,0.08)` / `rgba(255,255,255,0.14)` | Bordures par défaut et marquées |

### Espacement

Échelle 4px-base, alignée sur les utilitaires Tailwind par défaut.
Disponibles via `var(--space-1)` … `var(--space-12)` ou directement
via `p-1`, `gap-3`, etc.

| Token | Pixels |
| --- | --- |
| `--space-1` | 4 |
| `--space-2` | 8 |
| `--space-3` | 12 |
| `--space-4` | 16 |
| `--space-5` | 20 |
| `--space-6` | 24 |
| `--space-8` | 32 |
| `--space-10` | 40 |
| `--space-12` | 48 |

### Typographie

Police principale : Noto Sans (substitut public à *gg sans* Discord),
injectée par `apps/dashboard` via `next/font/google`.

| Token | Taille | Line-height |
| --- | --- | --- |
| `--font-size-xs` | 12px | 16px |
| `--font-size-sm` | 14px | 20px |
| `--font-size-base` | 16px | 24px |
| `--font-size-lg` | 18px | 28px |
| `--font-size-xl` | 20px | 28px |
| `--font-size-2xl` | 24px | 32px |
| `--font-size-3xl` | 30px | 36px |

### Rayons et ombres

| Token | Valeur | Usage |
| --- | --- | --- |
| `--radius-sm` | 3px | Boutons (style Discord) |
| `--radius-md` | 4px | Inputs, panels |
| `--radius-lg` | 8px | Cards |
| `--radius-xl` | 12px | Modales, hero |
| `--shadow-sm` | discret | Cards en repos |
| `--shadow-md` | marqué | Hover, popovers |
| `--shadow-lg` | profond | Modales, drawers |
| `--shadow-glow-primary` | blurple | CTAs et focus rings vraiment saillants |

### Animations

Courbes et durées standardisées pour que les transitions aient le
même rythme partout :

- `--ease-out` — apparitions, hover.
- `--ease-spring` — retours interactifs (rebond Discord léger).
- `--duration-fast` (120 ms), `--duration-base` (180 ms),
  `--duration-slow` (260 ms).

## Mode clair / sombre

V1 : **dark-only**. Le rendu est uniformément sombre, conformément à
la direction artistique du projet. Les composants doivent malgré tout
lire les couleurs via les tokens (`var(--background)`, etc.) plutôt
que des valeurs en dur — c'est ce qui rendra le mode clair activable
sans réécrire les composants quand il sera câblé en PR 7.4.

La mécanique d'override est posée dans `theme.css` sous le sélecteur
`[data-theme="light"]`, vide pour l'instant.

## Composants

28 composants couvrent les besoins courants du dashboard :

- **Primitives** : `Button`, `Input`, `Textarea`, `Label`, `Select`,
  `Toggle`, `Checkbox` (via `Label` patterns), `Separator`.
- **Conteneurs** : `Card`, `Sidebar`, `Header`, `PageHeader`,
  `PageTitle`, `PageBreadcrumb`, `Drawer`, `Tabs`, `Skeleton`.
- **Feedback** : `Badge`, `EmptyState`, `Toaster` (toasts), `Tooltip`,
  `Progress`, `InlineConfirm`, `UnboundPermissionsBanner`.
- **Patterns module** : `CollapsibleSection`, `ExpandablePanel`,
  `StickyActionBar`, `ReadonlySwitch`, `DiscordMessagePreview`.

Chaque composant est typé strictement et accepte un `className`
override quand il a du sens (composants atomiques) ou refuse
l'override quand il est opinioné (composants pattern).

## Ajouter un nouveau token

1. Définir la variable dans `:root` au début de `theme.css`.
2. Si le token doit être consommé en classe Tailwind, l'exposer
   sous `@theme inline` plus bas.
3. Mettre à jour ce README dans la section concernée.
4. Documenter dans le commit message le pourquoi (préfère "le
   composant X avait besoin d'une couleur d'accent supplémentaire"
   plutôt que "ajout d'un token").

## Ajouter un nouveau composant

1. Créer `src/components/<Nom>.tsx`. Pas de fichiers de styles
   séparés : tout passe par les tokens et Tailwind.
2. Exporter depuis `src/index.ts`.
3. Lire les couleurs et tailles depuis les tokens (`bg-card`,
   `text-foreground`, `var(--space-3)`, etc.). Pas de hex en dur.
4. Si le composant introduit un nouveau pattern, ajouter une note
   dans la section *Composants* ci-dessus.
5. Tests unitaires dans `tests/unit/<Nom>.test.tsx`.
