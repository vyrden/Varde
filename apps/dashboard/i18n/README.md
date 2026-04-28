# Internationalisation du dashboard

Le dashboard utilise [`next-intl`](https://next-intl.dev/) pour
afficher son interface en plusieurs langues. V1 livre **français**
et **anglais**.

## Comment c'est branché

Trois fichiers font tout le travail :

- [`config.ts`](./config.ts) — liste des locales supportées et
  locale par défaut.
- [`locale.ts`](./locale.ts) — résout la locale active pour la
  requête courante (cookie d'abord, sinon `Accept-Language`, sinon
  défaut).
- [`request.ts`](./request.ts) — config server-side appelée par
  `next-intl` à chaque rendu Server Component. Charge le JSON de
  messages correspondant.

Le plugin [`next-intl/plugin`](https://next-intl.dev/docs/getting-started/app-router)
est branché dans [`next.config.mjs`](../next.config.mjs), et le
provider client est posé dans [`app/layout.tsx`](../app/layout.tsx).

## Comment la locale est choisie

Dans cet ordre, le premier qui donne une locale supportée gagne :

1. **Cookie `NEXT_LOCALE`** posé par les préférences utilisateur
   (PR 7.4). Persiste entre les sessions.
2. **En-tête `Accept-Language`** envoyé par le navigateur. Premier
   tag de langue qui matche `fr` ou `en`.
3. **Défaut** : `fr`.

## Utiliser les traductions dans le code

Côté **server component** (le cas le plus courant) :

```tsx
import { getTranslations } from 'next-intl/server';

export async function MaPage() {
  const t = await getTranslations('section.scope');
  return <h1>{t('title')}</h1>;
}
```

Côté **client component** (`'use client'`) :

```tsx
'use client';
import { useTranslations } from 'next-intl';

export function MonComposant() {
  const t = useTranslations('section.scope');
  return <button>{t('button')}</button>;
}
```

## Conventions de clés

Format : `{section}.{component}.{key}`. Trois exemples :

- `auth.signIn.title` — titre de la carte de connexion.
- `dashboard.guildList.empty.title` — titre de l'état vide de la
  liste de serveurs.
- `modules.welcome.editor.testButton` — bouton « Tester » de
  l'éditeur du module welcome.

Avantages : les clés se rangent par fichier dans le JSON, on évite
les collisions, on retrouve la traduction d'un coup d'œil.

**Aucun string hardcodé en français ou en anglais ne doit subsister
dans le code après PR 7.0.**

## Ajouter une nouvelle clé

1. L'ajouter dans `messages/fr.json` ET `messages/en.json` (jamais
   l'un sans l'autre).
2. La consommer via `t('chemin.de.la.cle')`.
3. Si la clé contient une variable, utiliser la syntaxe ICU :
   `"hello": "Bonjour {name}"` puis `t('hello', { name: 'Alice' })`.

## Ajouter une nouvelle langue

1. Étendre `locales` dans [`config.ts`](./config.ts).
2. Créer le fichier `messages/<code>.json` en partant d'une copie
   de `en.json`.
3. Tester avec un cookie `NEXT_LOCALE=<code>` posé manuellement
   (DevTools → Application → Cookies).
4. Documenter le code de langue dans la table ci-dessous.

| Code | Langue | Statut |
| --- | --- | --- |
| `fr` | Français | ✅ Livré |
| `en` | English | ✅ Livré |
