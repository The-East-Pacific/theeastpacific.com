# The East Pacific — News & Blog

The official news site for [Tep Worlds](https://theeastpacific.com), built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build).

## How content works

Blog posts are automatically synced from a Discourse forum category:

- Source: `https://forum.theeastpacific.com/c/community/administrative-announcements/34`
- Sync runs every 30 minutes via GitHub Action
- Each topic becomes a Markdown file in `src/content/blog/`
- Posts are rendered as full articles at `theeastpacific.com/blog/[slug]/`
- Each post links back to the original forum thread for discussion

## Adding content

To add a blog post, simply create a new topic in the [Administrative Announcements category](https://forum.theeastpacific.com/c/community/administrative-announcements/34) on the forum. The site will pick it up within 30 minutes.

## Local development

```bash
npm install
node scripts/sync-discourse.js   # fetch latest forum posts
npm run dev                      # start dev server
