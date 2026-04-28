# Onboarding adaptatif

Le pilier différenciant du projet. Sa qualité décide de la pertinence
du bot tout entier. Le moteur a été livré au jalon 3, le catalogue
des cinq presets V1 (`starter`, `gaming`, `tech`, `creative`,
`study`) au jalon 4. Ce document décrit son fonctionnement.

## Objectif

Transformer l'installation d'un bot en une session guidée qui produit une
configuration cohérente, adaptée au contexte de la communauté, avec
explication des choix.

Aucun bot concurrent ne fait cela correctement. MEE6 jette l'admin devant un
dashboard vide. PeakBot génère des structures depuis un prompt mais sans
pédagogie. YAGPDB attend que l'admin lise sa documentation.

## Principes

1. **Adaptatif, pas paramétrique.** Les questions posées varient selon les
   réponses précédentes. On ne pose pas la question des anti-raid à quelqu'un
   qui dit avoir une communauté de 50 personnes qui se connaissent.
2. **Opinionné, pas dictatorial.** Le bot propose des défauts raisonnables
   basés sur les réponses, l'admin peut tout modifier avant validation.
3. **Explicable, toujours.** Chaque recommandation est accompagnée d'une
   phrase qui dit pourquoi elle est proposée.
4. **Réversible et rejouable.** Toute modification appliquée au serveur est
   traçable et réversible. L'onboarding peut être relancé plus tard.
5. **Extensible par les modules.** Les modules contribuent leurs propres
   questions et recommandations. Le moteur est dans le core, les contenus
   viennent des modules.
6. **Respectueux de l'existant.** Si le serveur a déjà une structure,
   l'onboarding propose des ajustements, pas une table rase.

## Flux utilisateur

### Scénario serveur neuf

1. L'admin ajoute le bot à son serveur Discord.
2. Le bot envoie un message dans le premier salon texte disponible invitant
   à se connecter au dashboard pour démarrer l'onboarding.
3. Dans le dashboard, l'admin se connecte via Discord OAuth2.
4. Le wizard démarre. Première étape : contexte général.
   - Type de communauté (tech, créative, gaming, éducatif, autre).
   - Thématique (champ libre ou suggestions).
   - Taille cible (moins de 50, 50-500, 500-5000, plus).
   - Langue principale.
   - Ton souhaité (formel, neutre, décontracté).
5. Étapes suivantes : questions conditionnelles en fonction des réponses
   précédentes et des modules qui contribuent au wizard.
   - Risque attendu (serveur ouvert au public, serveur privé, entre les
     deux).
   - Besoin de vérification à l'arrivée.
   - Organisation thématique (quelles grandes catégories de sujets).
   - Niveau de modération souhaité (laxiste, standard, strict).
   - Besoin d'un canal de soutien et tickets.
6. Récapitulatif : le bot propose une structure complète.
   - Rôles à créer ou modifier.
   - Catégories et salons.
   - Modules à activer avec leurs paramètres initiaux.
   - Permissions par défaut.
   - Messages d'accueil et règles.
7. L'admin revoit, ajuste, valide.
8. Application. Chaque action est tracée dans l'audit log.
9. Post-setup : tour guidé rapide du dashboard et pointeurs vers la doc.

### Scénario serveur existant

1. Étapes 1 à 5 identiques.
2. Avant l'étape 6, le bot analyse l'existant.
   - Rôles déjà présents, hiérarchie, usages probables.
   - Structure des salons.
   - Permissions en place.
3. Recommandations mixtes : "voici ce qui existe déjà et qui colle à vos
   besoins, voici ce qu'on suggère d'ajouter, voici ce qui pourrait être
   problématique".
4. L'admin choisit point par point. Validation et application.

### Scénario rejeu

1. L'admin relance l'onboarding depuis le dashboard.
2. Option "refaire à partir de zéro" (questions complètes) ou "ajuster"
   (prend en compte la config actuelle comme état initial).
3. Les réponses précédentes sont pré-remplies et modifiables.
4. Les nouveaux modules installés depuis le dernier onboarding peuvent
   contribuer leurs questions.

## Architecture du moteur

Le moteur d'onboarding vit dans le core. Il expose une API aux modules pour
contribuer des questions et des recommandations.

### Concepts

- **Question** : une entrée du wizard. Type (choice, multi-choice, text,
  number, boolean), libellé, aide, options, validation.
- **Condition** : expression sur les réponses précédentes qui décide si une
  question s'affiche.
