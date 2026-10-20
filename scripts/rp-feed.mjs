/**
 * rp-feed — poll Urth + News Broadcasts for new posts, forward them to a
 * Discord channel webhook as a no-ping feed. Runs on a schedule in GitHub
 * Actions (see .github/workflows/rp-feed.yml).
 *
 * State (topic id -> last forwarded post id) lives in rp-feed-state.json on
 * the `rp-feed-state` branch — NOT on main, so state commits never trigger a
 * site redeploy. Pass STATE_PATH (read) and OUT_PATH (write).
 *
 * Tracking uses the topic's full post-id stream, so long topics work: only
 * the new tail posts are fetched individually via /posts/{id}.json.
 *
 * Env:
 *   FORUM_BASE            default https://forum.theeastpacific.com
 *   FEED_CATEGORY_IDS     default "16,78" (Urth, News Broadcasts)
 *   DISCORD_WEBHOOK_URL   required to actually post (omit for dry-run)
 *   STATE_PATH            where to read state from
 *   OUT_PATH              where to write updated state
 *   FIRST_RUN             "true" seeds watermarks without posting anything
 *   DRY_RUN               "1" prints messages instead of POSTing to Discord
 *   RECENT_HOURS          window for backfilling old-but-unseen topics (default 24)
 *   MAX_PER_TOPIC / MAX_TOTAL caps per run (defaults 10 / 30)
 */

import { htmlToDiscordMarkdown, neutralizeMentions } from './discord-markdown.mjs';

const FORUM_BASE = process.env.FORUM_BASE || 'https://forum.theeastpacific.com';
const CATEGORY_IDS = (process.env.FEED_CATEGORY_IDS || '16,78').split(',').map(Number);
const DISCORD_URL = process.env.DISCORD_WEBHOOK_URL || '';
const STATE_PATH = process.env.STATE_PATH || './rp-feed-state.json';
const OUT_PATH = process.env.OUT_PATH || STATE_PATH;
const FIRST_RUN = process.env.FIRST_RUN === 'true';
const DRY_RUN = process.env.DRY_RUN === '1' || !DISCORD_URL;
const RECENT_HOURS = Number(process.env.RECENT_HOURS) || 24;
const FEED_USERNAME = process.env.FEED_USERNAME || 'Urth News Network';
const MAX_PER_TOPIC = Number(process.env.MAX_PER_TOPIC) || 10;
const MAX_TOTAL = Number(process.env.MAX_TOTAL) || 30;
const EXCERPT_MAX = 300;

const log = (fields) => console.log(JSON.stringify({ service: 'rp-feed', ...fields }));

