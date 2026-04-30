# 0016. Credentials Discord — la BDD est la source unique

Date: 2026-04-30
Statut: accepted

## Contexte

PR 7.1 a posé `instance_config` : une table singleton qui stocke les
credentials Discord (App ID, Public Key, token bot, OAuth client
secret), avec chiffrement AES-256-GCM des valeurs sensibles via la
master key (`VARDE_KEYSTORE_MASTER_KEY`). Le wizard de setup
(`/setup/*`) écrit ces credentials et l'admin route `/admin/discord`
les modifie à chaud post-setup.

Côté `apps/server` (bot + API), tout consomme déjà cette source : le
bot lit son token depuis `instance_config`, les routes admin
revalident contre Discord avec les credentials de la table, etc.

**Côté `apps/dashboard`, ce n'était pas le cas.** Auth.js v5 lisait
`process.env['VARDE_DISCORD_CLIENT_ID']` et
`process.env['VARDE_DISCORD_CLIENT_SECRET']` à l'init du module, et le
bouton « + » du `GuildRail` lisait `VARDE_DISCORD_CLIENT_ID` au render
pour construire l'URL d'invitation du bot. Les mêmes valeurs vivaient
donc à deux endroits :

1. dans `instance_config` (BDD chiffrée, écrites par le wizard)
2. dans `.env.local` (plaintext, à la main)

Cette duplication s'est manifestée concrètement pendant le test du
wizard : un admin a saisi l'App ID `1499…605373` dans le wizard puis
gardé `VARDE_DISCORD_CLIENT_ID=1496…887249` (une autre app) dans son
`.env`. Conséquences :

- **Login dashboard cassé** : Auth.js envoie `client_id=…887249` à
  Discord. Discord cherche les redirect URIs enregistrées sur cette
  app, ne les trouve pas → « redirect_uri OAuth2 non valide ».
- **Bouton invite incohérent** : pointe sur `…887249` alors que le
  bot connecté est `…605373`. Si le login finissait par marcher, le
  clic inviterait une **autre app** que celle qui tourne — bot
  fantôme silencieux.

Le drift n'a même pas été flagué nulle part : aucune source ne « gagne »
sur l'autre, le code lit l'une OU l'autre selon le composant, et le
résultat est cassé sans erreur claire.

Trois familles de solutions ont été envisagées :

1. **Forcer la sync au boot** : valider au démarrage que `process.env`
   et `instance_config` sont alignés, crash sinon. Refusé — ça impose
   à l'admin de toucher au `.env` *en plus* du wizard, exactement le
   contraire de l'objectif produit (« le wizard suffit »).

2. **Wizard qui réécrit `.env.local`** : à chaque étape, le wizard
   patche le fichier sur disque. Refusé — atomicité fragile, casse
   les déploiements en filesystem read-only (containers immuables),
   ajoute une dépendance à des permissions filesystem qui n'existent
   pas en prod.

