# 0011. Internationalisation du dashboard avec `next-intl`, dispatch par cookie

Date: 2026-04-28
Statut: accepted

## Contexte

Le jalon 7 introduit l'internationalisation FR/EN du dashboard.
Trois questions à trancher avant de coder :

1. **Quelle bibliothèque** d'i18n côté Next.js — `next-intl`, `lingui`,
   `react-i18next`, ou rien (catalogue maison + `Intl` natif) ?
2. **Comment dispatch la locale** — par segment d'URL (`/fr/...`,
   `/en/...`), par cookie, par sous-domaine, par auto-détection
   `Accept-Language` seulement ?
3. **Périmètre couvert** — tous les écrans existants en une PR, ou
   le minimum vital posé puis migration au fil des PRs qui touchent
   les écrans concernés ?

Contraintes :

- Compatible Next.js 16 App Router (Server Components, server
  actions). Pas de hack qui casserait le rendu côté serveur.
- TypeScript strict — typage des clés de traduction et des
  paramètres ICU si supportés.
- Couvre la pluralisation, la mise en forme des dates et nombres
  (futurs besoins évidents : « 3 modules actifs », « il y a 5 min »).
- Pas de dépendance lourde supplémentaire si une option légère
  fonctionne.

## Décision

### Bibliothèque : `next-intl`

`next-intl` est la solution la plus alignée avec App Router :

- Provider client distinct des helpers serveur (`getTranslations`
  côté Server Components, `useTranslations` côté Client Components).
- Pluralisation et mise en forme via le standard ICU (`{count,
  plural, one {# membre} other {# membres}}`).
- Format de dates et nombres via les API `Intl` natives.
- TypeScript-first, types des clés inférés depuis le JSON de
  messages quand on l'active.
- Bundle léger côté client.

Les autres options écartées :

- `lingui` — bon outillage de macros mais complexité d'intégration
  Next 16 plus élevée, besoin d'un compileur de macros, friction
  pour peu de gain à l'échelle V1.
- `react-i18next` — historique mais pas pensé pour les Server
  Components, demande des contournements pour le rendu côté serveur.
- Catalogue maison + `Intl` — viable techniquement mais réinvente
  un système d'interpolation et de pluralisation. Coût de
  maintenance disproportionné.

### Dispatch : cookie `NEXT_LOCALE`

Le dispatch se fait via un cookie `NEXT_LOCALE` posé depuis les
préférences utilisateur. Pas de path-based routing.

Raisons :

- L'utilisateur configure sa langue **une fois** dans les
  paramètres. Bouger la locale dans l'URL force un changement de
  route à chaque switch — désorientant.
- Pas de besoin SEO multi-langue : le dashboard est entièrement
  derrière auth, pas indexable.
- URLs plus simples (`/guilds/123` plutôt que `/fr/guilds/123`),
  pas de refactor des routes existantes.
- Évite la duplication des bookmarks (`/fr/guilds/123` ≠
  `/en/guilds/123` pour le même serveur).

Fallback en l'absence de cookie : on lit l'en-tête `Accept-Language`
du navigateur et on prend le premier tag qui matche une locale
supportée. À défaut, on retombe sur le défaut (`fr`).

### Périmètre PR 7.0 : pilote, pas exhaustif

L'infra `next-intl` est posée et démontrée fonctionnelle sur le
shell global (login, accueil, 404, header). Les écrans existants
restants (page guild, audit, modules, settings) seront migrés
**au fil de l'eau** dans les PRs 7.1 à 7.4 qui les touchent toutes
en profondeur (refonte UI/UX, nouveaux écrans, refactor permissions).

Migrer ces écrans à l'identique en PR 7.0 avant la refonte = travail
jeté. À la clôture du jalon 7, tout le dashboard sera passé à
l'i18n.

## Alternatives considérées

### Routing par segment d'URL

Rejeté : ajoute un préfixe à toutes les routes du dashboard, force
un refactor des liens, des redirects, des middlewares. Bénéfice
SEO non applicable (auth-gated). Désorienterait l'utilisateur qui
voit son URL changer en switchant la langue.

### `Accept-Language` seul (pas de cookie)

Rejeté : ne permet pas à l'utilisateur de choisir explicitement sa
langue indépendamment du paramétrage navigateur. Cas d'usage
réel : un user installe Varde sur un poste partagé en anglais mais
préfère l'utiliser en français.

### Migration exhaustive des écrans en PR 7.0

Rejeté : le jalon 7 va réécrire en profondeur la majorité du
dashboard via la PR 7.4 (refonte UI/UX). Tout migrer maintenant
demanderait deux passes — une à l'identique, une après refonte.
Posé un critère ajusté pour PR 7.0 (« aucun nouveau string
hardcodé ») et la migration au fil de l'eau dans 7.1-7.4.

## Conséquences

### Positives

- Infra propre et bien intégrée à App Router.
- Provider client posé une seule fois dans `app/layout.tsx`,
  consommable depuis n'importe quel composant ensuite.
- Pas de refactor d'URL, pas de friction sur les bookmarks.
- Test de dispatch unitaire couvre les trois cas (cookie, header,
  défaut) sans démarrer Next.

### Négatives et points de vigilance

- Charger les fichiers de messages dynamiquement (`import(
  \`../messages/\${locale}.json\`)`) introduit un point de
  friction au build : Webpack/Turbopack doit savoir générer les
  variantes possibles. À surveiller si la liste de locales grossit.
- Le cookie n'est lu côté serveur que via `cookies()` — les
  Server Components qui exposent leur rendu à un cache Next ne
  pourront pas être SSG. Acceptable, le dashboard est entièrement
  dynamique de toute façon.
- Le mock de `next-intl/server` côté tests demande de lire le
  vrai fichier `messages/fr.json` ou de stub les clés. Pattern
  documenté dans le test pilote `DashboardHeader.test.tsx`.

## Références

- [next-intl docs](https://next-intl.dev/) — App Router setup.
- `apps/dashboard/i18n/README.md` — guide d'usage interne.
