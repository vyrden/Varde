# Architecture Decision Records (ADR)

Journal des décisions d'architecture significatives du projet. Chaque
décision qui conditionne le reste du code est consignée ici. L'objectif
n'est pas d'écrire une thèse : c'est de laisser une trace lisible à six
mois, un an, cinq ans.

## Quand créer un ADR

Un ADR est nécessaire quand la décision :

- modifie une interface publique du core ou des contracts,
- introduit ou remplace une dépendance structurante,
- change le modèle de données de manière non triviale,
- affecte la sécurité ou les permissions,
- tranche une option sur laquelle des alternatives crédibles existaient.

Un ADR n'est pas nécessaire pour les détails d'implémentation qui peuvent
être déduits du code ou de la doc existante.

## Format

Un fichier par ADR, nommé `NNNN-titre-court.md` avec une numérotation
séquentielle à quatre chiffres.

Structure minimale :

```md
# NNNN. Titre clair

Date: YYYY-MM-DD
Statut: proposed | accepted | superseded by NNNN

## Contexte

Quel problème on résout. Quelles contraintes pèsent. Quels sont les
éléments du contexte qui peuvent évoluer.

## Décision

Ce qu'on a décidé, en clair.

## Alternatives considérées

Les options qu'on a regardées et pourquoi elles ont été écartées.

## Conséquences

Ce que cette décision implique, positif comme négatif. Les nouvelles
contraintes qu'elle introduit, les portes qu'elle ferme.

## Références

Liens, issues, PR, discussions liées.
```

## Règles

- Les ADR ne sont jamais modifiés une fois acceptés. Si une décision est
  remise en cause, on crée un nouvel ADR qui remplace l'ancien et on
  met le champ `Statut` de l'ancien à `superseded by NNNN`.
- Un ADR est court. Une à trois pages max. Si c'est plus long, il y a
  probablement deux décisions.
- Les ADR sont écrits pour un lecteur futur qui ne connaît pas le
  contexte. Pas de références implicites, pas de jargon interne non
  expliqué.
- Un ADR est revu et mergé comme du code.

## Liste

- [0001 - Schéma DB du core et conventions de persistance](./0001-schema-db-core.md) — accepted
- [0002 - Format des modules : manifeste TS, `module.json` généré, surface du `ctx`](./0002-format-modules.md) — accepted
- [0003 - Mode dégradé sans Redis](./0003-mode-degrade-redis.md) — accepted
- [0004 - Monolithe bot + API dans un seul process](./0004-monolithe-bot-api.md) — accepted
- [0005 - `configUi` en sidecar de `ModuleDefinition`](./0005-configui-sidecar.md) — accepted
- [0006 - Session partagée dashboard ↔ API via cookie JWT HS256](./0006-session-partagee-cookie.md) — accepted
- [0007 - Moteur d'onboarding pluggable et IA BYO-LLM](./0007-onboarding-ia-byo-llm.md) — accepted
- [0008 - Symétrie des permissions officiels/tiers et seeding par onboarding](./0008-permissions-modules-officiels.md) — accepted
- [0009 - Diff before/after sur `guild.channelUpdate` et `guild.roleUpdate`](./0009-diff-before-after-channel-role-update.md) — accepted
- [0010 - `onboarding-presets` est API-driven, pas un module bot](./0010-onboarding-presets-api-driven.md) — accepted
- [0011 - Internationalisation du dashboard avec `next-intl`, dispatch par cookie](./0011-i18n-next-intl-cookie.md) — accepted
- [0012 - Tokens design CSS-first dans `@varde/ui` consommés via Tailwind 4](./0012-design-tokens-css-first.md) — accepted
- [0013 - Persistance des credentials Discord en DB chiffrée plutôt qu'en `.env`](./0013-credentials-discord-en-db-chiffree.md) — accepted
- [0014 - Ownership claim-first à la connexion Discord](./0014-ownership-claim-first.md) — accepted
- [0015 - Permissions extensibles via niveaux déclarés par les modules](./0015-permissions-niveaux-modules.md) — accepted
- [0016 - Credentials Discord — la BDD est la source unique](./0016-credentials-discord-source-unique.md) — accepted
