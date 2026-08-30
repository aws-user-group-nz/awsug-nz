/**
 * axe-core scan against the built static site.
 *
 * Expects `dist/` already built and a preview server on PREVIEW_URL
 * (default http://127.0.0.1:8001). Fails the process on serious/critical
 * violations. Moderate/minor are reported but do not fail.
 */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = (process.env.PREVIEW_URL ?? 'http://127.0.0.1:8001').replace(
  /\/$/,
  ''
);

const ROUTES = [
  '/',
  '/about',
  '/events',
  '/meetups/auckland',
  '/community-days/photos/2025',
  '/constitution',
  '/code-of-conduct',
  '/404',
];

const FAIL_IMPACTS = new Set(['serious', 'critical']);

async function scan(page, path) {
  const url = `${base}${path}`;
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  // Give client-hydrated regions a beat to settle (events / Discord).
  await page.waitForTimeout(400);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const status = response?.status() ?? 0;
  return { path, status, results };
}

function summarise(violations) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  colorScheme: 'light',
});
const page = await context.newPage();

let failed = false;
const report = [];

for (const path of ROUTES) {
  try {
    const { status, results } = await scan(page, path);
    const failing = results.violations.filter((v) =>
      FAIL_IMPACTS.has(v.impact ?? '')
    );
    const other = results.violations.filter(
      (v) => !FAIL_IMPACTS.has(v.impact ?? '')
    );

    report.push({
      path,
      status,
      serious: summarise(failing),
      other: summarise(other),
    });

    if (failing.length > 0) failed = true;

    const mark = failing.length === 0 ? 'ok' : 'FAIL';
    console.log(
      `[${mark}] ${path} (HTTP ${status}) — ${failing.length} serious/critical, ${other.length} other`
    );
    for (const v of failing) {
      console.log(
        `  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes} nodes)`
      );
      for (const t of v.targets ?? []) console.log(`      ${t}`);
    }
    for (const v of other) {
      console.log(
        `  · [${v.impact}] ${v.id}: ${v.help} (${v.nodes} nodes)`
      );
    }
  } catch (error) {
    failed = true;
    console.error(
      `[FAIL] ${path}:`,
      error instanceof Error ? error.message : error
    );
    report.push({ path, error: String(error) });
  }
}

await context.close();
await browser.close();

console.log('\n--- axe summary ---');
console.log(JSON.stringify(report, null, 2));

if (failed) {
  console.error('\naxe found serious/critical issues (or scan errors).');
  process.exit(1);
}

console.log('\nNo serious/critical axe violations on the key route set.');
