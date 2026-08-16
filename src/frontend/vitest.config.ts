import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // An explicit allowlist rather than a glob, so a new module is measured
      // only once someone decides it should be. The cost of that is a module
      // can sit outside the gate indefinitely — which is what had happened to
      // every security-critical file below: the identity gate, the admin gate
      // and the rate limiter were all unmeasured while the product enforced an
      // 85% threshold on GPX parsing.
      include: [
        // Security-critical: authorisation, metering, audit.
        'src/lib/serverAuth.ts',
        'src/lib/adminAuth.ts',
        'src/lib/rateLimit.ts',
        'src/lib/auditLog.ts',
        'src/lib/logger.ts',

        'src/lib/theme.ts',
        'src/lib/activityTypes.ts',
        'src/lib/gpxParser.ts',
        'src/lib/polylineDecoder.ts',
        'src/lib/useSavedPlaces.ts',
        'src/lib/useUserLocation.ts',
        'src/lib/fitnessScore.ts',
        'src/lib/placeUrl.ts',
        'src/lib/gpxBuilder.ts',
        'src/lib/routeDifficulty.ts',
        'src/lib/savedPlans.ts',
        'src/lib/readiness.ts',
        'src/lib/trainingPlan.ts',
        'src/lib/weatherAlerts.ts',
        'src/lib/weatherAlertCache.ts',
        'src/lib/radarLayer.ts',
        'src/lib/stravaAuth.ts',
      ],
      thresholds: {
        statements: 85,
        branches: 50,
        functions: 85,
        lines: 85,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
