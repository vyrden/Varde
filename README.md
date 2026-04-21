# Varde

Bot Discord auto-hébergé, pensé comme une plateforme d'extensions. Noyau
minimal, modules officiels et tiers indiscernables, onboarding adaptatif, IA en
copilote de l'admin.

## Statut

Projet en conception avancée. Jalon 1 (core minimum viable) terminé
(2026-04-21) : le noyau sait charger un module, le brancher sur un
événement Discord et lui faire exercer toute l'API publique (audit,
scheduler, config, permissions, i18n, UI). Un module témoin
`hello-world` valide le critère de sortie dans les tests d'intégration
de bout en bout.

Paquets livrés à ce jour :

- `@varde/contracts` — types et schémas partagés, `defineModule()`.
- `@varde/db` — schéma Postgres/SQLite des 11 tables du core, client
  Drizzle, migrations.
- `@varde/core` — logger, i18n, keystore (AES-256-GCM), config, audit,
  permissions, event bus, scheduler (mode dégradé DB-polling), plugin
  loader, ctx factory, UIService.
- `@varde/bot` — mapper discord.js → `CoreEvent`, command registry,
  DiscordService avec rate limit, dispatcher, shutdown coordinator.
- `@varde/testing` — `createTestHarness` pour les tests d'intégration
  de modules (SQLite in-memory, faux temps injectable).
- `modules/hello-world` — module témoin de l'API.

Reste à livrer avant V1.0.0 : dashboard + API (jalon 2), onboarding
adaptatif (jalon 3), modules officiels moderation/welcome/roles/logs
(jalons suivants). Pas encore de release tagguée.

## Pourquoi un bot de plus

Le paysage des bots Discord est saturé mais mal adressé pour les communautés
exigeantes. MEE6 est devenu un produit commercial qui verrouille des
fonctionnalités de base derrière un paywall. Carl-bot est plus honnête mais
tout aussi généraliste. YAGPDB est puissant mais austère. Aucun n'est pensé
comme un vrai logiciel modulaire, documenté, auto-hébergeable et respectueux de
l'admin.

Ce projet part d'un constat simple : les communautés tech et créatives veulent
le même niveau de qualité d'outillage que celui qu'elles exigent de leurs
propres projets. Code ouvert, configuration déclarative, extensibilité propre,
transparence des choix.

## Ce que le bot fait

À la V1 :

- Accompagne la création ou l'adaptation d'un serveur Discord via un
  onboarding adaptatif (rôles, salons, modules, configuration initiale).
- Modère manuellement et automatiquement.
- Accueille les nouveaux membres, gère les départs, assigne des rôles à
  l'arrivée, filtre les comptes neufs.
- Gère les rôles assignables par les membres (menus, reaction roles, rôles
  temporaires).
- Journalise tout ce qui se passe sur le serveur dans un audit log unifié.

Le tout piloté depuis un dashboard web.

## Ce que le bot ne fait pas

Pas de leveling, pas de musique, pas de mini-jeux, pas d'intégrations Twitch
ou YouTube en V1. Ces capacités viendront en modules additionnels, officiels
ou tiers.

Pas de télémétrie, pas de phone home, pas de dépendance à un service central.
L'admin installe, configure, héberge. Le projet ne sait rien de son instance.

Pas de chatbot IA généraliste. L'IA sert l'admin (analyser, suggérer, résumer)
sans jamais parler à la place de la communauté.

## Architecture en une phrase

Un noyau TypeScript strict expose un contrat typé à des modules découvrables,
chargés dynamiquement, qui contribuent leurs commandes Discord, pages
dashboard, hooks d'onboarding et logiques métier via des points d'extension
explicites.

## Installation

Une image de production Docker n'est pas encore publiée (attendue à la
V1.0.0). À ce stade le projet se lance depuis les sources.

Prérequis : Node.js 24 LTS, pnpm 10, Docker + Docker Compose (pour la
DB de dev). La procédure complète de setup local (token Discord,
application de test, permissions OAuth2, lancement des services) est
dans [`CONTRIBUTING.md`](./CONTRIBUTING.md).

Aperçu :

```sh
pnpm install
docker compose -f docker/docker-compose.dev.yml up -d
VARDE_DATABASE_URL=postgres://varde:varde@localhost:5432/varde pnpm db:migrate
pnpm check   # lint + typecheck + tests
pnpm build
```

La configuration applicative par serveur est stockée en base (pas de
fichier de config par serveur) et sera pilotée depuis le dashboard
(jalon 2).

## Contribuer

Lire [`CONTRIBUTING.md`](./CONTRIBUTING.md) pour le setup local, le
workflow de PR, et les standards attendus.

Les modules tiers sont bienvenus tant qu'ils respectent le contrat
d'extension et les conventions UI. Ils se développent dans des repos
séparés.

## Sécurité

Pour signaler une vulnérabilité, voir [`SECURITY.md`](./SECURITY.md).
Ne jamais ouvrir d'issue publique pour un problème de sécurité.

## Licence

Apache 2.0. Voir [`LICENSE`](./LICENSE). Les modules officiels sont
distribués sous la même licence.
