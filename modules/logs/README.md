# Module `logs`

Un module officiel du bot qui surveille les événements d'une guild Discord
et les transmet en temps réel à des salons de logs configurables.

Conçu pour les administrateurs qui veulent garder une trace des arrivées,
départs, modifications de rôles, suppressions de messages et autres
événements importants, sans avoir à plonger dans les outils de modération
Discord natifs à chaque fois.

## À quoi sert-il ?

À chaque fois qu'un événement surveillé se produit sur votre serveur
Discord (par exemple : quelqu'un modifie un salon, un rôle est supprimé,
un message est édité), le module formate un message enrichi (embed) et
l'envoie dans le salon de logs de votre choix.

Cas d'usage typiques :

- **Audit de modération** : voir qui supprime / édite des messages, qui
  modifie les rôles et permissions, qui crée ou supprime des salons.
- **Suivi des membres** : arrivées, départs, changements de surnom, rôles
  ajoutés ou retirés.
- **Traçabilité en équipe** : quand plusieurs modérateurs configurent le
  serveur ensemble, le module garde un historique lisible des
  changements.

## Installation / activation

Le module est livré avec l'installation de base du bot. Pour l'activer
sur votre guild :

1. Ouvrez le dashboard du bot (URL fournie par votre hébergement).
2. Connectez-vous avec votre compte Discord (vous devez avoir la
   permission `Gérer le serveur` sur la guild concernée).
3. Sélectionnez la guild dans la liste, puis **Modules → Logs**.
4. Activez le module via l'interrupteur en haut de page.

À la première activation, le bot vous propose deux modes de configuration :
**simple** (recommandé pour démarrer) ou **avancé** (plusieurs salons de
logs, règles fines).

## Configuration

### Mode simple

Trois choix à faire, un bouton Enregistrer. C'est tout.

- **Salon cible** : le salon où les logs seront publiés. Vous pouvez
  aussi cliquer sur "Créer un salon #logs" pour générer un salon
  dédié automatiquement.
- **Quoi logger** :
  - **Tout** : les 11 événements les plus courants (arrivées, départs,
    modifications membres, messages supprimés/édités, salons et rôles
    créés/modifiés/supprimés).
  - **Modération** : seulement les événements utiles à la modération
    (suppressions/éditions de messages, départs, changements de rôles).
  - **Membres** : arrivées, départs, modifications de membres.
