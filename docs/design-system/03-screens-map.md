# 03 — Cartographie des écrans

Une fiche par écran clé. L'ordre suit le parcours utilisateur :
accueil → setup wizard → guild → administration. Les fiches
décrivent l'**intention**, pas l'implémentation.

Légende des champs :

- *Route* : chemin dans l'app actuelle (ou *proposé*).
- *Intention primaire* : verbe d'action en tête, une phrase.
- *Densité* : aérée | moyenne | dense.
- *Mascotte* : présence justifiée (cf. `04-mascot-usage.md`).

---

## A. Accueil — connexion

### Page d'accueil sur `/` non-authentifié

Cette fiche fusionne l'ancienne "Landing publique" et l'ancien
"Login". Décision tracée dans `decisions.md` D-09.

- **Route** : `/` quand non-authentifié. Le visiteur authentifié
  qui arrive sur `/` part vers la sélection de guilde (cf. fiche B)
  ou directement sur sa guilde unique.
- **Intention primaire** : démarrer la connexion Discord pour
  utiliser ou installer Varde sur cette instance.
- **Intentions secondaires** :
  1. Comprendre en une phrase ce que fait Varde (positionnement
     court, pas marketing complet).
  2. Atteindre la documentation depuis l'accueil — lien externe
     vers le repo GitHub en attendant la doc embarquée
     (cf. décision D-10).
  3. Vérifier qu'on est sur la bonne instance (mention discrète
     d'URL et version dans le pied de carte).
- **Action principale** : bouton primaire "Se connecter avec
  Discord", full-width sur `--container-narrow`. CTA secondaire
  textuel "Voir la documentation" → lien GitHub (target `_blank`,
  `rel="noopener noreferrer"`).
- **Densité** : aérée. Carte centrée dans le viewport, fond
  `--bg-page`. Pas de hero pleine largeur, pas de feature grid,
  pas de footer marketing.
