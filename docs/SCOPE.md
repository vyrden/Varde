# Scope

Ce document définit ce qui est dans la V1, ce qui n'y est pas, et pourquoi.
Il sert d'arbitre en cas de tentation d'étendre le scope en cours de route.

## Règle de coupe

Une fonctionnalité entre en V1 si et seulement si elle satisfait les trois
conditions suivantes :

1. Elle est **nécessaire** à ce qu'un admin installe et fasse tourner un
   serveur sainement dès le premier jour.
2. Elle est **structurante** : son absence dégrade immédiatement l'expérience
   des membres ou de l'admin.
3. Elle est **difficile à rajouter tard** sans casser des contrats internes
   (permissions, audit, schéma DB).

Toute fonctionnalité qui ne coche pas les trois sort en module additionnel,
quelle que soit sa popularité ailleurs.

## Périmètre V1

### 1. Onboarding adaptatif

Le pilier différenciant. Détail dans [`ONBOARDING.md`](./ONBOARDING.md).

Capacités :

- Questionnaire contextuel à l'installation (type de communauté, taille cible,
  thématique, langue, ton, niveau de risque attendu).
- Génération d'une configuration opinionnée mais éditable.
- Création automatique des rôles et salons recommandés, ou adaptation d'une
  structure existante.
- Activation des modules pertinents avec paramètres par défaut adaptés.
- Explication systématique des choix proposés.
- Rejouable à tout moment, extensible par les modules qui ajoutent leurs
  propres questions et recommandations.

### 2. Modération

Capacités :

- Commandes manuelles : warn, mute, kick, ban, timeout, unban, unmute.
- Raisons obligatoires, référence à un admin auteur, durée explicite pour les
  sanctions temporaires.
- Expiration automatique des sanctions temporaires (scheduler).
- Historique des sanctions par utilisateur, consultable dans le dashboard.
- Automod configurable : spam, caps, liens, mots-clés, mentions de masse,
  comptes neufs.
- Escalade configurable (N avertissements en X jours = Y sanction).
- Whitelists par rôle et par salon.

### 3. Accueil et départs

Capacités :

- Messages d'accueil configurables (contenu, salon, embed, mentions).
- Messages de départ configurables.
- Rôle assigné automatiquement à l'arrivée.
- Filtre comptes neufs (âge minimum, vérification optionnelle par réaction ou
  bouton).
- Tous les événements traçables dans l'audit log.

### 4. Gestion des rôles

Capacités :

- Menus de rôles via composants Discord modernes (boutons, select menus), pas
  les anciennes reactions par défaut.
- Reaction roles classiques proposés en mode compatibilité.
- Rôles avec expiration automatique.
- Rôles mutuellement exclusifs (par ex. un seul rôle de couleur à la fois).
- Limites configurables (nombre max de rôles par utilisateur).

### 5. Audit et logs

Capacités :

- Audit log interne unifié : toute action système traçable (auteur, cible,
  module, type, timestamp, métadonnées).
- Dispatch configurable vers des salons Discord par catégorie d'événement
  (mod, accès, rôles, messages supprimés, etc.).
- Rétention configurable.
- Recherche et filtres dans le dashboard.
- Export CSV / JSON.

### Dashboard web

Capacités V1 :

- Login Discord OAuth2.
- Sélection du serveur à administrer parmi ceux où l'utilisateur a les droits.
- Flow d'onboarding intégré.
- Pages de configuration par module.
- Consultation de l'audit log avec filtres.
- Gestion des modules (activer, désactiver, mettre à jour).

## Hors scope V1

Les capacités ci-dessous sont reconnues utiles mais sortent de la V1. Elles
viendront en modules additionnels, officiels ou tiers, selon les priorités
post-V1.

### Reportées en V1.1 ou V1.2 (modules officiels)

- **Custom commands avancées** (texte, embeds, conditionnel léger).
- **Tickets** (système de support avec salons privés, transcripts).
- **Notifications par saisie manuelle** (annonces programmées, rappels).
- **Leveling basique** (XP textuel, rôles de rang, dashboard).
- **Analytics** (croissance, rétention, activité par salon).

### Reportées plus loin ou laissées à la communauté

- Intégrations externes : Twitch, YouTube, RSS, GitHub, Reddit, Twitter/X.
- Économie, monnaie virtuelle, shop.
- Collections, gacha, cartes.
- Mini-jeux.
- Musique (terrain juridique toxique, pas d'intérêt pour le projet).
- Chatbot IA conversationnel.

### Assistance IA

Volontairement pas un module séparé en V1. L'IA s'intègre comme *service*
interne invocable par le moteur d'onboarding et par le module d'audit pour
résumer les incidents. Un module `ai-assistance` plus ambitieux viendra après
la V1.

Principes :

- Fournisseur LLM configurable (Ollama local ou tout backend
  compatible OpenAI : OpenAI officiel, OpenRouter, Groq, vLLM, LM Studio…).
- Clés fournies par l'admin, jamais par le projet.
- Toute sortie IA est journalisée dans l'audit log.
- Opt-out complet par serveur.

## Décisions de coupe documentées

### Pourquoi pas de leveling en V1

Fonctionnalité ajoutable tardivement sans friction (schéma DB séparé, pas
d'impact sur les permissions, pas d'impact sur l'onboarding). Tentante mais
pas structurante.

### Pourquoi pas de custom commands en V1

Nécessite un moteur d'expression, un modèle de sécurité, une UI d'édition
soignée. Beaucoup de travail pour une feature qu'un module peut apporter
plus tard sans recasser le core.

### Pourquoi pas d'intégrations externes en V1

Chaque intégration a ses propres contraintes d'auth, de rate limiting, de
webhooks. Les traiter hors V1 permet de cadrer proprement l'API d'intégration
externe dans le core avant de la consommer.

### Pourquoi l'onboarding est un pilier et pas une option

C'est la seule capacité qui justifie un nouveau bot en 2026. Sans elle, le
projet est un clone de plus.
