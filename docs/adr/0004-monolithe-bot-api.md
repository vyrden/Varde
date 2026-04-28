# 0004. Monolithe bot + API dans un seul process

Date: 2026-04-21
Statut: accepted

## Contexte

Le projet a besoin d'un process bot connecté à la gateway Discord et
d'un process API servant le dashboard web. Deux choix de déploiement
sont crédibles :

- **Deux process séparés** (`apps/bot` et `apps/api`) qui communiquent
  via la DB pour l'état et via Redis pub/sub pour les événements
  temps réel — le cas classique d'un service distribué.
- **Un seul process** qui exécute les deux rôles en partageant un
  EventBus in-memory et une seule connexion DB.

Plusieurs contraintes tirent vers l'option monolithique en V1 :

- [ADR 0003](./0003-mode-degrade-redis.md) impose déjà un mode dégradé
  sans Redis, ce qui rend un pub/sub inter-process impossible dans ce
  mode. Si bot et API doivent communiquer en mode dégradé, ils
  tournent de toute façon sur la même machine.
- Le `ConfigService` émet un événement `config.changed` que le bot
  doit consommer (ex : re-scheduler une tâche après modification d'un
  paramètre). En monolithe, une seule instance de l'EventBus suffit
  et l'événement est reçu en même temps par la logique module côté
  bot et par les routes API.
- La V1 cible des communautés de 100 à 5000 membres — une charge que
  Node tient largement sur un seul cœur. Aucune donnée n'indique que
  scinder en deux process améliorerait les latences ou le débit à ce
  volume.
- Réduire le nombre de process réduit la surface d'exploitation :
  moins de variables d'environnement, un seul log, un seul crash
  possible, un seul dockerfile.

Le risque est de coupler durablement bot et API d'une manière qui
empêcherait plus tard d'en séparer les déploiements.

## Décision

On introduit **`apps/server`** : un point d'entrée unique qui, au
démarrage, instancie l'EventBus, le `ConfigService`, le
`PluginLoader`, l'API Fastify et le client discord.js, tous
partageant les mêmes services core.

- `apps/bot` et `apps/api` restent des paquets publiant leur surface
  applicative (factories, routes, attach helpers). Ils ne démarrent
  rien de leur propre fait.
- `apps/server` compose :
  1. Un `@varde/core` instancié avec `createLogger`,
     `createEventBus`, `createConfigService`, `createAuditService`,
     `createPluginLoader` et un `ctxFactory`.
  2. Une API Fastify via `createApiServer` de `@varde/api`, à laquelle
     on passe le `ConfigService` et le `PluginLoader` partagés.
  3. Un client discord.js attaché au `Dispatcher` via
     `attachDiscordClient` de `@varde/bot`, avec le même EventBus.
  4. Un shutdown coordinator unique qui arrête proprement : API,
     Discord client, schedulers, connexion DB.
- L'événement `config.changed` transite **par l'EventBus in-process**.
  Pas de Redis pub/sub requis, même en mode Redis-actif — le mode
  Redis ne sera utilisé que pour BullMQ et le cache si un jour on
  split, pas pour propager `config.changed` en V1.

`apps/bot` et `apps/api` conservent leurs tests d'intégration
indépendants via `createApiServer` / `createTestHarness` — la
décomposition logicielle reste propre.

## Alternatives considérées

### Deux process avec Redis pub/sub

Bot et API déployés séparément, communication via Redis. Rejetée en
V1 :

- Force Redis en dépendance dure, ce qui contredit l'ADR 0003.
- Double surface de logs et de monitoring pour un gain nul à notre
  volume cible.
- `config.changed` demanderait une sérialisation réseau + un
  listener distinct côté bot, pour un événement déjà géré
  proprement par l'EventBus in-process.

### Deux process sans pub/sub, synchronisation par polling DB

Chaque process interroge la table `guild_config` à intervalles
réguliers pour détecter les changements. Rejetée : latence
inacceptable pour un dashboard interactif (« je change la valeur, le
bot la prend en compte dans 30 secondes ») et charge DB parasite.

### Monolithe via IPC (fichier socket unix)

Rejetée : aucun gain sur l'EventBus in-process dès lors qu'on est
sur la même machine, sauf à imaginer une séparation par utilisateur
système que nous ne visons pas.

## Conséquences

### Positives

- `config.changed` est naturel et instantané.
- Un seul dockerfile, un seul log stream, un seul crash possible.
- Le mode dégradé sans Redis (ADR 0003) continue de fonctionner sans
  traitement spécial côté transport inter-service — il n'y a pas de
  transport inter-service.
- Les tests E2E qui nécessitent bot + API ne paient pas un coût de
  démarrage de deux process.

### Négatives et points de vigilance

- Un split futur (multi-instance horizontale, séparation des
  déploiements) devra réintroduire un transport pour
  `config.changed`. C'est prévu dans [ADR 0003](./0003-mode-degrade-redis.md) §
  « Capacités réduites » : le pub/sub Redis est la voie de
  réhabilitation.
- Le `PluginLoader` et le `ConfigService` deviennent singletons de
  fait. On doit s'interdire d'y stocker un état qui n'aurait pas de
  sens à l'échelle du process entier.
- Le dashboard Next.js (`apps/dashboard`) reste un process séparé,
  communiquant avec `apps/server` par HTTP. C'est intentionnel : Next
  a son propre cycle de vie (dev server, build SSR) et ne doit pas
  embarquer discord.js.

## Références

- [0003 - Mode dégradé sans Redis](./0003-mode-degrade-redis.md)
  §« Pas de pub/sub inter-process » — contrainte qui a poussé le
  choix du monolithe.
- [`apps/server`](../../apps/server) — implémentation du point
  d'entrée composé.
- [`apps/bot`](../../apps/bot) et [`apps/api`](../../apps/api) —
  paquets applicatifs consommés par `apps/server`.
