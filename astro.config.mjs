import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://theeastpacific.com',
  integrations: [
    starlight({
      title: 'The East Pacific',
      description: 'News, announcements, and stories from The East Pacific community.',
      logo: {
        src: './src/assets/logo.svg',
        replacesTitle: false,
      },
      favicon: '/favicon.ico',
      customCss: ['./src/styles/custom.css'],
      components: {
        Footer: './src/components/Footer.astro',
      },
      social: {
        discord: 'https://discord.com/channels/633351482128728064',
      },
      editLink: {
        baseUrl: 'https://github.com/the-east-pacific/tepworlds/edit/main/',
      },
      sidebar: [
        {
          label: 'Site',
          items: [
            { label: 'Home', slug: '/' },
            { label: 'Blog', slug: 'blog' },
          ],
        },
      ],
    }),
    mdx(),
    sitemap(),
  ],
});
