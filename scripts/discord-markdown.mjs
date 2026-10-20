/**
 * Convert Discourse cooked HTML to Discord-flavoured markdown.
 * Handles the markup the forum actually emits: bold/italic/strike, links,
 * emoji images (kept as the real emoji), code/pre blocks, quotes (with
 * quoted-username attribution), headings and lists. Everything else is
 * stripped to text.
 */

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  '#x27': "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
};

function decodeEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-zA-Z#0-9]+);/g, (m, name) => (name in ENTITY_MAP ? ENTITY_MAP[name] : m));
}

function stripTagsKeepLines(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
}

export function htmlToDiscordMarkdown(html) {
  let s = String(html || '');

  // Emoji images carry the real emoji in alt text — keep it.
  s = s.replace(/<img[^>]*class="[^"]*\bemoji\b[^"]*"[^>]*>/gi, (m) => {
    const alt = m.match(/alt="([^"]*)"/i);
    return alt ? alt[1] : '';
  });
  // Other images can't render inline — drop the tag, keep nothing.
  s = s.replace(/<img[^>]*>/gi, '');

  // Fenced code blocks first (so inline-code conversion skips them).
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
    const code = decodeEntities(stripTagsKeepLines(inner).replace(/^\n+|\n+$/g, ''));
    return '\n```\n' + code + '\n```\n';
  });

  // Inline formatting.
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  s = s.replace(/<(s|strike|del)[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~');
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Links: [text](url).
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Headings become bold lines.
  s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n**$1**\n');

  // Discourse quote blocks, with quoted-user attribution when present.
  s = s.replace(/<aside[^>]*class="[^"]*\bquote\b[^"]*"[^>]*>([\s\S]*?)<\/aside>/gi, (m, inner) => {
    const who = m.match(/data-username="([^"]*)"/i);
    const lines = stripTagsKeepLines(inner)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `> ${l}`);
    const head = who ? `> **${who[1]} said:**` : null;
    return '\n' + [head, ...lines].filter(Boolean).join('\n') + '\n';
  });
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const lines = stripTagsKeepLines(inner)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `> ${l}`);
    return '\n' + lines.join('\n') + '\n';
  });

  // Lists → bullets.
  s = s.replace(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1].trim()).filter(Boolean);
    return '\n' + items.map((i) => `• ${i}`).join('\n') + '\n';
  });

  // Remaining block structure → newlines, then strip leftover tags.
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?(p|div)[^>]*>/gi, '\n');
  s = s.replace(/<hr[^>]*>/gi, '\n');
  s = s.replace(/<[^>]*>/g, '');

  s = decodeEntities(s);
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

/**
 * Neutralize mass mentions so message content can never ping, even if a
 * forum post quotes "@everyone" or "@here". (allowed_mentions is still set
 * to parse nothing on the Discord request itself.)
 */
export function neutralizeMentions(text) {
  return text.replace(/@(everyone|here)/gi, '@\u200b$1');
}
