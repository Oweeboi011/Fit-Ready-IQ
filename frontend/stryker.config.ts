import type { Config } from '@stryker-mutator/core';

const config: Config = {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  // Only mutate pure business-logic utilities — not UI components or API routes
  mutate: ['src/lib/gpxParser.ts', 'src/lib/polylineDecoder.ts', 'src/lib/activityTypes.ts'],
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  reporters: ['html', 'progress'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  timeoutMS: 30000,
  concurrency: 2,
};

export default config;
