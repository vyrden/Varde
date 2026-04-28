# Roadmap

Vue d'ensemble des jalons de développement. Chaque jalon a un objectif
unique, un critère de sortie vérifiable, et est livré avant d'attaquer
le suivant.

## Vue synthétique

| # | Jalon | Statut | Livré le |
| :---: | --- | :---: | :---: |
| 0 | Fondations (monorepo, CI, stack en place) | ✅ Livré | 2026-04-20 |
| 1 | Cœur minimum viable (loader modules, événements, audit, permissions) | ✅ Livré | 2026-04-21 |
| 2 | Dashboard minimum viable (login Discord, config, audit) | ✅ Livré | 2026-04-21 |
| 3 | Moteur d'onboarding (presets, prévisualisation, application, rollback) | ✅ Livré | 2026-04-22 |
| 4 | Cinq modules officiels V1 | ✅ Livré | 2026-04-27 |
| 5 | Sécurité béton et polish technique | ✅ Livré | 2026-04-27 |
| 6 | Production-ready (compose Docker, image, doc utilisateur et dev) | ✅ Livré | 2026-04-28 |
| 7 | Refonte UI/UX, simplification de l'installation, i18n, E2E | 🚧 À venir | — |
| 8 | Modules V1.1 additionnels | ⏳ Prévu | — |

> Versions publiées : **v0.4.0** (fin du jalon 4), **v0.5.0** (fin
> du jalon 5), **v0.6.0** (fin du jalon 6). La **V1.0.0** sortira
> à la clôture du jalon 7, quand l'UI/UX sera stabilisée.

---

## Jalon 0 — fondations

**Objectif :** un repo viable qui passe `pnpm install && pnpm check`,
sans aucune fonctionnalité utilisateur.

Livré : monorepo pnpm + Turborepo, TypeScript strict, Biome, Vitest,
structure des paquets et apps, CI GitHub Actions (lint, typecheck,
tests, build), Docker Compose de développement (Postgres + Redis),
documentation de base.

**Critère de sortie atteint** : la commande check tourne au vert sur
un repo sans feature.

---

## Jalon 1 — cœur minimum viable

**Objectif :** le cœur sait charger un module, le brancher sur un
événement Discord, et lui faire exercer toute l'API publique.

Livré :

- Plugin loader (découverte, validation du manifeste, cycle de vie).
- Système d'événements typé.
- Service de configuration validée par Zod (persistance Postgres).
- Service d'audit log persistant.
- Service de permissions applicatives mappé sur les rôles Discord.
- Scheduler avec Redis + BullMQ et mode dégradé in-memory.
- Contexte `ctx` exposé aux modules.
- Connexion au gateway Discord et dispatch vers le cœur.
- Module témoin `hello-world` qui exerce le contrat de bout en bout.

**Critère de sortie atteint** : `hello-world` reçoit un événement
Discord, répond via la factory UI, écrit dans l'audit, vérifie une
permission, planifie une tâche — sans toucher au cœur.

---

## Jalon 2 — dashboard minimum viable

**Objectif :** un admin connecté via Discord peut voir ses serveurs
et ajuster la configuration d'un module.

Livré :

- App Next.js en place (App Router, React 19).
- Auth.js avec provider Discord OAuth2.
- Liste des serveurs administrables.
- API Fastify avec authentification par cookie de session.
- Page de configuration générée depuis le manifeste déclaratif d'un
  module (validation Ajv côté client).
- Page d'audit log avec filtres basiques.
- Design system partagé dans `@varde/ui`.

**Critère de sortie atteint** : un admin peut modifier un paramètre
de `hello-world` depuis le dashboard et constater l'effet sur Discord.

---

## Jalon 3 — moteur d'onboarding

**Objectif :** un admin peut, depuis le dashboard, démarrer un
parcours d'onboarding qui crée rôles, salons et configuration en
une session, puis revenir en arrière s'il le souhaite.

Livré :

- Modèle de données : sessions, actions, invocations IA.
- API d'enregistrement d'actions custom par les modules
  (`ctx.onboarding`).
- UI builder dans le dashboard (preset, IA, preview, apply).
- Exécution séquentielle des actions (rôles, catégories, salons,
  configuration) avec rollback automatique en cas d'échec.
