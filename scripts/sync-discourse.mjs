import fs from 'node:fs/promises';
import path from 'node:path';

const DISCOURSE_BASE = 'https://forum.theeastpacific.com';
const OUT_DIR = './src/content/blog';

async function fetchTopic(id) {
  const res = await fetch(`${DISCOURSE_BASE}/t/${id}.json`);
  if (!res.ok) throw new Error(`Failed to fetch ${id}`);
  return res.json();
}
function toFrontmatter(data) {
  const post = data.post_stream.posts[0];
  if (!post?.created_at) {
    throw new Error(`Topic ${data.id} has no created_at — skipping`);
  }
  const fm = {
    title: data.title,
    date: new Date(post.created_at).toISOString().slice(0, 10),
    author: post.username,
    discourseUrl: `${DISCOURSE_BASE}/t/${data.slug}/${data.id}`,
    discourseId: data.id,
    excerpt: (post.cooked || '').replace(/<[^>]+>/g, '').slice(0, 200),
  };
  // ... rest unchanged
}
  const fmYaml = Object.entries(fm)
    .map(([k,v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `---\n${fmYaml}\n---\n\n${post.cooked}\n`;
}

async function sync(ids) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const id of ids) {
    const data = await fetchTopic(id);
    const slug = `${id}-${data.slug}`;
    const content = toFrontmatter(data);
    await fs.writeFile(path.join(OUT_DIR, `${slug}.md`), content, 'utf8');
    console.log('Wrote', slug);
  }
}

// Example: sync the topics you care about
// You can pull this list from Discourse API /latest.json too
sync([12281]);
