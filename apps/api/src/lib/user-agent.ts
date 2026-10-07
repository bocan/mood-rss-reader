import pkg from '../../package.json' with { type: 'json' };

const REPO_URL = 'https://github.com/bocan/mood-rss-reader';

/**
 * Who we are, on every request this server makes to another site: feed
 * fetches, the site home page (feed and favicon discovery) and WebSub hubs.
 * The name, version and URL let a site owner who sees us in their logs find
 * out what we are.
 */
export const USER_AGENT = `MoodReader/${pkg.version} (+${REPO_URL})`;

/**
 * The same identity in the browser-like form, for fetching an article page
 * (the Extracted view): some publishers refuse a user-agent that does not
 * start like a browser's.
 */
export const BROWSER_LIKE_USER_AGENT = `Mozilla/5.0 (compatible; MoodReader/${pkg.version}; +${REPO_URL})`;