- Persistance de l'état, bridge discord.js v14 pour les créations
  réelles côté serveur.
- Rollback temporisé 30 minutes via le scheduler.
- IA copilote optionnelle (« BYO-LLM ») : aucun fournisseur par
  défaut, l'admin branche Ollama ou un backend compatible OpenAI.
  Clé chiffrée AES-256-GCM dans le keystore (voir
  [ADR 0007](./adr/0007-onboarding-ia-byo-llm.md)).

**Critère de sortie atteint** : avec un module qui contribue une
action d'onboarding, le builder applique ses effets sur un vrai
serveur Discord.

---

## Jalon 4 — modules officiels V1

**Objectif :** livrer les cinq modules officiels avec exactement la
même API que les modules tiers (« aucun privilège officiel »).

Livré :

| Module | Rôle |
| --- | --- |
| `logs` | Audit Discord routé par type d'événement, mode simple ou multi-routes, filtres globaux. |
| `welcome` | Accueil et départs (salon ou DM), carte d'avatar 700×250 générée, auto-rôle avec délai, filtre comptes neufs. |
| `reaction-roles` | Réactions emoji et boutons mélangeables sur un même message, modes normal / unique / vérificateur. |
| `moderation` | Slash commands manuelles (12) et automod multi-règles (12 types : blacklist, regex, mots-clés, anti-flood, IA, invitations, liens, majuscules, emojis, spoilers, mentions, zalgo). |
| `onboarding-presets` | Catalogue de 5 presets éditables avec apply / rollback. Livré comme service API plutôt que comme module bot — voir [ADR 0010](./adr/0010-onboarding-presets-api-driven.md). |

Refonte UX/UI single-page sur les quatre pages module, avec primitives
partagées (`StickyActionBar`, `CollapsibleSection`,
`EntityMultiPicker`, `DiscordMessagePreview`, `useDirtyExitGuard`).

**Critère de sortie atteint** : un admin installe une instance fraîche,
démarre un onboarding de bout en bout, obtient un serveur configuré
et modéré sans toucher à un fichier de configuration.

---

## Jalon 5 — sécurité béton et polish technique

**Objectif :** durcir la surface d'attaque, éponger la dette
technique visible, mesurer les performances, vérifier la robustesse.

Livré :

- 🔐 `pnpm audit` clean (zéro CRITICAL/HIGH), audit bloquant en CI.
- 🛡️ En-têtes de sécurité (CSP, HSTS, X-Frame-Options,
  X-Content-Type-Options, etc.) sur 100 % des réponses HTTP côté
  API et dashboard.
- 🚦 Rate limiting global API (300 req/min/IP) avec plafond serré
  sur les routes IA (10 req/min/IP).
- 📁 Vérification du type réel des images uploadées (magic bytes),
  pas seulement le `Content-Type`.
- 🔒 Test statique qui empêche toute future route mutante d'oublier
  le contrôle d'accès admin.
- 📡 Observabilité de la connexion Discord (déconnexions,
  reconnexions, warnings).
- 🩹 Résilience DB validée (graceful 5xx, pas de crash process).
- 🔑 Audit du flow Auth.js v5, redaction explicite de l'access token
  Discord côté client.
- 🔄 Rotation de la master key du keystore testée bout-en-bout.
- ✅ Couverture tests cœur et API > 75 %, plancher anti-régression
  en CI.
- 📦 Bundle dashboard sous plafond (~355 KB gzipped), check CI.
- 📖 `SECURITY.md` enrichi : modèle de menaces V1 explicite et
  procédures opérateur (rotation master key, rotation secret de
  session, révocation token bot, révocation clé IA, bench p95,
  validation 24 h pré-release).

**Critère de sortie atteint** : tous les indicateurs ci-dessus au vert
en CI.

> 🔁 **Récurrent** : la checklist du jalon 5 sera rejouée tous les 4
> à 5 jalons par la suite, pour empêcher la dette de compounder.

---

## Jalon 6 — production-ready

**Objectif :** rendre l'instance installable et exploitable par
un inconnu, et donner aux développeurs tiers un point d'entrée
clair pour écrire leur propre module.

Livré :

- 🐳 Compose de production avec quatre services (`bot`, `dashboard`,
  `postgres`, `redis`), images Docker multi-stages (Node 24 LTS,
  user non-root, healthchecks chaînés), volumes persistants pour
  la base et les uploads, service utilitaire de migration.
