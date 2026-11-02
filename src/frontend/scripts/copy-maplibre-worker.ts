/**
 * Copies MapLibre's web worker into `public/`, where the map can load it.
 *
 * MapLibre 6 finds its worker by resolving `./maplibre-gl-worker.mjs` against
 * its own module URL. Once the bundler has moved that module into a hashed
 * chunk the sibling file is not there, the worker 404s and the map never
 * starts. `MapView` points `setWorkerUrl` at the copy instead.
 *
 * Copied on every dev and build rather than committed, so the worker always
 * matches the installed `maplibre-gl` — a main thread and worker from two
 * different versions do not speak the same protocol.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const source = join(
  dirname(require.resolve('maplibre-gl/package.json')),
  'dist',
  'maplibre-gl-worker.mjs'
);
const target = join(process.cwd(), 'public', 'maplibre-gl-worker.mjs');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
