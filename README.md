# Varde

Bot Discord auto-hébergé, pensé comme une plateforme d'extensions. Noyau
minimal, modules officiels et tiers indiscernables, onboarding adaptatif, IA en
copilote de l'admin.

## Statut

Projet en conception avancée. Jalon 0 (fondations) terminé : monorepo
en place, CI verte sur `dev`, docker compose de dev fonctionnel,
squelettes des apps et packages compilables. Aucune fonctionnalité
métier livrée. Pas encore de release.

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

Détails dans [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Installation

À venir. Cible : `docker compose up` sur une machine avec Docker.
Configuration via variables d'environnement (voir
[`.env.example`](./.env.example)). La configuration applicative par
serveur est stockée en base (pas de fichier de config par serveur) et
pilotée depuis le dashboard.

## Contribuer

Lire [`CONTRIBUTING.md`](./CONTRIBUTING.md) pour le setup local, le
workflow de PR, et les standards attendus. Les conventions détaillées
sont dans [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md), le contrat
d'extension dans [`docs/PLUGIN-API.md`](./docs/PLUGIN-API.md).

Les modules tiers sont bienvenus tant qu'ils respectent le contrat
d'extension et les conventions UI. Ils se développent dans des repos
séparés.

## Sécurité

Pour signaler une vulnérabilité, voir [`SECURITY.md`](./SECURITY.md).
Ne jamais ouvrir d'issue publique pour un problème de sécurité.

## Licence

Apache 2.0. Voir [`LICENSE`](./LICENSE). Les modules officiels sont
distribués sous la même licence.
