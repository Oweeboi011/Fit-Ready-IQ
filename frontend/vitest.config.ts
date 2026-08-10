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
      include: [
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
