# 0013. Persistance des credentials Discord en DB chiffrée plutôt qu'en `.env`

Date: 2026-04-29
Statut: accepted

## Contexte

Avant le jalon 7, l'instance lisait son token bot Discord et son client
secret OAuth depuis `.env.local` au boot, via les variables
`VARDE_DISCORD_TOKEN`, `VARDE_DISCORD_CLIENT_ID`,
`VARDE_DISCORD_CLIENT_SECRET`. L'admin éditait le fichier à la main
avant de lancer le service, puis redémarrait à chaque rotation.

Le jalon 7 vise une « simplification de l'installation » (cf.
`docs/ROADMAP.md`). Le wireframe du wizard demande à l'admin de
coller ses credentials directement dans le navigateur, étape par étape,
avec une validation Discord à chaque étape. Cela impose de persister
ces credentials côté serveur pour que :

- la connexion gateway puisse être démarrée sans redémarrage du
  process une fois le wizard fini ;
- une instance redémarrée puisse retrouver ses credentials sans
  qu'on rejoue le wizard ;
- une rotation (token compromis, secret régénéré) puisse passer par
  l'UI plutôt que par une édition de fichier sur la machine hôte.

Trois questions à trancher :

1. **Où persister** — fichier sur disque, variable d'env générée,
   table DB ?
2. **Quel chiffrement** — clair, dérivation de la master key
   keystore, primitive séparée ?
3. **Comment migrer les déploiements existants** qui ont déjà du
   `VARDE_DISCORD_TOKEN` en env — bascule dure, fallback temporaire,
   import manuel ?

Contraintes :

- Auto-hébergé, pas de service tiers — pas de KMS managé.
- Master key keystore (`VARDE_KEYSTORE_MASTER_KEY`) déjà en place
  pour chiffrer les secrets modules tiers (clés API IA notamment).
- Le token bot doit être déchiffré au boot (avant que le bot soit
  visible) — donc à un moment où aucun utilisateur n'est connecté,
  donc sans cookie de session.
- Compatible avec le mode rotation déjà documenté côté keystore
  (`VARDE_KEYSTORE_PREVIOUS_MASTER_KEY`).

## Décision

**Une table singleton `instance_config` (variante PG + variante
SQLite) qui porte tous les credentials Discord chiffrés au repos
en AES-256-GCM avec la même primitive que le keystore.**

Schéma (extraits — voir `packages/db/src/schema/{pg,sqlite}.ts`) :

- `id` text fixe `'singleton'` + `CHECK (id = 'singleton')` →
  contrainte applicative et SQL qu'il n'y a qu'une seule ligne.
- `discord_app_id` text (clair, public).
- `discord_public_key` text (clair, public).
- `discord_bot_token_{ciphertext,iv,auth_tag}` blob — token
  chiffré.
- `discord_client_secret_{ciphertext,iv,auth_tag}` blob — secret
  chiffré.
- `bot_name`, `bot_avatar_url`, `bot_description` text (clair —
  publics côté Discord).
- `setup_step` int — étape la plus avancée atteinte par le wizard.
- `setup_completed_at` timestamp nullable — déclencheur du
  démarrage du bot.

Le service `instanceConfigService` (dans `@varde/core`) abstrait
chiffrement/déchiffrement via les primitives `encryptString` /
`tryDecryptString` du module `keystore.ts`, exposées publiquement
au commit `feat(db): jalon 7 PR 7.1 — table singleton
instance_config + crypto exports`. Pas de duplication de la
primitive.

Au boot, `apps/server/src/bin.ts` :

1. Lit `setup_completed_at` via le service.
2. Si `null` ET `VARDE_DISCORD_TOKEN` env présent → chemin legacy,
   login avec le token env (warning émis pour signaler la migration
   à venir).
3. Si `null` ET pas d'env token → la gateway n'est pas connectée.
   Un listener `onReady` du service prendra le relais quand le
   wizard appellera `complete()`.
4. Si `setup_completed_at` posé → login avec le token DB déchiffré.

`VARDE_DISCORD_TOKEN`, `VARDE_DISCORD_CLIENT_ID`,
`VARDE_DISCORD_CLIENT_SECRET` deviennent **optionnels et legacy**.
Ils restent supportés temporairement pour les dev setups antérieurs
au wizard ; documentés dans `.env.example` avec un avertissement
explicite. Ils seront retirés à une PR ultérieure quand toutes les
instances en cours auront migré.

## Alternatives considérées

