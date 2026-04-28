# 0006. Session partagée dashboard ↔ API via cookie JWT HS256

Date: 2026-04-21
Statut: accepted

## Contexte

Le dashboard (Next.js) et l'API (Fastify) vivent dans deux process
distincts — voir [ADR 0004](./0004-monolithe-bot-api.md) — et doivent
partager la notion d'« utilisateur connecté ». L'authentification
passe par Discord OAuth2, côté dashboard, via Auth.js v5.

Deux familles de solutions :

- **Session serveur en base**, partagée par une table
  `sessions(sid, userId, expiresAt, ...)` lue par les deux process.
  Auth.js côté dashboard, middleware côté API qui relit la même
  table.
- **Token signé transporté en cookie**, sans table de sessions. Les
  deux process vérifient la signature avec le même secret. Auth.js
  produit un JWT, Fastify le vérifie avec `jose`.

Contraintes pesant sur le choix :

- La V1 refuse d'ajouter un shared state applicatif inutile. Ajouter
  une table `sessions` oblige le bot et l'API à synchroniser un cycle
  de vie de session, à gérer les purges, à réfléchir au cache.
- L'API Fastify doit rester indépendante d'Auth.js — elle ne doit pas
  importer Next ni next-auth. Elle doit faire la vérification avec
  une lib de crypto standard.
- L'`access_token` Discord (nécessaire pour appeler
  `/users/@me/guilds` depuis l'API, voir
  [routes guilds](../../apps/api/src/routes/guilds.ts)) doit voyager
  avec la session — sinon l'API doit aller le chercher ailleurs.
- Les deux process tournent sur le même origin en prod (reverse proxy
  devant les deux), et en dev sur `localhost` avec deux ports
  distincts. Les cookies doivent être compatibles avec les deux
  configurations.

## Décision

On adopte le modèle **JWT partagé via cookie**.

### Signature et secret

- Algorithme : **HS256** avec secret symétrique partagé
  `VARDE_AUTH_SECRET`. HS256 est suffisant : les deux process sont
  des peers légitimes, aucun tiers ne doit vérifier sans signer.
- Le secret est fourni par variable d'environnement. En l'absence,
  Auth.js côté dashboard retombe sur un secret dev explicite (non
  utilisable en prod — ADR 0004 discute la composition). L'API
  refuse de démarrer sans `VARDE_AUTH_SECRET` en prod.

### Encodage

- Côté dashboard, Auth.js v5 est configuré avec `session.strategy:
  'jwt'` et des callbacks `encode`/`decode` sur-chargés qui utilisent
  **`jose.SignJWT` / `jose.jwtVerify`**. On évite le format JWE
  maison d'Auth.js pour que l'API puisse décoder avec la même lib
  standard.
- Côté API, un `createJwtAuthenticator({ secret, cookieName })`
  lit le cookie, décode via `jose.jwtVerify`, expose une
  `SessionData` typée à Fastify.

### Cookie

- Nom fixe : **`varde.session`**. Partagé tel quel par Auth.js
  (`cookies.sessionToken.name`) et par `createJwtAuthenticator`
  (`cookieName` par défaut).
- Attributs : `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`,
  `secure: true` en production. `lax` est suffisant — le dashboard
  ne passe jamais de mutation cross-site, les server actions et le
  PUT modules passent par le même origin.

### Contenu du payload

