# Assets

Gestion des ressources statiques du projet : images, icônes, fonts,
illustrations, sons, documents. Objectif : performance, maintenance aisée,
accessibilité, conformité licences.

## Principes

- **Un asset dans le repo est un engagement.** Il doit être utilisé, tenu à
  jour, supprimé quand il ne l'est plus.
- **Formats modernes, fallbacks maîtrisés.** AVIF et WebP pour les
  raster, SVG pour le vectoriel, WOFF2 pour les fonts.
- **Optimisation à la source, pas au runtime.** Les assets sont optimisés
  avant commit.
- **Licences tracées.** Chaque asset tiers a sa source et sa licence
  consignées.
- **Pas d'assets en dur dans les modules.** Le design system est imposé, les
  modules ne viennent pas avec leur propre logo ou leur propre icône sauf
  si ça fait partie de leur manifeste UI.

## Emplacements

```
packages/ui/
└── src/assets/          # Assets partagés du design system (logo, icônes maison)

apps/dashboard/
└── public/              # Assets statiques servis directement (favicons, og-image, robots.txt)

modules/<n>/
└── src/assets/          # Assets spécifiques au module (rares, justifiés)
```

Pas d'assets à la racine du repo sauf :

- `favicon.ico` de secours si un déploiement en a besoin.
- `LICENSE`, `NOTICE` (fichiers texte, pas des assets à proprement parler).

## Images

### Formats

- **Photos et illustrations complexes** : AVIF en priorité, WebP en
  fallback. JPEG accepté si outillage ne supporte pas AVIF/WebP.
- **Logos, illustrations simples, pictos** : SVG.
- **Screenshots de doc** : PNG ou WebP selon le rendu.
- **Bannières OG (Open Graph)** : PNG ou JPEG, 1200×630.

### Optimisation

Avant commit, toute image passe par une optimisation :

- SVG : SVGO avec une config partagée (`packages/config/svgo.json`).
- PNG : oxipng ou pngquant.
- JPEG : mozjpeg.
- AVIF / WebP : sharp ou outils équivalents, niveau de qualité documenté.

Script `scripts/optimize-assets.sh` qui applique l'optimisation à tout un
dossier. Intégré en pre-commit pour les fichiers d'assets staged.

### Naming

- `kebab-case.ext`.
- Préfixe par catégorie pour les assets partagés du UI : `icon-`, `logo-`,
  `illustration-`, `pattern-`.
- Pas de numéro de version dans le nom (`logo-v2.svg` est à éviter) :
  l'historique git gère ça.
- Pas d'espaces, pas de majuscules, pas d'accents.

### Accessibilité

- Toute image informative dans le dashboard a un `alt` explicite.
- Les images décoratives ont `alt=""`.
- Les icônes seules servent de décor à un bouton : l'élément interactif a
  un `aria-label`.
- Les contrastes d'icônes face au fond respectent WCAG AA (minimum 3:1
  pour les graphiques, 4.5:1 pour le texte).

### Responsive

- Balises `<picture>` avec `srcset` pour les images au-dessus de 600px de
  large.
- `loading="lazy"` par défaut, sauf images critiques au-dessus de la
  ligne de flottaison.
- `decoding="async"` par défaut.
- Dimensions (`width` et `height`) systématiquement renseignées pour éviter
  les layout shifts (CLS).

### Dark mode

- Les illustrations et logos qui dépendent du thème sont fournis en deux
  variantes : `-light.svg` et `-dark.svg`.
- Utiliser `<picture>` avec `media="(prefers-color-scheme: dark)"` ou CSS
  `currentColor` sur les SVG inline pour suivre la couleur de texte.

## Icônes

### Bibliothèque

Une seule bibliothèque d'icônes pour tout le dashboard. Choix par défaut :
**Lucide** (open source, MIT, ligne simple, bonne couverture).

Règles :

- Les icônes Lucide sont utilisées via le composant `Icon` du design system,
  jamais importées directement dans un module.
- Pas de seconde bibliothèque d'icônes ajoutée sans ADR.
- Icônes custom acceptées en SVG dans `packages/ui/src/assets/icons/`, avec
  les mêmes conventions de taille et de stroke que Lucide pour l'harmonie.

### Usage

- Les icônes décoratives : `aria-hidden="true"`.
- Les icônes interactives (boutons icon-only) : `aria-label` explicite.
- Taille standard : 16, 20, 24 px. Les tailles intermédiaires sont
  refusées par le design system.
- Stroke width uniforme dans une vue.

## Fonts

### Choix

- Web fonts variables en WOFF2 pour réduire la charge.
- Police par défaut du dashboard : une police système-first stack, avec une
  police web optionnelle chargée uniquement si l'identité l'impose.
- Pas de Google Fonts en inclusion directe (privacy et perf). Fonts
  auto-hébergées.

### Règles

- Préchargement (`<link rel="preload" as="font" crossorigin>`) pour la
  police principale si elle est web.