- 🔐 `.env.example` exhaustif, généré à partir de l'audit du code,
  avec toutes les variables d'environnement consommées.
- 📖 Guide de déploiement pas-à-pas (`docs/DEPLOYMENT.md`) :
  pré-requis, création de l'application Discord, premier `up`,
  smoke test, mise en place d'un reverse-proxy Caddy pour le
  HTTPS, sauvegardes, mise à jour, troubleshooting.
- 📚 Guide utilisateur (`docs/USER-GUIDE.md`) destiné aux admins de
  communauté Discord — usage du dashboard, des cinq modules, du
  journal d'audit, des permissions, du branchement IA optionnel.
- 🧩 Guide de création de module (`docs/MODULE-AUTHORING.md`)
  pas-à-pas, accompagné d'un module exemple fonctionnel
  (`modules/example-counter/`).
- 🛡️ Documentation publique de tous les fichiers `docs/` du projet
  qui n'étaient jusque-là accessibles qu'en interne (architecture,
  conventions, ADR, scope, roadmap, opérations, tests, assets).

**Critère de sortie atteint** : compose prod fonctionnel et
documenté, doc admin et doc dev publiées, instance prête à
tourner 24/24 sur une machine fraîche en moins de 5 minutes
après la première installation.

> ✂️ **Reportés au jalon 7** : l'internationalisation FR/EN du
> dashboard et les tests E2E Playwright. Ces deux chantiers
> dépendent fortement de l'UI actuelle, qui va être refondue au
> jalon 7 — coder l'i18n ou des sélecteurs Playwright maintenant
> serait du travail jeté.

---

## Jalon 7 — refonte UI/UX et simplification de l'installation

**Objectif :** rendre la mise en place et l'usage quotidien
nettement plus simples, à la fois pour l'admin qui installe et
pour la modératrice qui utilise au jour le jour.

Scope (axes principaux, à détailler dans le plan d'exécution) :

- 🎨 Refonte UI/UX du dashboard (cohérence visuelle, parcours
  simplifiés, retours utilisateurs intégrés).
- 🧰 Simplification de l'installation et de la première
  configuration (assistants intégrés, défauts plus pertinents,
  diagnostic de configuration).
- 🌍 Internationalisation FR/EN du dashboard, posée sur l'UI
  refondue.
- 🎭 Tests Playwright sur les parcours critiques, posés une fois
  l'UI stabilisée.
- 📜 Changelog complet, tag `v1.0.0`, release GitHub.

**Critère de sortie :** V1.0.0 publiable.

---

## Jalon 8 — modules V1.1 additionnels

**Objectif :** étendre le catalogue des modules officiels en
s'appuyant sur le contrat plugin stabilisé.

Le périmètre exact sera arrêté à l'ouverture du jalon en
fonction des retours utilisateurs sur la V1. Pistes prévues :
modules de niveaux et progression, tickets de support, annonces
programmées, alertes de sources externes (Twitch / YouTube / RSS).

---

## Au-delà — pistes V1.2 et V2

Liste indicative, à réévaluer selon les retours des premières
instances en production.

### V1.2 — amélioration de l'infrastructure

- Isolation des modules en worker threads (résilience).
- API de webhooks sortants standardisée.
- Export / import de configuration.
- Support multi-langue étendu au-delà de FR / EN.

### V2 et au-delà

- API d'intégrations externes propre (Twitch, YouTube, GitHub, RSS).
- Module `analytics` (croissance, rétention, activité).
- Module d'assistance IA avancée (résumé de conversation, détection
  de doublons FAQ, contexte modération).
- Catalogue public de modules communautaires.

---

## Principes de séquencement

- **Pas de feature V1 en jalon 0.** Les fondations d'abord.
- **Chaque jalon a un critère de sortie vérifiable.** Pas de « c'est
  plus ou moins fini ».
- **Un module à la fois.** L'ordre est pensé pour faire émerger les
  manques du contrat d'extension.
- **L'onboarding vient tard dans la V1.** Il dépend de tous les
  modules pour être démonstratif.
- **Pas de release V1 tant que les cinq modules ne sont pas là.** Un
  onboarding qui ne peut rien activer n'a pas de sens.