3. **BDD seule source de vérité, env réduit au bootstrap** (option
   retenue) : `apps/dashboard` lit les credentials depuis
   `instance_config` à chaud comme `apps/server` le fait déjà. L'env
   ne contient plus que les variables qu'on ne peut **pas** stocker
   en BDD pour des raisons de bootstrap (la DB URL, la master key, le
   secret JWT partagé, le port, l'URL publique).

## Décision

On retient l'option 3. La règle :

> `.env` = bootstrap. Tout le reste = BDD.

**Bootstrap** = ce qui doit exister avant qu'on puisse lire la DB ou
décrypter quoi que ce soit. Concrètement : `VARDE_DATABASE_URL`,
`VARDE_KEYSTORE_MASTER_KEY`, `VARDE_BASE_URL`, `VARDE_API_PORT`,
`VARDE_API_HOST`, `VARDE_API_URL`, `VARDE_AUTH_SECRET`,
`VARDE_LOG_LEVEL`, `VARDE_UPLOADS_DIR`. Ces variables sont
intrinsèquement du « comment je démarre », pas du « comment je suis
configuré ».

`VARDE_DISCORD_TOKEN` reste accepté en chemin legacy (warning au boot)
le temps que les déploiements migrent leur ancien `.env` via le
wizard — déjà décidé à ADR 0013, hors scope ici.

### Architecture côté `apps/dashboard`

Pour que Auth.js et `GuildRail` lisent depuis la BDD sans introduire
de dépendance directe à `@varde/db` ou à la master key côté
dashboard, on passe par un endpoint interne :

```
GET /internal/oauth-credentials    →    { clientId, clientSecret }
```

- **Auth** : `Authorization: Bearer <VARDE_AUTH_SECRET>`. Comparaison
  timing-safe avec préfilter de longueur. Pas de nouveau secret à
  introduire — `VARDE_AUTH_SECRET` est déjà partagé API↔dashboard pour
  la signature HS256 des cookies.
- **Statuts** : 401 sans Bearer ou Bearer invalide ; 404 quand le
  wizard n'est pas terminé ; 200 sinon. Le 404 est **un état métier**,
  pas une erreur — le client le retourne en `null` à son caller.
- **Préfixe `/internal/*`** : signale que le path doit être bloqué
  au reverse-proxy (Caddy, Traefik) en exploitation. La doc déploiement
  le rappelle.
- **Rate limit** : 60 req/min/IP. Le client dashboard cache 60 s donc
  on ne dépasse pas en exploitation normale.

### Client côté dashboard

`apps/dashboard/lib/oauth-credentials.ts` expose :

- `createOAuthCredentialsClient({ apiUrl, authSecret, ttlMs?, fetchImpl?, now? })`
  → factory injectable (tests).
- `getOAuthCredentialsClient()` → singleton de prod, lit `VARDE_API_URL`
  et `VARDE_AUTH_SECRET` au premier appel.
- `client.get()` → cache mémoire avec TTL (60 s par défaut), inflight
  de-duplication (deux appels concurrents partagent la même `Promise`),
  retourne `null` sur 404, throw sur les autres échecs.
- `client.invalidate()` → vide le cache pour forcer un refetch après
  rotation connue côté caller.

Auth.js v5 supporte `NextAuth(async () => config)` : la fonction est
appelée par requête, ce qui nous permet de fetcher les credentials
sans bloquer l'init du module. Le cache 60 s amortit le coût.

### Cleanup env

`.env.example` perd `VARDE_DISCORD_CLIENT_ID` et
`VARDE_DISCORD_CLIENT_SECRET`. Un warning explicite est émis au boot
de `apps/server` quand l'une ou l'autre traîne encore dans l'env d'un
déploiement legacy — pas de crash, le code ne les lit plus.

## Conséquences

- **UX admin** : plus jamais besoin de toucher au `.env` après
  l'install initiale pour configurer Discord. Une rotation de secret
  côté `/admin/discord` est prise en compte au max après 60 s, sans
  redémarrage du process.
- **Sécurité** : le client secret OAuth ne vit plus en plaintext sur
  disque. Un dump DB volé ou un backup mal configuré ne donne plus
  rien d'exploitable tant que la master key vit ailleurs.
- **Cohérence** : impossible par construction d'avoir une drift entre
  l'app où le bot tourne, l'app utilisée pour le login dashboard, et
  l'app pointée par le bouton invite. Une seule source, un seul appId.
- **Surface d'exposition** : un nouvel endpoint qui sert des secrets
  en clair — mitigation par Bearer fort (`VARDE_AUTH_SECRET` 32 octets
  aléatoires), timing-safe compare, rate limit, préfixe `/internal/*`
  bloquable au proxy.
- **Échec gracieux** : si l'API est injoignable au moment où Auth.js
  fetch les credentials, le code retombe sur des valeurs vides. Le
  `signIn` Discord échoue proprement (Discord rejette client_id vide),
  le SignInCard reste rendable, l'admin n'a pas un crash de page.

## Références

- Endpoint API : `apps/api/src/routes/internal-credentials.ts`
- Client dashboard : `apps/dashboard/lib/oauth-credentials.ts`
- Wiring Auth.js : `apps/dashboard/auth.ts`
- Wiring GuildRail : `apps/dashboard/components/shell/GuildRail.tsx` +
  `apps/dashboard/app/guilds/[guildId]/layout.tsx`
- ADR amont : 0013 (credentials Discord en BDD chiffrée)