- Subset limité à l'usage réel (latin étendu au maximum pour notre cas).
- `font-display: swap` sur tous les `@font-face`.
- Fallbacks systèmes cohérents déclarés (métriques ajustées avec
  `size-adjust` si nécessaire pour limiter les CLS de chargement).
- Fichiers WOFF2 compressés, pas de TTF ou OTF livrés au navigateur.

## Favicons et métadonnées web

Dossier `apps/dashboard/public/favicons/` avec :

- `favicon.ico` (multi-résolutions 16, 32, 48).
- `favicon-16.png`, `favicon-32.png`.
- `apple-touch-icon.png` (180×180).
- `icon-192.png`, `icon-512.png` (pour PWA / Android).
- `maskable-icon.png` si PWA.
- `site.webmanifest`.

Générés via un outil dédié (realfavicongenerator.net ou équivalent
scriptable), pas à la main.

## Open Graph et social

- Image OG par défaut à la racine du `public/` : `og-image.png` (1200×630).
- Balises meta OG et Twitter Card dans le `<head>` du dashboard, avec
  valeurs par défaut et override par page.
- Images OG dynamiques envisageables via Next.js `ImageResponse` pour les
  pages contextuelles, mais prudence sur le coût (mise en cache
  indispensable).

## Assets des modules

Exception à la règle générale : un module peut avoir besoin de ses propres
assets (illustration d'onboarding spécifique, icône distinctive pour une
catégorie métier).

Règles :

- Déclarer dans `modules/<n>/src/assets/`.
- Être importé via le système d'assets du core (pas de chemin hardcodé).
- Respecter les mêmes contraintes d'optimisation et de licence.
- Ne jamais écraser un asset du design system.

## Sons (hors scope V1)

Aucun son en V1. À plus long terme, si nécessaire :

- Formats OGG Opus et MP3 en fallback.
- Durée limitée, volume normalisé.
- Toujours contrôlables par l'utilisateur (mute, volume).
- Pas de son déclenché sans action utilisateur (autoplay interdit).

## Vidéos

Pas de vidéo hébergée dans le repo ou par le projet. Si vidéo nécessaire
pour la doc ou le marketing : hébergée sur une plateforme tierce (YouTube,
Vimeo), embed respectant la vie privée (nocookie, lazy).

## Licences et attribution

### Règles

- Tout asset tiers a sa source et sa licence documentées dans
  `packages/ui/src/assets/LICENSES.md` ou le fichier équivalent du module.
- Licences compatibles uniquement : MIT, Apache 2.0, CC0, CC-BY (avec
  attribution), SIL OFL (pour les fonts).
- Pas d'asset dont la licence est ambiguë, pas de "found on Pinterest".
- Les attributions requises sont affichées dans une page `/credits` du
  dashboard.

### Format du fichier LICENSES

```md
# Assets tiers

## Lucide Icons
- Source : https://lucide.dev
- Licence : ISC
- Usage : toutes les icônes sous `icons/lucide/`

## Illustration "welcome-banner"
- Source : [URL]
- Auteur : [Nom]
- Licence : CC-BY 4.0
- Attribution : affichée sur /credits
```

## Optimisation bundle

### JavaScript / CSS

- Code splitting automatique par route Next.js.
- Import dynamique (`import()`) pour les modules lourds non critiques au
  premier paint.
- Tree shaking : éviter les imports `*`, préférer les imports nommés.
- Pas d'importation massive d'une lib pour une fonction (ex. lodash full
  pour un `debounce`).
- Analyzer : `next build` avec `@next/bundle-analyzer` consulté
  périodiquement.

### Images via Next.js

- Utiliser `next/image` pour toute image interne au dashboard.
- Les domaines autorisés en `remotePatterns` sont explicitement listés.
- Placeholder `blur` ou couleur dominante pour les images principales.

## Contrôles automatiques

### En CI

- Lint des SVG (SVGO passe sans modifier si asset déjà optimisé).
- Lint des licences : script qui vérifie que tout fichier dans les dossiers
  d'assets a une entrée dans le fichier `LICENSES`.
- Budget de taille : un `assets-budget.json` déclare les tailles max par
  catégorie. Échec en CI si dépassé.

Exemple de budget :

```json
{
  "packages/ui/src/assets/**/*.svg": "10KB",
  "apps/dashboard/public/favicons/*.png": "20KB",
  "apps/dashboard/public/og-image.png": "200KB"
}
```

### En revue

Checklist rapide :

- Asset nécessaire ou redondant avec un existant ?
- Format moderne ?
- Optimisé ?
- Licence documentée ?
- Alt / aria approprié dans l'usage ?

## Suppression

Un asset retiré de son usage est supprimé du repo dans la même PR. Pas de
cadavres dans `public/` ou `src/assets/`. Un script `scripts/find-unused-assets.ts`
scanne périodiquement les références pour détecter les orphelins.
