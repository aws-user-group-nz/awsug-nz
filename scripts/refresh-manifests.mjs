#!/usr/bin/env node
/**
 * Refreshes the vendored Community Day photo manifests.
 *
 * Run manually (`npm run refresh-manifests`) when a new Community Day's photos
 * are published. The output is committed so builds stay hermetic: no network
 * call, no credentials, and a build that cannot break because an origin is
 * having a bad day.
 *
 * The archive has no machine-readable index. Its `photos.json` fallback path
 * returns 403, and the real file lists are inlined into the archive page as a
 * `photoManifests` object literal, alongside a `yearDirs` map of year to S3
 * prefix. So we parse those two literals out of the page.
 *
 * This is brittle by nature — it is scraping. It is a manual, occasional
 * script precisely so that brittleness can never break a build or a deploy.
 * If it stops working, the vendored JSON keeps working until someone fixes it.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ARCHIVE_URL = 'https://awsug.nz/communitydays/archive/photos/index.html';
const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'photo-manifests'
);

/** Pulls a `const <name> = {...};` object literal out of the page source. */
function extractObjectLiteral(source, name) {
  const start = source.indexOf(`const ${name} = {`);
  if (start === -1) {
    throw new Error(`Could not find "const ${name} = {" in the archive page`);
  }

  const open = source.indexOf('{', start);
  let depth = 0;

  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(open, i + 1);
        // The page uses single quotes and trailing commas, so this is JS
        // syntax rather than JSON. Function is the least-bad parser here, and
        // the input is a slice of a first-party page we control.
        return Function(`"use strict"; return (${literal});`)();
      }
    }
  }

  throw new Error(`Unbalanced braces while reading "${name}"`);
}

const response = await fetch(ARCHIVE_URL);
if (!response.ok) {
  throw new Error(`${ARCHIVE_URL} returned ${response.status}`);
}
const html = await response.text();

const yearDirs = extractObjectLiteral(html, 'yearDirs');
const photoManifests = extractObjectLiteral(html, 'photoManifests');

await mkdir(OUT_DIR, { recursive: true });

const summary = [];

for (const [year, dir] of Object.entries(yearDirs)) {
  const files = photoManifests[year];
  if (!Array.isArray(files) || files.length === 0) {
    console.warn(`  ${year}: no photos found, skipping`);
    continue;
  }

  const manifest = { year: Number(year), dir, photos: files };
  const path = join(OUT_DIR, `${year}.json`);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  summary.push(`  ${year}: ${files.length} photos -> ${dir}`);
}

console.log(`Refreshed manifests from ${ARCHIVE_URL}`);
console.log(summary.join('\n'));
