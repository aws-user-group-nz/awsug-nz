#!/usr/bin/env node
/**
 * Generates Open Graph images (1200x630 PNG) from the theme tokens.
 *
 * Run manually with `npm run og`; the output in `public/og/` is committed.
 *
 * Deliberately NOT wired into `prebuild`. `@resvg/resvg-js` is a native
 * binary, and native binaries break on Node upgrades and on CI architectures
 * that differ from a developer's laptop. For roughly a dozen pages, a
 * build-time pipeline buys nothing over a checked-in file — while a checked-in
 * file guarantees the site can always be built with no native dependencies at
 * all. The images are still generated from the theme rather than hand-drawn.
 *
 * Inter is read from `@fontsource/inter` as static `.woff` weights. The site
 * itself uses the variable build, but satori's font parser cannot read a
 * variable font's `fvar` table, and it does not accept woff2 at all. Bundling
 * the font rather than relying on system fonts is what makes the output
 * reproducible on any machine.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(root, 'public', 'og');

// Straight from src/styles/primitives.css. If the palette changes there,
// change it here and re-run.
const COLOURS = {
  gradient1: '#232F3E',
  gradient2: '#2f1c42',
  gradient3: '#161e2d',
  gradient4: '#521c42',
  orange: '#FF9900',
  white: '#FFFFFF',
  muted: '#D5DBDB',
};

/** Every page that wants its own card. Filenames match SEO.astro's `ogImage`. */
const CARDS = [
  { file: 'default.png', eyebrow: 'Meetups · Community Days · Discord', title: 'Aotearoa New Zealand’s AWS community' },
  { file: 'events.png', eyebrow: 'Events', title: 'Meetups, streams and Discord sessions' },
  { file: 'meetups.png', eyebrow: 'Meetups', title: 'Free AWS meetups across New Zealand' },
  { file: 'about.png', eyebrow: 'About us', title: 'Community run, vendor neutral, open to all' },
  { file: 'sponsors.png', eyebrow: 'Sponsors', title: 'The organisations behind our events' },
  { file: 'community-days.png', eyebrow: 'Community Days', title: 'Full-day conferences by the community' },
  { file: 'news.png', eyebrow: 'News', title: 'Updates from the society' },
  { file: 'resources.png', eyebrow: 'Resources', title: 'Where to start learning AWS' },
];

const WEIGHTS = [400, 600, 700, 800];

function loadInter() {
  return Promise.all(
    WEIGHTS.map(async (weight) => ({
      name: 'Inter',
      weight,
      style: 'normal',
      data: await readFile(
        join(
          root,
          'node_modules',
          '@fontsource',
          'inter',
          'files',
          `inter-latin-${weight}-normal.woff`
        )
      ),
    }))
  );
}

/**
 * Satori takes React-element-shaped objects. Building them literally avoids
 * pulling JSX tooling into a script that runs a handful of times a year.
 */
const el = (type, props, ...children) => ({
  type,
  props: { ...props, children: children.length === 1 ? children[0] : children },
});

function card({ eyebrow, title }) {
  return el(
    'div',
    {
      style: {
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        // Mirrors the animated hero gradient, frozen at one position.
        backgroundImage: `linear-gradient(135deg, ${COLOURS.gradient1} 0%, ${COLOURS.gradient2} 38%, ${COLOURS.gradient3} 68%, ${COLOURS.gradient4} 100%)`,
        fontFamily: 'Inter',
        color: COLOURS.white,
      },
    },
    el(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 20 } },
      el(
        'div',
        {
          style: {
            display: 'flex',
            backgroundColor: COLOURS.orange,
            color: '#000000',
            fontSize: 30,
            fontWeight: 800,
            padding: '10px 20px',
            borderRadius: 8,
          },
        },
        'AWS'
      ),
      el(
        'div',
        { style: { display: 'flex', fontSize: 30, fontWeight: 600, letterSpacing: -0.5 } },
        'User Group Aotearoa'
      )
    ),

    el(
      'div',
      { style: { display: 'flex', flexDirection: 'column' } },
      el(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: COLOURS.orange,
            marginBottom: 20,
          },
        },
        eyebrow
      ),
      el(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: -1.5,
            maxWidth: 940,
          },
        },
        title
      )
    ),

    el(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `2px solid ${COLOURS.orange}`,
          paddingTop: 24,
          fontSize: 26,
          color: COLOURS.muted,
        },
      },
      el('div', { style: { display: 'flex' } }, 'awsug.nz'),
      el('div', { style: { display: 'flex' } }, 'Everyone welcome')
    )
  );
}

const fonts = await loadInter();
await mkdir(OUT_DIR, { recursive: true });

for (const spec of CARDS) {
  const svg = await satori(card(spec), { width: 1200, height: 630, fonts });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
    .render()
    .asPng();

  await writeFile(join(OUT_DIR, spec.file), png);
  console.log(`  ${spec.file}  ${(png.length / 1024).toFixed(0)} KB`);
}

console.log(`\nWrote ${CARDS.length} OG images to public/og/`);
