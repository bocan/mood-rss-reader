import { expect, test } from 'vitest';
import { identityInput } from './profile';

// SPEC-026: the identity fields in Settings, Sharing.

const form = (over: Partial<Parameters<typeof identityInput>[0]> = {}) => ({
  website: '',
  photo: '',
  links: '',
  ...over,
});

test('empty fields clear: null for the addresses, [] for the links', () => {
  expect(identityInput(form())).toEqual({ input: { websiteUrl: null, photoUrl: null, meLinks: [] } });
});

test('trims, skips blank lines, drops exact duplicates, and keeps the order', () => {
  const result = identityInput(
    form({
      website: ' https://chris.example ',
      photo: 'https://chris.example/me.jpg',
      links: 'https://b.example.com\n\n  https://a.example.com  \nhttps://b.example.com\n',
    }),
  );
  expect(result).toEqual({
    input: {
      websiteUrl: 'https://chris.example',
      photoUrl: 'https://chris.example/me.jpg',
      meLinks: ['https://b.example.com', 'https://a.example.com'],
    },
  });
});

test('names the bad line, counting blank lines as the user sees them', () => {
  expect(identityInput(form({ links: 'https://a.example.com\n\njavascript:alert(1)' }))).toEqual({
    error: 'Line 3 is not a web address.',
  });
});

test('refuses a bad website and a photo that is not https', () => {
  expect(identityInput(form({ website: 'mailto:a@b.co' }))).toEqual({
    error: 'Your website is not a web address.',
  });
  expect(identityInput(form({ photo: 'http://chris.example/me.jpg' }))).toEqual({
    error: 'The photo must be an https web address.',
  });
});

test('at most 8 profiles', () => {
  const links = (n: number) => Array.from({ length: n }, (_, i) => `https://s${i}.example.com`).join('\n');
  expect(identityInput(form({ links: links(8) }))).toHaveProperty('input');
  expect(identityInput(form({ links: links(9) }))).toEqual({ error: 'Up to 8 other profiles.' });
});
