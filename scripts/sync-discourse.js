// scripts/sync-discourse.js
// Fetches the latest topics from a Discourse category and saves them as Markdown
// files in src/content/blog/ so the Starlight site can render them as a blog.
//
// Run: node scripts/sync-discourse.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DISCOURSE_BASE = 'https://forum.theeastpacific.com';
const CATEGORY_SLUG = 'community/administrative-announcements';
const CATEGORY_ID = 34;
const MAX_TOPICS = 50;
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'content', 'blog');

// Convert HTML to Markdown-ish content
function htmlToMarkdown(html) {
  if (!html) return '';
  let md = html;

  // Headers
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n\n');

  // Bold/italic
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');

  // Code
  md = md.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '\n```\n$1\n```\n');
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

  // Lists
  md = md.replace(/<ul[^>]*>/gi, '\n');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

  // Paragraphs and breaks
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gis, '\n$1\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, '\n> $1\n\n');

  // Strip remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  md = md.replace(/&amp;/g, '&')
         .replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>')
         .replace(/&quot;/g, '"')
         .replace(/&#39;/g, "'")
         .replace(/&nbsp;/g, ' ');

  // Collapse multiple blank lines
  md = md.replace(/\n{3,}/g, '\n\n').trim();

  return md;
}

function makeSlug(title, id) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60)
    .replace(/^-|-$/g, '');
  return `${base}-${id}`;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => https.get(u, {
      headers: {
        'User-Agent': 'TepWorlds-Blog-Sync/1.0',
        'Accept': 'application/json',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
    get(url);
  });
}

async function fetchTopicDetails(topicId) {
  const url = `${DISCOURSE_BASE}/t/${topicId}.json`;
  try {
    const json = await fetchUrl(url);
    const data = JSON.parse(json);
    const firstPost = data.post_stream?.posts?.[0];
    if (!firstPost) return null;
    return {
      id: data.id,
      title: data.title,
      slug: data.slug,
      author: firstPost.username,
      authorName: firstPost.name,
      date: data.created_at,
      lastActivity: data.last_posted_at,
      excerpt: firstPost.excerpt,
      content: htmlToMarkdown(firstPost.cooked),
      url: `${DISCOURSE_BASE}/t/${data.slug}/${data.id}`,
    };
  } catch (e) {
    console.error(`Failed to fetch topic ${topicId}:`, e.message);
    return null;
  }
}

async function main() {
  console.log('Fetching topics from category', CATEGORY_ID);

  // Fetch the latest topics from the category
  const listUrl = `${DISCOURSE_BASE}/c/${CATEGORY_SLUG}/${CATEGORY_ID}.json`;
  let listData;
  try {
    const json = await fetchUrl(listUrl);
    listData = JSON.parse(json);
  } catch (e) {
    console.error('Failed to fetch category list:', e.message);
    process.exit(1);
  }

  const topics = (listData.topic_list?.topics || []).slice(0, MAX_TOPICS);
  console.log(`Found ${topics.length} topics`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const topic of topics) {
    const details = await fetchTopicDetails(topic.id);
    if (!details) continue;

    const filename = `${details.id}-${details.slug}.md`;
    const filepath = path.join(OUTPUT_DIR, filename);

    const frontmatter = [
      '---',
      `title: "${details.title.replace(/"/g, '\\"')}"`,
      `date: ${details.date}`,
      `author: ${details.author}`,
      `discourseUrl: "${details.url}"`,
      `discourseId: ${details.id}`,
      details.excerpt ? `excerpt: "${details.excerpt.replace(/"/g, '\\"').substring(0, 200)}"` : '',
      '---',
      '',
    ].filter(Boolean).join('\n');

    const content = `${frontmatter}\n${details.content}\n\n---\n\n💬 [Discuss this on the forum](${details.url})\n`;

    fs.writeFileSync(filepath, content);
    console.log(`  Wrote ${filename}`);
  }

  console.log(`\nSynced ${topics.length} posts to ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
