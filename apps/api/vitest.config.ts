import { createVitestConfig } from '@varde/config/vitest';

export default createVitestConfig({
  packageName: '@varde/api',
  includeIntegration: true,
});
