# 0010. `onboarding-presets` est API-driven, pas un module bot

Date: 2026-04-27
Statut: accepted

## Contexte

L'onboarding adaptatif (ADR 0007) est l'une des cinq capacités V1 du
projet (cf. [SCOPE.md](../SCOPE.md)). Le ROADMAP.md le liste comme
« Module 5 — `onboarding-presets` » dans la même série que `logs`,
`welcome`, `reaction-roles` et `moderation`, ce qui peut laisser
penser qu'il devrait suivre le même format : un dossier
`modules/onboarding-presets/` avec manifeste, runtime, slash commands,
locales, branchement au loader.

À l'implémentation jalon 3, le code a divergé de cette intuition.
Les surfaces existantes :

- **`packages/presets/`** — bibliothèque pure (catalogue de cinq
  presets, validateur Zod, types) consommée à la fois par le runtime
  et par le dashboard.
- **`apps/api/src/onboarding-draft.ts`**,
  **`onboarding-reconcile.ts`**, **`onboarding-repo.ts`** — moteur
  draft + apply + rollback côté API (ADR 0007).
- **`apps/api/src/routes/onboarding.ts`** — sept endpoints REST
  exposés au dashboard (`POST /onboarding`, `PATCH /draft`, `POST
  /preview`, `POST /apply`, `POST /rollback`, IA generate-preset, IA
  suggest-completion).
- **`apps/dashboard/components/onboarding/`** — wizard UI à cinq
  écrans (PresetPicker, BuilderCanvas, PreviewStep, AppliedStep,
  FinishedStep).

Aucun fichier `modules/onboarding-presets/`. Le doc
`docs/ETAT-DU-PROJET.md` listait l'item comme « ⏳ en dernier »,
suggérant qu'il restait à écrire — alors que la fonctionnalité est
livrée et testée (146 tests d'intégration en avril 2026).

La question : faut-il rétroactivement créer un module
`onboarding-presets/` au sens du loader (manifest.ts, runtime.ts,
inscriptions slash + events) pour s'aligner sur la nomenclature
ROADMAP, ou acter le choix actuel ?

## Décision

**`onboarding-presets` reste API-driven.** Pas de module bot avec
manifeste, runtime, ni inscription slash command.

### Raisons

1. **Surface naturelle.** L'onboarding est un flow one-shot piloté
   depuis le dashboard. Il n'a pas de boucle d'événements (pas de
   réaction à `guild.memberJoin`, pas de slash command intra-Discord
   nécessaire), pas de tâche planifiée *propre* — l'auto-expire est
   un job du `SchedulerService` core, pas d'un module utilisateur.

2. **Pas d'isolation à protéger.** Le contrat module (ADR 0002) sert
   à isoler des extensions tierces qui appellent les API du core via
   `ctx`. L'onboarding consomme directement `OnboardingExecutor`,
   `CoreConfigService`, `KeystoreService`, et orchestre des actions
   `core.createRole` / `core.createCategory` / `core.createChannel` /
   `core.patchModuleConfig` qui sont déjà fournies par le core.
   L'envelopper dans un module ferait exactement l'inverse de ce que
   le format module sert à faire.

3. **Le catalogue est extensible sans module.** Les cinq presets
   livrés vivent dans `packages/presets/src/catalog/`. Ajouter un
   preset = un fichier dans ce dossier + une entrée dans `index.ts`.
   Pas de runtime, pas de manifeste, pas de pollution des types.

4. **L'IA est optionnelle et déjà branchée.** Les routes
   `/onboarding/ai/*` activent à l'installation via la même
   `AiKeystoreService` que les autres consommateurs IA. Aucun module
   nouveau requis.

5. **Pas de slash commands utilisateur pertinentes.** Les flows
   alternatifs imaginés (`/onboarding status`,
   `/onboarding rollback`) sont des doublons stricts du dashboard,
   apportent une UX dégradée (pas de live preview) et augmentent la
   surface à maintenir.

### Conséquences

- **Périmètre V1 honoré.** La capacité « Onboarding adaptatif » est
  livrée et fonctionne ; elle n'a juste pas la forme `modules/<id>`
  attendue par lecture rapide du ROADMAP.

- **Audit log.** Comme l'onboarding est core-driven, ses entrées
  d'audit utilisent le scope `core` (pas `moduleId: 'onboarding-presets'`
  qui n'existe pas). Actions : `onboarding.session.created`,
  `onboarding.session.applied`, `onboarding.session.apply_failed`,
  `onboarding.session.rolled_back`, `onboarding.session.rollback_failed`,
  `onboarding.session.expired`. Toutes scope `core`, actor `user`
  (admin) sauf `expired` qui est `system` (auto-expire scheduler ou
  reconcile boot).

- **Documentation.** `docs/ETAT-DU-PROJET.md` et `docs/ROADMAP.md`
  doivent refléter ce choix : `onboarding-presets` n'est pas un
  module bot. La capacité est livrée comme un service API + paquet
  `@varde/presets` + UI dédiée.

- **Module tiers d'extension.** Si un développeur tiers veut étendre
  l'onboarding (proposer son propre catalogue de presets, ajouter
  une étape custom au wizard), il le fera via une API d'extension
  contributive future, pas en réimplémentant un `modules/onboarding-presets/`.
  Cette extension n'est pas V1.

### Alternatives écartées

- **Wrapper module-only.** Créer un `modules/onboarding-presets/`
  qui ne ferait que ré-exporter les presets et écouter `apply` pour
  logger : pollue le contrat module sans rien apporter, trompe les
  développeurs tiers qui voudraient s'y référer comme exemple
  canonique de module.

- **Slash commands `/onboarding`.** Doublon du dashboard, UX
  dégradée, augmente la surface attaque (validation des permissions
  côté Discord côté chat plutôt que session HTTP signée).

- **Renommer le ROADMAP.** L'idée intuitive de « cinq modules
  symétriques » est utile pour planifier ; on garde donc l'item
  ROADMAP mais on précise qu'il s'agit d'un service API, pas d'un
  module bot.

## Liens

- [ADR 0007 — Moteur d'onboarding pluggable et IA BYO-LLM](./0007-onboarding-ia-byo-llm.md)
- [ADR 0002 — Format des modules](./0002-format-modules.md)
- `apps/api/src/routes/onboarding.ts` — routes onboarding
- `packages/presets/` — catalogue
- `apps/dashboard/components/onboarding/` — UI wizard
