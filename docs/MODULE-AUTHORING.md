# Écrire un module Varde

Ce guide vous accompagne pas à pas dans l'écriture de votre premier
module Varde. À la fin, vous saurez écouter un événement Discord,
exposer une slash-command, et donner à l'admin un formulaire de
configuration sur le dashboard — exactement comme les modules
officiels.

> 📝 **Tout au long du guide**, on s'appuie sur un module exemple
> livré dans le repo : [`modules/example-counter/`](../modules/example-counter/).
> C'est un module fonctionnel et minimal qui compte les messages
> envoyés par chaque membre. Vous pouvez l'ouvrir en parallèle, le
> compiler, le faire tourner, le copier comme point de départ.

## 📋 Sommaire

1. [Qu'est-ce qu'un module ?](#quest-ce-quun-module-)
2. [Avant de commencer](#avant-de-commencer)
3. [Anatomie d'un module](#anatomie-dun-module)
4. [Le manifeste](#le-manifeste)
5. [La configuration](#la-configuration)
6. [Écouter un événement](#écouter-un-événement)
7. [Exposer une slash-command](#exposer-une-slash-command)
8. [Persister vos données](#persister-vos-données)
9. [Logs, audit et i18n](#logs-audit-et-i18n)
10. [Tester votre module](#tester-votre-module)
11. [Distribuer votre module](#distribuer-votre-module)
12. [Conventions à suivre](#conventions-à-suivre)
13. [Aller plus loin](#aller-plus-loin)

---

## Qu'est-ce qu'un module ?

Dans Varde, **tout ce qui n'est pas l'infrastructure (gateway Discord,
routage HTTP, base de données) est un module**. Les cinq capacités
livrées en V1 — `logs`, `welcome`, `reaction-roles`, `moderation`,
onboarding-presets — sont écrites avec exactement la même API que
celle décrite ici. **Aucun privilège pour les modules officiels** :
si une capacité est exposée à un module officiel, elle est exposée
à tous les modules.

Un module est un paquet TypeScript autonome qui :

- déclare un **manifeste** (id, version, permissions, événements
  écoutés) ;
- expose un objet via `defineModule()` qui réunit la config, les
  commandes, et les hooks de cycle de vie ;
- est chargé dynamiquement par le cœur au démarrage du bot.

> ⚙️ **Pas de framework dans le framework.** Vous écrivez du
> TypeScript ordinaire. Le cœur ne vous force pas à utiliser des
> décorateurs, des classes, ou un container d'injection.

---

## Avant de commencer

Vous aurez besoin de :

- Une **instance de développement de Varde** qui tourne (voir
  [`DEPLOYMENT.md`](./DEPLOYMENT.md) ou le `docker-compose.dev.yml`).
- **Node.js 24 LTS** et **pnpm 10** sur votre machine.
- Une connaissance basique de **TypeScript** et de **Zod** (pour les
  schémas de configuration).

Pas besoin de connaître le code du cœur. Tout passe par un objet
`ctx` que le cœur vous fournit, dont la surface est documentée dans
[`PLUGIN-API.md`](./PLUGIN-API.md).

---

## Anatomie d'un module

Voici la structure minimale d'un module, identique à celle de
`example-counter` :

```text
modules/mon-module/
├── package.json         # Métadonnées du paquet pnpm
├── tsconfig.json        # Hérite de @varde/config/tsconfig.node.json
└── src/
    ├── index.ts         # defineModule() avec commandes + hooks
    ├── manifest.ts      # Déclaration statique du module
    ├── config.ts        # Schéma Zod + métadonnées dashboard
    └── locales.ts       # Strings traduisibles (FR/EN)
```

Quatre dépendances suffisent :

```json
{
  "dependencies": {
    "@varde/contracts": "workspace:*",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@varde/config": "workspace:*",
    "typescript": "6.0.3"
  }
}
```

`@varde/contracts` apporte tous les types partagés. **C'est la seule
porte d'entrée vers le cœur.** Vous n'importez jamais depuis
`@varde/core` directement.

---

## Le manifeste

Le manifeste décrit votre module au cœur, de manière déclarative.

```ts
// modules/example-counter/src/manifest.ts
import type { ManifestStatic, ModuleId, PermissionId } from '@varde/contracts';

export const manifest: ManifestStatic = {
  id: 'example-counter' as ModuleId,
  name: 'Example Counter',
  version: '1.0.0',
  coreVersion: '^1.0.0',
  description: 'Compte les messages envoyés par chaque membre.',
  author: { name: 'Mainteneur' },
  license: 'Apache-2.0',
  schemaVersion: 0,
  permissions: [
    {
      id: 'example-counter.view' as PermissionId,
      category: 'utility',
      defaultLevel: 'member',
      description: 'Autorise la consultation du compteur via /count.',
    },
  ],
  events: {
    listen: ['guild.messageCreate'],
    emit: [],
  },
};
```

Quelques règles à connaître :

| Champ | À retenir |
| --- | --- |
| `id` | Kebab-case unique. Pour un module tiers, préfixez avec votre namespace : `mon-auteur/mon-module`. |
| `coreVersion` | Plage semver des cœurs compatibles. `^1.0.0` accepte tout 1.x. |
| `permissions` | Une entrée par permission applicative que le module définit. Le cœur les enregistre dans `permissions_registry`. |
| `events.listen` | Liste des événements du cœur que le module écoute. Le loader vérifie qu'un handler existe pour chacun. |

> 🔑 **Permissions : convention de nommage.** Toujours préfixer par
> votre `id` de module — `mon-module.action.verbe`. Le cœur refuse
> au runtime toute permission non préfixée, pour empêcher un module
> de fabriquer une permission au nom d'un autre.

---

## La configuration

La config est ce que l'admin règle depuis le dashboard. Vous la
décrivez en deux pièces qui se complètent :

- un **schéma Zod** (`configSchema`) : valide la donnée à chaque
  écriture, applique les valeurs par défaut.
- des **métadonnées de rendu** (`configUi`) : disent au dashboard
  comment afficher le formulaire.

```ts
// modules/example-counter/src/config.ts
import type { ConfigUi } from '@varde/contracts';
import { z } from 'zod';

export const configSchema = z.object({
  enabled: z.boolean().default(true),
  excludedChannelIds: z.array(z.string()).default([]),
});

export type ExampleCounterConfig = z.infer<typeof configSchema>;

export const configUi: ConfigUi = {
  fields: [
    {
      path: 'enabled',
      label: 'Compteur actif',
      widget: 'toggle',
      description: 'Désactive l incrément sans perdre les compteurs déjà accumulés.',
      order: 1,
    },
    {
      path: 'excludedChannelIds',
      label: 'Salons ignorés (un ID par ligne)',
      widget: 'textarea',
      placeholder: '123456789012345678',
      order: 2,
    },
  ],
};
```

**Widgets disponibles en V1** : `text`, `textarea`, `number`,
`toggle`, `select`. Pas encore de picker de salons ou de rôles
côté `configUi` générique — les modules officiels qui en ont besoin
fournissent leurs propres pages dashboard. Couvert post-V1.

> 💡 **Les `default()` de Zod ne sont pas optionnels.** Mettez-en
> sur chaque champ. Un `configSchema.parse({})` doit produire un
> objet complet, sinon votre `onLoad` doit gérer le cas « pas de
> config en base encore ». Préférez Zod qui le fait pour vous.

### Lire la config dans le code

Le snapshot brut de la table `guild_config` contient la config de
**tous** les modules. Une petite fonction utilitaire isole la vôtre :

```ts
import type { ModuleId } from '@varde/contracts';

const MODULE_ID = 'example-counter' as ModuleId;

export function resolveConfig(raw: unknown): ExampleCounterConfig {
  const asObj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const modules = (asObj['modules'] ?? {}) as Record<string, unknown>;
  const own = modules[MODULE_ID] ?? {};
  return configSchema.parse(own);
}
```

À l'usage, dans un handler :

```ts
const raw = await ctx.config.get(event.guildId).catch(() => null);
const cfg = resolveConfig(raw);
if (!cfg.enabled) return;
```

> ⚡ **Lisez la config à chaque événement, pas une seule fois au
> `onLoad`.** Comme ça, un toggle dashboard prend effet
> immédiatement, sans redémarrage du bot.

---

## Écouter un événement

Le cœur expose un `EventBus` typé. Vous vous abonnez dans `onLoad`,
vous vous désabonnez dans `onUnload`.

```ts
// modules/example-counter/src/index.ts (extrait)
import { defineModule } from '@varde/contracts';

const subscriptions = new Set<() => void>();

export const exampleCounter = defineModule({
  manifest,
  configSchema,
  configUi,

  onLoad: async (ctx) => {
    const unsubscribe = ctx.events.on('guild.messageCreate', async (event) => {
      const raw = await ctx.config.get(event.guildId).catch(() => null);
      const cfg = resolveConfig(raw);
      if (!cfg.enabled) return;
      if (cfg.excludedChannelIds.includes(event.channelId)) return;

      // Votre logique ici…
    });
    subscriptions.add(unsubscribe);
  },

  onUnload: async () => {
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions.clear();
  },
});
```

> 🧹 **Toujours désabonner dans `onUnload`.** Le loader ne le fait
> pas pour vous : vos handlers survivraient au unload du module et
> se déclencheraient toujours en mémoire.

### Catalogue des événements

Liste partielle de la V1 — `PLUGIN-API.md` a la liste complète :

- `guild.memberJoin`, `guild.memberLeave`, `guild.memberUpdate`
- `guild.messageCreate`, `guild.messageEdit`, `guild.messageDelete`
- `guild.roleCreate`, `guild.roleUpdate`, `guild.roleDelete`
- `guild.channelCreate`, `guild.channelUpdate`, `guild.channelDelete`
- `moderation.sanctionApplied`, `moderation.sanctionExpired`
- `onboarding.completed`
- `config.changed`

Chaque événement a un schéma Zod public dans
`@varde/contracts` (par ex. `guildMessageCreateSchema`).
Vous pouvez vous y reporter pour connaître les champs exacts.

---

## Exposer une slash-command

Une slash-command se déclare directement dans `defineModule` :

```ts
commands: {
  count: {
    name: 'count',
    description: 'Affiche combien de messages un membre a envoyé.',
    defaultPermission: 'example-counter.view' as PermissionId,
    options: [
      {
        name: 'member',
        description: 'Le membre dont voir le compteur. Toi-même par défaut.',
        type: 'user',
        required: false,
      },
    ],
    handler: (input, ctx) => {
      const target = (input.options['member'] as string | undefined) ?? input.userId;
      const count = counters.get(`${input.guildId}:${target}`) ?? 0;
      return ctx.ui.success(
        ctx.i18n.t('count.other', { userId: target, count: String(count) }),
      );
    },
  },
},
```

Quelques détails utiles :

- `type` peut valoir `'string' | 'integer' | 'boolean' | 'number' | 'user' | 'role' | 'channel'`.
- Pour `user | role | channel`, l'option arrive comme **snowflake**
  (string) dans `input.options`, et la vue enrichie correspondante
  est dans `input.resolved.users[id]` / `roles[id]` / `channels[id]`.
- Le handler renvoie un `UIMessage` produit par `ctx.ui.*`. Vous ne
  construisez **jamais** un `interaction.reply` à la main : le cœur
  applique les en-têtes, les couleurs, les attachements pour vous.

> 🎨 **Helpers d'UI disponibles en V1 :**
>
> - `ctx.ui.embed(options, attachments?)` — embed personnalisé.
> - `ctx.ui.success(message)` — encart vert.
> - `ctx.ui.error(message)` — encart rouge.
> - `ctx.ui.confirm({ message, confirmLabel?, cancelLabel? })` —
>   boutons de confirmation.

---

## Persister vos données

Trois façons de persister, dans l'ordre du plus simple au plus
robuste :

### 1. Stockage en mémoire (réservé aux exemples / prototypes)

Ce que fait `example-counter` : une `Map` au niveau du module. Très
simple, mais **les données sont perdues à chaque redémarrage**.
Acceptable pour un module qu'on apprend, jamais pour de la prod.

### 2. Configuration (pour des paramètres)

`ctx.config.get(guildId)` et `ctx.config.set(guildId, patch)` lisent
et écrivent la config validée Zod. C'est ce qu'utilisent tous les
modules pour leurs réglages — pas pour des données métier (le JSON
peut grossir indéfiniment, pas indexé, pas idéal pour des dizaines
de milliers d'entrées).

### 3. Tables dédiées via `ctx.db` (recommandé en prod)

Le cœur expose un client Drizzle scopé à votre module : seules les
tables préfixées par votre `id` sont visibles. Vous écrivez vos
migrations dans `migrations/<id>/` et le cœur les applique au
chargement.

C'est le pattern qu'utilisent les modules officiels —
[`modules/moderation/`](../modules/moderation/),
[`modules/welcome/`](../modules/welcome/) sont de bons exemples à
ouvrir pour voir comment structurer schéma + migrations + lecture.

> 🚧 **À l'heure du jalon 6**, le typage fin de `ctx.db` est encore
> un marker (`ScopedDatabase` à `__scoped: true`). Les modules
> officiels accèdent à leur DB via des helpers temporaires en
> attendant le scoping fort. Suivez l'évolution dans
> [ADR 0001](./adr/0001-schema-db-core.md).

---

## Logs, audit et i18n

### `ctx.logger`

Logger Pino scopé à votre module. Niveaux : `trace`, `debug`,
`info`, `warn`, `error`, `fatal`. Utilisez `info` au démarrage et
pour les événements rares, `debug` pour le diagnostic au quotidien.

```ts
ctx.logger.info('action exécutée', { guildId, userId });
```

### `ctx.audit.log`

L'audit est **le journal officiel de tout ce qui change l'état** :
modération, configuration, actions IA, … L'admin le consulte dans
le dashboard. Tout ce que votre module fait qui n'est pas une simple
lecture **doit** y aller.

```ts
await ctx.audit.log({
  guildId: event.guildId,
  action: 'mon-module.action.verbe' as ActionId,
  actor: { type: 'module', id: 'mon-module' as ModuleId },
  target: { type: 'user', id: event.userId },
  severity: 'info',
  metadata: { compteur: 42 },
});
```

> ⚠️ **N'écrivez pas un audit par message.** Les volumes peuvent
> être énormes. Réservez l'audit aux événements significatifs : un
> palier atteint, une sanction posée, une config modifiée. Pour la
> télémétrie de bas niveau, utilisez `ctx.logger.debug`.

### `ctx.i18n.t`

Lookup de string traduisible. Le cœur résout la locale du serveur
au moment de l'invocation et applique un fallback automatique sur
`en` si une clé manque dans la locale primaire.

```ts
// modules/example-counter/src/locales.ts
export const locales = {
  fr: {
    'count.self': 'Tu as envoyé **{count}** message(s).',
    'count.other': '<@{userId}> a envoyé **{count}** message(s).',
  },
  en: {
    'count.self': 'You have sent **{count}** message(s).',
    'count.other': '<@{userId}> has sent **{count}** message(s).',
  },
} as const;

// dans un handler
ctx.i18n.t('count.self', { count: String(42) });
```

Toutes les valeurs interpolées doivent être des `string`. Convertissez
les nombres en string avant.

---

## Tester votre module

Le paquet `@varde/testing` fournit un `createTestHarness` qui monte
un cœur minimal en mémoire (SQLite, scheduler in-memory, executor
onboarding pré-câblé). C'est tout ce qu'il faut pour les tests
d'intégration de la plupart des modules.

```ts
import { describe, expect, it } from 'vitest';
import { createTestHarness } from '@varde/testing';
import { exampleCounter } from '../src/index.js';

describe('example-counter', () => {
  it('incrémente le compteur sur messageCreate', async () => {
    const harness = await createTestHarness({ modules: [exampleCounter] });
    await harness.emit({
      type: 'guild.messageCreate',
      guildId: 'g1',
      channelId: 'c1',
      messageId: 'm1',
      authorId: 'u1',
      content: 'hello',
      createdAt: Date.now(),
    });
    // Vérifications via ctx.audit.entries / ctx.config.get / etc.
  });
});
```

Les modules officiels ont chacun leur dossier `tests/` à ouvrir
comme référence — `modules/welcome/tests/` est particulièrement
fourni.

> 🧪 **Convention testing.** Un test = un comportement observable.
> Pas de mock du cœur. Pas de tests qui passent quand on supprime
> l'implémentation. Voir
> [`docs/TESTING.md`](./TESTING.md) pour le détail.

---

## Distribuer votre module

Trois scénarios :

| Cible | Démarche |
| --- | --- |
| **Usage personnel** sur votre instance | Posez le dossier sous `modules/`, ajoutez-le aux dépendances de `apps/server`, redémarrez. C'est ce que fait `example-counter`. |
| **Module open source** réutilisable | Publiez votre paquet sur npm sous votre namespace (`@vous/varde-mon-module`). Les utilisateurs le `pnpm add` puis l'enregistrent dans leur `apps/server`. |
| **Fork pour patch interne** | Forkez le repo, ajoutez votre module, gardez à jour avec l'amont. Tant que vous ne touchez pas au cœur, les rebases sont triviaux. |

L'enregistrement dans `apps/server` ressemble à ceci :

```ts
// apps/server/src/server.ts (extrait simplifié)
import { exampleCounter } from '@varde/module-example-counter';

const modules = [
  helloWorld,
  logsModule,
  welcomeModule,
  // …
  exampleCounter,
];
```

> 📦 **Pas encore de catalogue de modules tiers** côté Varde. Il en
> est question post-V1 : `docs/ROADMAP.md` § « Catalogue public de
> modules communautaires ». En attendant, partagez votre lien npm
> ou GitHub directement avec les administrateurs intéressés.

---

## Conventions à suivre

Trois règles non négociables, héritées du cœur :

1. **Aucun import depuis `@varde/core/internal` ou un autre paquet
   privé.** Tout passe par `@varde/contracts` et `ctx`. Si quelque
   chose vous manque, c'est un manque de l'API publique — ouvrez
   une issue plutôt que contourner.
2. **TypeScript strict.** Pas de `any`. Utilisez `unknown` et
   raffinez avec des type guards. Voir
   [`CONVENTIONS.md`](./CONVENTIONS.md) pour le détail.
3. **Aucun import UI hors `@varde/ui`.** Si votre module contribue
   une page dashboard custom (pas une page déclarative générée),
   les composants doivent venir de `@varde/ui` uniquement. Pas de
   MUI, pas de Chakra, pas de styled-components.

Et trois règles douces, qui rendent les modules agréables à
maintenir :

- Une fonction = une responsabilité. Si la description tient en
  « X et Y », découpez.
- Loggez sans secrets. Jamais de token, jamais de mot de passe,
  jamais de contenu de message privé dans `ctx.logger`.
- Donnez des erreurs lisibles. `throw new Error('config invalide :
  threshold doit être > 0')` plutôt que `throw new Error('bad arg')`.

---

## Aller plus loin

| Sujet | Où regarder |
| --- | --- |
| Surface complète de `ctx` | [`PLUGIN-API.md`](./PLUGIN-API.md) |
| Liste complète des événements | [`PLUGIN-API.md`](./PLUGIN-API.md) § Événements |
| Architecture et choix techniques | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| ADR — décisions structurantes | [`adr/`](./adr/) |
| Conventions de code | [`CONVENTIONS.md`](./CONVENTIONS.md) |
| Stratégie de test | [`TESTING.md`](./TESTING.md) |
| Module exemple | [`modules/example-counter/`](../modules/example-counter/) |
| Modules officiels (références prod) | [`modules/welcome/`](../modules/welcome/), [`modules/moderation/`](../modules/moderation/), [`modules/reaction-roles/`](../modules/reaction-roles/), [`modules/logs/`](../modules/logs/) |

---

> 💬 **Une question, un retour ?** Ouvrez une issue. La surface du
> contrat plugin est la pièce la plus structurante du projet :
> chaque retour qui pointe une lacune ou une ambiguïté améliore
> l'API pour tout le monde.
