import { defineConfig } from 'vitest/config';

/**
 * Vitest 4 (vite 8 + rolldown/oxc) lit le `tsconfig` du package et
 * refuse de parser du JSX quand `jsx: "preserve"` y est déclaré — ce
 * qui est le cas côté Next. On force donc oxc à transformer le JSX
 * avec le runtime automatique, indépendamment du `tsconfig`. La config
 * n'utilise pas `createVitestConfig` du `@varde/config` parce qu'il
 * faut passer des options `oxc` non exposées par le helper partagé.
 */
export default defineConfig({
  test: {
    name: '@varde/dashboard',
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    reporters: ['default'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
});