- **État vide** : sans objet (la page est toujours rendue à
  l'identique pour un visiteur non-auth).
- **États d'erreur** : OAuth refusé ou échec callback → bandeau
  danger persistant en haut de carte, copy actionnable
  ("Réessayer" + lien vers la doc d'auth).
- **Mascotte présente** : oui, posture *content* — taille réduite
  (96–128 px), au-dessus du titre. Test des 3 questions validé :
  humanise un écran technique, signale qu'on est arrivé "chez Varde"
  et pas sur un panneau de connexion générique.
- **Composants critiques** :
  - Card centrée (`--container-narrow`).
  - Mascotte / placeholder Compass.
  - Titre `--text-2xl` (ex. "Bienvenue sur Varde").
  - Microcopy de positionnement en `--text-base` (1 à 2 phrases —
    ex. "Plateforme d'extensions Discord, auto-hébergée et
    transparente. Connectez-vous pour configurer ou installer le
    bot sur cette instance.").
  - Button primaire "Se connecter avec Discord".
  - Lien secondaire "Voir la documentation" en `--text-sm`.
  - Mention discrète d'URL d'instance et version en
    `--text-caption` au pied de carte.
- **Risques UX** :
  - Tomber dans le marketing complet (hero, feature grid, captures).
    Garde-fou : la page reste une carte centrée.
  - Lien doc qui pointe vers une 404 si l'URL GitHub change.
    Garde-fou : centraliser la valeur dans une variable
    d'environnement ou une constante typée — pas de hardcode dans
    le JSX.
  - Microcopy générique ("Connectez-vous pour continuer"). Garde-fou :
    une phrase qui dit ce que **cette instance** propose, pas une
    phrase de SaaS interchangeable.

---

## B. Sélection de guilde

### Sélection guilde (post-login, multi-guildes)

- **Route** : `/` après auth, quand le compte gère ≥ 2 guildes.
- **Intention primaire** : choisir la guilde sur laquelle travailler
  aujourd'hui.
- **Intentions secondaires** :
  1. Distinguer les guildes où Varde est installé / non installé.
  2. Inviter Varde sur une guilde où il manque.
- **Action principale** : carte cliquable de la guilde (full surface,
  pas un sous-bouton). CTA secondaire "Inviter sur d'autres serveurs".
- **Densité** : moyenne. Grille responsive 1/2/3 colonnes.
- **État vide** : 0 guildes → grand bloc "Inviter Varde" centré, lien
  OAuth Discord, mascotte *perdu*. Reprend le pattern
  `RouterRefreshOnFocus` actuel pour auto-redirect.
- **États d'erreur** : token Discord expiré → forcer reconnexion ;
  rate-limit → toast info + retry après délai.
- **Mascotte présente** : oui — uniquement dans l'état vide. Absente
  des cartes de guilde (serait du décor répété).
- **Composants critiques** : GuildCard (icône, nom, badge installé /
  à inviter, member count), EmptyState avec CTA OAuth.
- **Risques UX** : l'admin avec 30 guildes scrolle. Prévoir un
  filtre rapide "Recherche" en haut de grille si > 10 guildes.

---

## C. Setup wizard

Sept étapes existent dans `apps/dashboard/app/setup/`. La refonte
visuelle ne change pas le découpage logique mais durcit la hiérarchie
typographique et standardise le stepper.

### Setup — Welcome

- **Route** : `/setup`.
- **Intention primaire** : expliquer en 20 s ce qui va être configuré.
- **Action principale** : "Commencer".
- **Densité** : aérée. Conteneur `--container-narrow`.
- **Mascotte** : oui, posture *neutre* dans le visuel d'intro.
- **Risques UX** : la liste des 6 étapes à venir doit être visible
  d'entrée — pas de surprise ultérieure.

### Setup — System check

- **Route** : `/setup/system-check`.
- **Intention primaire** : vérifier que l'environnement est OK
  (DB joignable, Redis en option, secret de session).
- **Action principale** : "Continuer" (désactivé tant qu'un check
  est rouge).
- **Densité** : moyenne. Liste de checks avec icône statut.
- **État d'erreur** : check rouge → bloc danger inline avec doc
  contextuelle (ex. "DB unreachable → vérifie `DATABASE_URL`").
- **Mascotte** : non. Écran technique, la mascotte distrairait.

### Setup — Discord app

- **Route** : `/setup/discord-app`.
- **Intention primaire** : saisir App ID + Public Key et auto-valider.
- **Action principale** : Continuer (apparaît après auto-validation
  réussie).
- **Densité** : moyenne. Deux champs avec format check inline + bandeau
  succès / erreur.
- **État d'erreur** : `discord_app_not_found` → bandeau danger persistant.
- **Mascotte** : non.

### Setup — Bot token

- **Route** : `/setup/bot-token`.
- **Intention primaire** : saisir le token bot, le valider, le
  chiffrer en DB.
- **Action principale** : Continuer (auto-activé après validation).
- **Densité** : moyenne. Champ secret avec masquage par défaut + bouton
  "Afficher".
- **État d'erreur** : token invalide → message clair, doc lien (où
  trouver le token Discord Dev Portal).
- **Mascotte** : non. Écran sensible (secrets), focus maximum.

### Setup — OAuth

- **Route** : `/setup/oauth`.
- **Intention primaire** : configurer Client ID / Client Secret
  Discord pour l'auth dashboard.
- **Action principale** : Continuer (auto-activé).
- **Densité** : moyenne.
- **Mascotte** : non.

### Setup — Identity

- **Route** : `/setup/identity`.
- **Intention primaire** : nommer le bot, charger avatar et bannière.
- **Action principale** : Continuer (présent dès qu'un nom est
  validé).
- **Densité** : moyenne. Aperçu Discord-like à droite, formulaire à
  gauche.
- **État d'erreur** : upload trop lourd → message inline avec taille.
- **Mascotte** : non. La preview Discord du bot tient le rôle visuel.

### Setup — Summary

- **Route** : `/setup/summary`.
- **Intention primaire** : valider l'ensemble et finaliser.
- **Action principale** : "Terminer le setup".
- **Densité** : moyenne.
- **Mascotte** : oui, posture *fier* — moment de complétion légitime.
- **Risques UX** : ne pas singer un confetti ; la mascotte fière
  suffit.

---

## D. Dashboard guilde

### Vue d'ensemble guilde

- **Route** : `/guilds/[guildId]`.
- **Intention primaire** : voir d'un coup d'œil ce qui demande
  attention sur ce serveur.
- **Intentions secondaires** :
  1. Sauter directement vers un module configuré récemment.
  2. Activer un module essentiel non encore activé.
  3. Atteindre les logs / l'audit en un clic.
- **Action principale** : carte "Modules épinglés" (raccourcis
  cliquables) si ≥ 1 épingle ; sinon "Démarrage rapide".
- **Densité** : moyenne. Grille de cartes 1/2/3 colonnes.
- **État vide** : aucun module activé → "Démarrage rapide" dominant,
  cartes horizontales avec CTA "Configurer".
- **États d'erreur** : guild devenue inaccessible → page d'erreur
  guidée (ré-inviter le bot).
- **Mascotte** : oui, **uniquement** dans l'état vide majeur (0
  modules), posture *neutre* — invite à la première configuration.
  Absente sinon.
- **Composants critiques** : OverviewBanner (icône serveur + nom +
  membres + statut bot), CardModulesPinned, CardRecentChanges,
  CardActivity24h, QuickStartSection.
- **Risques UX** : devenir un panneau de stats — interdit. Toute
  carte doit déboucher sur une action en un clic.

### Liste des modules

- **Route** : `/guilds/[guildId]/modules` (*écran proposé*, page
  actuelle redirige vers les modules un par un).
- **Intention primaire** : trouver et activer / configurer / épingler
  un module.
- **Intentions secondaires** :
  1. Filtrer entre actifs / inactifs.
  2. Recherche rapide par nom.
- **Action principale** : carte du module → click hors zone toggle/pin
  ouvre la page de config.
- **Densité** : moyenne. Grille 1/2/3 colonnes.
- **État vide** : 0 modules installés (cas extrême self-host) →
  empty state explicatif vers `MODULE-AUTHORING.md`.
- **États d'erreur** : recherche sans résultat → "Aucun module ne
  correspond à `{query}`. Essayer un autre mot-clé."
- **Mascotte** : non. La grille parle d'elle-même. Empty state extrême
  peut accueillir mascotte *perdu*.
- **Composants critiques** : ModuleCard (icon, nom, badges
  Actif/Inactif/Configuré, toggle, pin), FilterBar (recherche +
  filtre), Grid responsive.
- **Risques UX** : la recherche doit avoir une latence ressentie
  < 100 ms. Pas de spinner pour 50 modules — filtrage local.

### Configuration d'un module

- **Route** : `/guilds/[guildId]/modules/[moduleId]`.
- **Intention primaire** : modifier la config et sauvegarder.
- **Intentions secondaires** :
  1. Comprendre l'effet d'un champ via l'aperçu.
  2. Activer / désactiver le module.
  3. Épingler / désépingler.
- **Action principale** : Sticky save bar en bas — visible dès
  qu'une modification est saisie.
- **Densité** : dense côté formulaire ; aérée côté aperçu.
- **État vide** : module nouvellement activé → formulaire avec
  valeurs par défaut + hint "Configurer ces champs pour activer
  pleinement".
- **États d'erreur** : validation Zod échouée → erreur inline sous
  le champ + scroll vers le premier champ en erreur.
- **Mascotte** : non. Écran utilitaire intense.
- **Composants critiques** : Header (breadcrumb, titre, icône, toggle,
  pin, doc), Form (généré depuis `configUi`), PreviewPanel (optionnel),
  StickySaveBar.
- **Risques UX** : l'admin perd ses modifs en quittant — la sticky
  save bar doit afficher "N modifications non sauvegardées" et un
  prompt avant navigation.

### Audit log

- **Route** : `/guilds/[guildId]/audit`.
- **Intention primaire** : retrouver une action passée.
- **Intentions secondaires** :
  1. Filtrer par auteur / module / type.
  2. Voir le diff before/after sur une modif de canal/rôle.
- **Action principale** : entrée d'audit cliquable → ouvre Drawer
  détail.
- **Densité** : dense. Liste verticale paginée.
- **État vide** : aucun événement → "Aucune action loggée pour le
  moment." Mascotte *neutre* tolérée si l'écran est récent.
- **États d'erreur** : filtre sans résultat → "Aucune entrée pour
  ces critères. Réinitialiser les filtres."
- **Mascotte** : non en usage normal.
- **Composants critiques** : AuditRow, FilterBar, Drawer detail,
  Pagination.
- **Risques UX** : volumétrie. Pagination serveur, pas de scroll
  infini (perte de contexte).

### Permissions / rôles

- **Route** : `/guilds/[guildId]/permissions`.
- **Intention primaire** : gérer qui peut faire quoi sur ce serveur.
- **Intentions secondaires** :
  1. Voir la liste des admins effectifs.
  2. Élever / révoquer un rôle.
- **Action principale** : ligne admin → menu contextuel (élever /
  révoquer).
- **Densité** : moyenne.
- **État vide** : un seul propriétaire → bandeau info "Vous êtes seul
  admin. Inviter un co-admin ?"
- **États d'erreur** : conflit (révoquer le dernier owner) → bloc
  danger inline avec confirmation explicite.
- **Mascotte** : non.
- **Composants critiques** : RolesTable, RoleRow, ConfirmDialog,
  AddAdminPanel.
- **Risques UX** : un clic ne doit jamais entraîner une perte de
  privilège accidentelle. Toute révocation passe par confirmation.

### Paramètres globaux de la guilde

- **Route** : `/guilds/[guildId]/settings` (+ sous-pages
  `bot`, `ai`, `permissions`).
- **Intention primaire** : ajuster les réglages transverses (langue,
  fuseau, salons par défaut).
- **Densité** : moyenne. Sections empilées avec sous-titres.
- **Mascotte** : non.
- **Risques UX** : éviter le syndrome "page paramètres fourre-tout".
  Si une section dépasse 5 champs, la déplacer en sous-page.

---

## E. Administration de l'instance (self-host)

### Page admin instance

- **Route** : `/admin`.
- **Intention primaire** : voir l'état global de l'instance (DB, bot,
  uptime, version) et accéder aux sections admin.
- **Intentions secondaires** :
  1. Sauter vers `Identity` / `URLs` / `Discord credentials` /
     `Ownership`.
  2. Repérer un avertissement (DB pleine, version périmée).
- **Action principale** : carte de la section (Identity, URLs, etc.)
  cliquable.
- **Densité** : moyenne.
- **État vide** : sans objet (toujours quelque chose à montrer).
- **États d'erreur** : DB inaccessible → bandeau danger pleine largeur,
  CTA "Voir le diagnostic".
- **Mascotte** : non. Vue technique d'instance.
- **Composants critiques** : OverviewBanner (instance), AdminSectionCard,
  StatusList (DB / bot / Redis).
- **Risques UX** : ne pas afficher trop de chiffres — l'admin
  d'instance n'est pas un SRE qui surveille. L'écran sert d'aiguillage.

### Admin — Identity / URLs / Discord / Ownership

- **Routes** : `/admin/identity`, `/admin/urls`, `/admin/discord`,
  `/admin/ownership`.
- **Intention primaire** : configurer un bloc précis (nom du bot, URL
  publique, credentials chiffrés, propriété de l'instance).
- **Densité** : moyenne. Pattern uniforme : header de page + formulaire
  avec sticky save bar (mêmes règles que config module).
- **Mascotte** : non.
- **Risques UX** : l'écran Discord credentials manipule des secrets —
  même règle que `setup/bot-token` (masquage par défaut).

---

## F. Documentation embarquée / aide contextuelle

### Aide contextuelle (proposée)

- **Route** : *écran proposé, à valider* — pas de page dédiée
  actuellement. Hypothèse : Drawer global ouvert via icône `?` du
  header.
- **Intention primaire** : trouver l'aide d'un champ / module sans
  quitter le contexte.
- **Intentions secondaires** :
  1. Lire la doc complète (lien externe vers `/docs`).
  2. Voir un exemple type pour la situation actuelle.
- **Action principale** : Drawer s'ouvre par-dessus le contenu, pré-rempli
  avec le sujet du champ focus.
- **Densité** : moyenne.
- **État vide** : sans objet (toujours un sujet par défaut).
- **États d'erreur** : article introuvable → "Pas encore de doc pour
  ce sujet. Ouvrir une issue ?"
- **Mascotte** : oui, posture *neutre* dans l'en-tête du Drawer —
  identifie l'aide comme un "guide" plutôt qu'un "manuel". Test des 3
  questions validé.
- **Composants critiques** : Drawer (déjà dans `@varde/ui`),
  ContextResolver (champ focus → article), Liens externes.
- **Risques UX** : une aide qui pousse trop fort vers l'externe perd
  l'utilisateur. Le Drawer doit suffire à 80 % des cas.

---

## G. Erreurs et états transverses

### 404 / 403 / 500

- **Route** : `app/not-found.tsx` (existant), `app/error.tsx`
  (*proposé*).
- **Intention primaire** : aider à se rattraper au lieu de juste
  signaler la panne.
- **Action principale** : "Retour à l'accueil" + "Voir la doc". Sur
  500 : "Réessayer" + lien issues GitHub.
- **Densité** : aérée. Conteneur `--container-narrow`.
- **Mascotte** : oui, posture *perdu* sur 404, *surpris* sur 500.
  Posture *neutre* sur 403. Test des 3 questions validé : la
  mascotte humanise l'échec sans en faire une fête.
- **Risques UX** : tomber dans le mème "404 not found, oh no!". Copy
  travaillée, pas générique.

---

## H. Récapitulatif densités

| Écran                              | Densité  | Justification                                  |
|------------------------------------|----------|------------------------------------------------|
| Accueil — connexion                | aérée    | Carte centrée, une intention primaire          |
| Sélection guilde                   | moyenne  | Grille de choix                                |
| Setup wizard (toutes étapes)       | moyenne  | Une étape = un focus                           |
| Vue d'ensemble guilde              | moyenne  | Aiguillage, pas exploration                    |
| Liste modules                      | moyenne  | Grille de choix avec actions inline            |
| Config module                      | dense    | Champs nombreux, scrollable                    |
| Audit log                          | dense    | Volumétrie, scan vertical                      |
| Permissions                        | moyenne  | Décisions critiques, espace pour confirmation  |
| Paramètres globaux                 | moyenne  | Sections empilées                              |
| Admin instance                     | moyenne  | Aiguillage entre sections admin                |
| Admin sous-sections                | moyenne  | Formulaires courts                             |
| Aide contextuelle (Drawer)         | moyenne  | Lecture d'article courte                       |
| 404 / 500 / 403                    | aérée    | Pas de bruit, l'erreur est l'objet             |
