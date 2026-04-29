# Installer Varde sur votre machine

Ce guide vous accompagne pas à pas pour faire tourner Varde sur
votre serveur. Comptez **15 à 20 minutes** la première fois si Docker
est déjà installé. Pas besoin d'être développeur — il faut juste
être à l'aise avec un terminal Linux.

> 💡 **Une instance = un serveur Discord, ou plusieurs ?** Une seule
> instance peut gérer autant de serveurs Discord que vous voulez,
> à condition d'inviter le bot sur chacun. Vous n'avez pas besoin
> de relancer Varde pour chaque communauté.

## 📋 Sommaire

1. [Avant de commencer](#avant-de-commencer)
2. [Créer l'application Discord](#créer-lapplication-discord)
3. [Récupérer le code](#récupérer-le-code)
4. [Préparer la configuration](#préparer-la-configuration)
5. [Premier démarrage](#premier-démarrage)
6. [Vérifier que tout fonctionne](#vérifier-que-tout-fonctionne)
7. [Mettre Varde derrière un domaine HTTPS](#mettre-varde-derrière-un-domaine-https)
8. [Sauvegardes](#sauvegardes)
9. [Mettre à jour Varde](#mettre-à-jour-varde)
10. [Procédures de sécurité](#procédures-de-sécurité)
11. [En cas de problème](#en-cas-de-problème)

---

## Avant de commencer

### Ce qu'il vous faut côté machine

| Ressource | Minimum | Recommandé |
| --- | --- | --- |
| 💻 OS | Linux (x86_64 ou arm64) | Debian 12, Ubuntu 22.04 / 24.04 |
| 🧠 RAM | 2 GB | 4 GB |
| 💾 Disque | 5 GB libres | 20 GB |
| 🌐 Réseau | Sortie autorisée vers `discord.com` et `gateway.discord.gg` | Pareil + un domaine pointant sur la machine si vous voulez du HTTPS |
| 📦 Docker | Docker Engine 24+ | Idem + Docker Compose v2 |

> 🐳 **Pas encore Docker ?** Suivez le guide officiel
> [docs.docker.com/engine/install](https://docs.docker.com/engine/install/),
> puis vérifiez avec `docker --version` et `docker compose version`.

### Comptes nécessaires

- Un **compte Discord** sous lequel l'application bot sera créée.
- Un **terminal SSH** sur la machine où vous installez Varde.

---

## Créer l'application Discord

Depuis le jalon 7 (cf. [ADR 0013](./adr/0013-credentials-discord-en-db-chiffree.md)),
le wizard de setup de Varde collecte les credentials Discord
directement à l'ouverture du dashboard. **Vous n'avez pas besoin
de copier le token ou les clés OAuth dans `.env` à l'avance.**

Cette section décrit ce que vous aurez à fournir au wizard. Le bot
n'est pas créé tant que cette étape n'est pas faite.

1. **Aller sur** [discord.com/developers/applications](https://discord.com/developers/applications)
   et cliquer sur **« New Application »**.
2. Choisir un nom (par ex. `Varde`), accepter les conditions, créer.
3. **Onglet `General Information`** : noter le **Application ID**
   et la **Public Key** (vous les collerez à l'étape « Discord App »
   du wizard).
4. **Onglet `OAuth2 → General`** :
   - Cliquer **« Reset Secret »** et copier le **Client Secret**
     (étape « OAuth » du wizard). Il ne s'affiche qu'une fois.
   - Section « Redirects » : à laisser vide pour l'instant. Le
     wizard vous donnera l'URL exacte à coller ici à l'étape
     « OAuth ».
5. **Onglet `Bot`** :
   - Cliquer **« Reset Token »** et copier le token affiché
     (étape « Token bot » du wizard). Vous ne le reverrez plus.
   - Activer les **trois Privileged Gateway Intents** : `Presence`,
     `Server Members`, `Message Content`. Le wizard liste
     explicitement ceux qui manquent et propose un lien direct
     vers le portail si besoin.

> ⚠️ **Le token bot est un secret aussi sensible qu'un mot de passe
> maître.** S'il fuit, n'importe qui peut prendre le contrôle de
> votre bot. Une fois persisté par le wizard, il est chiffré au
> repos en AES-256-GCM avec votre `VARDE_KEYSTORE_MASTER_KEY` —
> voir [SECURITY.md](../SECURITY.md) pour la procédure de
> révocation et la rotation de master key.

---

## Récupérer le code

```sh
git clone https://github.com/vyrden/Varde.git varde
cd varde
```

Pour rester sur une version stable, basculez sur le dernier tag :

```sh
git fetch --tags
git checkout v0.5.0   # ou la version la plus récente publiée
```

> 📦 Une image Docker pré-publiée arrive avec la V1.0.0. En attendant,
> les Dockerfiles sont buildés depuis les sources lors du premier
> `docker compose up` (comptez 3 à 5 minutes la première fois).

---

## Préparer la configuration

1. **Copier le modèle de variables d'environnement** :

   ```sh
   cp .env.example docker/.env
   ```

2. **Générer les secrets cryptographiques** :

   ```sh
   echo "VARDE_AUTH_SECRET=$(openssl rand -base64 32)" >> docker/.env
   echo "VARDE_KEYSTORE_MASTER_KEY=$(openssl rand -base64 32)" >> docker/.env
   ```

3. **Éditer `docker/.env`** et compléter :

   | Variable | Valeur attendue |
   | --- | --- |
   | `VARDE_BASE_URL` | `https://votre-domaine.com` (ou `http://localhost:3000` en dev — optionnelle, défaut `http://localhost:3000`). |
   | `VARDE_POSTGRES_PASSWORD` | Un mot de passe long, généré aléatoirement. |
   | `VARDE_LOG_LEVEL` | `info` en prod, `debug` pour investiguer. |

   > 🔐 Stockez `VARDE_KEYSTORE_MASTER_KEY` dans un gestionnaire de
   > secrets séparé (Bitwarden, 1Password, KeePass…) en plus du
   > fichier sur la machine. Sans cette clé, vous ne pourrez plus
   > déchiffrer les clés API IA stockées en base si la machine
   > meurt.

---

## Premier démarrage

Tout passe par Docker Compose à partir d'ici.

1. **Construire les images et démarrer la pile** :

   ```sh
   docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d --build
   ```

   Quatre conteneurs vont démarrer : `varde-postgres`, `varde-redis`,
   `varde-bot`, `varde-dashboard`.

2. **Appliquer les migrations de base de données** (à faire une seule
   fois, après le tout premier `up`) :

   ```sh
   docker compose -f docker/docker-compose.prod.yml --env-file docker/.env --profile migrate run --rm migrate
   ```

   Vous devriez voir `[db] migrations Postgres appliquées`.

3. **Ouvrir le wizard de setup** : pointez votre navigateur sur
   `http://localhost:3000` (ou votre domaine HTTPS si vous êtes
   déjà derrière un reverse-proxy). Le middleware Next.js détecte
   que `setup_completed_at` est null en DB et vous redirige vers
   `/setup/welcome`.

   Suivez les 7 étapes — le wizard explique quoi copier/coller à
   chaque écran et valide les credentials contre Discord en temps
   réel. À la fin, le bouton « Démarrer Varde » pose
   `setup_completed_at` et déclenche la connexion gateway sans
   redémarrage du process. Vous arrivez ensuite sur la page
   d'accueil du dashboard.

   > 🛠️ **Chemin legacy.** Si vous avez déjà renseigné
   > `VARDE_DISCORD_TOKEN` + `VARDE_DISCORD_CLIENT_ID` +
   > `VARDE_DISCORD_CLIENT_SECRET` dans `.env`, le bot se connecte
   > directement avec ces valeurs et le wizard est court-circuité.
   > Un warning explicite est posé dans les logs pour vous inviter
   > à migrer vers la persistance DB chiffrée (cf. ADR 0013).

4. **Inviter le bot sur votre serveur Discord** : ouvrez l'URL
   suivante dans un navigateur, en remplaçant `CLIENT_ID` par
   l'Application ID que vous avez collé à l'étape « Discord App »
   du wizard :

   ```text
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot+applications.commands
   ```

   `permissions=8` correspond à « Administrator », recommandé en
   première installation pour que tous les modules fonctionnent
   sans blocage de permissions. Vous pourrez restreindre plus tard.

---

## Vérifier que tout fonctionne

```sh
# Le dashboard répond ?
curl -fsS http://localhost:3000/ -o /dev/null && echo "✅ dashboard OK"

# L'API interne répond ? (depuis l'hôte Docker)
docker compose -f docker/docker-compose.prod.yml exec bot \
  curl -fsS http://127.0.0.1:4000/health
# → {"status":"ok",...}

# Le bot a-t-il rejoint le gateway Discord ?
docker compose -f docker/docker-compose.prod.yml logs bot | grep "Client Discord ready"
# → ... "tag":"VotreBot#1234","guilds":1 ...
```

Ouvrez ensuite **`http://localhost:3000`** dans votre navigateur
(ou votre domaine HTTPS) et connectez-vous avec votre compte Discord.

---

## Mettre Varde derrière un domaine HTTPS

En production, n'exposez jamais le port 3000 directement à Internet —
mettez un **reverse-proxy** devant pour gérer le TLS. Le plus simple
est **Caddy**, qui obtient automatiquement un certificat Let's Encrypt.

Sur la même machine que Varde, installez Caddy
([caddyserver.com/docs/install](https://caddyserver.com/docs/install))
puis créez `/etc/caddy/Caddyfile` :

```caddy
votre-domaine.com {
    reverse_proxy localhost:3000
}
```

Rechargez : `sudo systemctl reload caddy`. C'est tout — Caddy
demande le certificat à Let's Encrypt et redirige `:80 → :443`.

> 🛡️ Avec un reverse-proxy, vérifiez que votre `.env` contient
> bien l'URL **HTTPS** dans `VARDE_BASE_URL`, et que le redirect
> OAuth2 dans le Discord Developer Portal pointe vers
> `https://votre-domaine.com/api/auth/callback/discord`.

---

## Sauvegardes

### Postgres

Sauvegarde quotidienne recommandée. Dans un `cron` :

```sh
0 3 * * * docker compose -f /chemin/vers/varde/docker/docker-compose.prod.yml \
  exec -T postgres pg_dump -U varde -Fc varde \
  > /var/backups/varde/db-$(date +\%F).dump
```

Restauration :

```sh
docker compose -f docker/docker-compose.prod.yml \
  exec -T postgres pg_restore -U varde -d varde --clean < backup.dump
```

### Uploads (cartes welcome, polices custom)

Le volume Docker `varde_prod_bot_uploads` contient les images
uploadées par les admins. Sauvegardez-le :

```sh
docker run --rm \
  -v varde_prod_bot_uploads:/data:ro \
  -v $(pwd):/backup \
  alpine tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

---

## Mettre à jour Varde

```sh
# Récupérer la nouvelle version
git fetch --tags
git checkout v0.6.0   # ou la cible souhaitée

# Lire le CHANGELOG entre votre version actuelle et la nouvelle
cat CHANGELOG.md

# Rebuilder et relancer
docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d --build

# Appliquer les nouvelles migrations s'il y en a
docker compose -f docker/docker-compose.prod.yml --env-file docker/.env \
  --profile migrate run --rm migrate
```

> 📋 **Lisez toujours le `CHANGELOG.md`** avant une mise à jour.
> Les variables d'environnement ajoutées y sont signalées, comme
> les éventuelles migrations manuelles à faire.

---

## Procédures de sécurité

Les procédures sensibles (rotation de la master key, révocation du
token bot, rotation du secret de session) sont décrites pas à pas
dans **[SECURITY.md](../SECURITY.md)**. À garder sous la main avant
qu'un incident arrive, pas après.

---

## En cas de problème

### `pg_isready` ne passe pas, le bot reste en `unhealthy`

Le conteneur Postgres met du temps au premier démarrage (init de la
base, healthcheck en attente). Vérifiez les logs :

```sh
docker compose -f docker/docker-compose.prod.yml logs postgres | tail
```

Si vous voyez `database system is ready to accept connections`,
patientez — le bot retentera la connexion automatiquement.

### Le dashboard répond 500 au login OAuth

Vérifiez :

1. Le redirect URI déclaré dans le Discord Developer Portal
   correspond **exactement** (à la barre oblique près) à
   `${VARDE_BASE_URL}/api/auth/callback/discord`.
2. `VARDE_AUTH_SECRET` est bien défini et ≥ 32 octets.
3. `VARDE_BASE_URL` est en `https://` si vous êtes derrière un
   reverse-proxy.

### Le bot ne voit pas son serveur

Si vous voyez `guilds:0` dans les logs juste après l'invitation, c'est
normal pendant quelques secondes — le bot reçoit l'événement
`GuildCreate` puis l'inscrit en base. Si ça persiste plus de 30 s,
relancez le bot :

```sh
docker compose -f docker/docker-compose.prod.yml restart bot
```

### Erreurs `EADDRINUSE` au démarrage

Un autre processus utilise déjà le port 3000. Soit tuez ce
processus, soit changez la valeur de `VARDE_DASHBOARD_PORT` dans
`docker/.env`.

### Logs détaillés pour investiguer

```sh
# Tous les services en suivi continu
docker compose -f docker/docker-compose.prod.yml logs -f

# Un seul service
docker compose -f docker/docker-compose.prod.yml logs -f bot

# Niveau debug à la volée (puis restart)
echo "VARDE_LOG_LEVEL=debug" >> docker/.env
docker compose -f docker/docker-compose.prod.yml up -d
```

---

> 🆘 **Toujours bloqué·e ?** Ouvrez une issue avec :
>
> - votre version de Varde (`git describe --tags`),
> - votre OS (`uname -a`),
> - le bout de log pertinent (sans tokens ni secrets),
> - ce que vous avez essayé.
