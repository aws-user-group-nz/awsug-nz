/**
 * Build the Pagefind index after `astro build`.
 *
 * - Indexes all HTML under dist/ (honours data-pagefind-body / ignore)
 * - Dynamically finds every *.pdf under dist/, extracts text, and adds a
 *   custom record so PDF body content is searchable without per-file config
 * - Writes pdf-pages.json so search can open the wrapping HTML page (not the
 *   raw file) when a page in dist links to that PDF
 */
import { createIndex } from 'pagefind';
import { extractText, getDocumentProxy } from 'unpdf';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const language = 'en-nz';

/** @param {string} dir */
async function listFiles(dir, predicate) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} current */
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'pagefind') continue;
        await walk(full);
      } else if (entry.isFile() && predicate(entry.name, full)) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out.sort();
}

/** @param {string} filePath */
function titleFromPdfPath(filePath) {
  const base = path.basename(filePath, '.pdf');
  const cleaned = base
    .replace(/^awsugnz[-_]?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\d{4}(\s+\d{1,2})?$/u, '')
    .trim();
  if (!cleaned) return path.basename(filePath);
  return cleaned.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/** @param {string} filePath */
function urlFromPdfPath(filePath) {
  const rel = path.relative(distDir, filePath).split(path.sep).join('/');
  return `/${rel}`;
}

/** @param {string} htmlPath */
function urlFromHtmlPath(htmlPath) {
  let rel = path.relative(distDir, htmlPath).split(path.sep).join('/');
  if (rel.endsWith('/index.html')) rel = rel.slice(0, -'/index.html'.length);
  else if (rel.endsWith('.html')) rel = rel.slice(0, -'.html'.length);
  if (rel === 'index' || rel === '') return '/';
  return `/${rel}/`.replace(/\/{2,}/g, '/');
}

/** @param {string} href */
function normalizePdfHref(href) {
  try {
    const url = new URL(href, 'https://awsug.nz');
    return url.pathname;
  } catch {
    return href.startsWith('/') ? href.split('?')[0] : `/${href.split('?')[0]}`;
  }
}

/**
 * First HTML page in dist that links to each PDF wins.
 * @returns {Promise<Record<string, string>>} pdfUrl → pageUrl
 */
async function buildPdfPageMap() {
  /** @type {Record<string, string>} */
  const map = {};
  const htmlFiles = await listFiles(distDir, (name) => name.endsWith('.html'));
  for (const htmlPath of htmlFiles) {
    const html = await readFile(htmlPath, 'utf8');
    const pageUrl = urlFromHtmlPath(htmlPath);
    for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+\.pdf)(?:#[^"']*)?["']/gi)) {
      const pdfUrl = normalizePdfHref(match[1]);
      if (!map[pdfUrl]) map[pdfUrl] = pageUrl;
    }
  }
  return map;
}

/** @param {string} htmlPath */
async function titleFromHtmlPath(htmlPath) {
  const html = await readFile(htmlPath, 'utf8');
  const h1 = html.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([^<]+)<\/h1>/i)
    || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1?.[1]) return h1[1].trim();
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title?.[1]) {
    return title[1].split('|')[0].trim();
  }
  return null;
}

/** @param {string} pageUrl */
function htmlPathFromPageUrl(pageUrl) {
  if (pageUrl === '/') return path.join(distDir, 'index.html');
  const trimmed = pageUrl.replace(/\/$/, '').replace(/^\//, '');
  return path.join(distDir, trimmed, 'index.html');
}

async function main() {
  const { errors: createErrors, index } = await createIndex();
  if (!index) {
    console.error('Failed to create Pagefind index:', createErrors);
    process.exit(1);
  }

  const { errors: dirErrors, page_count: pageCount } = await index.addDirectory({
    path: distDir,
  });
  if (dirErrors?.length) {
    console.error('Pagefind HTML indexing errors:', dirErrors);
    process.exit(1);
  }

  const pdfPageMap = await buildPdfPageMap();
  const pdfs = await listFiles(distDir, (name) => name.toLowerCase().endsWith('.pdf'));
  let pdfCount = 0;
  for (const filePath of pdfs) {
    const bytes = new Uint8Array(await readFile(filePath));
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    const content = Array.isArray(extracted.text)
      ? extracted.text.join('\n')
      : String(extracted.text ?? '');
    if (!content.trim()) {
      console.warn(`Skipping empty PDF: ${path.relative(root, filePath)}`);
      continue;
    }

    const pdfUrl = urlFromPdfPath(filePath);
    const pageUrl = pdfPageMap[pdfUrl];
    let title = titleFromPdfPath(filePath);
    if (pageUrl) {
      const pageTitle = await titleFromHtmlPath(htmlPathFromPageUrl(pageUrl));
      if (pageTitle) title = pageTitle;
    }

    // Keep the PDF URL in the index (unique record). Search UI rewrites to the
    // wrapping page via pdf-pages.json when one exists.
    const { errors } = await index.addCustomRecord({
      url: pdfUrl,
      content,
      language,
      meta: {
        title,
        type: 'pdf',
      },
    });
    if (errors?.length) {
      console.error(`Failed to index ${pdfUrl}:`, errors);
      process.exit(1);
    }
    pdfCount += 1;
    console.log(
      pageUrl
        ? `Indexed PDF ${pdfUrl} → ${pageUrl} (${title})`
        : `Indexed PDF ${pdfUrl} (${title}, no HTML page)`,
    );
  }

  const pagefindDir = path.join(distDir, 'pagefind');
  const { errors: writeErrors } = await index.writeFiles({
    outputPath: pagefindDir,
  });
  if (writeErrors?.length) {
    console.error('Pagefind write errors:', writeErrors);
    process.exit(1);
  }

  await writeFile(
    path.join(pagefindDir, 'pdf-pages.json'),
    `${JSON.stringify(pdfPageMap, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `Pagefind index written to dist/pagefind (${pageCount ?? 0} HTML pages, ${pdfCount} PDFs, ${Object.keys(pdfPageMap).length} PDF→page routes)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
