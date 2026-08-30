// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE and BASE come from the environment so the same source builds correctly
// at a domain root or under a demo subpath (e.g. GitHub Pages project pages).
const site = process.env.SITE ?? 'https://awsug.nz';
const base = process.env.BASE ?? '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  build: {
    format: 'directory',
  },
  // Warm same-origin pages on hover so ClientRouter swaps feel instant.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  devToolbar: {
    enabled: false,
  },
});
