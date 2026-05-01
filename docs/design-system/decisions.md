# Journal de décisions — refonte visuelle

Format ADR-léger. Une entrée par choix non évident. Chaque décision a
un statut (`Acceptée` | `À valider` | `Révisée` | `Rejetée`), un
contexte court, les options envisagées, la décision retenue, ses
conséquences.

L'objectif : qu'un revieweur six mois plus tard comprenne **pourquoi**
on a tranché, sans avoir à reconstituer le débat.

---

## D-01 — Pivot palette : marketing discord.com plutôt que client Discord

**Statut** : Acceptée.

**Date** : 2026-05-01.

**Contexte.** La DA actuelle (`docs/DA/DA.md`) a posé une direction
"natif client Discord" : palette exacte du client (`#1e1f22`,
`#2b2d31`, `#313338`), tricolonne avec rail à 64 px, focus sur la
familiarité immédiate. La refonte demandée pivote vers la
référence visuelle du **site marketing** discord.com — palette plus
neutre dite "ash", hiérarchie typographique imposante, compositions
asymétriques ancrées sur grille forte.

**Options envisagées.**

1. *Garder la palette client Discord à l'identique.*
   Pour : zéro risque sur la familiarité. Contre : ferme la porte au
   ton "marketing-quality dashboard for admins" demandé. Maintient le
   dashboard dans une esthétique de panneau de configuration alors
   que le brief vise un produit qui assume sa marque.

2. *Adopter la palette marketing discord.com à l'identique.*
   Pour : moins de friction, référence claire. Contre : pas de
   distinction de marque ; on ne peut pas pretender être Varde si on
   est indistinguable de discord.com.

3. *Dériver une palette ash propre, inspirée du marketing.* (retenue)
   Pour : assume une identité Varde tout en gardant la familiarité
   tonale. Permet de calibrer les paliers contre les fonds réels du
   dashboard plutôt que d'hériter de ceux d'une page marketing
   centrée.

**Décision.** Option 3. La palette `ash-*` posée dans `02-tokens.md` est
calibrée pour le dashboard (11 paliers), avec pour rôles abstraits
des mappings vers ces paliers. Le `paper-*` symétrique livre le mode
clair en parallèle.

**Conséquences.**

- `packages/ui/src/theme.css` est réécrit en PR 7.4 d'implémentation.
  Les tokens existants `--rail`, `--sidebar`, `--surface*` sont
  conservés en alias rétro-compatibles le temps de migrer les
  composants.
- `docs/DA/DA.md` reste la trace de la version 1 mais sera marquée
  `Statut: archivé` au moment de la PR d'implémentation. Aucun
  composant ne référence plus ses tokens à la fin du jalon 7.
- Audit de migration : chaque composant existant de `@varde/ui` est
  passé en revue pour vérifier qu'il consomme uniquement les rôles
  abstraits (`--bg-surface-2`, etc.), pas les paliers directs.

---

## D-02 — Couleur primaire `iris-500` = `#5b6cff`, dérivée du blurple

**Statut** : Acceptée.

**Date** : 2026-05-01 (validée 2026-05-02).

**Contexte.** Le brief demande une couleur primaire "dérivée du
blurple Discord mais distincte. Justifier le choix". Garder
`#5865F2` exact serait un copier-coller de la marque Discord ; en
inventer une totalement étrangère casserait la familiarité tonale.

**Options envisagées.**

1. *`#5865F2` (blurple exact).*
   ΔE2000 = 0. Trop proche, pas de distinction.
2. *`#5b6cff`.* (retenue)
   ΔE2000 ≈ 4.1 contre blurple. Saturation +6 %, luminance +2 %.
   Famille hue identique (~236°). Distinction perceptible à l'œil
   exercé, non agressive en juxtaposition.
3. *`#6c63ff` (violet plus marqué).*
   ΔE2000 ≈ 7.5. Distinction nette mais glisse hors du blurple, perd
   l'ancrage tonal Discord.
4. *`#4f5dee` (plus indigo, plus sobre).*
   ΔE2000 ≈ 5.8. Choix conservateur, mais ressemble à plein de
   primaires SaaS de 2024.

