import { createVitestConfig } from '@varde/config/vitest';

export default createVitestConfig({
  packageName: '@varde/core',
  includeIntegration: true,
  // Plancher anti-régression. Niveau actuel mesuré le 2026-04-27 :
  // 80.91 / 69.62 / 80.18 / 81.83. Critère de sortie jalon 5 : >75 %.
  coverageThresholds: {
    statements: 78,
    branches: 65,
    functions: 78,
    lines: 78,
  },
});
