# @varde/config

Configurations partagées par tous les packages du monorepo : TypeScript,
Biome, Vitest.

## Usage

### TypeScript

Selon que le package cible Node ou le navigateur :

```json
{
  "extends": "@varde/config/tsconfig.node.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

Les options strictes communes (`strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, etc.) sont dans `tsconfig.base.json`. Les
variantes `node` et `browser` étendent la base avec `lib` et `types`
adaptés.

### Biome

Dans le `biome.json` du package (ou à la racine du monorepo) :

```json
{
  "extends": ["@varde/config/biome.json"]
}
```

Les règles critiques listées dans [../CONVENTIONS.md](../../docs/CONVENTIONS.md)
section "Règles de lint critiques" sont déjà activées (`noExplicitAny`,
`noNonNullAssertion`, `noUnusedVariables`, `noUnusedImports`, `useConst`,
`noConsole` avec tolérance `error` et `warn`). Ajouter les surcharges
spécifiques au package si nécessaire.

### Vitest

Dans `vitest.config.ts` :

```ts
import { createVitestConfig } from '@varde/config/vitest';

export default createVitestConfig({
  packageName: 'core',
  includeIntegration: true,
});
```

Environnement par défaut : `node`. Pour un package browser (ex.
`packages/ui`), passer `environment: 'happy-dom'` ou `'jsdom'`.
