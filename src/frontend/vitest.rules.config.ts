import { defineConfig } from 'vitest/config';

/**
 * Firestore security-rules tests. Separate from the unit config because they
 * need a running emulator: `npm run test:rules` starts one around this run.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/firestore-rules/**/*.test.ts'],
    // The emulator serialises rule evaluation; parallel files only contend.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
