# 0003. Mode dégradé sans Redis

Date: 2026-04-20
Statut: accepted

## Contexte

Le projet cible deux classes de déploiements :

- Déploiements standards : Postgres + Redis, toutes capacités actives.
- Petits déploiements auto-hébergés : Postgres ou SQLite seuls, sans
  Redis.

Redis assure plusieurs fonctions dans l'architecture, détaillées dans
[../ARCHITECTURE.md](../ARCHITECTURE.md) section Redis :

- File BullMQ pour le scheduler (sanctions temporaires, purges, tâches
  différées).
- Cache applicatif (permissions compilées, config serveur, réponses
  d'API Discord).
- Rate limiting en fenêtre glissante.
- Pub/sub entre le bot et l'API.

Le mode dégradé sans Redis doit exister, mais ses limites doivent être
précisément connues de l'admin qui l'adopte. Cet ADR les fige une fois
pour toutes.

## Décision

### Activation

Le mode dégradé s'active **explicitement** par absence de la variable
d'environnement `VARDE_REDIS_URL` au démarrage. Pas de détection
automatique en cours d'exécution : si Redis devient injoignable après
démarrage, les opérations Redis échouent normalement et sont relayées
dans l'audit log avec sévérité `error`. Le basculement silencieux d'un
Redis présent vers un fallback in-memory est explicitement refusé —
il masquerait un incident d'infrastructure.

### Capacités maintenues

En mode dégradé, les capacités suivantes continuent de fonctionner :

- **Scheduler** via la table `scheduled_tasks` en DB (Postgres ou
  SQLite) et un tick périodique du process bot.
- **Cache applicatif** via LRU in-memory par process, avec TTL courts
  et invalidations synchrones.
- **Rate limiting** via compteurs in-memory par process.
- **Audit log, config, permissions, keystore** : inchangés, en DB.

### Capacités réduites

Sont explicitement dégradées :

- **Multi-instance impossible.** Le cache et le rate limiting in-memory
  divergeraient entre processus. Le mode dégradé suppose un seul
  process bot et un seul process API.
- **Scheduler moins fin.** Le tick périodique introduit une latence
  d'expiration des sanctions temporaires pouvant atteindre la période
  de tick (cible : 10 secondes). Acceptable pour un bot de petite
  taille, inadapté à un grand volume.
- **Pas de pub/sub inter-process.** Les communications bot ↔ API
  passent par un canal IPC local (fichier socket unix ou file DB) au
  lieu de Redis pub/sub. Si bot et API ne tournent pas sur la même
  machine, le mode dégradé ne convient pas.
- **Cache froid entre redémarrages.** Les permissions compilées et les
  lookups fréquents sont recalculés au démarrage. Impact perceptible
  uniquement à l'allumage.
- **Pas de déduplication idempotente distribuée.** Les `job_key`
  uniques en DB (voir [0001](./0001-schema-db-core.md)) suffisent pour
  l'unicité logique ; la couche Redis BullMQ apportait une sécurité
  supplémentaire contre les doubles enregistrements quasi-simultanés.

### Dégradations observables

- Le dashboard affiche un bandeau `Mode dégradé actif` tant
  qu'aucun Redis n'est configuré. Le bandeau liste brièvement les
  conséquences et pointe vers cet ADR.
- L'endpoint `/health/ready` reste vert en mode dégradé tant que la DB
  répond.
- Une métrique `varde_redis_available` (0 ou 1) est exposée sur
  `/metrics` pour permettre une alerte découplée de la config.

### Modules

Un module peut déclarer dans son manifeste une capacité
`requiresRedis: true` pour refuser son activation en mode dégradé. Par
défaut, un module ne requiert pas Redis.

Le contrat des services `ctx.scheduler`, `ctx.cache`, `ctx.rateLimit`
ne change pas entre les deux modes : seul le backend diffère. Un
module n'a pas à se soucier du mode.

## Alternatives considérées

### Pas de mode dégradé

Rejetée : empêche l'auto-hébergement minimaliste revendiqué par le
projet (`docker compose up` sur un VPS basique sans Redis). L'offre
de valeur en souffrirait.

### Détection automatique et bascule à chaud

Utiliser un client Redis avec mock mémoire en secours. Rejetée : masque
les incidents réseau, complique fortement le code (deux chemins à
maintenir par service), rend les tests non déterministes. On préfère
un mode dégradé choisi explicitement au démarrage.

### Fallback transparent côté client Redis

Wrapper ioredis avec mémoire de secours. Rejetée : cache divergent
entre processus, impossible à raisonner, fausse sécurité.

## Conséquences

### Positives

- L'auto-hébergement très minimaliste reste possible.
- Le contrat `ctx.*` est identique dans les deux modes — les modules
  sont portables par construction.
- Les incidents Redis en prod sont visibles, jamais masqués.

### Négatives et points de vigilance

- La version dégradée ne scale pas : un seul process bot, un seul
  process API, sur la même machine.
- La latence d'expiration des sanctions temporaires est visiblement
  supérieure en mode dégradé (jusqu'à une dizaine de secondes).
- Le mode dégradé n'est pas testé à iso-couverture du mode standard :
  les tests d'intégration ciblent en priorité le mode Redis. Un
  petit set de tests dédié au mode dégradé reste nécessaire pour
  verrouiller la non-régression.
- La documentation exploitée par l'admin doit être très claire sur ce
  qu'il perd en choisissant ce mode. Voir [../DEPLOYMENT.md](../DEPLOYMENT.md).

## Références

- [0001 - Schéma DB du core](./0001-schema-db-core.md) — table
  `scheduled_tasks` prévue pour la projection DB du scheduler.
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — section Redis et section
  Compromis.
- BullMQ : https://docs.bullmq.io
