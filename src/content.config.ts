import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';

/**
 * Content lives as markdown with YAML frontmatter so it stays portable if the
 * framework ever changes. Schemas are validated at build time, so a typo in
 * frontmatter fails the build rather than rendering a broken page.
 */

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    lede: z.string().optional(),
    /** Filename under public/og/. Falls back to the default card. */
    ogImage: z.string().optional(),
    /** Lower sorts first in the About index. */
    order: z.number().default(50),
    /** Hidden from the About index but still routable. */
    unlisted: z.boolean().default(false),
  }),
});

const meetups = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/meetups' }),
  schema: z.object({
    title: z.string(),
    region: z.string(),
    description: z.string(),
    meetupUrl: z.url().optional(),
    order: z.number().default(50),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    badge: z.string().optional(),
    link: z
      .object({
        label: z.string(),
        href: z.string(),
      })
      .optional(),
  }),
});

export const collections = { pages, meetups, news };
