import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://theeastpacific.com',
  base: '',
  integrations: [
    starlight({
      title: 'TEP',
      description: 'News, announcements, and stories from Urth, Valsora, The East Pacific.',
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
            // points to src/content/docs/index.mdx
            { label: 'Home', link: '/' },
            
            // points to src/content/docs/blog.mdx
            { label: 'Blog', link: '/blog/' },
          ],
        },
      ],
    }),
    mdx(),
    sitemap(),
  ],
});
