# Contribuer

Merci de votre intérêt pour le projet. Ce document décrit comment
contribuer efficacement et sans friction.

## Avant de commencer

- Lire le [`README.md`](./README.md) pour comprendre la mission et le
  périmètre V1.
- Pour une contribution significative, ouvrir d'abord une issue pour
  valider l'orientation avant d'investir du temps.

## Types de contributions

- **Corrections de bugs** : toujours bienvenues, accompagnées d'un test de
  régression.
- **Nouvelles fonctionnalités** : ouvrir d'abord une issue pour en discuter.
  Une PR surprise sur une feature non discutée a peu de chance d'être
  mergée.
- **Modules tiers** : pas dans ce repo. Les développer dans un repo à part,
  publier sur le catalogue communautaire (à venir). Les modules officiels
  sont maintenus par l'équipe du projet.
- **Améliorations de documentation** : toujours bienvenues. Les petites
  corrections peuvent passer directement en PR.
- **Traductions** : bienvenues. Les fichiers de traduction vivent dans
  chaque module sous `src/locales/`.

## Setup local

### Prérequis

- Node.js 24 LTS.
- pnpm 10 ou plus récent.
- Docker et Docker Compose.
- Un compte Discord et une application Discord de test (pour obtenir un
  token de bot et des identifiants OAuth2).

### Installation

```sh
git clone <repo-url>
cd varde
git config core.hooksPath .githooks && chmod +x .githooks/*
pnpm install
cp .env.example .env.local
```

Les deux commandes `git config core.hooksPath .githooks` et
`chmod +x .githooks/*` activent les hooks versionnés dans `.githooks/`
(validation de conventions de commit). À exécuter une fois après
clone ; à relancer si un nouveau hook est ajouté.

Éditer `.env.local` pour renseigner les secrets (token Discord, client id /
secret OAuth2, secret de session, etc.). Les variables obligatoires sont
listées dans `.env.example`.

### Créer une application Discord de test

Pour développer et tester localement, il faut une application Discord
dédiée, distincte de toute application utilisée en production ou sur un
serveur réel.

#### Créer l'application

