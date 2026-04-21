import { createVitestConfig } from '@varde/config/vitest';

export default createVitestConfig({
  packageName: '@varde/module-hello-world',
  includeIntegration: true,
});