function buildMessage(post, topicTitle) {
  const url = `${FORUM_BASE}/t/${post.topic_slug}/${post.topic_id}/${post.post_number}`;
  const isNewTopic = post.post_number === 1;
  return {
    username: FEED_USERNAME,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: String(topicTitle).slice(0, 256),
        url,
        description: neutralizeMentions(htmlToDiscordMarkdown(post.cooked).slice(0, EXCERPT_MAX)) || '(no text content)',
        color: 7575989,
        author: { name: `@${post.username}`.slice(0, 256) },
        footer: { text: isNewTopic ? 'New topic' : `Reply #${post.post_number}` },
        timestamp: post.created_at || undefined,
      },
    ],
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function main() {
  let state = { topics: {} };
  try {
    const fs = await import('node:fs/promises');
    state = JSON.parse(await fs.readFile(STATE_PATH, 'utf8'));
    if (!state.topics) state = { topics: {} };
  } catch {
    log({ message: 'no prior state, starting fresh' });
  }

  let posted = 0;
  let failed = 0;

  for (const catId of CATEGORY_IDS) {
    let list;
    try {
      list = await fetchJson(`${FORUM_BASE}/c/${catId}.json`);
    } catch (err) {
      log({ message: 'category fetch failed', catId, error: String(err) });
      process.exitCode = 1;
      continue;
    }
    const topics = list.topic_list?.topics ?? [];
    log({ message: 'category scanned', catId, topics: topics.length });

    for (const t of topics) {
      if (posted >= MAX_TOTAL) break;
      const stored = state.topics[t.id]?.lastId ?? null;

      let detail;
      try {
        detail = await fetchJson(`${FORUM_BASE}/t/${t.id}.json`);
      } catch (err) {
        log({ message: 'topic fetch failed', topicId: t.id, error: String(err) });
        process.exitCode = 1;
        continue;
      }
      const stream = detail.post_stream?.stream ?? [];
      const tailId = stream.length ? stream[stream.length - 1] : null;

      if (FIRST_RUN || stored === null) {
        if (FIRST_RUN) {
          // Seed silently: never flood the channel with backlog.
          if (tailId !== null) state.topics[t.id] = { lastId: tailId, title: detail.title };
          continue;
        }
        // Old-but-unseen topic (existed before tracking, newly active): only
        // posts from the recent window qualify, then the watermark advances.
        const recentIds = stream.slice(-MAX_PER_TOPIC);
        const cutoff = Date.now() - RECENT_HOURS * 3600 * 1000;
        for (const pid of recentIds) {
          if (posted >= MAX_TOTAL) break;
          let p;
          try {
            p = await fetchJson(`${FORUM_BASE}/posts/${pid}.json`);
          } catch (err) {
            log({ message: 'post fetch failed', topicId: t.id, postId: pid, error: String(err) });
            process.exitCode = 1;
            break;
          }
          if (p.post_type !== 1 || p.deleted_at || new Date(p.created_at).getTime() < cutoff) continue;
          if (!(await forward(p, detail.title, t.id))) {
            failed += 1;
            break;
          }
          posted += 1;
        }
        if (tailId !== null) {
          state.topics[t.id] = { lastId: tailId, title: detail.title };
        }
        continue;
      }

      // Known topic: everything after the stored watermark is new.
      const idx = stream.indexOf(stored);
      const newIds = (idx === -1 ? stream.slice(-MAX_PER_TOPIC) : stream.slice(idx + 1)).slice(0, MAX_PER_TOPIC);
      for (const pid of newIds) {
        if (posted >= MAX_TOTAL) break;
        let p;
        try {
          p = await fetchJson(`${FORUM_BASE}/posts/${pid}.json`);
        } catch (err) {
          log({ message: 'post fetch failed', topicId: t.id, postId: pid, error: String(err) });
          process.exitCode = 1;
          break;
        }
        if (p.post_type !== 1 || p.deleted_at) {
          state.topics[t.id] = { lastId: pid, title: detail.title };
          continue;
        }
        if (!(await forward(p, detail.title, t.id))) {
          failed += 1;
          break; // keep watermark below the failure; retry next run
        }
        state.topics[t.id] = { lastId: pid, title: detail.title };
        posted += 1;
      }
    }
  }

  async function forward(post, topicTitle, topicId) {
    const message = buildMessage(post, topicTitle);
    if (DRY_RUN) {
      console.log(`DRY-RUN post #${post.post_number} in "${topicTitle}": ${message.embeds[0].url}`);
      return true;
    }
    try {
      const res = await fetch(DISCORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      if (!res.ok) throw new Error(`discord -> ${res.status}`);
      return true;
    } catch (err) {
      log({ message: 'discord forward failed', topicId, post: post.post_number, error: String(err) });
      return false;
    }
  }

  const fs = await import('node:fs/promises');
  await fs.writeFile(OUT_PATH, JSON.stringify(state, null, 2) + '\n');
  log({ message: 'run complete', posted, failed, dryRun: DRY_RUN, firstRun: FIRST_RUN });
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  log({ message: 'fatal', error: String(err?.stack || err) });
  process.exitCode = 1;
});
