# Plugin API

Contrat entre le core et les modules (officiels comme tiers). Ce document est
le plus structurant du projet : il définit ce qu'un module peut et ne peut
pas faire, et garantit que les modules officiels et tiers sont indiscernables
du point de vue de l'utilisateur.

La règle absolue : **un module officiel n'utilise jamais d'API privée du
core**. Si le core fournit une capacité à un module officiel, il la fournit à
tous les modules.

## Anatomie d'un module

Un module est un package pnpm autonome. Il exporte un objet qui satisfait
l'interface `Module` du core et déclare un manifeste.

### Manifeste

Le manifeste décrit le module de manière déclarative. Il peut être écrit
comme fichier `module.json` ou comme export TypeScript typé.

Champs obligatoires :

- `id` : identifiant unique, kebab-case, préfixé du namespace pour les tiers
  (`author/module-name`).
- `name` : nom affiché.
- `version` : semver strict.
- `coreVersion` : plage de versions compatibles du core (range semver).
- `description` : courte description.
- `author` : nom et contact.
- `license` : SPDX.

Champs déclaratifs :

- `permissions` : liste des permissions applicatives que le module définit et
  qu'il requiert (format `module.action`).
- `events` : événements que le module écoute (voir catalogue plus bas).
- `commands` : commandes Discord déclarées.
- `dashboardPages` : pages contribuées au dashboard.
- `onboardingContributions` : questions et recommandations contribuées au
  wizard d'onboarding.
- `dependencies` : autres modules requis (éviter autant que possible).
- `configSchema` : schéma Zod ou JSON Schema de la config du module.
- `migrations` : chemin vers les migrations Drizzle du module.

### Cycle de vie

Un module expose jusqu'à quatre hooks :

- `onLoad(ctx)` : appelé une fois au chargement, après validation du
  manifeste. Enregistrer les ressources (timers, subscribers).
- `onEnable(ctx, guild)` : appelé à chaque activation du module sur un
  serveur.
- `onDisable(ctx, guild)` : symétrique.
- `onUnload(ctx)` : libération des ressources, avant arrêt du process.

Les hooks reçoivent un objet `ctx` typé qui donne accès aux services du core.

## Le contexte (ctx)

`ctx` est le seul point d'accès autorisé d'un module vers le core. Il expose :

- `ctx.logger` : logger Pino scoped au module.
- `ctx.config` : lecture / écriture de la config du module pour un serveur
  donné.