### Fichier chiffré sur disque (ex. `instance.json.enc`)

Avantage : pas de table DB supplémentaire, pas de migration.

Rejeté parce que :

- duplique le mécanisme de chiffrement-au-repos du keystore (qui
  vit déjà en DB) ;
- complique les backups (deux artefacts à sauvegarder au lieu
  d'un dump DB) ;
- empêche un éventuel multi-instance share de DB (pas un cas V1
  mais le verrouillage est gratuit) ;
- pas d'avantage concret par rapport à la DB une fois qu'on a déjà
  la table keystore.

### Vault externe (HashiCorp Vault, AWS Secrets Manager, etc.)

Rejeté parce que contraire au principe « auto-hébergé, autonome,
transparent » de `CLAUDE.md`. Une instance Varde doit pouvoir
tourner sur un Raspberry Pi 4 sans dépendance à un service tiers.

### Réutiliser la table `keystore` existante

La table `keystore` est scopée par `(guildId, moduleId, key)` —
trois colonnes qui n'ont pas de sens pour un secret system-level
de l'instance. On aurait dû ajouter des sentinelles
(`guildId='__instance__'`, `moduleId='__core__'`) qui ouvrent une
porte aux collisions et obscurcissent le contrat.

Une table dédiée avec sa propre contrainte singleton est plus
explicite, et la primitive crypto est partagée — on n'a pas
dupliqué le chiffrement, juste les colonnes.

### Demander au wizard d'écrire `.env.local` côté serveur

Rejeté parce que :

- impose des permissions d'écriture sur le filesystem du process
  serveur, ce qu'on évite par principe sur un déploiement
  conteneurisé ;
- nécessite un redémarrage pour relire l'env (Node ne réimporte
  pas `.env` à chaud) — casse l'UX « cliquer puis le bot se
  connecte » ;
- introduit un fichier de secrets à backuper séparément.

### Bascule dure (suppression immédiate du fallback env)

Rejeté pour la migration des dev setups existants qui ont déjà
des credentials en env. Le fallback legacy est explicitement
borné et documenté ; il dégage d'un commit dédié quand on aura
confirmé que les instances en prod sont passées par le wizard.

## Conséquences

Positives :

- L'admin n'a plus à éditer `.env.local` pour configurer Discord.
  Le déploiement « zero-config » (juste `DATABASE_URL` et
  `KEYSTORE_MASTER_KEY` requis) devient possible.
- La rotation d'un token compromis se fait via la page admin
  instance (chantier 2 du jalon 7) sans redémarrage du process.
- Les secrets ne traînent plus dans des shells history, des
  `git status` accidentels sur `.env.local`, ou des images
  Docker qui auraient été buildées avec le token en build-arg.
- Backups simplifiés : un dump Postgres contient toute la config
  de l'instance, plus besoin de versionner ou backuper `.env`
  séparément.

Négatives / nouvelles contraintes :

- La master key (`VARDE_KEYSTORE_MASTER_KEY`) devient encore plus
  critique. Sa perte rend les credentials Discord illisibles —
  l'instance reste configurée en DB mais le bot ne peut plus se
  connecter. Le secret est désormais documenté comme « à
  sauvegarder hors-bande, dans un gestionnaire de secrets ».
  La procédure de rotation (`SECURITY.md`) couvre déjà le cas.
- Phase de transition : le code doit accepter à la fois les
  credentials env (legacy) et DB (nouveau). Cette dualité est
  documentée et limitée à `apps/server/src/bin.ts` + un commit
  de retrait planifié pour la V1.0.0.
- Une corruption de la DB est désormais bloquante pour le bot
  (avant, l'env survivait à un wipe DB). Acceptable parce que
  l'instance ne peut de toute façon pas tourner sans sa DB.

## Références

- Jalon 7 PR 7.1 — Wizard de setup initial : `docs/Jalon 7/PR1-wizard.md`
- Service : `packages/core/src/instance-config.ts`
- Schémas : `packages/db/src/schema/pg.ts`,
  `packages/db/src/schema/sqlite.ts`
- Migrations : `packages/db/migrations/{pg,sqlite}/0002_instance_config.sql`
- Boot : `apps/server/src/bin.ts`, `apps/server/src/boot.ts`
- ADR 0001 (schéma DB du core) — pose le principe d'une table
  par préoccupation.
- `SECURITY.md` — procédure de rotation de la master key keystore,
  étendue ici aux credentials Discord par le même mécanisme.
