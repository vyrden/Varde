# 0007. Moteur d'onboarding pluggable et IA BYO-LLM

Date: 2026-04-21
Statut: accepted

## Contexte

Le jalon 3 ajoute un moteur d'onboarding : un admin Discord doit
pouvoir, depuis le dashboard, construire un serveur opérationnel
(rôles, catégories, salons, modules activés et configurés) en une
session guidée, sans éditer un bitfield de permissions ni copier un
ID.

Trois surfaces doivent cohabiter :

1. **Un modèle d'actions composable** — chaque primitive (créer un
   rôle, créer un salon, patcher une config module) est une opération
   indépendante qui doit pouvoir être appliquée puis annulée dans une
   fenêtre courte.
2. **Un catalogue extensible de presets** — des « communautés types »
   hand-curated (gaming, tech, créatif, étude) comme point de départ,
   éditables par l'admin avant apply.
3. **Une assistance IA optionnelle** — à la fois pour générer un
   preset sur mesure à partir d'une description textuelle de la
   communauté (rôle A), et pour suggérer des compléments pendant la
   construction (rôle B).

Contrainte non-négociable du projet : **auto-hébergé, autonome,
sans dépendance à un service central, pas de télémétrie, pas de
phone home**. Tout default qui enverrait des données vers un SaaS
tiers violerait ce principe fondateur.

## Décision

### Moteur d'actions

Chaque primitive implémente un contrat strict :

```ts
interface OnboardingActionDefinition<Payload, Result> {
  readonly type: ActionType;
  readonly schema: ZodType<Payload>;
  readonly apply: (ctx, payload) => Promise<Result>;
  readonly undo: (ctx, payload, previousResult: Result) => Promise<void>;
  readonly canUndo: boolean | ((result: Result) => boolean);
}
```

- Les actions sont enregistrées dans un registre keyed par `type` au
  démarrage. Le core en fournit quatre en V1 : `createRole`,
  `createCategory`, `createChannel`, `patchModuleConfig`.
- Les modules tiers en contribuent via
  `ctx.onboarding.registerAction(def)`.
- Le registre refuse toute définition sans `undo` ni `canUndo` — fail
  fast au chargement, pas au runtime rollback.
- L'exécution est séquentielle avec delay 50 ms entre actions pour
  respecter les rate limits Discord. Sur échec au milieu : undo auto
  des actions déjà appliquées, statut `failed`.

### Presets

Un preset est une structure de données pure (validée Zod), pas du
code :

```ts
interface PresetDefinition {
  id: PresetId;
  name: string;
  description: string;
  tags: readonly string[];
  roles: readonly PresetRole[];
  categories: readonly PresetCategory[];
  channels: readonly PresetChannel[];
  modules: readonly PresetModuleConfig[];
  locale: 'fr' | 'en' | 'both';
}
```

Les presets hand-curated vivent dans un nouveau paquet privé
`@varde/presets` (scope `@varde`, Apache 2.0). 5 presets livrés en
V1 : gaming, tech, créatif, study-group, generic-starter.

### IA pluggable

Contrat `AIProvider` exposé par un nouveau paquet `@varde/ai` :

```ts
interface AIProvider {
  readonly id: string;
  readonly generatePreset: (input) => Promise<PresetProposal>;
  readonly suggestCompletion: (input) => Promise<readonly Suggestion[]>;
  readonly testConnection: () => Promise<ProviderInfo>;
}
```

Les adapters V1 :

- **Ollama** — local auto-hébergé, endpoint par défaut
  `http://localhost:11434`. Protocole `/api/chat` natif.
- **OpenAI-compatible** — couvre OpenAI officiel + OpenRouter + Groq
  + LocalAI + vLLM + LM Studio + text-gen-webui. Protocole
  `/v1/chat/completions` avec `response_format: json_object` quand
  disponible.
- **Stub rule-based** — implémentation par défaut en tests, zéro
  réseau. Sert aussi si aucun provider n'est configuré.

### Configuration et per-scope

- **Zéro provider par défaut**. Si l'admin n'a pas configuré de
  provider via la page Paramètres → IA du dashboard, les CTA IA sont
  masquées. Le builder marche à 100 % avec les presets hand-curated.
- **Per-instance en V1**. Tous les serveurs gérés par une instance
  Varde partagent le même provider et les mêmes credentials. Le
  passage à per-guild (chaque admin de guild choisit son propre
  provider) arrivera post-V1 si la demande émerge.