- **Recommandation** : une proposition d'action (créer un rôle, créer un
  salon, activer un module, définir un paramètre). Produite à partir d'une
  règle qui examine les réponses.
- **Action** : traduction concrète d'une recommandation validée en
  changement Discord ou config.

### Contributions des modules

Un module déclare dans son manifeste :

- Ses questions (ajoutées au wizard global, positionnées dans une étape).
- Ses règles de recommandation (si telle condition sur les réponses, alors
  telles recommandations).
- Les actions associées à ses recommandations (les modules savent comment
  appliquer leurs propres effets).

Le moteur compose les contributions de tous les modules actifs pour produire
un wizard cohérent et un plan d'actions exécutable.

### Analyse de serveur existant

Composant du moteur distinct, appelé avant la phase de recommandation en
mode "serveur existant". Il produit un rapport structuré :

- Rôles inventoriés avec usage probable déduit (par nom, permissions, nombre
  de membres).
- Catégories et salons avec thématique déduite.
- Permissions anormales détectées (rôle `@everyone` avec permissions
  administratives, etc.).
- Éléments recommandés manquants pour le type de communauté détecté.

Cette analyse peut s'appuyer sur `ctx.ai` si disponible pour raffiner les
déductions. Sans IA, des heuristiques suffisent à la V1.

### Rôle de l'IA

L'IA sert à :

- Proposer des noms de salons cohérents avec la thématique.
- Suggérer un message d'accueil adapté au ton choisi.
- Analyser un serveur existant avec plus de finesse (déduire l'intention
  derrière une structure non standard).
- Générer un résumé explicatif personnalisé du plan proposé.

L'IA ne prend jamais de décision. Elle produit des propositions que l'admin
valide explicitement. Tout appel IA pendant l'onboarding est tracé.

## Données et état

Le moteur persiste l'état d'un onboarding en cours dans `onboarding_state`.
Un onboarding peut être interrompu et repris. Les onboardings abandonnés
expirent après 7 jours.

À l'issue d'un onboarding validé :

- Les réponses sont conservées pour permettre le rejeu ou l'analyse ("tel
  admin a choisi telle combinaison, voici les modules les plus pertinents").
- Les actions appliquées sont tracées individuellement dans l'audit log.
- Un snapshot "avant onboarding" peut être produit pour rollback.

## Rollback

L'admin doit pouvoir annuler un onboarding venant d'être appliqué tant qu'il
n'a pas confirmé. Concrètement :

- Après application, une bannière propose d'annuler pendant 5 minutes.
- Le rollback ré-exécute les actions inverses (supprimer les rôles créés,
  rétablir les configs précédentes).
- Passé le délai, un rollback reste possible mais est signalé comme "une
  opération lourde" et demande confirmation.

## Considérations UX

- Le wizard tient sur une page avec navigation par étapes claires, pas de
  redirect entre pages.
- Progression visible mais pas bloquante (l'admin peut revenir en arrière).
- Sauvegarde automatique à chaque étape.
- Prévisualisation : un panneau latéral montre en temps réel la structure
  qui sera produite.
- Export du plan proposé en JSON avant application, pour l'admin qui veut
  relire ou archiver.

## Mesure de succès

Métriques à instrumenter (mais à ne surtout pas remonter au projet central,
consultables en local) :

- Taux de completion du wizard.
- Temps moyen de completion.
- Taux de rollback dans les 5 minutes.
- Taux de rejeu dans les 30 jours.
- Modules activés via onboarding vs activés manuellement ensuite.

## Décisions prises à l'implémentation (jalon 3)

- **Format de déclaration** : objets TypeScript validés Zod, pas de
  DSL custom. Voir [ADR 0007](./adr/0007-onboarding-ia-byo-llm.md).
- **Versioning des presets** : versionnés via la propriété `version`
  des `PresetDefinition`, validation Zod cross-field qui interdit
  les références orphelines (`roleLocalId` qui pointe sur un rôle
  inexistant).
- **Échec partiel** : exécution séquentielle avec délai de 50 ms entre
  actions pour respecter le rate limit Discord. Sur échec en cours :
  rollback automatique des actions déjà appliquées et statut
  `failed`. L'admin reçoit un détail des actions ayant été
  rétractées.
- **Duplication entre modules** : le moteur applique l'ordre déclaré
  dans le draft. C'est l'admin qui décide via le builder s'il garde
  les contributions de plusieurs modules ou en retire certaines avant
  apply.
