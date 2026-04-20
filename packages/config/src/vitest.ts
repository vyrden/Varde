import { defineConfig } from 'vitest/config';

/**
 * Options pour générer la config Vitest d'un package du monorepo.
 */
export interface CreateVitestConfigOptions {
  /** Nom du package, utilisé pour identifier le run. */
  readonly packageName: string;
  /** Environnement d'exécution des tests. Défaut : `node`. */
  readonly environment?: 'node' | 'jsdom' | 'happy-dom';
  /**
   * Inclure les tests d'intégration (sous `tests/integration/`).
   * Par défaut, seuls les tests unitaires sont collectés.
   */
  readonly includeIntegration?: boolean;
}

/**
 * Produit une configuration Vitest cohérente avec les conventions du
 * projet : nom scopé au package, environnement par défaut Node, timeouts
 * stables, reporter par défaut, couverture v8.
 *
 * @param options - Paramètres d'adaptation au package consommateur.
 * @returns Configuration Vitest prête à être exportée depuis un
 *          `vitest.config.ts`.
 */
export function createVitestConfig(
  options: CreateVitestConfigOptions,
): ReturnType<typeof defineConfig> {
  const environment = options.environment ?? 'node';
  const include = options.includeIntegration
    ? ['tests/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.tsx']
    : ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'];

  return defineConfig({
    test: {
      name: options.packageName,
      environment,
      include,
      reporters: ['default'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: ['tests/**', 'dist/**'],
      },
      testTimeout: 10_000,
      hookTimeout: 10_000,
    },
  });
}
