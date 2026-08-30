/**
 * Build the Pagefind index after `astro build`.
 *
 * - Indexes all HTML under dist/ (honours data-pagefind-body / ignore)
 * - Dynamically finds every *.pdf under dist/, extracts text, and adds a
 *   custom record so PDF body content is searchable without per-file config
 */
import { createIndex } from 'pagefind';
import { extractText, getDocumentProxy } from 'unpdf';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const language = 'en-nz';

/** @param {string} dir */
async function listPdfs(dir) {
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
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
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

  const pdfs = await listPdfs(distDir);
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

    const url = urlFromPdfPath(filePath);
    const title = titleFromPdfPath(filePath);
    const { errors } = await index.addCustomRecord({
      url,
      content,
      language,
      meta: {
        title,
        type: 'pdf',
      },
    });
    if (errors?.length) {
      console.error(`Failed to index ${url}:`, errors);
      process.exit(1);
    }
    pdfCount += 1;
    console.log(`Indexed PDF ${url} (${title})`);
  }

  const { errors: writeErrors } = await index.writeFiles({
    outputPath: path.join(distDir, 'pagefind'),
  });
  if (writeErrors?.length) {
    console.error('Pagefind write errors:', writeErrors);
    process.exit(1);
  }

  console.log(
    `Pagefind index written to dist/pagefind (${pageCount ?? 0} HTML pages, ${pdfCount} PDFs)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
