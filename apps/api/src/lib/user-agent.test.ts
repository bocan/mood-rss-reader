import { expect, test } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { BROWSER_LIKE_USER_AGENT, USER_AGENT } from './user-agent.js';

const REPO = 'https://github.com/bocan/mood-rss-reader';

test('the user-agent names the app, its version and where to find it', () => {
  expect(USER_AGENT).toBe(`MoodReader/${pkg.version} (+${REPO})`);
});

test('the browser-like form carries the same identity behind a Mozilla prefix', () => {
  expect(BROWSER_LIKE_USER_AGENT).toBe(
    `Mozilla/5.0 (compatible; MoodReader/${pkg.version}; +${REPO})`,
  );
});

test('neither form is the old placeholder', () => {
  for (const ua of [USER_AGENT, BROWSER_LIKE_USER_AGENT]) {
    expect(ua).not.toMatch(/your\/rss-reader|rss-reader\/0\.1/);
  }
});
