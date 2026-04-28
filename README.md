# Varde

> **Un bot Discord pensé pour les humains qui gèrent des communautés.**
> Pas un produit commercial, pas un gadget, pas un mouchard.
> Vous l'installez chez vous, vous décidez ce qu'il fait.

![Licence](https://img.shields.io/badge/licence-Apache%202.0-blue.svg)
![Statut](https://img.shields.io/badge/statut-en%20cours%20avant%20V1.0-orange.svg)
![Auto-hébergé](https://img.shields.io/badge/auto--hébergé-oui-success.svg)
![Sans paywall](https://img.shields.io/badge/paywall-aucun-success.svg)

---

## 🌱 Pourquoi ce projet ?

Si vous avez déjà géré un serveur Discord un peu vivant, vous connaissez l'histoire :

- 🔒 **MEE6** verrouille des fonctions de base derrière un abonnement.
- 🧰 **Carl-bot** est honnête mais très généraliste.
- 🛠️ **YAGPDB** est puissant mais austère.

Aucun n'est vraiment **votre** outil. Vous bricolez avec ce qu'on vous laisse.

**Varde**, c'est un bot que vous **hébergez vous-même**, qui se configure depuis une interface web claire, et qui ne vous facture rien parce qu'il n'y a personne à facturer : pas de société derrière, pas de serveur central, pas de service à payer.

> 🧭 **L'idée en une phrase :** un outil de gestion de communauté Discord qui se comporte comme un vrai logiciel libre — propre, documenté, modulaire, et qui respecte la personne qui l'installe.

---

## ✨ Ce que ça fait, simplement

Varde s'occupe des tâches répétitives qui mangent votre temps de modérateur ou d'admin :

| Tâche | Détail |
| --- | --- |
| 👋 **Accueillir** | Message de bienvenue, image personnalisée, rôle automatique, départ propre. |
| 🛡️ **Modérer** | Avertissements, mutes, bans (manuels ou automatiques selon des règles claires). |
| 🎭 **Distribuer des rôles** | Les membres choisissent leurs rôles via des réactions ou des boutons. |
| 📜 **Garder une trace** | Tout ce qui se passe est tracé proprement, consultable depuis un tableau de bord. |
| 🚀 **Démarrer un serveur** | Un assistant configure pour vous rôles, salons et modules selon le type de communauté. |

**Le tout pilotable depuis un site web** que vous lancez à côté du bot. Pas de fichier texte mystérieux à éditer, pas de commande à mémoriser.

---

## ✅ Ce qui fonctionne aujourd'hui

Cette section liste ce qui est **déjà opérationnel**. Pas de promesses, pas de "à venir" : ce que vous voyez ci-dessous tourne réellement.

### 🤖 Le bot

| Fonction | Détails |
| --- | --- |
| **Accueil & départs** | Message personnalisé en salon ou en DM. Carte d'avatar 700×250 px générée automatiquement (avatar circulaire, fond couleur ou image que vous uploadez). Auto-rôle avec délai et filtre anti-comptes-neufs. |
| **Rôles à la carte** | Messages où les membres récupèrent un rôle via une réaction emoji **ou** via un bouton Discord. Les deux peuvent être mélangés sur le même message. Trois modes : libre, exclusif, vérificateur. |
| **Modération manuelle** | `/ban`, `/kick`, `/mute`, `/tempban`, `/tempmute`, `/warn`, `/clear`, `/slowmode`, `/case`, `/infractions`. |
| **Modération automatique** | Règles configurables : liste noire, mots-clés multilingues, regex, anti-flood, liens, invitations, majuscules, mentions, spoilers, zalgo, classification IA optionnelle. Actions composables (supprimer, avertir, mute). |
| **Journal d'audit** | Tout ce qui se passe sur le serveur (arrivées, départs, modifs de rôles, suppressions de messages, etc.) routé par type d'événement, avec filtres et exclusions. |
| **Onboarding adaptatif** | 5 modèles prêts à l'emploi (tech, gaming, créatif, étude, générique). Prévisualisation avant application, retour en arrière possible pendant 30 minutes. |

### 🌐 Le tableau de bord

Une interface web complète permet de :

- 🔑 Se connecter avec son compte Discord.
- 📋 Voir la liste de **vos** serveurs (uniquement ceux où vous êtes admin).
- ⚙️ Configurer chaque module via un formulaire généré automatiquement, avec validation à la volée.
- 🕵️ Parcourir le journal d'audit du serveur avec filtres et pagination.
- 🎨 Une UI cohérente entre tous les modules (mêmes barres d'action, mêmes prévisualisations Discord, mêmes pickers de rôles/salons).

### 🧠 Côté IA (optionnelle)

> L'IA est un **assistant**, pas un décideur. Elle peut proposer un brouillon ou une analyse, jamais agir seule.

- Aucun fournisseur d'IA imposé. Vous branchez **votre propre** moteur : Ollama en local, ou n'importe quel backend compatible OpenAI (OpenAI, OpenRouter, Groq, vLLM, LM Studio).
- Votre clé d'API est chiffrée (AES-256-GCM) avant d'être stockée.
- Aucune trace de prompt en clair : seuls des hash sont conservés pour traçabilité.
- Si vous ne fournissez pas de clé, un mode "règles" déterministe prend le relais.

### 🔐 Sécurité (jalon 5 livré)

| Mesure | Statut |
| --- | :---: |
| Audit de dépendances bloquant en CI | ✅ |
| En-têtes HTTP de sécurité (CSP, HSTS, X-Frame-Options…) | ✅ |
| Limite de débit globale + plafond serré sur les routes sensibles | ✅ |
| Vérification du type réel des images uploadées (magic bytes) | ✅ |
| Test statique : impossible d'oublier le contrôle d'accès admin sur une route mutante | ✅ |
| Observabilité de la connexion Discord (déconnexions, reconnexions, warnings) | ✅ |
| Procédures de rotation de clés documentées (master key, secret d'authentification, token bot, clé IA) | ✅ |
| Couverture de tests > 75 % sur le cœur et l'API, plancher anti-régression en CI | ✅ |

---

## 🗺️ Feuille de route

| Jalon | Sujet | Statut |
| :---: | --- | :---: |
| 1 | Cœur technique (chargement de modules, événements, permissions, audit) | ✅ Livré (21/04/2026) |
| 2 | Tableau de bord minimum viable (login Discord, config, audit) | ✅ Livré (21/04/2026) |
| 3 | Moteur d'onboarding (presets, prévisualisation, application, rollback) | ✅ Livré (22/04/2026) |
| 4 | Cinq modules officiels V1 (logs, accueil, rôles, modération, presets) | ✅ Livré (27/04/2026) |
| 5 | Sécurité béton et polissage technique | ✅ Livré (27/04/2026) |
| 6 | Polissage V1 : traduction FR/EN, doc utilisateur, guide module tiers, tests E2E | 🚧 En cours |

> 📌 Versions publiées : **v0.4.0** (fin jalon 4) et **v0.5.0** (fin jalon 5). La V1.0.0 sortira à la fin du jalon 6.
>
> 🔁 Le jalon 5 (sécurité + polissage technique) sera **rejoué tous les 4 à 5 jalons** par la suite, pour ne jamais laisser la dette technique s'accumuler.

---

## 🚫 Ce que Varde **ne fait pas**

C'est volontaire. Mieux vaut bien faire peu que mal faire tout.

- ❌ Pas de système de niveaux / XP.
- ❌ Pas de musique, pas de mini-jeux.
- ❌ Pas d'intégrations Twitch / YouTube en V1.
- ❌ Pas de chatbot IA généraliste qui parle à votre place.
- ❌ Aucune télémétrie, aucun "phone home". Le projet ne sait **rien** de votre instance.

Ces capacités pourront arriver plus tard, **en modules optionnels**, officiels ou tiers — jamais imposées.

---

## 🛡️ Confidentialité et contrôle

> **Votre serveur, vos données, vos règles.**

- 🏠 **Auto-hébergé.** Vous lancez Varde sur votre machine, votre VPS, votre Raspberry Pi. Pas d'instance partagée.
- 🚫 **Aucun service central.** Le projet ne contacte aucun serveur tiers pour fonctionner.
- 🔍 **Transparent.** Le code est ouvert, les choix techniques sont documentés (voir [`docs/`](./docs/)).
- 🔑 **Vos secrets restent chez vous.** Token bot, clés API, master key : tout vit dans **votre** environnement.
- 📖 **Auditable.** Toute action significative est tracée dans un journal centralisé que vous pouvez consulter.

---

## 💬 Envie d'essayer ou de contribuer ?

- 👀 Vous voulez juste **voir** ce que ça donne → la procédure d'installation est plus bas, dans la section dev.
- 🐛 Vous avez trouvé un **bug** ou une idée → ouvrez une issue sur GitHub.
- 🧩 Vous voulez écrire **votre propre module** → c'est prévu dès le départ. Le contrat d'extension est documenté dans [`docs/PLUGIN-API.md`](./docs/PLUGIN-API.md).
- 🔐 Vous avez trouvé une **faille de sécurité** → voir [`SECURITY.md`](./SECURITY.md). Surtout, **n'ouvrez pas d'issue publique** pour ça.

---

<details>
<summary><strong>📦 Pour les développeurs</strong> (cliquez pour déplier)</summary>

### Stack technique

- **Monorepo** : pnpm workspaces + Turborepo
- **Langage** : TypeScript 6.x strict, cible Node.js 24 LTS
- **Bot Discord** : discord.js v14
- **API HTTP** : Fastify
- **ORM** : Drizzle (PostgreSQL principal, SQLite pour petits déploiements)
- **Cache / queues** : Redis + BullMQ
- **Frontend** : Next.js 16 (App Router) + React 19 + TailwindCSS 4 + shadcn/ui
- **Authentification** : Auth.js v5 avec provider Discord OAuth2
- **Logs** : Pino
- **Tests** : Vitest + Playwright
- **Lint / format** : Biome
- **Container** : Docker + docker-compose
- **CI** : GitHub Actions

### Architecture en une phrase

Un noyau TypeScript strict expose un contrat typé à des modules découvrables, chargés dynamiquement, qui contribuent leurs commandes Discord, pages dashboard, hooks d'onboarding et logiques métier via des points d'extension explicites.

### Structure du monorepo

```text
.
├── apps/
│   ├── bot/                  Processus bot (connexion Discord, dispatch événements)
│   ├── api/                  API HTTP pour le dashboard (Fastify)
│   ├── dashboard/            Frontend Next.js
│   └── server/               Point d'entrée composé bot + API (single-origin, ADR 0004)
├── packages/
│   ├── core/                 Permissions, événements, config, audit, plugin loader, keystore
│   ├── ui/                   Design system partagé
│   ├── db/                   Schémas Drizzle, migrations, client
│   ├── contracts/            Types partagés core ↔ modules ↔ dashboard
│   ├── ai/                   Contrat AIProvider et providers (stub, Ollama, OpenAI-compat)
│   ├── presets/              Catalogue des presets d'onboarding
│   ├── testing/              Harness pour les tests d'intégration de modules
│   └── config/               Config TS, Biome, Vitest partagées
├── modules/
│   ├── moderation/
│   ├── welcome/
│   ├── reaction-roles/
│   ├── logs/
│   ├── hello-world/          Module témoin de l'API core
│   └── onboarding-test/      Module témoin du contrat d'extension onboarding
├── docker/
└── docs/
```

### Paquets livrés à ce jour

- `@varde/contracts` — types et schémas partagés, `defineModule()`, `ConfigUi` et `ConfigFieldSpec`.
- `@varde/db` — schéma Postgres/SQLite des 11 tables du core, client Drizzle, migrations.
- `@varde/core` — logger, i18n, keystore (AES-256-GCM), config, audit, permissions, event bus, scheduler, plugin loader, ctx factory, UIService.
- `@varde/bot` — mapper discord.js → `CoreEvent`, command registry, DiscordService avec rate limit, dispatcher, shutdown coordinator.
- `@varde/api` — serveur Fastify : `/health`, `/me`, `/guilds`, `/guilds/:id/modules` (+ config GET/PUT), `/guilds/:id/audit` (filtres + cursor). JWT via `jose`, middleware `requireGuildAdmin`.
- `@varde/server` — point d'entrée composé core + API + client discord.js en un seul process (ADR 0004).
- `@varde/ui` — design system Tailwind 4 CSS-first, primitives partagées par le dashboard.
- `@varde/dashboard` — app Next.js 16 / React 19 / Auth.js v5 : liste serveurs, page guild, formulaire de config dérivé de `configUi` (ADR 0005), journal d'audit.
- `@varde/testing` — `createTestHarness` pour tests d'intégration de modules.
- `@varde/ai` — contrat `AIProvider` + service tracé + trois providers (stub, Ollama, OpenAI-compat). Timeout 30 s, erreurs typées.
- `@varde/presets` — 5 presets hand-curés validés Zod + validateur sémantique.

### Installation depuis les sources

> Une image Docker de production sera publiée à la V1.0.0. En attendant, le projet se lance depuis les sources.

**Prérequis :** Node.js 24 LTS, pnpm 10, Docker + Docker Compose (pour la base de données de dev).

```sh
pnpm install
docker compose -f docker/docker-compose.dev.yml up -d
VARDE_DATABASE_URL=postgres://varde:varde@localhost:5432/varde pnpm db:migrate
pnpm check   # lint + typecheck + tests
pnpm build
```

La procédure complète (création de l'application Discord, scopes OAuth2, variables d'environnement, lancement des services) est dans [`CONTRIBUTING.md`](./CONTRIBUTING.md).

### Configuration

La configuration applicative par serveur est stockée **en base** (pas de fichier de config par serveur) et se pilote depuis le dashboard. Un module expose un `configSchema` (Zod) pour la validation et un `configUi` (sidecar, ADR 0005) pour le rendu du formulaire.

### Contribuer

Lire [`CONTRIBUTING.md`](./CONTRIBUTING.md) pour le setup local, le workflow de PR et les standards attendus. Les modules tiers sont bienvenus tant qu'ils respectent le contrat d'extension et les conventions UI ; ils se développent dans des repos séparés.

### Documentation détaillée

**Pour les administrateurs :**

- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — installation pas à pas (15-20 min)
- [`docs/USER-GUIDE.md`](./docs/USER-GUIDE.md) — utilisation du dashboard au quotidien

**Pour les développeurs :**

- [`docs/MODULE-AUTHORING.md`](./docs/MODULE-AUTHORING.md) — écrire votre propre module
- [`docs/PLUGIN-API.md`](./docs/PLUGIN-API.md) — référence du contrat core / module
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — stack, décisions, trade-offs
- [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) — conventions de code
- [`docs/TESTING.md`](./docs/TESTING.md) — stratégie de test

**Référence et planification :**

- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — jalons V1 et au-delà
- [`docs/SCOPE.md`](./docs/SCOPE.md) — périmètre V1 et hors-scope
- [`docs/ONBOARDING.md`](./docs/ONBOARDING.md) — spec de l'onboarding adaptatif
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) — branches, CI, releases
- [`docs/ASSETS.md`](./docs/ASSETS.md) — gestion des ressources statiques
- [`docs/adr/`](./docs/adr/) — décisions d'architecture (ADR)

</details>

---

## 📜 Licence

Apache 2.0. Voir [`LICENSE`](./LICENSE). Les modules officiels sont distribués sous la même licence.
