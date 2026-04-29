# 0014. Ownership de l'instance via first-login + ajout/transfert via UI

Date: 2026-04-29
Statut: accepted

## Contexte

Une fois le wizard de setup terminé (jalon 7 PR 7.1), l'instance est
fonctionnelle mais sans notion d'« administrateur de l'instance » :
n'importe qui se connectant au dashboard verrait toutes les guilds
sur lesquelles **son** compte Discord est administrateur, mais sans
accès à des leviers globaux comme la rotation du token bot ou la
modification de la baseUrl.

Le jalon 7 PR 7.2 introduit un cockpit `/admin/*` pour ces leviers
globaux. La question : **qui** y a accès, et **comment** lui en
donner l'accès initial ?

Trois familles de solutions ont été envisagées :

1. **Lecture du fichier `.env`** : l'admin pose un
   `VARDE_OWNER_DISCORD_ID=...` au boot. Pro : zéro UI à écrire
   pour la première fois. Contra : reproduit le défaut combattu par
   ADR 0013 — éditer un fichier sur l'hôte pour faire évoluer
   l'instance, et impossible de gérer plusieurs owners sans
   resyncroniser le fichier.

2. **Aucune autorisation** : `/admin/*` est ouvert à tout user
   connecté. Contra : trivialement faux. La page expose le token
   bot révélable et la rotation OAuth ; elle ne peut pas être
   ouverte.

3. **Claim au premier login** : le premier compte Discord qui se
   connecte après que `setup_completed_at` est posé est
   automatiquement enregistré comme owner. Les suivants doivent
   être ajoutés explicitement par un owner existant.

## Décision

On retient l'option **3** : claim au premier login, ajout/retrait
ultérieur via une page admin. La table `instance_owners` matérialise
la liste, avec ces colonnes :

- `discord_user_id` (PK)
- `granted_at` (timestamp)
- `granted_by_discord_user_id` (nullable — `null` pour le claim
  automatique)

Le service `ownershipService` du core expose `claimFirstOwnership`,
`addOwner`, `removeOwner`, `isOwner`, `getOwners`. La méthode
`claimFirstOwnership` est idempotente : elle no-op dès qu'au moins
un owner existe. L'appel est fait depuis le callback `signIn` de
Auth.js (`apps/dashboard/auth.ts`) à chaque login Discord — tant
que la table est vide, le user qui se connecte hérite de l'instance.

Le middleware `requireOwner` (`apps/api/src/middleware/require-owner.ts`)
garde toutes les routes `/admin/*` côté API. Il retourne **404** si
la session est anonyme ou non-owner — pas 403 — pour ne pas révéler
l'existence du segment admin à un user qui n'y a rien à faire.

Le layout dashboard `app/admin/layout.tsx` reproduit la même
discipline côté Next.js : il tente un `GET /admin/overview` au
rendu et appelle `notFound()` si l'API rejette.

`removeOwner` refuse de retirer le dernier owner avec un
`409 last_owner` — un owner doit toujours rester pour pouvoir
gérer l'instance. La même garde est dupliquée côté UI (le bouton
« Retirer » est masqué quand `owners.length === 1`).

## Conséquences

- **Onboarding minimal** : zéro action admin nécessaire entre la
  fin du wizard et le premier login — la première personne qui
  ouvre le dashboard hérite des leviers.
- **Bootstrap unique** : l'admin doit comprendre que **le premier
  login post-setup compte**. Si une mauvaise personne se
  connecte par erreur, il faudra la retirer (ou redémarrer
  l'instance avec une DB neuve, qui rejouera le wizard). Cette
  asymétrie est documentée dans `USER-GUIDE.md`.
- **Pas de transfert dédié dans cette PR** : le pattern « ajouter
  le nouveau owner puis retirer l'ancien » couvre le cas. Une
  modale de transfert atomique pourra arriver dans une itération
  ultérieure si l'UX le justifie.
- **Pas de FK vers une table `users`** : l'instance ne stocke pas
  les utilisateurs Discord en local (cohérent avec ADR 0006). Les
  IDs sont conservés bruts ; le rendu UI hydrate via la session
  Auth.js du user courant ou un appel direct à l'API Discord
  côté admin route.
- **Audit log instance-scoped** : les events `instance.owner.*`,
  `instance.token.rotated`, `instance.url.*` ne sont pas encore
  câblés sur le `auditService` actuel (qui exige un `guildId`).
  La page admin se contente de logs Pino structurés via
  `log.warn(...)` pour matérialiser ces événements. L'extension
  de l'audit aux events sans guildId est un chantier dédié.
- **Whitelist callback Auth.js dynamique** : à chaque ajout d'URL
  additionnelle, la liste des hosts autorisés à servir l'auth
  Discord est révélée par `GET /allowed-hosts` (cache 30 s côté
  middleware Next.js). Cf. `lib/allowed-hosts.ts` et
  `middleware.ts`.
- **Hot rotation gateway** : le `discordReconnectService` (mutex
  FIFO + timeout 30 s) est posé pour que `PUT /admin/discord/token`
  puisse swap le client gateway sans redémarrage. Le câblage
  concret du handler côté `apps/server/src/bin.ts` est laissé à
  un follow-up — le contrat est en place et ses tests unitaires
  couvrent la sérialisation, le rollback et la propagation
  d'erreur.
