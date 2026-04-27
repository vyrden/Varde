# Politique de sécurité

Merci de prendre le temps de remonter une vulnérabilité. Ce document
explique comment le faire de manière responsable et comment le projet gère
les signalements.

## Versions supportées

Seule la dernière version mineure publiée est activement supportée pour les
correctifs de sécurité. Les versions antérieures peuvent être mises à jour
au cas par cas selon la sévérité.

| Version | Supportée      |
| ------- | -------------- |
| latest  | Oui            |
| older   | Au cas par cas |

## Signaler une vulnérabilité

Ne jamais ouvrir d'issue publique pour un problème de sécurité.

Utiliser à la place l'un des canaux suivants, par ordre de préférence :

1. **GitHub Security Advisories** : onglet "Security" du repo, bouton
   "Report a vulnerability". Canal privilégié car il crée un espace de
   discussion chiffré et traçable avec le mainteneur.
2. **Email** : `github-repo.policy126@passmail.com`.

Inclure dans le signalement :

- Description du problème.
- Étapes de reproduction.
- Impact estimé (qui est affecté, comment).
- Version concernée.
- Si possible, une suggestion de correctif.

## Ce à quoi s'attendre

- **Accusé de réception** : sous 72 heures ouvrées.
- **Première évaluation** : sous 7 jours, avec qualification (sévérité,
  scope, validité).
- **Correction** : les vulnérabilités de sévérité haute ou critique sont
  traitées en priorité. Un correctif est publié dès que possible, avec un
  advisory détaillant la nature du problème, les versions affectées, et
  les mesures recommandées.
- **Crédit** : le reporter est crédité dans l'advisory sauf demande
  contraire.

## Divulgation coordonnée

Le projet suit une politique de divulgation coordonnée. Grandes lignes :

- Le reporter et le mainteneur conviennent d'une date de divulgation.
- Délai usuel : 30 à 90 jours selon la complexité du correctif et la
  sévérité.
- Pas de divulgation publique avant que le correctif soit disponible et
  les utilisateurs aient eu un délai raisonnable pour mettre à jour.
- Exceptions : vulnérabilités activement exploitées ou déjà publiquement
  connues, qui peuvent justifier un advisory immédiat.

## Scope

Sont couverts par cette politique :

- Le code du projet (core, modules officiels, dashboard, API).
- Les images Docker officielles publiées par le projet.
- Les dépendances directes du projet.

Ne sont pas couverts :

- Les modules tiers hébergés hors de ce repo : rapporter directement à
  leurs auteurs respectifs.
- Les problèmes sur les instances auto-hébergées dus à une mauvaise
  configuration de l'administrateur (clés exposées, permissions
  incorrectes).
- Les problèmes sur Discord lui-même.

## Pratiques de sécurité du projet

Le projet applique les pratiques suivantes :

- Revue des PR obligatoire pour le code critique (core, permissions,
  audit, sécurité).
- Scan de dépendances automatisé à chaque PR et planifié.
- Scan de secrets en CI (gitleaks, voir
  `.github/workflows/secrets-scan.yml`).
- Dépendances de sécurité haute ou critique mises à jour sous 7 jours.
- Builds reproductibles documentés.
- Headers de sécurité posés sur 100 % des réponses HTTP : CSP, HSTS,
  X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy. Côté API via `@fastify/helmet`, côté dashboard
  via `next.config.mjs#headers()`.
- Rate limiting global sur l'API (300 req/min/IP par défaut), plafond
  serré sur les routes IA (10 req/min/IP) qui appellent un provider
  LLM externe.
- Stockage des secrets tiers chiffré au repos en AES-256-GCM via le
  keystore (voir ADR 0001 `keystore`).
- Images Docker signées (à terme, avec cosign ou équivalent).

## Modèle de menaces (V1)

Cette section liste explicitement les attaques considérées et celles
hors-scope, pour cadrer les attentes côté reporter et côté
mainteneur.

### Considérées

- **Compromission d'un compte admin Discord** : un attaquant qui
  obtient les identifiants Discord d'un admin avec MANAGE_GUILD peut
  reconfigurer ses serveurs via le dashboard. Mitigation : pas de
  privilège dashboard au-delà de ce que Discord OAuth2 + MANAGE_GUILD
  autorisent déjà. L'audit log centralisé trace toute action.
- **Vol du token bot Discord** : un attaquant qui exfiltre
  `VARDE_DISCORD_TOKEN` peut piloter le bot sur tous les serveurs où
  il est invité. Mitigation : token env-only, jamais persisté en DB,
  jamais logué. Procédure de révocation documentée plus bas.
- **Injection SQL** : surface réduite par Drizzle paramétré partout,
  validation Zod aux frontières d'API.