**Décision.** Option 2 : `#5b6cff`. Tracé dans `02-tokens.md` §2.
Validation utilisateur reçue le 2026-05-02. Un test visuel
côte-à-côte sur un écran type (ex. Accueil + CTA setup) reste
souhaitable au moment où la palette est appliquée — si l'œil
infirme à ce moment-là, ouvrir une révision (D-02 → `Révisée`),
ne pas modifier en silence.

**Conséquences.**

- La rampe `iris-100` à `iris-900` posée dans `02-tokens.md` est
  consolidée et utilisée telle quelle pour l'implémentation.
- Le focus ring iris (`--shadow-glow-iris`) calibré contre
  `iris-500` est consolidé en l'état.
- Si une révision tardive change `iris-500`, les paliers sont
  recalculés mécaniquement (lighten/darken) et le glow recalibré
  en même temps — pas de réécriture de spec.

---

## D-03 — Échelle typo : ratio 1.25 et 10 tailles

**Statut** : Acceptée.

**Date** : 2026-05-01.

**Contexte.** Le brief autorise 1.2, 1.25 ou 1.333. Le choix conditionne
le contraste perçu de la hiérarchie.

**Options envisagées.**

1. *Ratio 1.2 (Minor Third).*
   Plus calme, transitions douces entre tailles. Convient à de la
   doc longue. Manque de contraste pour des hero marketing où on
   veut un titre qui claque.
2. *Ratio 1.25 (Major Third).* (retenue)
   Sweet spot entre lisibilité et contraste. Donne une display
   `60 px` qui claque face à une `body 14 px` (ratio 4.3:1) sans
   cassure de progression. Standard chez Inter Display, Geist, et
   les systèmes inspirés de Material 3.
3. *Ratio 1.333 (Perfect Fourth).*
   Display agressive. Cohérent en marketing pur, mais trop fort en
   contexte dashboard (les titres sautent à la figure dans une page
   dense).

**Décision.** Ratio 1.25, dix tailles de `--text-caption` (11 px) à
`--text-display` (60 px). Détaillé en `02-tokens.md` §5.

**Conséquences.**

- L'échelle remplace l'échelle existante (`--font-size-xs` à
  `--font-size-3xl`, sept paliers). Migration : les composants
  utilisent déjà `text-xs`, `text-sm`, `text-base`, `text-lg`,
  `text-xl`, `text-2xl`, `text-3xl` qui restent stables. S'ajoutent
  `text-caption`, `text-4xl`, `text-display`.
- Les line-heights augmentent légèrement sur `--text-2xl` et
  `--text-3xl` pour respirer en display.

---

## D-04 — Typographie : Inter Display + Inter, abandon de Noto Sans

**Statut** : Acceptée.

**Date** : 2026-05-01 (validée 2026-05-02).

**Contexte.** Le dashboard utilise actuellement Noto Sans, choisi
comme substitut public à gg sans (la police propriétaire Discord).
Le brief de refonte vise un ton marketing avec typographie marquée.
Noto est neutre, manque de caractère en grandes tailles.

**Options envisagées.**

1. *Garder Noto Sans pour les deux usages.*
   Bundle minimal (déjà chargé). Caractère insuffisant pour les
   titres d'accueil et les hero d'états vides.
2. *Inter Display (display) + Inter (texte).* (retenue)
   Famille unique, deux variantes optiques. Couplage parfait, pas de
   friction de bascule. Open source SIL OFL, self-hostable via
   `next/font/google`. Bundle ≈ 80 KB woff2 sous-ensemble latin avec
   poids 400/500/600/700.
3. *Geist (Vercel) pour les deux.*
   Très moderne, bonne lisibilité. Marqué "stack JS / startup
   Vercel" — pas d'alignement avec une plateforme self-host
   communautaire. Identité empruntée plutôt qu'assumée.
4. *Ginto (display) + Inter (texte).*
   Ginto est la police marketing de discord.com. Licence
   commerciale, non distribuable hors d'un achat dédié. Recalé sur
   le principe self-host first.
5. *ABC Diatype (display) + Inter (texte).*
   Diatype est une police propriétaire vendue par ABC Dinamo.
   Excellente, mais incompatible avec self-host first sans achat
   licence runtime. Recalé.

