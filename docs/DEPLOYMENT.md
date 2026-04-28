# Déploiement

Ce document décrit comment installer, configurer et exploiter une
instance Varde en production auto-hébergée. Il est découpé en sections
indépendantes, à parcourir dans l'ordre la première fois puis à
consulter séparément.

Document en cours de construction pendant le jalon 0. Des sections
seront étoffées au fur et à mesure que les composants concernés
arrivent (keystore au jalon 1, migrations au jalon 1, etc.).

## Prérequis

- Machine Linux (x86_64 ou arm64) avec Docker 24+ et Docker Compose v2.
- Accès sortant vers `discord.com` et `gateway.discord.gg`.
- 2 GB de RAM minimum pour une instance modeste, 4 GB recommandés
  dès qu'un module d'audit avec rétention active tourne.
- Stockage : 5 GB minimum pour la base et les logs, à dimensionner
  selon le volume réel.

Pour la création d'une application Discord et les identifiants
associés : voir [../CONTRIBUTING.md](../CONTRIBUTING.md) section
"Créer une application Discord de test". Les étapes sont identiques
en prod ; seuls l'URL de redirection OAuth2 et la gestion des secrets
diffèrent.

## Docker compose de référence

Un fichier `docker/docker-compose.prod.yml` sera fourni au jalon 5
(polish V1), avec cinq services : `bot`, `api`, `dashboard`, `postgres`,
`redis`.

À renseigner par l'admin :

- Variables d'environnement via un `.env` à côté du compose
  (jamais committé).
- Volumes de données nommés (par défaut `varde_postgres_data`,
  `varde_redis_data`).
- Exposition des ports : dashboard seul exposé en frontal, bot et API
  écoutent en interne.

## Variables d'environnement

La liste exhaustive est dans [`.env.example`](../.env.example).
Variables obligatoires au démarrage :

- `VARDE_DISCORD_TOKEN`
- `VARDE_DISCORD_CLIENT_ID`
- `VARDE_DISCORD_CLIENT_SECRET`
- `VARDE_DATABASE_URL`
- `VARDE_REDIS_URL` (sauf mode dégradé — voir ADR 0003)
- `VARDE_SESSION_SECRET` (≥ 32 octets aléatoires)
- `VARDE_KEYSTORE_MASTER_KEY` (32 octets en base64)

Les variables manquantes font échouer le démarrage avec un message
explicite (principe « fail fast »).

## Migrations

Les migrations ne sont **jamais** appliquées automatiquement en prod.
Elles sont exécutées explicitement par l'admin :

```sh
docker compose -f docker/docker-compose.prod.yml exec bot pnpm db:migrate
```

Lire la section migration du `CHANGELOG.md` avant chaque upgrade.

Détails de la stratégie dans [ARCHITECTURE.md](./ARCHITECTURE.md)
section Migrations DB.

## Sauvegarde et restauration

### Postgres

```sh
docker compose exec postgres pg_dump -U varde -Fc varde > backup-$(date +%F).dump
```

Restauration :

```sh
docker compose exec -T postgres pg_restore -U varde -d varde < backup.dump
```

### SQLite (mode petit déploiement)

Utiliser la commande `.backup` de `sqlite3`, pas une copie brute du
fichier :

```sh
sqlite3 /var/lib/varde/varde.db ".backup /var/lib/varde/backup-$(date +%F).db"
```

Fréquence recommandée pour un serveur actif : quotidienne, rétention
30 jours. À adapter selon volumétrie.

## Rotation du keystore

Le keystore stocke les secrets tiers (tokens d'intégrations, etc.)
chiffrés par `VARDE_KEYSTORE_MASTER_KEY` (AES-256-GCM).

Rotation à effectuer tous les 12 mois ou après suspicion de fuite. La
procédure complète sera documentée lors de l'implémentation du module
keystore (jalon 1). Principe : clé `NEXT` configurée en parallèle,
commande de réencryption, bascule.

## Bascule Postgres ↔ SQLite

SQLite est accepté pour les petits déploiements. Au-delà d'un certain
seuil (quelques centaines de serveurs actifs, écritures fréquentes),
Postgres devient nécessaire. Une procédure de migration des données
sera documentée post-V1 si un besoin concret émerge.

## Mode dégradé sans Redis

Voir [adr/0003-mode-degrade-redis.md](./adr/0003-mode-degrade-redis.md).
Section dédiée à ajouter ici au jalon 5 avec les commandes et
observations exploitables.

## Checklist de mise en production

- Application Discord créée, intents activés, scopes déclarés.
- `.env` renseigné, toutes les variables `VARDE_*` obligatoires
  présentes.
- `KEYSTORE_MASTER_KEY` stockée dans un gestionnaire de secrets
  indépendant du repo et des sauvegardes applicatives.
- Volumes Docker montés sur disque persistant, pas éphémère.
- Domaine du dashboard configuré, TLS terminé en amont via reverse
  proxy.
- `/health/ready` surveillé, alerte configurée.
- Sauvegarde Postgres planifiée et restauration éprouvée au moins une
  fois.
- Rotation des logs déléguée à l'hébergeur.
- Bannière "Mode dégradé actif" absente (si Redis attendu).

## Observabilité

Détails dans [ARCHITECTURE.md](./ARCHITECTURE.md) section
Observabilité. Points clés à documenter ici au fil des jalons :

- Format des logs Pino et champs stables.
- Tableau de métriques Prometheus exposées sur `/metrics` et
  recommandations d'agrégation.
- Endpoints `/health/live` et `/health/ready` et leurs sémantiques.
