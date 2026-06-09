import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string(),
    excerpt: z.string().optional(),
    discourseUrl: z.string().url(),
    discourseId: z.number(),
  }),
});

export const collections = { blog };