- **Ignorer les bots** : case à cocher. Laissée cochée par défaut (les
  bots génèrent beaucoup de messages qui n'apportent rien au log).

Le preset **Tout** **n'inclut pas** l'événement "Message envoyé" — il
est volontairement bruyant et n'est pas activé par défaut. Pour le
logger, passez en mode avancé.

Un bouton **Tester** à côté du salon envoie un embed de test : si vous
le voyez dans le salon, tout fonctionne.

### Mode avancé

Pour les serveurs plus grands qui veulent des règles fines :

- **Plusieurs routes** : chaque route associe un ensemble d'événements à
  un salon cible. Par exemple, une route "modération → #mod-logs" et
  une route "membres → #welcome-logs".
- **Verbosité par route** : `compact` (1-2 lignes) ou `détaillé`
  (embed structuré avec before/after, listes de rôles, etc.).
- **Exclusions** :
  - **Utilisateurs exclus** : saisissez des IDs ou mentions — le bot
    ignorera les événements liés à ces utilisateurs (utile pour les
    autres bots).
  - **Rôles exclus** : un utilisateur qui porte un de ces rôles est
    ignoré (utile pour les VIP qu'on ne veut pas logger).
  - **Salons sources exclus** : les événements qui viennent de ces
    salons sont ignorés (utile pour exclure `#spam` ou
    `#bot-commands`).
- **Encart "Limites techniques"** : en bas de la page, rappelle les
  plafonds techniques (voir section suivante).
- **Bouton Tester par route** : envoie un embed de test dans le salon
  cible de la route concernée.

## Événements surveillés

Au total **12 événements `guild.*`** sont couverts (les 2 meta
`guild.join` / `guild.leave` concernent l'arrivée/le départ du bot lui-même
et ne sont pas loggables — si le bot part, il ne peut plus écrire).

| Événement | Déclencheur |
|---|---|
| `guild.memberJoin` | Un membre rejoint le serveur |
| `guild.memberLeave` | Un membre part (quitte ou est éjecté) |
| `guild.memberUpdate` | Modification d'un membre (rôles, surnom) |
| `guild.messageCreate` | Un message est envoyé (bruyant — opt-in mode avancé) |
| `guild.messageEdit` | Un message est édité |
| `guild.messageDelete` | Un message est supprimé |
| `guild.channelCreate` | Un salon est créé |
| `guild.channelUpdate` | Un salon est modifié (nom, sujet, position, catégorie) |
| `guild.channelDelete` | Un salon est supprimé |
| `guild.roleCreate` | Un rôle est créé |
| `guild.roleUpdate` | Un rôle est modifié (nom, couleur, permissions, etc.) |
| `guild.roleDelete` | Un rôle est supprimé |

## Limites techniques

- **Taille des embeds** : si le contenu d'un message dépasse 1024
  caractères, il part en **pièce jointe** `.txt` attachée à l'embed.
  Aucune troncature silencieuse — tout est préservé.
- **Routes cassées** : si un salon de logs est supprimé ou si le bot
  perd ses permissions dessus, la route est marquée comme **cassée**.
  Jusqu'à **100 événements par route cassée** sont conservés en mémoire,
  et un bandeau dans le dashboard vous alerte.
- **Rate limit Discord** : le bot respecte la limite de débit de
  l'API Discord (50 messages par seconde par bot). Les envois sont mis
  en file d'attente automatiquement.
- **Hors scope V1** : pas de replay persistant — si le bot redémarre,
  les événements bufferisés en mémoire sont perdus.

## Dépannage

### Le bot ne poste rien dans mon salon de logs

Vérifiez dans l'ordre :

1. Le module est bien **activé** (interrupteur en haut de la page Logs).
2. Le bot a les permissions `Envoyer des messages` et `Intégrer des liens`
   dans le salon cible.
3. L'événement que vous attendez n'est pas dans les **exclusions**
   (utilisateur / rôle / salon source).
4. Cliquez sur **Tester** pour forcer un envoi : si ça échoue, un
   message vous indique la raison (salon introuvable, permissions
   manquantes, rate limit).

### Une route est marquée comme cassée

Un bandeau rouge apparaît en haut de la page Logs listant les routes
cassées. Causes fréquentes :

- Le salon cible a été **supprimé**.
- Le bot a perdu ses **permissions** sur ce salon.
- Discord a renvoyé une erreur **rate limit** (cas rare, se résout
  tout seul).

Une fois la cause réparée (salon recréé ou permissions rétablies),
cliquez sur **Rejouer** à côté de la route cassée : le bot ré-envoie
les événements bufferisés (jusqu'à 100) dans l'ordre d'arrivée, en
espaçant les envois de 50 ms pour respecter le rate limit Discord.

Si certains événements échouent encore après le replay, un message vous
l'indique. Vous pouvez re-cliquer sur Rejouer après avoir corrigé la
cause résiduelle.

### Le preset simple "Tout" ne log pas les messages envoyés

C'est volontaire — logger **tous** les messages d'un serveur actif
peut rapidement saturer le salon de logs. Passez en mode avancé et
créez une route qui inclut explicitement `guild.messageCreate` si vous
avez besoin de cet audit.

## Permissions requises

Côté dashboard, la configuration du module logs exige la permission
applicative `logs.config.manage`. Par défaut, elle est liée à votre
rôle `@Modérateur` lors de l'onboarding initial.

Pour changer qui peut configurer le module :

1. Dashboard → **Permissions** (menu de gauche).
2. Trouvez `logs.config.manage`.
3. Liez-la aux rôles Discord de votre choix.

Côté Discord, le bot lui-même a besoin des permissions suivantes sur
chaque salon de logs utilisé :

- `View Channel`
- `Send Messages`
- `Embed Links`
- `Attach Files` (pour les contenus longs qui basculent en `.txt`)

## Signaler un bug

- Bug dans le dashboard ou le formatage d'un embed : ouvrez une issue
  sur le dépôt du projet.
- Régression sur l'onboarding / les presets : préciser la version du
  bot (visible en bas du dashboard).
