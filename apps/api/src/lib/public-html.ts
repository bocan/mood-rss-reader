/**
 * Server-rendered public pages (SPEC-019/020): zero-JS, self-contained HTML.
 * Every interpolated value MUST pass through esc(); notes, titles, and feed
 * names are untrusted input.
 */

/** HTML-entity escape for text and attribute contexts (single + double quoted). */
export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** Escaped text with newlines rendered as <br>. For share notes. */
export function escMultiline(s: string): string {
  return esc(s).replace(/\r?\n/g, '<br>\n');
}

/**
 * A short, readable label for a link: host and path, with no scheme and no
 * trailing slash ("mastodon.social/@chris"). The URL itself if it does not
 * parse. Not escaped: pass it through esc().
 */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}${u.search}`.replace(/\/+$/, '');
  } catch {
    return url;
  }
}

/** What the owner card shows about a person (SPEC-026). */
export interface OwnerCardSource {
  displayName: string;
  bio: string | null;
  websiteUrl: string | null;
  photoUrl: string | null;
  meLinks: string[];
}

/**
 * The page owner's h-card (SPEC-026). `pageUrl` is the absolute URL of the
 * page the card is on: a u-uid and u-url equal to it make this the page's
 * representative h-card. `author` adds p-author, for a card inside an h-feed.
 * Optional parts are left out, never rendered empty. rel="me" must keep the
 * "me" token: Mastodon verifies the page through it.
 */
export function ownerCard(
  owner: OwnerCardSource,
  pageUrl: string,
  { author }: { author: boolean },
): string {
  const parts = [
    owner.photoUrl
      ? `<img class="u-photo" src="${esc(owner.photoUrl)}" alt="" width="48" height="48" loading="lazy" referrerpolicy="no-referrer">`
      : '',
    `<a class="p-name u-url u-uid" href="${esc(pageUrl)}">${esc(owner.displayName)}</a>`,
    owner.websiteUrl
      ? `<a class="u-url" rel="me noopener" href="${esc(owner.websiteUrl)}">${esc(linkLabel(owner.websiteUrl))}</a>`
      : '',
    owner.bio ? `<p class="p-note">${escMultiline(owner.bio)}</p>` : '',
    owner.meLinks.length > 0
      ? `<ul class="me-links">\n${owner.meLinks
          .map((link) => `    <li><a rel="me noopener" href="${esc(link)}">${esc(linkLabel(link))}</a></li>`)
          .join('\n')}\n  </ul>`
      : '',
  ].filter(Boolean);
  return `<div class="h-card${author ? ' p-author' : ''} owner">
  ${parts.join('\n  ')}
</div>`;
}

const STYLE = `
  :root { color-scheme: light dark; }
  body {
    margin: 0 auto; padding: 2rem 1.25rem 4rem; max-width: 42rem;
    font: 1rem/1.65 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #fdfdfc; color: #21242b;
  }
  a { color: #2f6fd0; }
  h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 0.25rem; }
  header p { margin: 0.25rem 0 0; color: #6a7180; }
  header { margin-bottom: 2.25rem; }
  article { margin: 0 0 2rem; }
  article .note { margin: 0 0 0.35rem; font-family: Georgia, 'Times New Roman', serif; font-size: 1.05rem; }
  article h2 { font-size: 1rem; margin: 0; font-weight: 600; }
  article .meta { margin: 0.15rem 0 0; font-size: 0.85rem; color: #6a7180; }
  footer { margin-top: 3rem; font-size: 0.85rem; color: #6a7180; }
  .owner { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.75rem; margin-top: 0.75rem; font-size: 0.9rem; }
  .owner img { border-radius: 50%; }
  .owner .p-note { flex-basis: 100%; }
  .me-links { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 0.25rem 0.9rem; list-style: none; margin: 0; padding: 0; }
  .me-links li { margin: 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #14161b; color: #e8ebf1; }
    a { color: #69a8ef; }
    header p, article .meta, footer { color: #98a0ad; }
  }
`;

/** Wrap body content in a complete, self-contained HTML document. */
export function layout(opts: { title: string; head?: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>${STYLE}</style>
${opts.head ?? ''}
</head>
<body>
${opts.body}
</body>
</html>
`;
}
