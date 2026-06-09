import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { glob } from 'astro/loaders';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema(),
  }),
  blog: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
    schema: z.object({
      title: z.string(),
      author: z.string().optional(),
      date: z.coerce.date().optional(),
      pubDate: z.coerce.date().optional(),
      discourseUrl: z.string().optional(),
    }),
  }),
};
