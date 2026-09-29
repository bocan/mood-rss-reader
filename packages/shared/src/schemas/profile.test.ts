import { describe, expect, test } from 'vitest';
import { MAX_ME_LINKS, SLUG_RE, updateProfileSchema } from './profile.js';

// SPEC-026: the IndieWeb identity fields.
describe('updateProfileSchema identity fields', () => {
  const ok = (body: Record<string, unknown>) => updateProfileSchema.safeParse(body).success;
  const bad = [
    'javascript:alert(1)',
    'mailto:a@b.co',
    'data:text/html,x',
    'https://localhost',
    'https://127.0.0.1',
    'not a url',
    `https://example.com/${'x'.repeat(290)}`, // over 300 characters
  ];

  test('the website and the links take http and https addresses with a real domain', () => {
    expect(ok({ websiteUrl: 'https://example.com' })).toBe(true);
    expect(ok({ websiteUrl: 'http://example.com/me' })).toBe(true);
    expect(ok({ meLinks: ['https://mastodon.example/@chris', 'http://example.org'] })).toBe(true);
  });
  test.each(bad)('the website and the links refuse %j', (url) => {
    expect(ok({ websiteUrl: url })).toBe(false);
    expect(ok({ meLinks: [url] })).toBe(false);
  });
  test('the photo must be https', () => {
    expect(ok({ photoUrl: 'https://example.com/me.jpg' })).toBe(true);
    expect(ok({ photoUrl: 'http://example.com/me.jpg' })).toBe(false);
    for (const url of bad) expect(ok({ photoUrl: url })).toBe(false);
  });
  test(`at most ${MAX_ME_LINKS} links`, () => {
    const links = (n: number) => Array.from({ length: n }, (_, i) => `https://s${i}.example.com`);
    expect(ok({ meLinks: links(MAX_ME_LINKS) })).toBe(true);
    expect(ok({ meLinks: links(MAX_ME_LINKS + 1) })).toBe(false);
  });
  test('trims, drops exact duplicates, keeps the order, and stores what was typed', () => {
    const parsed = updateProfileSchema.parse({
      websiteUrl: '  https://Example.com/Me/  ',
      meLinks: [' https://b.example.com ', 'https://a.example.com', 'https://b.example.com'],
    });
    expect(parsed.websiteUrl).toBe('https://Example.com/Me/');
    expect(parsed.meLinks).toEqual(['https://b.example.com', 'https://a.example.com']);
  });
  test('null and [] clear the fields', () => {
    expect(updateProfileSchema.parse({ websiteUrl: null, photoUrl: null, meLinks: [] })).toEqual({
      websiteUrl: null,
      photoUrl: null,
      meLinks: [],
    });
  });
});

describe('SLUG_RE', () => {
  test.each(['chris', 'chris-f', 'a1b', 'reader-42', 'x'.repeat(32)])('accepts %s', (slug) => {
    expect(SLUG_RE.test(slug)).toBe(true);
  });

  test.each([
    'ab', // too short
    'x'.repeat(33), // too long
    'Chris', // uppercase
    '-chris', // leading dash
    'chris-', // trailing dash
    'chris_f', // underscore
    'chris f', // space
    'chr/is', // slash
    '', // empty
  ])('rejects %j', (slug) => {
    expect(SLUG_RE.test(slug)).toBe(false);
  });
});