- **XSS dashboard** : React échappe par défaut, le rendu Markdown
  Discord (`renderDiscordMarkdown`) échappe explicitement
  `<` `>` `&` avant insertion. CSP en complément.
- **CSRF** : routes mutantes côté API exigent une session JWT signée
  HS256 (cookie HttpOnly + SameSite). Auth.js gère côté Next.
- **Rejeu de session** : le JWT est court-vécu (rotation au refresh
  OAuth Discord).
- **Abus de routes coûteuses (LLM)** : rate limiting strict sur
  `/onboarding/ai/*` (10 req/min/IP).
- **Fuite de secrets via logs** : aucune entrée logger n'embarque
  token / clé / password — vérifié par grep automatique au build.

### Hors scope

- **Compromission de l'OS hôte** : si l'attaquant a un shell sur la
  machine, il a accès aux variables d'environnement et à la DB. La
  responsabilité revient à l'opérateur (durcissement OS, isolation
  réseau).
- **Compromission de l'API Discord elle-même** : pas de défense
  côté projet contre une faille Discord upstream.
- **Modules tiers malveillants** : un opérateur qui installe un
  module non audité s'expose. Le contrat module donne accès à
  `ctx.keystore`, `ctx.config`, `ctx.discord` — un module hostile
  peut exfiltrer ce que ces APIs lui exposent. Recommandation :
  n'installer que des modules audités. Isolation worker thread
  prévue en V1.2.

## Procédures opérationnelles

Ces procédures s'adressent à l'**administrateur de l'instance**
auto-hébergée. Elles supposent un accès shell au serveur et aux
variables d'environnement.

### Rotation de la master key (chiffrement keystore)

Le keystore chiffre les secrets tiers (clés API IA, etc.) avec
AES-256-GCM. La master key vit en variable d'environnement, jamais
en base. Pour la roter sans interruption :

1. Générer une nouvelle clé 32 octets :

   ```sh
   openssl rand -base64 32
   ```

2. Sur le process en cours :
   - Déclarer la nouvelle clé en `VARDE_KEYSTORE_MASTER_KEY`.
   - Déclarer **l'ancienne** clé en
     `VARDE_KEYSTORE_PREVIOUS_MASTER_KEY`.
3. Redémarrer `apps/server`. Au démarrage, le keystore continue à
   lire les enregistrements existants chiffrés sous l'ancienne clé
   (fallback `previousMasterKey`), et chaque écriture utilise la
   nouvelle clé.
4. La ré-encryption se fait **paresseusement** : un secret n'est
   ré-écrit qu'au prochain `put`. Pour forcer la ré-encryption
   complète, utiliser la méthode `rekey()` du `KeystoreService` (à
   exposer via une commande administrateur — issue trackée pour le
   jalon 6).
5. Une fois la ré-encryption complète, retirer
   `VARDE_KEYSTORE_PREVIOUS_MASTER_KEY` et redémarrer.

**Critères de réussite** : aucun `get` ne retombe sur l'ancienne
clé, les `ai_invocations` continuent à fonctionner sans erreur de
déchiffrement.

### Révocation d'un token bot Discord compromis

Si tu soupçonnes que `VARDE_DISCORD_TOKEN` a fuité :

1. **Immédiatement** : aller sur
   <https://discord.com/developers/applications/{APP_ID}/bot>,
   cliquer « Reset Token ». L'ancien token est invalidé
   instantanément côté Discord.
2. Mettre à jour `VARDE_DISCORD_TOKEN` dans le secret manager du
   serveur (ou `.env.local` en dev) avec le nouveau token.
3. Redémarrer `apps/server`. Le bot reconnecte avec le nouveau
   token.
4. Auditer le journal du bot (`pino` JSON logs) entre la fuite
   estimée et la rotation pour repérer toute action anormale.
5. Si un audit révèle des actions hostiles, utiliser l'audit log
   centralisé (`/guilds/:id/audit` côté dashboard) pour reconstituer
   l'impact serveur par serveur.

### Rotation du secret JWT (`VARDE_AUTH_SECRET`)

`VARDE_AUTH_SECRET` est le secret HS256 partagé entre Auth.js
(dashboard, signature) et l'API Fastify (vérification). Il est
posé en variable d'environnement et n'est jamais persisté en DB.
Le faire tourner invalide **tous** les cookies de session en cours
— c'est l'unique mécanisme de logout-all-sessions disponible vu
qu'Auth.js v5 stratégie JWT n'a pas de blacklist serveur.

À faire en cas de :

- Suspicion qu'un cookie de session valide a été exfiltré.
- Compromission soupçonnée du host hébergeant l'app (les variables
  d'environnement étaient lisibles).
- Rotation préventive trimestrielle (recommandé, cf. checklist
  opérateur ci-dessous).

Procédure :

1. Générer un nouveau secret 32 octets :

   ```sh
   openssl rand -base64 32
   ```

