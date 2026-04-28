# Guide d'utilisation de Varde

Ce guide est pour vous si vous êtes l'administrateur ou la
modératrice d'un serveur Discord et que vous venez d'installer
Varde (ou que quelqu'un l'a installé pour vous). Il couvre tout
ce qu'on fait depuis le **tableau de bord web**, sans avoir à
ouvrir un terminal.

> 🛠️ Si vous cherchez plutôt à **installer** Varde sur votre
> machine, voyez [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## 📋 Sommaire

1. [Première connexion](#première-connexion)
2. [Vue d'ensemble du dashboard](#vue-densemble-du-dashboard)
3. [Configurer votre serveur en quelques minutes (onboarding)](#configurer-votre-serveur-en-quelques-minutes-onboarding)
4. [Les modules officiels, un par un](#les-modules-officiels-un-par-un)
5. [Le journal d'audit](#le-journal-daudit)
6. [Permissions : qui peut faire quoi](#permissions--qui-peut-faire-quoi)
7. [Brancher une IA (facultatif)](#brancher-une-ia-facultatif)
8. [Pièges fréquents et comment s'en sortir](#pièges-fréquents-et-comment-sen-sortir)

---

## Première connexion

1. Ouvrez l'URL de votre instance Varde dans un navigateur
   (par exemple `https://varde.votre-domaine.com`).
2. Cliquez sur **« Se connecter avec Discord »**.
3. Discord vous demande d'autoriser l'application — acceptez.
4. Vous êtes redirigé vers le **sélecteur de serveur** : la liste
   de tous les serveurs Discord où vous êtes administrateur **et**
   où Varde est déjà invité.

> ❓ **Aucun serveur dans la liste ?** Soit vous n'avez pas la
> permission « Gérer le serveur » sur votre serveur Discord (Varde
> n'affiche que ceux que vous pouvez vraiment piloter), soit le
> bot n'a pas encore été invité dessus. La procédure d'invitation
> est dans [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## Vue d'ensemble du dashboard

Une fois sur la page d'un serveur, vous trouvez :

| Zone | À quoi ça sert |
| --- | --- |
| 📋 **Sidebar à gauche** | Navigation entre les modules et les pages globales (audit, paramètres, permissions). |
| 🏠 **Page d'accueil** | Récapitulatif rapide du serveur et accès aux modules. |
| 🧩 **Une page par module** | Configuration détaillée du module concerné. Chaque module a sa propre interface. |
| 🪪 **Identité en haut à droite** | Votre avatar Discord, et le bouton de déconnexion. |

Tout se sauvegarde **après confirmation explicite**. Vous pouvez
modifier des champs sans crainte : tant que vous n'avez pas
cliqué sur « Enregistrer », rien ne change réellement.

---

## Configurer votre serveur en quelques minutes (onboarding)

C'est le moyen le plus rapide pour démarrer un serveur prêt à
l'emploi : rôles, salons, modules, le tout en une seule session
guidée.

### Étape 1 — Choisir un point de départ

Cinq **presets** prêts à l'emploi sont fournis :

| Preset | Pour qui | Ce qu'il met en place |
| --- | --- | --- |
| 🚀 **Starter générique** | Petit serveur, communauté quelconque | Rôles minimaux, salons d'accueil, modération basique. |
| 🛠️ **Tech / Dev** | Communauté technique | Rôles par stack, salons par sujet, automod adapté aux liens. |
| 🎮 **Gaming** | Communauté de joueurs | Rôles par jeu, salons vocaux, automod tolérant aux majuscules. |
| 🎨 **Créatif** | Artistes, écrivains, vidéastes | Galeries dédiées, salons par discipline, accueil élaboré. |
| 📚 **Étude / éducation** | Cours, tutorat, groupes d'étude | Salons par matière, modération stricte, accueil avec règles. |

Vous choisissez le plus proche de votre besoin — vous pourrez tout
ajuster ensuite.

### Étape 2 — Prévisualiser

Le dashboard affiche **la liste de tout ce qui va être créé ou
modifié** : les rôles, les salons, les modules à activer, leurs
paramètres initiaux. **Aucun changement n'a encore été fait sur
votre serveur Discord.**

Vous pouvez modifier librement la liste avant validation : ajouter
un salon, retirer un rôle, changer un nom.

### Étape 3 — Appliquer

Quand vous cliquez sur **Appliquer**, Varde exécute toutes les
actions sur votre serveur Discord, dans l'ordre. Si une action
échoue (souvent parce que Discord refuse une permission), Varde
**annule automatiquement** ce qu'il a déjà fait et vous explique
ce qui a coincé.

### Étape 4 — Le filet de sécurité (30 minutes)

Pendant 30 minutes après une application réussie, vous pouvez
**revenir en arrière** d'un clic. Varde supprime les rôles, les
salons et les configurations qu'il vient de poser. Au-delà de
30 minutes, vous gardez bien sûr la possibilité de tout supprimer
manuellement, mais il n'y a plus de bouton magique.

> 💾 **Tout est tracé.** Chaque action posée par l'onboarding
> apparaît dans le **journal d'audit** (voir plus bas) avec qui,
> quand, et quoi.

---

## Les modules officiels, un par un

Cinq modules sont livrés avec Varde. Chacun a sa propre page de
configuration.

### 👋 Welcome — accueil et départs

Pour souhaiter la bienvenue à un nouveau membre et signaler les
départs.

| Réglage | Ce que ça change |
| --- | --- |
| **Salon d'accueil** | Le salon où le message de bienvenue est posté. Vide → message en DM seulement. |
| **Carte d'avatar** | Image 700×250 pixels générée automatiquement avec l'avatar du membre, son pseudo, le compteur de membres. |
| **Couleur ou image de fond** | La carte peut avoir un fond uni ou une image que vous uploadez. |
| **Auto-rôle** | Donne automatiquement un ou plusieurs rôles au nouveau membre. Délai configurable (immédiat, 1 min, 1 h, 24 h…). |
| **Filtre comptes neufs** | Bloque ou met en quarantaine les comptes Discord créés il y a moins de N jours. |

Les **boutons « Tester »** vous permettent de prévisualiser le
message d'accueil avec votre propre profil avant de l'activer.

> 📷 **Carte d'avatar : polices personnalisées.** Vous pouvez
> uploader vos propres polices (`.ttf`, `.otf`) dans le dossier
> `uploads/fonts/` de l'instance, elles apparaîtront dans la
> liste déroulante.

### 🎭 Reaction-roles — distribution de rôles

Pour qu'un membre récupère un rôle en cliquant sur une réaction
ou un bouton.

Trois modes possibles, choisis par message :

| Mode | Comportement |
| --- | --- |
| **Normal** | Cliquer ajoute le rôle, recliquer le retire. Plusieurs rôles peuvent être pris en même temps. |
| **Unique** | Un seul rôle parmi plusieurs (ex. couleur de pseudo). Cliquer sur un autre swap automatiquement. |
| **Vérificateur** | Pensé pour la validation de règles : cliquer ajoute le rôle, recliquer le retire aussi. |

Vous pouvez **mélanger réactions emoji et boutons Discord** sur le
même message, et utiliser les emojis personnalisés de votre
serveur ou ceux d'autres serveurs (les utilisateurs avec Discord
Nitro pourront les voir). Six modèles prêts à l'emploi sont
fournis : règles, couleurs, continents, notifications, zodiaque,
vanille.

### 🛡️ Moderation — outils de modération

Deux pans complémentaires.

**Slash-commands manuelles** — pour les modérateurs humains :

| Commande | Action |
| --- | --- |
| `/warn` | Avertir un membre, raison obligatoire. |
| `/mute`, `/tempmute` | Couper la voix / le chat (permanent ou temporaire). |
| `/kick`, `/ban`, `/tempban`, `/unban` | Sanctions classiques. |
| `/clear`, `/slowmode` | Modération de salon. |
| `/case`, `/infractions` | Consulter l'historique d'un membre. |

**Automod** — pour les filtres automatiques :

12 types de règles disponibles (mots interdits, regex, anti-flood,
liens externes, invitations Discord, majuscules excessives, emojis
en spam, mentions de masse, zalgo, classification IA…). Chaque
règle peut combiner plusieurs actions : supprimer le message,
avertir le membre, le mettre en mute. Vous pouvez exclure des
rôles (modérateurs) et restreindre certains salons à un type de
contenu (images uniquement, par exemple).

### 📜 Logs — qui fait quoi sur le serveur

Pour garder une trace publique des événements du serveur dans des
salons Discord dédiés.

Deux modes :

- **Mode simple** : un seul salon, vous cochez les types
  d'événements qui vous intéressent (membres, messages, rôles,
  salons…).
- **Mode avancé** : plusieurs « routes », chacune avec son salon
  et sa liste d'événements précise. Pratique pour séparer les
  logs de modération, les arrivées/départs, etc.

Si Discord refuse l'envoi (permissions manquantes, rate-limit), la
route est marquée comme « cassée » et **les événements sont mis en
attente** — vous corrigez la permission, vous cliquez sur
« Rejouer », et la file part.

### 🚀 Onboarding-presets — l'assistant de démarrage

C'est le module qui alimente l'assistant décrit plus haut. Vous
n'avez rien à configurer dessus directement : vous l'utilisez en
lançant l'onboarding depuis la page d'accueil de votre serveur.

---

## Le journal d'audit

**Tout ce qui change l'état de votre serveur via Varde est tracé.**
Le journal d'audit est consultable depuis la sidebar.

Chaque entrée affiche :

- 👤 **Acteur** — l'utilisateur ou le module qui a déclenché
  l'action.
- 🎯 **Cible** — l'utilisateur, le rôle ou le salon affecté
  (selon le cas).
- 🏷️ **Action** — un identifiant clair (`moderation.member.banned`,
  `welcome.config.updated`, `onboarding.session.applied`…).
- ⚠️ **Sévérité** — info, warn, error.
- 🕒 **Date** précise.
- 📦 **Détails** — métadonnées spécifiques à l'action (raison,
  durée, ancien et nouveau état…).

Vous pouvez filtrer par module, par sévérité, par utilisateur, par
plage de dates. C'est l'outil principal pour répondre à
« qu'est-ce qui s'est passé » quand quelque chose vous surprend.

---

## Permissions : qui peut faire quoi

Varde a **deux niveaux de permissions** :

### 1. Permissions Discord natives

Le bot respecte scrupuleusement les permissions Discord. Si vous
n'avez pas « Gérer le serveur » sur Discord, vous ne voyez même
pas le serveur dans le dashboard.

### 2. Permissions applicatives (internes à Varde)

Chaque module définit ses propres permissions, plus fines que
celles de Discord :

- `moderation.warn` — autoriser à donner un avertissement
- `moderation.ban` — autoriser à bannir
- `moderation.ban.permanent` — différencier le ban temporaire du
  permanent
- `logs.config.manage` — autoriser à modifier la config des logs
- … etc.

Sur la page **Paramètres → Permissions** vous mappez chaque
permission à un ou plusieurs **rôles Discord** de votre serveur :

> Le rôle `@Modérateur` peut faire `moderation.warn`,
> `moderation.kick`, `moderation.tempban`. Le rôle `@Admin` peut
> faire tout ça **plus** `moderation.ban.permanent` et
> `logs.config.manage`.

> 🔔 **Si une permission n'a aucun rôle lié**, un bandeau orange
> apparaît sur la page du module concerné. C'est un état normal
> juste après l'installation d'un module — il faut juste lier la
> permission au moins une fois.

---

## Brancher une IA (facultatif)

Varde peut s'appuyer sur un fournisseur d'IA pour proposer
intelligemment des configurations d'onboarding ou pour faire de
la classification de contenu en automod. **C'est totalement
facultatif** — sans IA configurée, Varde fonctionne en mode
règles déterministes.

Sur la page **Paramètres → IA**, deux options :

- **Ollama (local)** — vous avez un serveur Ollama qui tourne
  quelque part, vous renseignez son URL. Aucune donnée ne quitte
  votre infrastructure.
- **OpenAI-compatible** — n'importe quel backend qui parle le
  protocole OpenAI : OpenAI officiel, OpenRouter, Groq, vLLM,
  LM Studio, etc. Vous donnez l'URL de l'API et votre clé.

> 🔐 **Votre clé API est chiffrée** (AES-256-GCM) avant d'être
> stockée dans la base, avec une master key qui vit dans
> l'environnement de l'instance. Personne d'autre que l'instance
> Varde elle-même ne peut la déchiffrer.

> 🧠 **L'IA propose, vous disposez.** Aucune décision de
> modération ou d'application n'est jamais prise sans validation
> humaine explicite. Toute invocation IA est tracée dans l'audit.

---

## Pièges fréquents et comment s'en sortir

### Le bot ne réagit pas à mes messages

Vérifiez dans cet ordre :

1. **Le bot est-il en ligne ?** Cherchez son badge vert dans la
   liste des membres Discord.
2. **A-t-il les bonnes intents ?** Sur le Developer Portal Discord,
   « Server Members Intent » et « Message Content Intent » doivent
   être activés (voir [`DEPLOYMENT.md`](./DEPLOYMENT.md)).
3. **Est-il dans le bon salon ?** Vérifiez les permissions Discord
   du rôle du bot sur le salon concerné.

### Le bot dit « Permission insuffisante » alors qu'il est admin

Probablement un problème de **hiérarchie des rôles** Discord. Le
bot ne peut agir que sur des rôles **plus bas que le sien** dans la
liste hiérarchique du serveur. Dans Paramètres → Rôles de Discord,
remontez le rôle du bot au-dessus de tous les rôles qu'il doit
pouvoir manipuler.

### J'ai créé un rôle via l'onboarding mais il n'apparaît pas

Discord met parfois quelques secondes à propager les nouveaux
rôles. Si après une minute il n'est toujours pas là, vérifiez le
journal d'audit : une erreur de permission peut avoir provoqué un
rollback automatique.

### J'ai supprimé Varde du serveur, est-ce que ses données sont parties ?

Côté Discord, oui — rôles et salons posés par Varde sont sa
responsabilité tant qu'il est là, mais ils survivent à son départ
puisque ce sont des objets Discord normaux. Côté base de données
de l'instance Varde, **les données restent** (vous pouvez vouloir
réinviter le bot plus tard sans tout perdre). Pour purger :
contactez l'administrateur de l'instance.

### Une carte d'accueil ne s'affiche pas

Trois causes possibles :

1. La police choisie n'est pas installée côté serveur — basculez
   sur une police système (Inter, sans-serif…).
2. L'image de fond est trop grosse — Varde accepte 5 Mo max.
3. Le bot n'a pas la permission « Joindre des fichiers » dans le
   salon visé.

### Le mode automod a fait taire un faux positif

Tous les actes d'automod arrivent dans le **journal d'audit** avec
le détail (quelle règle a déclenché, quelle action a été prise).
Vous pouvez :

- Annuler le mute manuellement avec `/unmute`.
- Ajuster la règle qui a déclenché (seuil, mots-clés, exclusion
  de rôle).
- Ajouter le rôle du membre concerné aux **bypass roles** de la
  règle.

---

> 🆘 **Vous bloquez quelque part ?** Le journal d'audit est
> souvent la première chose à regarder — il vous dit qui a fait
> quoi, et quand. Si ça ne suffit pas, l'administrateur de
> l'instance peut consulter les logs techniques du bot pour
> investiguer plus en profondeur.
