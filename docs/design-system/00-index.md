# Cadrage de la refonte visuelle Varde

Document d'entrée du dossier `docs/design-system/`. Résume l'état des
lieux et pointe vers les six livrables. À lire en premier avant toute
discussion ou implémentation visuelle.

Ce dossier précède l'implémentation. Aucun composant React, aucune
ligne de CSS, aucune dépendance n'est ajoutée tant que le contenu de
ce dossier n'a pas été validé.

## État des lieux

- **Stack confirmée** : Next.js 16.2 (App Router) + React 19.2 +
  TypeScript 6 + Tailwind 4 CSS-first. Auth.js v5 (Discord OAuth),
  next-intl 4.9 pour l'i18n cookie-driven, Drizzle (Postgres / SQLite),
  Pino, Vitest + Playwright.
- **Design system actuel** : `@varde/ui` interne, 28 composants
  (Button, Card, Drawer, EmptyState, Skeleton, Toggle, Toaster,
  StickyActionBar, Tabs, Tooltip, etc.). Tokens CSS posés dans
  `packages/ui/src/theme.css`, ADR 0012 acte le CSS-first.
- **Libs présentes** : `class-variance-authority`, `clsx`,
  `tailwind-merge`, `@dnd-kit/core+sortable+utilities` (pour la
  sidebar épingles à venir). **Absentes** : framer-motion / motion,
  next-themes, Lottie. Aucune dépendance externe n'est ajoutée par ce
  cadrage.
- **Police actuelle** : Noto Sans via `next/font/google` (substitut
  public à gg sans). Cadrage propose un pivot vers Inter Display +
  Inter (cf. §5 du livrable 02 et `decisions.md` D-04).
- **Écrans existants** : 30 routes — accueil (`/`), `/setup/*`
  (welcome, system-check, discord-app, bot-token, oauth, identity,
  summary), `/admin/*` (instance, identity, urls, ownership, discord),
  `/guilds/[id]/*` (modules, audit, onboarding, permissions, settings).
- **DA existante** (`docs/DA/DA.md`) : direction "natif client
  Discord" — palette du client (rail/sidebar/surface), tricolonne.
  Cette refonte pivote vers "marketing discord.com" : palette ash plus
  neutre, hiérarchie typographique plus marquée, primaire iris dérivé
  du blurple. Le pivot est tracé dans `decisions.md` D-01.
- **Mascotte** : aucune ressource ni doc actuelle. Les règles d'usage
  sont posées à blanc dans `04-mascot-usage.md`.

## Sommaire des livrables

- **[01-principles.md](./01-principles.md)** — Sept principes
  directeurs : intention par écran, densité contextuelle,
  justification, typographie, motion, mascotte, self-host. Chaque
  principe vient avec règle opérationnelle et anti-pattern.
- **[02-tokens.md](./02-tokens.md)** — Tokens CSS exhaustifs :
  palettes ash (dark) et paper (light), iris primaire, sémantiques,
  rôles abstraits, typo Inter Display + Inter, espacement 4 px,
  rayons, ombres dual dark/light, grille, motion, z-index,
  validation contraste.
- **[03-screens-map.md](./03-screens-map.md)** — Fiches d'intention
  pour les 13 écrans clés : accueil/connexion, sélection guilde,
  7 étapes du setup, vue d'ensemble guild, modules, config module,
  audit, permissions, settings, admin instance, aide contextuelle,
  erreurs.
- **[04-mascot-usage.md](./04-mascot-usage.md)** — Règles d'usage
  de la mascotte : 10 cas autorisés avec posture, 10 cas interdits,
  contraintes techniques (SVG, 5 expressions, 5 tailles), test de
  présence à 3 questions, cahier des charges illustrateur.
- **[05-motion-grammar.md](./05-motion-grammar.md)** — Cinq
  catégories d'animation (micro, état, éphémère, page, narrative),
  tokens durées + easings, règles de cohérence, stratégie
  `prefers-reduced-motion`, choix de stack (CSS-first + motion à
  l'exception).
- **[06-anti-patterns.md](./06-anti-patterns.md)** — Vingt règles
  à l'impératif négatif : pas de gradient générique, pas de
  glassmorphism, pas de skeleton à la place d'empty state, pas de
  drag sans alternative clavier, pas de polices CDN, pas de copy
  générique.

## Document compagnon

[decisions.md](./decisions.md) — journal de décisions ADR-light : pour
chaque choix non évident (pivot palette, typo, primaire, stack motion,
densité par écran), contexte + options envisagées + décision retenue +
conséquences. Source unique de vérité quand une revue interroge "pourquoi
ce choix".

## Convention de mise à jour

- Toute évolution d'un livrable est tracée dans `decisions.md` au minimum
  par une entrée datée. Les modifications de tokens en particulier ne
  passent pas en silence.
- Les six livrables sont des fichiers vivants : la refonte est un
  processus, pas un one-shot. Une décision révisée se note dans le
  journal et se reflète dans le livrable concerné, pas l'inverse.
- Le format Markdown reste GFM. Aucune image, aucune capture, aucun
  lien externe non self-hostable dans ces fichiers.

## Étape suivante

Validation explicite de ce dossier par le mainteneur. Une fois validée,
l'implémentation peut démarrer dans l'ordre suggéré par PR 7.4 (cf.
`docs/Jalon 7/PR4-experience-serveur.md`), en commençant par les tokens
(`packages/ui/src/theme.css` réécrit selon `02-tokens.md`).
