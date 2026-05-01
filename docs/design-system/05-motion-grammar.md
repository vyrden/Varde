# 05 — Grammaire d'animation

Cinq catégories. Chacune a ses durées, ses easings, son cas d'usage.
Aucune animation hors catégorie. Si un besoin n'entre dans aucune,
ajouter une catégorie dans cette spec et la justifier dans
`decisions.md` ; ne pas inventer un easing local.

## 1. Catégories

### A. Micro-interactions (hover, focus, active, pressed)

- **Cible** : éléments interactifs immédiats (Button, Link, Input,
  Toggle au repos).
- **Durée** : `--duration-fast` (120 ms).
- **Easing** : `--ease-standard`.
- **Propriétés animées** : `background-color`, `border-color`,
  `color`, `box-shadow`. Jamais `width`/`height`/`top`/`left`.
- **Règle** : déclenchement immédiat, jamais de délai. Le retour au
  repos a la même durée que la transition entrante (pas d'asymétrie
  perçue comme de l'inertie).
- **Exemple** : un Button passe de `--bg-surface-2` à `--bg-surface-3`
  en 120 ms sur `:hover`.

### B. Transitions d'état (toggle, expand/collapse, switch)

- **Cible** : changements d'état d'un même composant (Toggle on/off,
  ExpandablePanel, accordéon, Tabs).
- **Durée** : `--duration-base` (180 ms).
- **Easing** : `--ease-spring` pour le toggle (rebond léger qui
  signale l'engagement) ; `--ease-standard` pour les autres
  changements d'état.
- **Propriétés animées** : `transform` (translate), `opacity`,
  `max-height` (avec valeur connue, jamais `auto`).
- **Règle** : la transition explique le changement. Pas plus de deux
  propriétés animées simultanément. Pas de `box-shadow` en
  `expand/collapse` — ça grésille.
- **Exemple** : ExpandablePanel : le contenu apparaît en
  `transform: translateY(-4px) → 0` + `opacity: 0 → 1` sur 180 ms.

### C. Entrées et sorties d'éléments éphémères (toast, popover, drawer)

- **Cible** : éléments qui apparaissent et disparaissent (Toast,
  Tooltip riche, Popover, Drawer, Dropdown).
- **Durée** :
  - Apparition : `--duration-slow` (260 ms).
  - Disparition : `--duration-base` (180 ms) — sortie plus rapide que
    l'entrée, conformément aux conventions Material et Apple HIG.
- **Easing** :
  - Apparition : `--ease-decelerate` (le mouvement freine en arrivant).
  - Disparition : `--ease-accelerate` (le mouvement part vite).
- **Propriétés animées** : `transform` (translate), `opacity`. Le
  contenu interne ne s'anime pas indépendamment du conteneur.
- **Règle** : un seul élément éphémère animé à la fois côté toast
  (queue gérée). Le drawer occupe la profondeur visuelle ; pas de
  parallax sur la page de fond, juste un scrim opacity 0 → 0.4.
- **Exemple** : Toast entre par la droite (`translateX(24px) →
  0`) + `opacity: 0 → 1` en 260 ms decelerate ; sort en 180 ms
  accelerate sur la même trajectoire.

### D. Transitions de page

- **Cible** : navigation entre routes du dashboard.
- **Durée** : `--duration-deliberate` (360 ms) **uniquement** sur les
  cas où la transition apporte une vraie continuité (par ex.
  `/guilds/[id]` → `/guilds/[id]/modules/[moduleId]`). Sinon, pas
  d'animation : la nouvelle page apparaît directement.
- **Easing** : `--ease-standard`.
- **Propriétés animées** : `opacity` (fade léger 0.6 → 1), pas de
  translate (un translate sur tout l'écran masque le travail réel
  qu'est la navigation).
- **Règle** : par défaut, **pas** de transition de page. La transition
  s'opt-in écran par écran via une convention (ex. la page enfant
  reçoit un attribut `data-page-transition="continuity"`). Les
  navigations d'admin ou wizard où chaque écran est nouveau ne
  s'animent pas.
- **Exemple** : ouvrir la config d'un module depuis la grille fait
  fader la grille à 0.6 puis charge la page de config qui fait
  l'inverse. Les autres navigations sont instantanées.

### E. Animations narratives (onboarding, états vides avec mascotte)

- **Cible** : scènes pédagogiques uniques — premier ouverture d'un
  écran, état vide majeur, écran d'introduction wizard.
- **Durée** : 600 à 900 ms, déclenchée une seule fois par écran (pas
  de re-jeu à chaque montage).
- **Easing** : `--ease-emphasized` ou `--ease-standard` selon le ton.
- **Propriétés animées** : `transform` (translate, scale léger ≤ 1.05),
  `opacity`, plus rarement `clip-path` pour révéler progressivement.
  La mascotte peut introduire un mouvement `transform: rotate(-6deg →
  0deg)` discret.
- **Règle** : une narration par écran maximum. Stagger autorisé entre
  éléments d'une même scène (50–80 ms entre chaque), jamais en boucle.
  L'animation se rejoue uniquement après navigation explicite hors / re.
- **Exemple** : sur l'état vide "0 modules", la mascotte apparaît
  (translate + opacity), puis le titre, puis la description, puis le
  CTA — total 800 ms, stagger 60 ms.

## 2. Tableau des durées

| Token                   | Valeur | Catégorie associée                          |
|-------------------------|--------|---------------------------------------------|
| `--duration-instant`    | 0 ms   | `prefers-reduced-motion` actif (override)   |
| `--duration-fast`       | 120 ms | A — micro-interactions                      |
| `--duration-base`       | 180 ms | B — transitions d'état, sorties éphémères   |
| `--duration-slow`       | 260 ms | C — entrées éphémères                       |
| `--duration-deliberate` | 360 ms | D — transitions de page (opt-in)            |
| —                       | 600–900 ms | E — narratives (durée totale composée)  |

## 3. Tableau des easings

| Token                | Courbe Bézier                       | Sensation                              | Catégorie                                        |
|----------------------|-------------------------------------|----------------------------------------|--------------------------------------------------|
| `--ease-standard`    | `cubic-bezier(0.2, 0.0, 0, 1)`      | Naturel, légèrement décéléré           | A par défaut, B alternative, D                   |
| `--ease-accelerate`  | `cubic-bezier(0.4, 0.0, 1, 1)`      | Le mouvement gagne en vitesse          | C — disparitions, sorties d'écran                |
| `--ease-decelerate`  | `cubic-bezier(0.0, 0.0, 0.2, 1)`    | Le mouvement freine à l'arrivée        | C — apparitions                                  |
| `--ease-emphasized` | `cubic-bezier(0.2, 0.0, 0, 1.2)`     | Petit dépassement à l'arrivée          | E — narratives marquées                          |
| `--ease-spring`      | `cubic-bezier(0.34, 1.36, 0.64, 1)` | Léger rebond, retour interactif        | B — toggles, switches                            |

Aucun easing arbitraire. Si une animation ne tient pas avec ces cinq
courbes, soit elle change de catégorie, soit la spec ajoute une courbe
documentée.

## 4. Règles de cohérence transverses

1. **Durée + easing par catégorie** : tous les éléments d'une même
   catégorie partagent durée et easing. Pas d'exception "ce hover-là
   est en 200 ms parce que je le sens mieux".
2. **Pas de transition sur `all`**. Toujours lister les propriétés
   animées (`transition: background-color 120ms, color 120ms`). Sinon
   le moteur anime des choses qui ne devraient pas bouger.
3. **GPU-friendly** : privilégier `transform` et `opacity`. `filter`
   accepté uniquement sur petits éléments. Bannir `top`/`left`/`width`/
   `height` animés sur des conteneurs > 240 px.
4. **Pas d'animation pendant qu'une autre joue sur le même élément**.
   Si un toggle est en transition, son `box-shadow` ne s'anime pas
   séparément.
5. **Pas de loop infini**. Skeleton compris : on préfère un skeleton
   immobile qu'un shimmer qui distrait.

## 5. Réduction de mouvement

`@media (prefers-reduced-motion: reduce)` :

| Catégorie | Comportement                                                                            |
|-----------|-----------------------------------------------------------------------------------------|
| A         | Conservé en version atténuée : `transition-duration: 60ms`, easing `linear`.            |
| B         | Conservé en version atténuée : durée 90 ms, easing `linear`. Le rebond `spring` saute.  |
| C         | Désactivé en mouvement, conservé en `opacity` cross-fade (180 ms `linear`).             |
| D         | Désactivé. Navigation instantanée.                                                      |
| E         | Désactivé. Les éléments apparaissent en place, sans translate ni rotation.              |

Implémentation : un fichier `motion.css` global pose les
`transition-property` et durées par défaut, et override en bloc dans
le media query reduce. Tous les composants héritent.

## 6. Stack technique

### CSS-first

Toutes les catégories A, B, et la majeure partie de C s'animent en
CSS pur (`transition` + classes utilitaires Tailwind). Pas de
dépendance JavaScript pour ces cas, pas de coût bundle.

### JavaScript (à l'exception près)

Une bibliothèque d'animation JS est nécessaire **seulement** pour :

- Le drawer (offset transformé pendant gesture de drag-to-close, si
  la fonctionnalité est livrée).
- Les transitions de page de catégorie D (orchestration entre
  démontage et montage de Next.js App Router).
- Les animations narratives E avec stagger (apparition séquencée
  d'une scène).

**Choix de stack** : `motion` (anciennement framer-motion). Justification :
- API React mainstream, bien documentée.
- Tree-shaking : importer `motion/react` minimal pèse ~14 KB gzip si
  on n'utilise que `motion.div` + `AnimatePresence`. Acceptable pour
  les 3 cas ci-dessus.
- Alternative `auto-animate` : trop limité (uniquement layout shift,
  pas d'orchestration).
- Alternative pure CSS via classes appliquées en JS : feasible mais
  fragile sur la transition de page Next.js.

À acter dans `decisions.md` : ajout de `motion` au `package.json` lors
de la PR qui câble la première animation E ou D. Tant qu'aucune
animation D ou E n'est livrée, pas d'ajout de dépendance.

### Pas d'animation au-dessus du framework

- Pas de Lottie. Le poids et la complexité ne sont pas justifiés pour
  les cas du dashboard.
- Pas de GIF animé. Format obsolète, gros, sans contrôle de motion-reduce.
- Pas de WebGL. Aucun cas d'usage produit.

## 7. Implémentation conseillée — exemples ciblés

Forme indicative à valider en revue lors de l'implémentation. Aucun
code n'est posé pendant cette phase de cadrage.

### Hover Button (catégorie A)

```css
.button {
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}
```

### Toggle on/off (catégorie B)

```css
.toggle-thumb {
  transition: transform var(--duration-base) var(--ease-spring);
}
```

### Toast (catégorie C)

```css
.toast-enter {
  transform: translateX(24px);
  opacity: 0;
}
.toast-enter-active {
  transition:
    transform var(--duration-slow) var(--ease-decelerate),
    opacity var(--duration-slow) var(--ease-decelerate);
  transform: translateX(0);
  opacity: 1;
}
.toast-exit-active {
  transition:
    transform var(--duration-base) var(--ease-accelerate),
    opacity var(--duration-base) var(--ease-accelerate);
  transform: translateX(24px);
  opacity: 0;
}
```

### Reduce override

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 60ms !important;
    animation-duration: 60ms !important;
    transition-timing-function: linear !important;
    animation-timing-function: linear !important;
  }
}
```