- `sub` : l'ID Discord de l'utilisateur (pas d'userId interne en V1 —
  on ne persiste aucun `users` côté core, l'ID Discord fait foi).
- `username` : pseudo Discord (pour l'affichage dashboard).
- `accessToken` : l'`access_token` Discord, propagé par Auth.js via
  le callback `jwt` (`account.access_token`), consommé par l'API pour
  appeler `/users/@me/guilds` — pas de persistance côté dashboard.
- `iat`, `exp` : issued/expire, TTL 7 jours (`sessionMaxAgeSeconds`).

### Forwarding depuis le dashboard vers l'API

Les server components et server actions du dashboard re-attachent le
cookie en appelant l'API depuis le process Next : le cookie est lu
via `next/headers` puis posé dans l'en-tête `cookie` de la requête
sortante. Le navigateur ne parle **jamais directement** à l'API —
pas de CORS à ouvrir, pas de `credentials: 'include'` à exposer.

## Alternatives considérées

### Table `sessions` partagée en DB

Rejetée :

- Oblige l'API à relire la DB à chaque requête, ce qui ajoute une
  requête systémique non triviale vs une vérification crypto en O(1).
- Oblige à réfléchir au cycle de vie (révocation, purge, cache). Pour
  la V1 aucun cas d'usage ne justifie la révocation instantanée d'une
  session spécifique.
- Force un état partagé supplémentaire que [ADR 0003](./0003-mode-degrade-redis.md)
  et [ADR 0004](./0004-monolithe-bot-api.md) cherchent à minimiser.

### Double cookie (session dashboard + token API séparé)

Rejetée : double surface d'authentification à maintenir, double
origine possible de bug (désynchronisation entre cookie session et
cookie API), aucun gain.

### JWT asymétrique (RS256 / ES256)

Envisageable mais prématuré en V1. L'intérêt de la clé publique est
la vérification par des tiers — on n'en a pas. HS256 reste plus
simple et aussi sûr tant que le secret reste secret.

### CORS + credentials pour laisser le browser taper l'API directement

Rejetée : oblige à ouvrir CORS sur l'API, à gérer les preflight, à
distinguer origin dashboard et origin API. Forwarder via Next
server-side est strictement plus simple et garde l'API derrière un
seul appelant connu.

## Conséquences

### Positives

- Pas de table sessions, pas de jointure supplémentaire, pas de
  cache à invalider.
- L'API est indépendante d'Auth.js — un futur client non-Next (CLI,
  tests, tierce partie) peut signer un JWT avec le même secret pour
  s'authentifier.
- Le mode monolithe (ADR 0004) comme un futur mode split tolèrent
  cette stratégie sans modification.
- Le cookie `varde.session` est l'unique source d'authentification :
  facile à révoquer (effacer le cookie côté client suffit pour le
  navigateur ; la rotation du secret invalide toutes les sessions).

### Négatives et points de vigilance

- **Révocation individuelle non possible** tant que le JWT n'expire
  pas. Pour les communautés visées (V1), pas de cas d'usage
  critique. Si un jour on a besoin (ex : interdire un modérateur
  banni), on ajoutera une liste de révocation ou on passera à un
  modèle à session DB — nouvel ADR.
- **Rotation du secret** invalide toutes les sessions en cours. Le
  cycle de vie `VARDE_AUTH_SECRET` doit être documenté côté
  exploitation (changer le secret = déconnexion globale).
- Le secret est partagé par deux process : une fuite du secret
  compromet les deux. Le déploiement doit le traiter comme tout
  secret critique (pas dans l'image, injecté au runtime).
- `accessToken` Discord dans le payload : s'il fuit (ex : logs), un
  attaquant peut appeler `/users/@me/guilds` au nom de la victime.
  La rédaction de logs Pino masque ce champ ; toute extension de
  log doit le vérifier.

## Références

- [`apps/dashboard/auth.ts`](../../apps/dashboard/auth.ts) —
  configuration Auth.js v5 avec `encode`/`decode` via `jose`.
- [`apps/api/src/jwt-authenticator.ts`](../../apps/api/src/jwt-authenticator.ts)
  — middleware Fastify qui vérifie le même cookie.
- [`apps/api/src/routes/guilds.ts`](../../apps/api/src/routes/guilds.ts)
  — exemple de consommation de `accessToken` pour appeler Discord.
- [0004 - Monolithe bot + API](./0004-monolithe-bot-api.md) — contexte
  d'exécution dans lequel le choix prend sens.
