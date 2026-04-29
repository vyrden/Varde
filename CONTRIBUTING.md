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

#### Configurer Discord — wizard ou env (legacy)

Depuis le jalon 7 (cf. ADR 0013), les credentials Discord sont
collectés par le wizard de setup à `${VARDE_BASE_URL}/setup` et
persistés chiffrés en DB. Sur une instance fraîche :

1. Ouvrir le dashboard, le middleware redirige automatiquement
   vers `/setup/welcome`.
2. Suivre les 7 étapes — le wizard ouvre lui-même les liens vers le
   portail Developer et explique quoi copier/coller à chaque
   étape.

Le chemin **legacy** par variables d'environnement reste
disponible pour les dev setups antérieurs au wizard :
`VARDE_DISCORD_TOKEN`, `VARDE_DISCORD_CLIENT_ID`,
`VARDE_DISCORD_CLIENT_SECRET`. Si elles sont renseignées dans
`.env.local`, le bot se connecte directement sans passer par le
wizard, et un warning est émis au boot pour signaler la migration
à venir. Voir `.env.example` pour le détail.

Pour les développeurs qui veulent comprendre ce qu'attend le
wizard sans le dérouler à chaque fois, voici les valeurs et leur
provenance dans le portail Discord :

1. Ouvrir
   [discord.com/developers/applications](https://discord.com/developers/applications)
   et créer une nouvelle application.
2. **General Information** → `Application ID` (saisi étape
   « Discord App » du wizard, ou `VARDE_DISCORD_CLIENT_ID` en
   legacy).
3. **General Information** → `Public Key` (saisi étape « Discord
   App »).
4. **OAuth2 → General** → `Client Secret` (saisi étape « OAuth »,
   ou `VARDE_DISCORD_CLIENT_SECRET` en legacy). Il ne s'affiche
   qu'une fois ; régénérer si perdu.
5. **Bot** → bouton « Reset Token », copier la valeur (saisie
   étape « Token bot », ou `VARDE_DISCORD_TOKEN` en legacy).
6. **Bot → Privileged Gateway Intents** : activer les trois —
   `Presence`, `Server Members`, `Message Content`. Le wizard
   liste explicitement ceux qui manquent à l'étape « Token bot ».

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
documentée dans `.env.example` via `VARDE_BASE_URL`.

#### Serveur de test dédié

Créer un serveur Discord vide réservé aux tests. Ne pas utiliser le bot
de développement dans une communauté existante : les commandes et
l'automod s'y appliqueraient sans filtre.

#### Rotation des secrets

Le token et le client secret se régénèrent depuis le Discord Developer
Portal. En cas de fuite suspectée, révoquer immédiatement côté
Discord puis :

- soit rejouer le wizard depuis l'admin instance (chantier 2 du
  jalon 7) si le wizard a déjà été terminé ;
- soit mettre à jour `.env.local` puis redémarrer le service si
  vous êtes encore sur le chemin legacy.

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

### Internationalisation

Tous les textes affichés à l'utilisateur dans le dashboard passent
par les fichiers de messages `next-intl` situés sous
[`apps/dashboard/messages/`](./apps/dashboard/messages/). **Aucune
nouvelle chaîne hardcodée** ne doit être introduite.

Pour ajouter une chaîne :

1. Ajouter la clé dans `messages/fr.json` ET dans `messages/en.json`
   (jamais l'un sans l'autre, sinon l'utilisateur EN voit la clé
   brute).
2. Convention de nommage : `{section}.{component}.{key}`, par
   exemple `dashboard.guildList.empty.title`.
3. Consommer la clé via `getTranslations()` côté Server Components
   ou `useTranslations()` côté Client Components.

Pour ajouter une nouvelle langue, suivre le guide dans
[`apps/dashboard/i18n/README.md`](./apps/dashboard/i18n/README.md).

### Tests E2E

Les tests Playwright vivent dans
[`apps/dashboard/tests/e2e/`](./apps/dashboard/tests/e2e/). Le
[README dédié](./apps/dashboard/tests/e2e/README.md) explique le
fonctionnement des fixtures (mocks Discord HTTP via MSW, auth
forgée, reset DB) avec des exemples d'usage.

Pour ajouter un test E2E :

1. Vérifier que le scénario relève bien d'un E2E (parcours
   utilisateur de bout en bout, pas de la logique métier — celle-ci
   passe par des tests unitaires).
2. Créer un fichier `*.spec.ts` sous `tests/e2e/`.
3. Réutiliser les fixtures existantes (`loginAs`,
   `mockDiscordUser`, `resetDatabase`). Étendre `discord-mocks.ts`
   si un nouveau endpoint Discord est consommé.
4. Préférer les sélecteurs accessibles (`getByRole`, `getByLabel`)
   aux sélecteurs CSS — résiste aux refactors de Tailwind.

Avant la première exécution sur un poste neuf :

```sh
pnpm exec playwright install --with-deps chromium
```

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
