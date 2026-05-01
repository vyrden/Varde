# 06 — Anti-patterns

Liste opérationnelle. Chaque entrée formulée à l'impératif négatif et
suivie d'une explication courte. Si une PR contredit l'un de ces
points, elle est revue avant merge ; l'exception passe par
`decisions.md`.

## Visuel

### 1. Pas de gradient générique en arrière-plan

Les gradients radial-purple ou diagonal-blue qu'on voit partout en
2025 ("hero AI-startup") n'apportent ni hiérarchie ni profondeur. Les
seuls gradients autorisés sont sémantiques : sur le CTA primaire iris
et sur la mascotte si elle utilise un effet de stratification. Aucun
fond de page, aucun fond de section ne reçoit de gradient décoratif.

### 2. Pas de glassmorphism systématique

Le `backdrop-filter: blur()` flou-derrière-translucide se justifie
uniquement quand le fond contient une information utile à laisser
deviner (par ex. derrière un drawer qui glisse). En dehors de ce cas
précis, c'est un coût GPU pour une esthétique de mode.

### 3. Pas de skeleton générique en lieu et place d'un état vide

Un skeleton signale "ça arrive". Un état vide signale "il n'y a rien
à montrer". Les confondre génère de l'attente injustifiée et perd
l'utilisateur. Skeleton uniquement pendant un chargement réel
documenté.

### 4. Pas de mélange d'icônes de familles différentes

Une seule famille d'icônes par projet (Lucide actuellement). Mélanger
Lucide + Heroicons + Material Symbols crée des incohérences de
graisse et de proportion qu'on remarque sans savoir pourquoi.
Exception unique : icônes de marque officielles (logo Discord,
GitHub) où le pictogramme est l'identifiant.

### 5. Pas de couleur sémantique pour décorer

`success` est vert parce qu'il porte le sens "ça a marché". Si une
icône informative est verte sans rapport avec un succès, on triche
sur le canal sémantique et on l'épuise. Les couleurs sémantiques ne
servent **que** leur sémantique.

### 6. Pas d'accent inventé hors palette

La couleur primaire est `iris-500`. Si un composant a besoin d'une
"autre couleur d'accent pour faire chic", c'est une erreur de design.
On utilise iris, on utilise une sémantique, ou rien.

### 7. Pas de drop shadow sur tout

L'élévation se mérite. Un Button au repos n'a pas de shadow ; il en
gagne une au hover si l'élévation hover est documentée. Empiler des
ombres sur tous les composants aplatit visuellement la page.

## Layout et espacement

### 8. Pas d'espacement uniforme sur toute la page

L'espacement est contextuel (cf. principe 2). Une page qui utilise
`gap-6` partout finit par être à la fois trop serrée pour les
sections marketing et trop lâche pour les listes denses.

### 9. Pas de scroll infini sur les listes critiques

Audit log, modules, permissions, paramètres : pagination explicite.
Le scroll infini fait perdre la position, casse la deep-link, et
empêche le clavier d'atteindre le pied de page. Acceptable uniquement
sur des feeds purement consultatifs (à ce jour : aucun dans Varde).

### 10. Pas de centrage horizontal des formulaires de configuration

Un formulaire de config de module aligné à gauche, contraint à
`--container-default`, lit mieux qu'un formulaire centré dans une
page large. Centrage réservé aux écrans accueil, login, wizard.

## Composants et interactions

### 11. Pas de modale pour ce qui peut être inline

Une modale interrompt et coûte un focus trap. Une confirmation de
suppression simple peut tenir en *inline confirm* sur la ligne
concernée (pattern déjà existant : `InlineConfirm`). Modale réservée
aux actions critiques (révoquer le dernier owner, par ex.).

### 12. Pas de tooltip pour expliquer ce qu'un libellé clair aurait dit

Un tooltip est une pirouette quand le label primaire est ambigu.
Avant d'ajouter un `?`, retravailler le libellé. Tooltip légitime :
informer d'une contrainte non évidente sur un champ déjà clair (ex.
"Doit faire 17 à 20 chiffres" sur App ID).

### 13. Pas de drag-and-drop sans alternative clavier

Tout drag-and-drop a un équivalent boutons "↑ Monter" / "↓ Descendre"
ou un menu de réorganisation accessible. Concerne en particulier la
sidebar épingles. Le DnD n'est pas un canal exclusif.

### 14. Pas de `confirm()` natif

Le dialogue système du navigateur ne s'intègre pas au design system,
ne supporte pas l'i18n, ne s'archive pas en audit. Toute confirmation
passe par `<ConfirmDialog />` ou `InlineConfirm`.

### 15. Pas de focus ring supprimé ou masqué

`outline: none` sans remplacement est un bug d'accessibilité, pas un
choix design. Le focus visible est obligatoire — on le **change**
(ring iris 2 px), on ne le **retire** jamais.

## Mascotte

### 16. Pas de mascotte décorative

Cf. `04-mascot-usage.md`. La mascotte n'apparaît que dans les cas
listés. Pas de mascotte en pied de page, pas en watermark.

## Performance

### 17. Pas d'animation sur des éléments larges

Animer `width` ou `height` d'un conteneur qui dépasse 240 px déclenche
un repaint coûteux. Préférer `transform: scale()` ou animer la
hauteur d'un wrapper interne plus petit.

### 18. Pas de polices via CDN externe au runtime

Les polices sont servies depuis l'origine (`next/font` self-hosting).
Pas de `<link>` Google Fonts, pas d'`@import url(...)` vers un CDN.
Cf. principe 7.

## Texte et microcopy

### 19. Pas de copy générique

"Une erreur est survenue", "Veuillez réessayer", "Bienvenue !" :
phrases vides. Microcopy travaillée, contextuelle, qui dit ce qui
s'est réellement passé et ce qu'on peut faire.

### 20. Pas d'anglicisme superflu

`token`, `dashboard`, `design system` restent — usage technique
établi. Pas de "leverager", "implémenter au mieux", "scaler", "pusher
en prod" dans les libellés UI ni dans la doc.
