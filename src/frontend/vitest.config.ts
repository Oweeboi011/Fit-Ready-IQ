import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Unit and component tests sit beside the code; route-handler integration
    // tests live in tests/integration/api. Rules tests need an emulator and run
    // under vitest.rules.config.ts instead.
    include: ['src/**/*.test.{ts,tsx}', 'tests/integration/api/**/*.test.ts'],
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
        'src/lib/stravaTokens.ts',

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
        'src/lib/useStravaSync.ts',
        'src/lib/personalStorage.ts',
        'src/lib/placesCacheSchema.ts',
        'src/lib/advisories.ts',
        'src/lib/plans.ts',

        // Shared UI primitives: every dialog and gallery in the app is built on these.
        'src/components/Modal.tsx',
        'src/components/ConfirmDialog.tsx',
        'src/components/PhotoGallery.tsx',
        'src/components/RouteFilter.tsx',

        // Route handlers with tests. Every route that writes user data or
        // spends money belongs here; the rest follow as they gain tests. A
        // blanket glob would sit at ~61% today and fail the gate outright.
        'src/app/api/account/delete/route.ts',
        'src/app/api/admin/cache/route.ts',
        'src/app/api/advisories/route.ts',
        'src/app/api/chat/route.ts',
        'src/app/api/health/route.ts',
        'src/app/api/places/cache/route.ts',
        'src/app/api/strava/sync/route.ts',
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
