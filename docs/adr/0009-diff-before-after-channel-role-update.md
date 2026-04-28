# 0009. Diff before/after sur `guild.channelUpdate` et `guild.roleUpdate`

Date: 2026-04-23
Statut: accepted

## Contexte

Les schémas V1 de `guildChannelUpdateSchema` et `guildRoleUpdateSchema`
dans [packages/contracts/src/events.ts](../../packages/contracts/src/events.ts)
exposaient uniquement `{id, updatedAt}`. Aucun détail sur ce qui a
changé. À l'ouverture du module `logs` (PR 4.2), deux formatters ont
besoin de ces events :

- `formatChannelUpdate` doit produire un log utile pour un admin —
  typiquement "Salon `#foo` renommé en `#foo-archive`", "topic modifié",
  "position changée", "déplacé sous une autre catégorie".
- `formatRoleUpdate` doit produire "couleur passée de X à Y",
  "permissions ajoutées/retirées", etc.

Sans diff dans le payload, un formatter ne peut produire qu'un log
générique "Le salon X a été modifié" — une dégradation silencieuse de
la valeur rendue à l'admin, en contradiction avec le principe « fail
fast, fail loud, recover gracefully — pas de dégradation silencieuse ».

## Décision

Enrichir les deux schémas avec des paires `<propriété>Before`
/ `<propriété>After`, sourcées depuis les objets `oldChannel` / `oldRole`
que discord.js passe déjà aux handlers `Events.ChannelUpdate` et
`Events.GuildRoleUpdate`. Aucun cache supplémentaire : le "before" est
consommé au fil de l'eau dans le client-adapter du bot.

### `guildChannelUpdateSchema`

Champs diffés (tous requis) :

- `nameBefore`, `nameAfter` — `string`
- `topicBefore`, `topicAfter` — `string | null` (null si le channel n'a
  pas de topic ou n'est pas un channel textuel)
- `positionBefore`, `positionAfter` — `number` entier ≥ 0
- `parentIdBefore`, `parentIdAfter` — `ChannelId | null` (null si hors
  catégorie)

### `guildRoleUpdateSchema`

Champs diffés (tous requis) :

- `nameBefore`, `nameAfter` — `string`
- `colorBefore`, `colorAfter` — `number` entier ≥ 0
- `hoistBefore`, `hoistAfter` — `boolean`
- `mentionableBefore`, `mentionableAfter` — `boolean`
- `permissionsBefore`, `permissionsAfter` — `string` (bitfield Discord,
  stringifié pour préserver la précision au-delà de 2^53)

### Propagation

- `apps/bot/src/mapper.ts` : les interfaces `ChannelUpdateInput` et
  `RoleUpdateInput` reflètent les nouveaux champs ; les branches
  correspondantes de `mapDiscordEvent` les mappent sans
  transformation.
- `apps/bot/src/client-adapter.ts` : deux nouveaux helpers
  `channelUpdateInput(oldChannel, newChannel)` et
  `roleUpdateInput(oldRole, newRole)` calculent les paires. Les
  helpers minimaux `channelInput` / `roleInput` existants restent pour
  `*.create` / `*.delete`.

## Conséquences

### Pour les consommateurs de ces events

Tout consommateur de `GuildChannelUpdateEvent` ou `GuildRoleUpdateEvent`
doit maintenant fournir (côté producteur) ou consommer (côté lecteur)
les nouveaux champs. En V1, seul le module `logs` consomme ces events
(à partir de PR 4.2b). Aucune migration tierce nécessaire.

### Pour le coût de maintenance

Aucun cache persistant ajouté. Aucun side effect dans le bot. La
surface du contrat augmente de 8 champs sur `channelUpdate` et 10
champs sur `roleUpdate`.

### Pour les données partielles

discord.js v14 garantit typiquement que `oldChannel` et `oldRole` sont
non-null dans les handlers. Dans des cas limites (cache partiel au
démarrage, channel jamais vu avant), certaines propriétés peuvent être
vides. Le client-adapter normalise alors : `name ?? ''`, `topic`
reste nullable, `position ?? 0`, `parentId ?? null`. Pas de drop
silencieux, pas de log obligatoire — un embed avec `nameBefore: ''`
signale clairement qu'on a raté le "before" sans casser le flux.

## Alternatives rejetées

### A. Cache persistant des entités guild côté bot

Maintenir en mémoire (ou en base) une copie des `GuildChannel` et
`Role` pour comparer à la volée.

- Rejet : complexité disproportionnée. discord.js tient déjà un cache
  (`client.channels.cache`, `guild.roles.cache`) et passe le
  `old*` au handler. Ré-implémenter = dupliquer.
- Rejet : coût mémoire non borné sur une instance multi-guildes.

### B. Payload minimal + fetch à la demande côté module logs

Garder le payload `{id, updatedAt}` et laisser le module `logs`
appeler l'API Discord pour récupérer l'état avant/après.

- Rejet : violation du principe "modules via API publiques du core
  uniquement" — un module n'a pas d'accès direct à discord.js.
- Rejet : le "before" n'est plus accessible après réception de
  l'event (Discord ne le conserve pas côté API).
- Rejet : latence + rate-limit accrus pour un log cosmétique.

### C. Diff des `permissionOverwrites` par channel

Inclure dans `channelUpdate` le diff des overwrites par rôle / par
user (cas d'usage sécurité : qui a gagné accès à quel salon).

- Rejet V1 : coût de modélisation élevé (matrice n × m), coût de
  rendu dans un embed limité, cas d'usage spécialisé sans demande
  concrète.
- Reconsidération : si un besoin admin explicite émerge, rouvrir dans
  une PR dédiée, en préservant la compatibilité arrière (champs
  optionnels sur le schéma).

### D. Diff de la `position` d'un rôle

Inclure `positionBefore/After` sur les rôles.

- Rejet V1 : modification rare, peu parlante dans un log d'admin
  (dérive en bruit si l'admin réordonne la hiérarchie visuellement).
  À ajouter plus tard si demandé.
