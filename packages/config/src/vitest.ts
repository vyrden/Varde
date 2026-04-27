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
  /**
   * Plancher de couverture par dimension (statements, branches,
   * functions, lines). Si fourni, `pnpm coverage` fail quand le code
   * passe sous ces seuils — protection contre la régression.
   *
   * Les valeurs sont exprimées en pourcentages 0-100. Mettre `undefined`
   * sur une dimension pour ne pas l'imposer ; dans la config racine
   * (jalon 5 PR 5.7), on cible 75 % sur core et api, et on capture le
   * niveau actuel pour les autres packages.
   */
  readonly coverageThresholds?: {
    readonly statements?: number;
    readonly branches?: number;
    readonly functions?: number;
    readonly lines?: number;
  };
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
        exclude: ['tests/**', 'dist/**', 'vitest.config.ts'],
        ...(options.coverageThresholds
          ? {
              thresholds: {
                ...(options.coverageThresholds.statements !== undefined
                  ? { statements: options.coverageThresholds.statements }
                  : {}),
                ...(options.coverageThresholds.branches !== undefined
                  ? { branches: options.coverageThresholds.branches }
                  : {}),
                ...(options.coverageThresholds.functions !== undefined
                  ? { functions: options.coverageThresholds.functions }
                  : {}),
                ...(options.coverageThresholds.lines !== undefined
                  ? { lines: options.coverageThresholds.lines }
                  : {}),
              },
            }
          : {}),
      },
      testTimeout: 10_000,
      hookTimeout: 10_000,
    },
  });
}