1. Ouvrir
   [discord.com/developers/applications](https://discord.com/developers/applications)
   et créer une nouvelle application.
2. Dans **General Information**, noter l'`Application ID` à renseigner
   dans `VARDE_DISCORD_CLIENT_ID`.
3. Dans **OAuth2 → General**, copier le `Client Secret` à renseigner
   dans `VARDE_DISCORD_CLIENT_SECRET`. Il ne s'affiche qu'une fois ;
   le régénérer si perdu.

#### Configurer le bot

1. Dans l'onglet **Bot**, créer le bot s'il n'existe pas.
2. Copier le token à renseigner dans `VARDE_DISCORD_TOKEN`. Même règle
   d'affichage unique, et même possibilité de régénération.
3. Activer les **Privileged Gateway Intents** suivants :
   - `Server Members Intent` — requis pour la modération et l'accueil.
   - `Message Content Intent` — requis pour l'automod et certaines
     commandes.

#### Scopes OAuth2

Pour l'invitation du bot et la connexion admin au dashboard, déclarer
les scopes suivants :

- `bot` — présence du bot sur le serveur.
- `applications.commands` — commandes slash.
- `identify` — login dashboard via Discord.
- `guilds` — lister les serveurs administrables par l'utilisateur
  connecté.

Permissions bot minimales à cocher lors de la génération de l'URL
d'invitation : Manage Roles, Manage Channels, Kick Members, Ban Members,
Manage Messages, Read Message History, Send Messages, Embed Links,
Manage Nicknames, Moderate Members.

#### URL de redirection OAuth2

En dev, ajouter dans **OAuth2 → Redirects** :

- `http://localhost:3000/api/auth/callback/discord`

L'URL exacte dépend du port et du provider Auth.js configuré. Elle est
documentée dans `.env.example` via `VARDE_DASHBOARD_URL`.

#### Serveur de test dédié

Créer un serveur Discord vide réservé aux tests. Ne pas utiliser le bot
de développement dans une communauté existante : les commandes et
l'automod s'y appliqueraient sans filtre.

#### Rotation des secrets

Le token et le client secret se régénèrent depuis le Discord Developer
Portal. En cas de fuite suspectée, révoquer immédiatement côté Discord
puis mettre à jour `.env.local`.

### Démarrage

```sh
docker compose -f docker/docker-compose.dev.yml up -d
VARDE_DATABASE_URL=postgres://varde:varde@localhost:5432/varde pnpm db:migrate
pnpm dev
```

`docker compose -f docker/docker-compose.dev.yml up -d` démarre Postgres
et Redis en arrière-plan. Vérifier la santé avec
`docker compose -f docker/docker-compose.dev.yml ps` (attendu : deux
services `healthy`). Purger les volumes avec `down -v` à la fin d'une
session si besoin de repartir propre.

`pnpm db:migrate` applique les migrations Drizzle sur la DB ciblée par
`VARDE_DATABASE_URL`. Pour SQLite, remplacer l'URL par un chemin de
fichier (ex. `./varde.sqlite`) et ajuster la commande :
`pnpm --filter @varde/db db:migrate:sqlite`.

`pnpm dev` lance en parallèle le bot, l'API et le dashboard en mode
watch. En l'état du jalon 1, `apps/api` et `apps/dashboard` sont des
squelettes qui loguent simplement « not implemented » — ils seront
câblés au jalon 2.

### Tests

```sh
pnpm test           # tests unitaires et d'intégration sur tous les paquets
pnpm test:unit      # uniquement les tests unitaires
pnpm test:integration
pnpm lint           # Biome (lint + format)
pnpm typecheck      # tsc --noEmit
pnpm check          # lint + typecheck + test en un passage
```

Les tests d'intégration Postgres utilisent Testcontainers et
nécessitent Docker accessible. Les autres tests tournent sur SQLite
in-memory et n'ont pas de prérequis.

### Commandes utiles

- `pnpm db:generate` : régénère les migrations SQL à partir des schémas
  Drizzle TypeScript (`packages/db/src/schema/*.ts`).
- `pnpm --filter @varde/db db:migrate:pg` / `db:migrate:sqlite` :
  variantes explicites si `VARDE_DATABASE_URL` pointe sur un driver
  particulier.

## Workflow de contribution

### Pour une contribution sans ambiguïté (typo, bug évident, micro-amélioration)

1. Fork le repo.
2. Crée une branche `fix/<sujet>` ou `docs/<sujet>`.
3. Commit en conventionnel.
4. Ouvre une PR contre `main`.

### Pour une contribution significative

1. Ouvre une issue pour discuter.
2. Attends un retour. Si l'orientation est validée, enchaîne.
3. Fork, branche, développement.
4. PR avec description complète (voir template).
5. Revue, ajustements, merge.

### Commits

Format conventionnel :

```text
<type>(<scope>): <sujet>
```

Types autorisés : `feat`, `fix`, `refactor`, `docs`, `chore`, `test`,
`perf`, `style`, `build`, `ci`. Sujet court (≤ 72 caractères),
impératif, sans point final.

Exemple : `feat(moderation): ajout d'un filtre anti-links paramétrable`.

Interdit : trailers auto-générés par l'outillage d'assistance, signatures
de co-authoring non humaines, mentions de l'outil utilisé pour écrire le
code. Le projet se livre comme étant écrit directement par ses
mainteneurs et contributeurs humains.

### Pull requests

- Titre au format commit conventionnel.
- Description avec contexte, changements, impact, points de vigilance,
  captures si UI.
- Une PR = une raison de changer. Pas de PR fourre-tout.
- CI verte obligatoire.
- Revue systématique sur : core, contracts, db, sécurité, permissions.

### Signatures DCO

Les commits doivent être signés au sens du
[Developer Certificate of Origin](https://developercertificate.org/) :
chaque commit inclut un trailer `Signed-off-by: Nom <email>`.

En pratique : `git commit -s -m "..."`.

Cela certifie que vous avez le droit de soumettre le code sous la licence
du projet. Pas de démarche administrative, juste un engagement explicite.

## Standards attendus

### Code

Points saillants :

- TypeScript strict, pas de `any`.
- Tests qui accompagnent le code.
- JSDoc sur les API publiques.
- Accessibilité WCAG AA sur le dashboard.
- Pas de `console.log`, pas de secrets committés.

### Politique de tests

- Un bug corrigé = un test de régression.
- Une feature = des tests couvrant les cas nominaux et les cas limites.
- Pas de test flaky toléré.

### Documentation

- API publique modifiée = doc mise à jour.
- Changement comportemental = `CHANGELOG.md` mis à jour.

## Process de revue

- Délai indicatif de première réponse : sous 7 jours.
- Les PR triviales (typo, petits fix) peuvent être mergées rapidement.
- Les PR structurantes passent par une revue détaillée qui peut demander
  plusieurs allers-retours. C'est normal et constructif.
- Une PR qui reste ouverte sans activité pendant plus de 60 jours peut
  être fermée par le mainteneur, avec proposition de réouvrir si le
  contributeur reprend le travail.

## Avec quoi remonter un doute

- **Question sur la direction produit** : issue.
- **Question technique sur une implémentation** : issue ou discussion sur
  la PR concernée.
- **Signalement de bug** : issue avec template bug report.
- **Signalement de vulnérabilité** : voir [`SECURITY.md`](./SECURITY.md),
  jamais en issue publique.

## Code of Conduct

Les interactions sur le projet (issues, PR, discussions) doivent rester
respectueuses et constructives. Les comportements abusifs, discriminatoires
ou de harcèlement sont inacceptables.

Un [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) dédié sera ajouté lors de
l'ouverture publique du projet. En attendant, le principe est simple :
attaquer les idées, pas les personnes.

## Licence des contributions

En soumettant une contribution, vous acceptez qu'elle soit distribuée sous
la licence du projet (Apache 2.0, voir [`LICENSE`](./LICENSE)). Le
trailer `Signed-off-by` sur vos commits matérialise cet accord via le
DCO.
