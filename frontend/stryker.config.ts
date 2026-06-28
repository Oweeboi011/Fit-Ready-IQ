import type { Config } from '@stryker-mutator/core';

const config: Config = {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  // Scoped to lib/ only — running Stryker on the full codebase exceeds the 30s per-test timeout
  mutate: ['src/lib/gpxParser.ts', 'src/lib/polylineDecoder.ts', 'src/lib/activityTypes.ts'],
  thresholds: {
    high: 80,
    low: 70,
    break: 70,
  },
  reporters: ['html', 'progress'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  timeoutMS: 30000,
  concurrency: 2,
};

export default config;
