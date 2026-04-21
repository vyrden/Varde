# Politique de sécurité

Merci de prendre le temps de remonter une vulnérabilité. Ce document
explique comment le faire de manière responsable et comment le projet gère
les signalements.

## Versions supportées

Seule la dernière version mineure publiée est activement supportée pour les
correctifs de sécurité. Les versions antérieures peuvent être mises à jour
au cas par cas selon la sévérité.

| Version | Supportée      |
| ------- | -------------- |
| latest  | Oui            |
| older   | Au cas par cas |

## Signaler une vulnérabilité

Ne jamais ouvrir d'issue publique pour un problème de sécurité.

Utiliser à la place l'un des canaux suivants, par ordre de préférence :

1. **GitHub Security Advisories** : onglet "Security" du repo, bouton
   "Report a vulnerability". Canal privilégié car il crée un espace de
   discussion chiffré et traçable avec le mainteneur.
2. **Email** : `github-repo.policy126@passmail.com`.

Inclure dans le signalement :

- Description du problème.
- Étapes de reproduction.
- Impact estimé (qui est affecté, comment).
- Version concernée.
- Si possible, une suggestion de correctif.

## Ce à quoi s'attendre

- **Accusé de réception** : sous 72 heures ouvrées.
- **Première évaluation** : sous 7 jours, avec qualification (sévérité,
  scope, validité).
- **Correction** : les vulnérabilités de sévérité haute ou critique sont
  traitées en priorité. Un correctif est publié dès que possible, avec un
  advisory détaillant la nature du problème, les versions affectées, et
  les mesures recommandées.
- **Crédit** : le reporter est crédité dans l'advisory sauf demande
  contraire.

## Divulgation coordonnée

Le projet suit une politique de divulgation coordonnée. Grandes lignes :

- Le reporter et le mainteneur conviennent d'une date de divulgation.
- Délai usuel : 30 à 90 jours selon la complexité du correctif et la
  sévérité.
- Pas de divulgation publique avant que le correctif soit disponible et
  les utilisateurs aient eu un délai raisonnable pour mettre à jour.
- Exceptions : vulnérabilités activement exploitées ou déjà publiquement
  connues, qui peuvent justifier un advisory immédiat.

## Scope

Sont couverts par cette politique :

- Le code du projet (core, modules officiels, dashboard, API).
- Les images Docker officielles publiées par le projet.
- Les dépendances directes du projet.

Ne sont pas couverts :

- Les modules tiers hébergés hors de ce repo : rapporter directement à
  leurs auteurs respectifs.
- Les problèmes sur les instances auto-hébergées dus à une mauvaise
  configuration de l'administrateur (clés exposées, permissions
  incorrectes).
- Les problèmes sur Discord lui-même.

## Pratiques de sécurité du projet

Le projet applique les pratiques suivantes :

- Revue des PR obligatoire pour le code critique (core, permissions,
  audit, sécurité).
- Scan de dépendances automatisé à chaque PR et planifié.
- Scan de secrets en CI.
- Dépendances de sécurité haute ou critique mises à jour sous 7 jours.
- Builds reproductibles documentés.
- Images Docker signées (à terme, avec cosign ou équivalent).

## Safe harbor

Les chercheurs de sécurité qui :

- suivent la procédure de signalement décrite ici,
- s'abstiennent de tout dommage ou accès à des données au-delà de ce qui
  est nécessaire pour démontrer la vulnérabilité,
- respectent le délai de divulgation coordonnée,

peuvent compter sur la collaboration du mainteneur pour traiter leur
signalement de bonne foi, sans poursuite.
