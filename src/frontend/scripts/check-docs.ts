/**
 * Documentation gate (`npm run lint:docs`). The mechanical half of ADR-0005:
 * no tool can tell whether a diagram still matches the code, but one can tell
 * whether a link still lands and whether a file still has anything in it.
 *
 * Fails when:
 *   - a relative link in any Markdown file points at a path that does not exist
 *   - a Markdown file is empty (a wiki page once sat empty for weeks)
 *   - something sits directly under docs/ outside the three-folder taxonomy
 *     (guides = what it is, solution-plan = how we deliver it, adr = why)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.venv',
  'coverage',
  'htmlcov',
  'reports',
  'playwright-report',
  'test-results',
  '.stryker-tmp',
  '.pytest_cache',
]);
// Vendored skill packs, maintained upstream rather than here. A path, not a
// name, so a `skills` directory anywhere else is still checked.
const SKIP_PATHS = new Set([path.join(ROOT, '.claude', 'skills')]);
const DOCS_ALLOWED = new Set(['README.md', 'guides', 'solution-plan', 'adr']);

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory())
      return SKIP_DIRS.has(name) || SKIP_PATHS.has(full) ? [] : markdownFiles(full);
    return name.endsWith('.md') ? [full] : [];
  });
}

const problems: string[] = [];
const rel = (file: string) => path.relative(ROOT, file).replaceAll('\\', '/');

for (const file of markdownFiles(ROOT)) {
  const text = readFileSync(file, 'utf8');
  if (text.trim() === '') problems.push(`${rel(file)}: empty file`);

  // Drop fenced code blocks first: a path inside an example is not a link.
  const prose = text.replace(/```[\s\S]*?```/g, '');
  for (const [, target] of prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const clean = decodeURIComponent(target.split('#')[0]);
    const resolved = clean.startsWith('/')
      ? path.join(ROOT, clean)
      : path.resolve(path.dirname(file), clean);
    if (!existsSync(resolved)) problems.push(`${rel(file)}: broken link → ${target}`);
  }
}

for (const name of readdirSync(path.join(ROOT, 'docs'))) {
  if (!DOCS_ALLOWED.has(name)) {
    problems.push(
      `docs/${name}: outside the taxonomy — move it into guides/, solution-plan/ or adr/`
    );
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} documentation problem(s).`);
  process.exit(1);
}
console.log('Docs OK.');