**Décision.** Option 2 : Inter Display + Inter. Ce changement
remplace Noto Sans dans `apps/dashboard/app/layout.tsx`. Validation
utilisateur reçue le 2026-05-02.

**Conséquences.**

- `apps/dashboard/app/layout.tsx` : import de `Inter_Display` et
  `Inter` depuis `next/font/google`, exposition en variables
  `--font-inter-display` et `--font-inter`.
- `theme.css` met à jour `--font-display` et `--font-sans` en
  conséquence.
- Bundle police : ~80 KB sous-ensemble latin. Si le subset cyrillic
  / vietnamese est nécessaire pour l'i18n future, recalibrer à ce
  moment-là.
- Compatibilité offline garantie par `next/font` (les fichiers sont
  servis depuis l'origine du dashboard).

---

## D-05 — Stack motion : CSS-first, `motion` ajoutée à l'exception

**Statut** : Acceptée (avec ajout de dépendance différé).

**Date** : 2026-05-01.

**Contexte.** Le brief ouvre framer-motion ou alternative selon
besoin. La majorité des animations du dashboard tiennent en CSS pur
(catégories A et B, partie de C). Une bibliothèque JS n'est utile
que pour la transition de page (catégorie D) et les animations
narratives orchestrées (catégorie E).

**Options envisagées.**

1. *CSS uniquement, jamais de bibliothèque.*
   Plus pur, zéro coût bundle. Mais la transition de page
   Next.js App Router et l'orchestration narrative E sont
   péniblement implémentables en CSS pur (couplage démontage /
   montage React).
2. *framer-motion / motion, partout.*
   API uniforme, mais ~30 KB gzip pour des choses que CSS gère mieux
   (hover, focus). Sur-ingénierie.
3. *CSS-first, `motion` à l'exception.* (retenue)
   Hover, focus, toggle, accordéon, popover : CSS pur. Drawer avec
   gesture, transition de page D, narrative E : `motion`. Tree-shake
   à ~14 KB gzip si on n'importe que `motion.div` + `AnimatePresence`.

**Décision.** Option 3. Aucune dépendance ajoutée par ce cadrage.
L'ajout de `motion` au `package.json` est différé à la PR qui livre
la première animation D ou E. Tant qu'aucune animation D ou E n'est
livrée, la dépendance reste absente.

**Conséquences.**

- L'arbitrage se fait écran par écran lors de l'implémentation.
- Si plus de 80 % du jalon 7 ne nécessite pas D ou E (hypothèse
  raisonnable), `motion` n'entre pas dans la stack du jalon 7.
  L'ajout devient un sujet du moment où une page marketing future
  (sujet ouvert hors design system, cf. D-09) justifierait une
  narrative E.

---

## D-06 — Mode clair : tokens livrés, câblage différé en PR 7.4.9

**Statut** : Acceptée.

**Date** : 2026-05-01.

**Contexte.** Le brief demande `dark first, light second`. Le câblage
applicatif (sélecteur, persistance par utilisateur, provider
SSR-safe sans flash) est un sujet à part entière qui mérite sa PR.
Mais les tokens du mode clair doivent exister dès maintenant pour
que les composants ne fassent pas d'hypothèses dark-only.

**Options envisagées.**

1. *Pas de tokens light tant qu'on ne livre pas le câblage.*
   Risque : les composants câblent du dark en dur sans s'en
   apercevoir. Migration ultérieure douloureuse.
2. *Tokens light livrés dans cette spec, câblage en PR 7.4.9.* (retenue)
   Les composants lisent via `var(--bg-surface-1)` et compagnie ; le
   passage au mode clair est un simple override CSS via
   `[data-theme="light"]` à activer plus tard.
3. *Tokens + câblage simultanés dès la première PR d'implémentation.*
   Trop : la sélecteur de thème + provider SSR-safe ajoute du scope
   et retarde la livraison de tokens.

**Décision.** Option 2.

**Conséquences.**

- `02-tokens.md` documente les paliers `paper-*` complets.
- `theme.css` à l'implémentation pose le sélecteur
  `[data-theme="light"]` avec les overrides de tous les rôles
  abstraits.
- L'audit visuel pré-merge se fait en dark-only pour le jalon 7. Le
  light passe son audit propre en PR 7.4.9.

---

## D-07 — Mascotte : règles posées, asset différé

**Statut** : Acceptée.

**Date** : 2026-05-01.

**Contexte.** Le brief demande des règles d'usage de la mascotte.
Aucun asset graphique n'existe. La production de la mascotte
(illustrateur, 5 expressions, validation) est un sujet hors-design
system.

**Options envisagées.**

1. *Repousser le sujet mascotte au moment où l'asset est livré.*
   Risque : les écrans qui prévoient une mascotte (login, états
   vides, 404, summary wizard) doivent attendre. Sinon, on
   improvise et on se retrouve avec des positionnements
   incohérents quand l'asset arrive.
2. *Poser les règles maintenant, intégrer un placeholder.* (retenue)
   Les écrans concernés affichent un placeholder neutre (icône
   Lucide `Compass`) jusqu'à livraison de la mascotte. Quand
   l'asset arrive, l'intégration consiste à remplacer le placeholder
   sans bouger la composition.

**Décision.** Option 2. `04-mascot-usage.md` documente règles + tests
+ contraintes techniques + cahier des charges illustrateur.

**Conséquences.**

- Tâche dérivée à programmer au backlog : commande / production de
  l'asset mascotte (5 expressions SVG).
- Composant `<Mascot />` à créer en PR dédiée. Tant qu'il n'existe
  pas, les écrans concernés utilisent l'icône `Compass` Lucide avec
  un commentaire `TODO mascotte`.

---

## D-08 — Espacement : extension de l'échelle existante (4 px), pas refonte

**Statut** : Acceptée.

**Date** : 2026-05-01.

**Contexte.** Le brief autorise 4 px ou 8 px en base. L'existant est
en 4 px (cohérent avec Tailwind par défaut), `--space-1` à
`--space-12` posés en ADR 0012.

**Options envisagées.**

1. *Migrer vers une base 8 px.*
   Trop : casse l'alignement avec les utilitaires Tailwind par
   défaut, force une migration de tous les composants. Sans gain
   net.
2. *Garder la base 4 px, étendre.* (retenue)
   Ajoute des paliers `--space-0`, `--space-0-5`, `--space-1-5`,
   `--space-16`, `--space-24`. Total 14 paliers. Cohérence avec
   Tailwind préservée.

**Décision.** Option 2.

**Conséquences.**

- Migration légère : les composants existants ne changent rien. Les
  nouveaux paliers servent les besoins marketing (large) et fines
  ajustements (icône / label).

---

## D-09 — Page d'accueil sur `/` : connexion + porte vers la doc

**Statut** : Acceptée.

**Date** : 2026-05-02 (révisée).

**Contexte.** Le brief initial parlait de "landing publique". La
discussion a clarifié que cette demande mêlait deux questions
distinctes :

1. Quelle est la première page qu'un visiteur voit en arrivant sur
   `/` non-authentifié d'une instance Varde ?
2. Où vit la vitrine projet pour convaincre quelqu'un d'installer
   Varde ?

Sur un produit self-host, ces deux questions n'ont pas la même
cible. Le visiteur d'une instance est presque toujours un
mainteneur ou un co-admin invité — il vient pour se logger. Le
candidat à l'installation est sur GitHub ou un futur site dédié,
pas sur l'instance d'un inconnu.

**Options envisagées.**

A. *Redirect direct vers le flow de connexion.*
   Coût zéro. Mais l'écran ne dit rien — pas de positionnement, pas
   d'aide pour un visiteur qui hésite à se connecter.

B. *Accueil enrichi sur `/`.* (retenue)
   Une carte centrée avec : titre court de positionnement, bouton de
   connexion Discord OAuth en CTA primaire, lien discret vers la
   documentation (livré ultérieurement, lien externe vers le repo
   GitHub en intermédiaire). Une seule page, pas de marketing
   complet, juste assez pour humaniser et orienter.

C. *Landing marketing complète sur l'instance.*
   Hero, features, CTA "Installer chez moi". Incohérent avec le
   self-host : le visiteur de l'instance n'est pas une cible
   d'acquisition. Recalé.

D. *Site marketing séparé sur `varde.dev`.*
   Repo dédié, hosting, domaine. Hors scope V1 et hors design
   system. Reste un sujet projet ouvert, indépendant de cette
   décision.

**Décision.** Option B. Une page d'accueil simple sur `/` non-auth
qui sert deux intentions : démarrer la connexion (intention
primaire) et donner accès à la documentation (intention secondaire,
via lien vers GitHub en attendant la doc embarquée — cf. D-10).

**Conséquences.**

- `03-screens-map.md` : la section "Landing publique" disparaît.
  La section "Login Discord OAuth" est renommée en
  **"Accueil — connexion"** et enrichie : lien doc en intention
  secondaire, microcopy de positionnement (1 à 2 phrases) au-dessus
  du CTA primaire.
- `04-mascot-usage.md` : l'entrée "Hero de la landing publique"
  est retirée. L'entrée "Login Discord OAuth" est renommée
  "Accueil / connexion (page `/`)" et garde la posture *content*.
- Implémentation : pour le jalon 7, le lien doc pointe vers le
  repo GitHub (`https://github.com/...`, à confirmer URL exacte).
  Bascule vers la doc embarquée quand celle-ci sera livrée
  (D-10 si validée).
- Pas de page marketing complète à concevoir, pas de captures, pas
  de hero pleine largeur. Une carte centrée sur
  `--container-narrow`.
- La question d'un éventuel `varde.dev` reste ouverte mais
  indépendante : décision projet, pas décision design system.

---

## D-10 — Aide contextuelle (Drawer) : principe acté, livraison post-jalon 7

**Statut** : Acceptée.

**Date** : 2026-05-01 (validée 2026-05-02).

**Contexte.** Le brief liste "Documentation embarquée / aide
contextuelle" dans les écrans à couvrir. Aujourd'hui, l'aide vit
dans `docs/USER-GUIDE.md` côté repo. Pas de Drawer en app.

**Options envisagées.**

1. *Renvoyer vers la doc Markdown servie séparément.*
   Trop de contexte perdu : l'admin sort du dashboard.
2. *Drawer global accessible via icône `?` du header.* (retenue)
   Reste in-app, contextuel par sujet (champ focus → article).
   Drawer existe déjà dans `@varde/ui`.

**Décision.** Option 2. Le travail est non négligeable (résolveur
champ → article, contenu Markdown rendu inline) et n'entre pas dans
le scope du jalon 7 ; il est programmé en post-jalon dédié.

**Conséquences.**

- La fiche F de `03-screens-map.md` reste comme cible de design.
- En attendant la livraison du Drawer, le lien "Voir la
  documentation" de la page d'accueil (cf. D-09) pointe vers le repo
  GitHub. La bascule vers le Drawer interne se fait quand il est
  livré.

---

## D-11 — DA.md : archivé, non supprimé

**Statut** : Acceptée.

**Date** : 2026-05-01.

**Contexte.** `docs/DA/DA.md` porte la direction artistique V1
(natif client Discord). Cette refonte la remplace. La supprimer
fait disparaître les justifications historiques ; la garder sans
marquer son statut crée de l'ambiguïté pour les futurs lecteurs.

**Options envisagées.**

1. *Supprimer `DA.md` et ses fichiers HTML wireframes.*
   Perte de mémoire produit. Recalé.
2. *Marquer `DA.md` comme `Statut: archivé`, pointer vers ce
   dossier.* (retenue)
3. *Réécrire `DA.md` pour qu'il reflète la nouvelle direction.*
   Confus : ce dossier devient la nouvelle référence. Dupliquer
   l'information répartie sur deux endroits invite la dérive.

**Décision.** Option 2. Le marquage se fait au moment de la PR
d'implémentation, pas pendant ce cadrage (qui n'écrit que dans
`docs/design-system/`).

**Conséquences.**

- À l'implémentation : ajouter un en-tête `> Statut: archivé.
  Référence active : docs/design-system/00-index.md` au début de
  `docs/DA/DA.md`. Les fichiers HTML wireframes restent comme
  trace historique.
