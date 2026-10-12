import type { IncomingHttpHeaders } from 'node:http';
import type { ArticleEmbeddable } from '@rss/shared';
import { Agent, interceptors, request } from 'undici';
import { BROWSER_LIKE_USER_AGENT } from './user-agent.js';

const TIMEOUT_MS = 10_000;

// Article URLs often redirect; the headers that count are the last page's.
const dispatcher = new Agent().compose(interceptors.redirect({ maxRedirections: 5 }));

type FrameBlock = NonNullable<ArticleEmbeddable['reason']>;

function headerValues(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Does one frame-ancestors source expression allow `app` to frame the page? */
function sourceAllows(source: string, app: URL, page: URL): boolean {
  const s = source.toLowerCase();
  if (s === '*') return true;
  if (s === "'none'") return false;
  if (s === "'self'") return page.origin === app.origin;
  // A scheme source, e.g. https:
  if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return s === app.protocol;
  // A host source: [scheme://]host[:port][/path], host may start with "*.".
  const match = /^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/:]+)(?::(\d+|\*))?(?:\/.*)?$/.exec(s);
  if (!match) return false;
  const [, scheme, host, port] = match;
  if (scheme && `${scheme}:` !== app.protocol) return false;
  if (port && port !== '*' && port !== (app.port || (app.protocol === 'https:' ? '443' : '80'))) {
    return false;
  }
  if (host!.startsWith('*.')) return app.hostname.endsWith(host!.slice(1));
  return host === app.hostname;
}

/**
 * Which response header, if any, forbids showing a page inside a frame on our
 * origin. The browser's rules: every Content-Security-Policy that has a
 * frame-ancestors directive must allow us; when one has it, X-Frame-Options
 * is ignored. Otherwise X-Frame-Options DENY and SAMEORIGIN forbid it
 * (ALLOW-FROM is obsolete, and browsers ignore it).
 */
export function frameBlock(
  headers: IncomingHttpHeaders,
  appOrigin: string,
  pageUrl: string,
): FrameBlock | null {
  const app = new URL(appOrigin);
  const page = new URL(pageUrl);

  // A header can repeat, and one header can hold several policies, split by commas.
  const policies = headerValues(headers['content-security-policy']).flatMap((h) => h.split(','));
  let sawFrameAncestors = false;
  for (const policy of policies) {
    const directive = policy
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .find((parts) => parts[0]?.toLowerCase() === 'frame-ancestors');
    if (!directive) continue;
    sawFrameAncestors = true;
    if (!directive.slice(1).some((source) => sourceAllows(source, app, page))) {
      return 'frame-ancestors';
    }
  }
  if (sawFrameAncestors) return null;

  const xfo = headerValues(headers['x-frame-options'])
    .flatMap((h) => h.split(','))
    .map((v) => v.trim().toLowerCase());
  if (xfo.includes('deny')) return 'x-frame-options';
  if (xfo.includes('sameorigin') && page.origin !== app.origin) return 'x-frame-options';
  return null;
}

/**
 * Ask the article's page whether it may show in a frame on our origin. Only
 * the headers are read. A page that cannot be reached counts as embeddable:
 * the Web view then lets the browser try, as it did before this check.
 */
export async function checkEmbeddable(url: string, appOrigin: string): Promise<ArticleEmbeddable> {
  const unknown: ArticleEmbeddable = { embeddable: true, reason: null };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return unknown;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return unknown;

  try {
    // GET, not HEAD: some sites answer HEAD with other headers, or refuse it.
    const res = await request(url, {
      method: 'GET',
      dispatcher,
      headersTimeout: TIMEOUT_MS,
      bodyTimeout: TIMEOUT_MS,
      headers: { 'user-agent': BROWSER_LIKE_USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    });
    await res.body.dump(); // only the headers matter; free the socket
    const reason = frameBlock(res.headers, appOrigin, url);
    return { embeddable: reason === null, reason };
  } catch {
    return unknown;
  }
}
