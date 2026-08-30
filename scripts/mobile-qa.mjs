/**
 * Mobile layout smoke check: no document-level horizontal overflow at key
 * widths, and critical controls meet a 44×44px minimum touch target.
 *
 * Expects a preview server on PREVIEW_URL (default http://127.0.0.1:8001).
 */
import { chromium } from 'playwright';

const base = (process.env.PREVIEW_URL ?? 'http://127.0.0.1:8001').replace(
  /\/$/,
  ''
);

const WIDTHS = [320, 375, 768, 860];
const ROUTES = [
  '/',
  '/about',
  '/events',
  '/history',
  '/meetups/auckland',
  '/community-days/photos/2025',
  '/constitution',
  '/sponsors',
];

const browser = await chromium.launch();
let failed = false;

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: 'light',
  });
  const page = await context.newPage();

  for (const path of ROUTES) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      return {
        scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
        clientWidth: doc.clientWidth,
      };
    });

    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      failed = true;
      console.log(
        `[FAIL] ${width}px ${path} — horizontal overflow (${overflow.scrollWidth} > ${overflow.clientWidth})`
      );
    } else {
      console.log(`[ok] ${width}px ${path}`);
    }

    // Touch targets for header controls on narrow viewports.
    if (width <= 860) {
        const targets = await page.evaluate(() => {
        const pick = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { sel, w: Math.round(r.width), h: Math.round(r.height) };
        };
        return [
          pick('[data-menu-button]'),
          pick('[data-menu-btn]'),
          pick('[data-theme-toggle]'),
        ].filter(Boolean);
      });

      for (const t of targets) {
        // Menu button is display:none above 860; at 860 it should appear.
        if (t.w === 0 && t.h === 0) continue;
        if (t.w < 44 || t.h < 44) {
          failed = true;
          console.log(
            `[FAIL] ${width}px ${path} — ${t.sel} touch target ${t.w}×${t.h}`
          );
        }
      }
    }
  }

  await context.close();
}

await browser.close();

if (failed) {
  console.error('\nMobile layout checks failed.');
  process.exit(1);
}

console.log('\nMobile layout checks passed.');