2. Mettre à jour `VARDE_AUTH_SECRET` dans le secret manager du
   serveur (ou `.env.local` en dev) avec la nouvelle valeur.
3. Redémarrer **simultanément** dashboard (Next.js) et API
   (Fastify) — sinon les deux côtés vérifient avec des secrets
   différents et toute requête authentifiée renvoie 401.
4. Conséquence visible : tous les admins connectés sont
   déconnectés, devront re-login via Discord. Aucune action
   d'admin requise côté Discord (pas de re-grant OAuth tant que
   les scopes inchangés).
5. Vérifier les logs : flux de `401 unauthenticated` côté API
   pendant ~15 min puis redescente normale.

**Critère de réussite :** anciens cookies refusés (curl avec un
ancien cookie sur `/me` → 401), nouveaux cookies acceptés après
re-login.

### Révocation d'une clé API IA fuitée

1. Révoquer la clé chez le provider (OpenAI dashboard, OpenRouter,
   Groq, etc. — chaque provider a un bouton de révocation).
2. Aller sur `/guilds/:id/settings/ai` côté dashboard, saisir la
   nouvelle clé. L'ancienne est écrasée dans le keystore (chiffrée
   au repos).
3. Vérifier dans `ai_invocations` qu'il n'y a pas eu d'appels
   non-attendus avec la clé compromise.

### Audit du flow d'authentification (réalisé jalon 5 PR 5.10)

État du flow auth dashboard ↔ API au 2026-04-27. À rejouer à
chaque passe de polish technique récurrente (cf. mémoire interne).

- **Stratégie Auth.js v5** : JWT (pas DB session), HS256 signé avec
  `VARDE_AUTH_SECRET`. Cookie `varde.session` posé par le dashboard,
  vérifié par l'API via `jose.jwtVerify` (whitelist d'algorithmes).
  L'API n'a pas `next-auth` en dépendance — seulement `jose`.
- **Cookie flags** : `httpOnly: true` (XSS ne lit pas le cookie),
  `sameSite: 'lax'` (CSRF basique : navigation top-level autorisée,
  cross-site POST refusé), `secure: true` en `NODE_ENV=production`.
  `path: '/'`. Pas de `domain` posé → cookie restreint au host.
- **Claims minimum** dans le JWT : `sub` (user Discord ID, requis),
  `username`, `accessToken` (Discord OAuth pour appels API → Discord
  uniquement), plus métadonnées d'avatar pour l'UI. Pas de
  permissions précompilées dans le JWT — recalculées par requête
  côté API via `requireGuildAdmin` qui interroge Discord.
- **Pas de leak `accessToken` côté client** : le callback `session`
  d'Auth.js construit explicitement `session.user` par whitelist
  des champs publics (id, name, globalName, image, decoration), sans
  spread implicite du JWT. La route `/me` côté API redacte aussi
  `accessToken` avant de répondre (test d'isolation dans
  `apps/api/tests/unit/server.test.ts`).
- **Expiration** : 7 jours (`maxAge` sur la session JWT). Pas de
  refresh token implémenté — l'admin re-login après expiration.
  Discord access_token : Auth.js le rafraîchit automatiquement si
  l'événement OAuth survient ; sinon expiration côté Discord
  (typiquement 7 jours) → 401 sur l'appel `/users/@me/guilds` →
  l'admin doit re-login.
- **Logout serveur** : Auth.js v5 stratégie JWT n'a pas de blacklist
  côté serveur. Un cookie volé reste valide jusqu'à expiration. Le
  seul mécanisme « logout-all-sessions » est la rotation de
  `VARDE_AUTH_SECRET` (procédure ci-dessus). Documenté comme
  acceptable V1, à reconsidérer si on bascule en stratégie session
  DB (ADR à écrire).
