import { createVitestConfig } from '@varde/config/vitest';

export default createVitestConfig({
  packageName: '@varde/api',
  includeIntegration: true,
  // Plancher anti-régression. Niveau actuel mesuré le 2026-04-27 :
  // 76.49 / 56.06 / 87.36 / 78.34. Critère de sortie jalon 5 : >75 %
  // sur statements et lines, branches/functions plus laxes le temps
  // d'écrire des tests d'intégration plus exhaustifs.
  coverageThresholds: {
    statements: 75,
    branches: 55,
    functions: 80,
    lines: 75,
  },
});
