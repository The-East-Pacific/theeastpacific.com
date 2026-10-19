import fs from 'node:fs/promises';
import path from 'node:path';

const DISCOURSE_BASE = 'https://forum.theeastpacific.com';
const OUT_DIR = './src/content/blog';

async function fetchTopic(id) {
  const res = await fetch(`${DISCOURSE_BASE}/t/${id}.json`);
  if (!res.ok) throw new Error(`Failed to fetch ${id}`);
  return res.json();
}

/**
 * Clean the post HTML by removing the 💬 emoji and discuss link footer.
 * Discourse posts often have a footer like:
 *   <p>💬 <a href="...">Discuss this on the forum</a></p>
 * We strip that out since we render our own discuss button in the component.
 */
function cleanContent(html) {
  if (!html) return '';
  
  // Remove the entire <p> tag containing the 💬 emoji and forum link
  let cleaned = html.replace(
    /<p>\s*💬\s*<a[^>]*href="[^"]*\/t\/[^"]*"[^>]*>.*?<\/a>\s*<\/p>/gi,
    ''
  );
  
  // Also remove any standalone 💬 emoji that might be at the end
  cleaned = cleaned.replace(/💬\s*$/g, '');
  
  // Remove trailing whitespace and extra newlines
  cleaned = cleaned.trim();
  
  return cleaned;
}

function toFrontmatter(data, meta = {}) {
  const post = data.post_stream.posts[0];
  if (!post?.created_at) {
    throw new Error(`Topic ${data.id} has no created_at — skipping`);
  }

  // Clean the post content to remove the 💬 discuss footer
  const cleanedContent = cleanContent(post.cooked);

  const fm = {
    title: data.title,
    date: new Date(post.created_at).toISOString().slice(0, 10),
    author: post.username,
    discourseUrl: `${DISCOURSE_BASE}/t/${data.slug}/${data.id}`,
    discourseId: data.id,
    // The forum's "Replies" column shows posts_count - 1 (total posts minus the
    // opening post); reply_count counts something stricter and under-reports.
    replies: Number.isInteger(meta.posts_count) ? Math.max(0, meta.posts_count - 1) : 0,
    excerpt: cleanedContent.replace(/<[^>]+>/g, '').slice(0, 200),
  };

  const fmYaml = Object.entries(fm)
    .map(([k,v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');

  return `---\n${fmYaml}\n---\n\n${cleanedContent}\n`;
}

const CATEGORY_SLUG = 'community/administrative-announcements';
const CATEGORY_ID = 34;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  return res.json();
}

/**
 * Fetch the latest topics in the Administrative Announcements category.
 * Returns them newest-first by topic id.
 */
async function listTopics() {
  const data = await fetchJson(
    `${DISCOURSE_BASE}/c/${CATEGORY_SLUG}/${CATEGORY_ID}.json`
  );
  const topics = data.topic_list?.topics ?? [];
  return topics
    .filter((t) => t.id && t.slug)
    .sort((a, b) => b.id - a.id);
}

async function sync() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const topics = await listTopics();
  console.log(`Found ${topics.length} topics in category ${CATEGORY_ID}`);
  const validIds = new Set(topics.map((t) => String(t.id)));
  // Filenames successfully written this run — used to clean up stale slugs
  // without deleting topics that merely failed to fetch.
  const writtenById = new Map();
  for (const topic of topics) {
    try {
      const data = await fetchTopic(topic.id);
      // Topic may have been moved out of Administrative Announcements
      // (e.g. split off to Trust and Safety) between listing and fetch.
      if (data.category_id !== CATEGORY_ID) {
        console.log(`Skipping ${topic.id}: now in category ${data.category_id}`);
        continue;
      }
      const slug = `${data.id}-${data.slug}`;
      const content = toFrontmatter(data, topic);
      const filename = `${slug}.md`;
      await fs.writeFile(path.join(OUT_DIR, filename), content, 'utf8');
      writtenById.set(String(data.id), filename);
      console.log('Wrote', slug);
    } catch (err) {
      console.error(`Skipping topic ${topic.id}: ${err.message}`);
    }
  }

  // Prune local posts whose topics left category 34 (moved, deleted, or
  // split off elsewhere). Without this, moved topics linger on the site.
  const files = await fs.readdir(OUT_DIR);
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const m = file.match(/^(\d+)-.*\.md$/);
    if (!m) continue;
    const id = m[1];
    if (!validIds.has(id)) {
      await fs.unlink(path.join(OUT_DIR, file));
      console.log('Removed (left category):', file);
    } else if (writtenById.has(id) && writtenById.get(id) !== file) {
      // Same topic id, stale slug (topic renamed) — keep the fresh file.
      await fs.unlink(path.join(OUT_DIR, file));
      console.log('Removed (stale slug):', file);
    }
  }
}

sync().catch((err) => {
  console.error(err);
  process.exit(1);
});