- **CSRF** : double couche.
  1. `SameSite=Lax` empêche les requêtes cross-site avec cookies
     sauf navigations top-level GET.
  2. CORS strict côté API (`@fastify/cors` configuré via
     `corsOrigin`, autorise uniquement l'origine du dashboard ;
     `credentials: true` ne s'applique que sur cette origine).
  Les routes mutantes API n'ont pas de CSRF token explicite — le
  combo SameSite + CORS + cookie HttpOnly est la défense V1. Un
  attaquant doit voler le cookie (XSS bloqué par CSP + HttpOnly) OU
  contrôler l'origine dashboard pour exécuter une mutation.
- **Algorithmes acceptés** : `algorithms: ['HS256']` whitelisté
  côté `jose.jwtVerify`. Pas de fallback `alg: none` ni RS256 —
  pas de surface CVE classique JWT.

### Baselines de performance (jalon 5)

Mesures observées au 2026-04-27. Servent de référence pour détecter
une régression majeure ; pas des SLA.

- **Bundle client dashboard** : ~1170 KB uncompressed total
  (toutes routes confondues), ~355 KB gzipped. Plafond de
  régression appliqué dans `.github/workflows/ci.yml` step
  « Bundle size check » : 1700 KB uncompressed, 500 KB gzipped
  (slack ~30 %). Mesure manuelle après
  `pnpm --filter @varde/dashboard build` :
  `find apps/dashboard/.next/static/chunks -name '*.js' -exec du -b {} + | awk '{s+=$1} END {print s/1024 " KB"}'`.
- **Couverture tests** : core 80.91 % / 81.83 % (statements / lines),
  api 76.49 % / 78.34 %. Plancher anti-régression appliqué via
  `pnpm coverage` (configuré dans `vitest.config.ts` de chaque
  package, exécuté en CI).
- **API p95** : cible indicative < 200 ms hors LLM (les routes
  `/onboarding/ai/*` ont une latence dominée par le provider LLM,
  hors scope). Mesure ad-hoc via `npx autocannon@latest` — pas de
  bench automatisé en V1, l'overhead de tooling ne se justifie que
  si on observe une dégradation. Procédure manuelle :

  ```sh
  # 1. Lancer le bot+API en local : pnpm --filter @varde/server start
  # 2. Récupérer un cookie de session valide via le dashboard.
  # 3. Bench une route représentative (1000 req, 10 conn, sans LLM) :
  npx autocannon@latest \
    -c 10 -d 30 -m GET \
    -H "cookie: varde.session=<JWT>" \
    "http://localhost:4000/guilds/<guildId>/audit?limit=50"
  ```

  Lire la ligne `Latency ... 99%` dans la sortie autocannon. Si
  > 200 ms : profile via `clinic.js doctor` ou `0x` pour identifier
  le hot path. Si DB-bound, vérifier les index Drizzle ; si CPU-bound
  (rare en V1), vérifier les sérialisations JSON volumineuses.

- **Bot stabilité 24 h** : à valider en simulation manuelle pré-
  release (jalon 6). Procédure :
  1. Lancer le bot connecté à un serveur Discord de staging.
  2. Vérifier 24 h plus tard : `ps aux | grep "dist/bin"` montre
     le PID toujours vivant ; `top -p <pid>` montre RSS stable
     (croissance < 50 MB sur la fenêtre).
  3. Inspecter les logs Pino : aucune entrée `discord shard
     disconnect` non suivie d'un `shard ready` / `shard resume`
     (PR 5.9 a posé les listeners qui rendent ces incidents
     visibles). Aucun `error` sans contexte.
  4. Critères d'échec : OOM, processus tué par OOM-killer Linux,
     mémoire en croissance linéaire, plus de 3 disconnects sans
     resume sur la fenêtre.

### Audit ponctuel de l'instance (checklist opérateur)

À faire à chaque mise en production majeure ou tous les 3 mois :

- [ ] `pnpm audit` ne signale aucune vulnérabilité HIGH ou CRITICAL.
- [ ] Le scan gitleaks de la dernière build CI est passé.
- [ ] Les variables d'environnement sensibles
      (`VARDE_DISCORD_TOKEN`, `VARDE_KEYSTORE_MASTER_KEY`,
      `VARDE_DATABASE_URL`, `AUTH_SECRET`) ne sont pas dans les logs
      Pino du serveur — `grep -i "VARDE_\|MASTER_KEY\|DISCORD_TOKEN"`
      sur la sortie JSON doit retourner 0 ligne.
- [ ] Le user PostgreSQL utilisé n'est pas superuser et n'a accès
      qu'au schéma de l'app.
- [ ] Headers de sécurité présents sur les réponses du dashboard :
      `curl -sI https://dashboard.example/ | grep -iE
      "content-security-policy|strict-transport|x-frame"` retourne
      au moins ces 3 lignes.
- [ ] Backups DB testés : un `pg_restore` a réussi sur une instance
      jetable dans le mois écoulé.
- [ ] `VARDE_KEYSTORE_MASTER_KEY` rotée dans les 12 derniers mois,
      ou rotation planifiée et tracée dans le calendrier opérateur.
- [ ] `VARDE_AUTH_SECRET` rotée dans les 3 derniers mois (déconnecte
      tous les admins — opération courte mais visible). Procédure
      ci-dessus. Si plus de 6 mois sans rotation, **planifier
      immédiatement**.

## Safe harbor

Les chercheurs de sécurité qui :

- suivent la procédure de signalement décrite ici,
- s'abstiennent de tout dommage ou accès à des données au-delà de ce qui
  est nécessaire pour démontrer la vulnérabilité,
- respectent le délai de divulgation coordonnée,

peuvent compter sur la collaboration du mainteneur pour traiter leur
signalement de bonne foi, sans poursuite.
