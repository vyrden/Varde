import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Démonte les composants rendus après chaque test. Sans ça, les DOM
 * successifs s'accumulent dans `document.body` et les sélecteurs
 * Testing Library remontent plusieurs occurrences.
 */
afterEach(() => {
  cleanup();
});
