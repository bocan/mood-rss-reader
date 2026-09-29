import { expect, test } from 'vitest';
import { isServerPath } from './server-paths';

// The service worker must not answer these with the app shell: the app has
// no route for them and would redirect to "/".

test('the public pages and their feeds are server paths', () => {
  for (const path of [
    '/u/chris',
    '/u/chris/blogroll',
    '/u/chris/blogroll.opml',
    '/u/chris/feed.xml',
    '/u/chris/feed.json',
  ]) {
    expect(isServerPath(path), path).toBe(true);
  }
});

test('the API, WebSub callbacks, and health checks are server paths', () => {
  for (const path of ['/api/articles', '/websub/callback/abc', '/healthz', '/readyz']) {
    expect(isServerPath(path), path).toBe(true);
  }
});

test('the app routes are not, so they still work offline', () => {
  for (const path of ['/', '/login', '/register', '/settings', '/admin', '/user', '/healthz/x']) {
    expect(isServerPath(path), path).toBe(false);
  }
});