- **Credentials dans le keystore**. API keys chiffrées AES-256-GCM
  via `KeystoreService` (table `keystore`, ADR 0001). Jamais en env,
  jamais loggées, jamais renvoyées au frontend en clair. Rotation
  documentée dans `docs/OPERATIONS.md`.

### Traçabilité

Chaque appel LLM passe par `AIService.invoke()` qui insère une ligne
dans `ai_invocations` avec : prompt hash, prompt version (pour le
lien vers la version du template), provider, model, tokens,
succès/erreur, timestamp, et `actor_id` (Discord user ID) pour le
rate-limit per-user.

### Jamais dans le chemin critique

- Timeout global de 8 s par appel LLM.
- Une panne provider, un timeout, un parse JSON qui échoue : erreur
  remontée à l'utilisateur, builder reste utilisable en manuel.
- Quota journalier par instance : warn à 100 invocations / jour,
  refus dur au-delà de 500. Configurable via env.
- Rate limit per-user sur `generatePreset` : max 10 / heure.

## Alternatives écartées

### Default cloud SaaS

Rejetée : viole le principe d'auto-hébergement strict. Un admin qui
installe Varde en `docker compose up` sans configurer d'IA ne doit
JAMAIS voir ses données partir vers un tiers.

### Un seul adapter imposé (Ollama only)

Rejetée : ferme la porte aux admins qui choisissent explicitement un
cloud provider en toute connaissance de cause. BYO est plus
respectueux de leur autonomie.

### Per-guild IA en V1

Rejetée : trop de surface d'UI pour peu de valeur démontrée tant
que les instances V1 sont mono-admin. Réintroductible en V2 sans
breaking change (ajout d'une table `guild_ai_config` qui override
l'instance default).

### Orchestration LLM en langue naturelle libre

Rejetée en V1 (la « rôle C » des discussions de cadrage) : laisser
l'utilisateur taper « un salon privé juste pour les contributeurs
vérifiés » et faire que le LLM traduise en actions discord est la
surface la plus ambigüe et la plus coûteuse à bien paramétrer.
Rôles A + B seuls en V1, C reporté.

## Conséquences

### Positives

- L'IA reste optionnelle. Une instance Varde peut tourner 100 %
  offline, sans aucun appel externe, avec le builder et les presets
  hand-curated seuls.
- Le contrat `AIProvider` devient un point d'extension public. Tout
  provider compatible peut être branché via un paquet tiers sans
  modifier le core.
- Le moteur d'actions composable est réutilisable hors onboarding
  (par exemple, un module futur qui veut « appliquer + rollback »
  une migration de config pourra s'appuyer sur la même infra).
- La traçabilité complète via `ai_invocations` permet l'audit coût,
  le rejeu d'un appel pour debug, et à terme la détection d'abus.

### Négatives et points de vigilance

- Deux adapters à maintenir côté core (Ollama + OpenAI-compatible).
  Acceptable en V1, bornable via un test contract partagé que
  chaque adapter doit passer.
- La qualité UX dépend du modèle choisi par l'admin. Un admin qui
  configure un tout petit modèle local (< 3 B paramètres) aura des
  presets générés médiocres. Documenté dans l'aide de la page
  Paramètres → IA.
- Les prompts sont versionnés dans `@varde/ai/src/prompts/`. Tout
  changement de prompt casse les tests golden associés —
  checkpoint de revue explicite, coût cognitif non négligeable
  pour qui modifie un prompt à la volée.
- Le stockage des API keys dans le keystore ajoute une ligne au
  cycle de vie de rotation de `VARDE_KEYSTORE_MASTER_KEY`
  (documenté dans `OPERATIONS.md`).

## Références

- [ADR 0001 — Schéma DB du core](./0001-schema-db-core.md) —
  tables `onboarding_sessions`, `ai_invocations`, `keystore`
  posées initialement.
- [ADR 0002 — Format des modules](./0002-format-modules.md) —
  contrat qui va s'enrichir de la surface `ctx.onboarding`.
- [ADR 0004 — Monolithe bot + API](./0004-monolithe-bot-api.md) —
  contexte d'exécution dans lequel les actions discord.js
  s'exécutent.
- [ADR 0006 — Session cookie HS256](./0006-session-partagee-cookie.md)
  — session auth que le dashboard Paramètres → IA consomme pour
  identifier l'admin qui pose les credentials.