- `ctx.db` : accès DB via un namespace isolé au module (pas d'accès aux
  tables d'autres modules).
- `ctx.events` : émission et souscription d'événements internes.
- `ctx.audit` : écriture dans l'audit log.
- `ctx.permissions` : vérification de permissions applicatives.
- `ctx.discord` : accès contrôlé aux objets discord.js (avec garde-fous et
  rate limiting).
- `ctx.scheduler` : planification de tâches différées.
- `ctx.i18n` : internationalisation.
- `ctx.ai` : accès au service IA si disponible côté serveur (facultatif).

Toute interaction avec le core passe par `ctx`. Aucune importation directe
depuis `@varde/core/internal` n'est autorisée pour un module.

## Catalogue des événements

Les modules écoutent des événements typés. Liste non exhaustive de la V1 :

- `guild.memberJoin`
- `guild.memberLeave`
- `guild.messageCreate`
- `guild.messageEdit`
- `guild.messageDelete`
- `guild.channelCreate`
- `guild.roleCreate`
- `moderation.sanctionApplied`
- `moderation.sanctionExpired`
- `onboarding.completed`
- `config.changed`

Un module peut aussi déclarer ses propres événements internes, préfixés par
son id. Ces événements sont visibles des autres modules, ce qui permet une
communication lâche (par exemple, `leveling.levelUp` écouté par un futur
module de récompenses).

Les événements ne sont pas des appels de fonction : un émetteur ne sait pas
qui écoute, un écouteur ne bloque pas l'émetteur. Les handlers sont async,
exécutés de manière isolée, leurs erreurs sont capturées et journalisées.

## Commandes Discord

Les commandes sont déclarées via le manifeste et enregistrées par le core
auprès de l'API Discord. Le module fournit uniquement le handler.

Format imposé des réponses :

- Les embeds utilisent une factory fournie par le core (`ctx.ui.embed`) qui
  applique la palette, les icônes et le format standards.
- Les erreurs passent par `ctx.ui.error(message)` qui produit une réponse
  normalisée.
- Les succès passent par `ctx.ui.success(message)`.
- Les messages de confirmation destructive passent par `ctx.ui.confirm()` qui
  produit un composant boutons standard.

Un module qui essaie d'envoyer un `interaction.reply` avec un embed
sur-mesure non issu de la factory voit sa réponse rejetée par un middleware
du core (en dev) ou journalisée comme violation (en prod).

## Pages dashboard

Un module contribue des pages via une convention déclarative. Il ne fournit
pas un bundle React complet : il fournit des descriptions de pages que le
dashboard assemble.

Deux formats possibles :

1. **Pages déclaratives** : le module déclare un schéma de formulaire typé
   (basé sur Zod + un vocabulaire UI : sections, champs, groupes,
   conditions). Le dashboard rend le formulaire avec les composants du
   design system. Couvre 80 % des besoins.

2. **Pages custom** : le module fournit un composant React qui reçoit un
   `ctx` client limité. Ces composants doivent importer exclusivement depuis
   `@varde/ui`. L'import de toute autre lib UI (MUI, Chakra, etc.)
   est interdit par configuration ESLint / Biome et refusé à la compilation.

Le module déclare ses pages dans son manifeste avec un chemin relatif sous la
section du module dans la navigation.

## Config

Chaque module définit un `configSchema` (Zod). Le core :

- Valide la config à chaque écriture.
- Migre la config entre versions du module via `migrations/config/`.
- Expose la config au module via `ctx.config.get(guildId)`.
- Expose la config au dashboard pour rendre l'UI d'édition (via pages
  déclaratives).

Pas de fichier à part, pas de variable d'environnement par module. Tout vit
dans la table `guild_config` du core, sous une clé namespacée.

## Audit

Un module qui modifie l'état doit appeler `ctx.audit.log(entry)`. Le core
garantit :

- L'écriture atomique avec l'action métier si la transaction englobe les
  deux.
- L'enrichissement automatique (timestamp, module émetteur, id de guild).
- Le respect de la rétention configurée.

Les champs attendus de l'entrée sont :

- `action` : identifiant canonique, format `module.action.verb`.
- `actor` : utilisateur Discord ou `system`.
- `target` : entité concernée.
- `severity` : info / warn / error.
- `metadata` : données libres, JSON.

## Permissions applicatives

Un module déclare les permissions qu'il introduit dans son manifeste. Format
`module.action`.

Exemple pour `moderation` :

- `moderation.warn`
- `moderation.ban`
- `moderation.ban.permanent`
- `moderation.view_history`
- `moderation.config`

L'admin mappe ces permissions à des rôles Discord via le dashboard. Le module
vérifie chaque action via `ctx.permissions.can(actor, 'moderation.ban',
target)`.

Refuser une vérification de permission (pour "simplifier") est un bug
critique.

## Niveau d'accès dashboard (`requiredPermission`)

À ne pas confondre avec les **permissions applicatives** ci-dessus. Le
champ `requiredPermission` du `ModuleDefinition` (jalon 7 PR 7.3)
contrôle qui voit le module dans le dashboard d'un serveur, à partir
des **niveaux** `admin` ou `moderator` configurés par l'admin du
serveur dans `/guilds/:id/permissions` :

- `'admin'` (défaut implicite) : seuls les users avec un rôle dans
  `adminRoleIds` ou le propriétaire Discord du serveur voient le
  module.
- `'moderator'` : également visible aux users avec un rôle dans
  `moderatorRoleIds`. Cas typiques : modération, anti-spam — un
  modérateur a besoin d'accéder aux outils de mod sans pouvoir
  modifier la config technique de l'instance.

Déclaration dans `defineModule` :

```ts
import { defineModule } from '@varde/contracts';

export const moderation = defineModule({
  manifest,
  requiredPermission: 'moderator',
  // ...
});
```

Sans le champ, le module retombe sur le défaut restrictif (`'admin'`)
— principe de moindre privilège côté contrat.

L'enforcement vit côté API : `GET /api/guilds/:guildId/modules` filtre
la liste retournée selon le niveau du user. La sidebar du dashboard
masque les liens des modules invisibles côté serveur.

## Accès DB

Un module accède à ses propres tables via `ctx.db` qui renvoie un client
Drizzle scopé au namespace du module. Les tables du core et d'autres modules
sont invisibles.

Pour lire ou modifier des données d'un autre module, on passe par les
événements ou par des API publiques exposées par ce module (déclarées dans
son manifeste sous `publicApi`).

Les migrations du module sont appliquées par le core au chargement. Le
module déclare sa version de schéma, le core applique les migrations
manquantes.

## Scheduler

Les tâches différées passent par `ctx.scheduler`. Trois types :

- `in(duration, task)` : exécution une fois après un délai.
- `at(date, task)` : exécution à une date précise.
- `cron(expression, task)` : exécution récurrente.

Les tâches sont persistées (via Redis / BullMQ ou table DB en fallback) et
survivent aux redémarrages. Elles sont idempotentes : la signature de la
tâche inclut les paramètres nécessaires à son exécution complète.

## IA (facultatif)

Si l'admin a configuré un fournisseur IA sur son instance, `ctx.ai` est
disponible. Il expose :

- `ctx.ai.complete(prompt, options)` : génération de texte.
- `ctx.ai.classify(text, labels)` : classification.
- `ctx.ai.summarize(texts, options)` : résumé.

Toute invocation IA est tracée dans l'audit log (prompt tronqué, modèle,
module appelant, coût estimé). L'admin peut désactiver l'IA par module.

## Règles de sécurité pour les modules

- Ne jamais logger le contenu brut de messages privés d'utilisateurs.
- Ne jamais persister de secrets (tokens tiers) en clair. Utiliser le
  keystore chiffré exposé par le core.
- Ne jamais appeler directement l'API Discord hors de `ctx.discord` (sinon
  contournement du rate limiting centralisé).
- Ne jamais exposer de route HTTP sans passer par la mécanique d'enregistrement
  d'API du core (qui applique auth, CORS, rate limit).

## Versionning et compatibilité

- Le core suit semver strict.
- Un module déclare `coreVersion` (range).
- Un changement breaking de l'API core = majeur. Les modules deviennent
  temporairement incompatibles, le core expose un mode compat pendant une
  version mineure ou deux.
- Les modules eux-mêmes suivent semver. Leurs migrations DB gèrent la
  compatibilité descendante des données.

## À faire avant d'écrire le premier module

1. Figer la liste des événements de la V1.
2. Figer la signature de `ctx` et de ses sous-objets (`config`, `audit`, etc.).
3. Écrire un module témoin minimal (`hello-world`) qui exerce chaque partie
   du contrat.
4. Itérer le contrat jusqu'à ce que `hello-world` et les cinq modules
   officiels partagent littéralement la même surface d'API.
