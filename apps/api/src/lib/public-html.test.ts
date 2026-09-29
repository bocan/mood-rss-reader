import { mf2 } from 'microformats-parser';
import { describe, expect, test } from 'vitest';
import { esc, escMultiline, layout, linkLabel, ownerCard, type OwnerCardSource } from './public-html.js';

// SPEC-026: the owner h-card.
describe('linkLabel', () => {
  test('host and path, no scheme, no trailing slash', () => {
    expect(linkLabel('https://mastodon.social/@chris/')).toBe('mastodon.social/@chris');
    expect(linkLabel('http://example.com/')).toBe('example.com');
    expect(linkLabel('https://example.com/a?b=1')).toBe('example.com/a?b=1');
  });
  test('a string that does not parse is returned as it is', () => {
    expect(linkLabel('not a url')).toBe('not a url');
  });
});

describe('ownerCard', () => {
  const page = 'https://reader.example/u/chris';
  const full: OwnerCardSource = {
    displayName: 'Chris',
    bio: 'Reads a lot.\nWrites a little.',
    websiteUrl: 'https://chris.example/',
    photoUrl: 'https://chris.example/me.jpg',
    meLinks: ['https://mastodon.example/@chris', 'https://github.com/chris'],
  };
  const parse = (html: string) => mf2(html, { baseUrl: page });

  test('parses as an h-card with the page as its uid and url, and every part', () => {
    const { items, rels } = parse(ownerCard(full, page, { author: false }));
    expect(items).toHaveLength(1);
    expect(items[0]!.type).toEqual(['h-card']);
    expect(items[0]!.properties).toMatchObject({
      name: ['Chris'],
      uid: [page],
      url: [page, 'https://chris.example/'],
      photo: ['https://chris.example/me.jpg'],
      note: ['Reads a lot.\nWrites a little.'],
    });
    // The website first, then the links, in the saved order.
    expect(rels.me).toEqual([
      'https://chris.example/',
      'https://mastodon.example/@chris',
      'https://github.com/chris',
    ]);
  });

  test('p-author only when asked', () => {
    expect(ownerCard(full, page, { author: true })).toContain('class="h-card p-author owner"');
    expect(ownerCard(full, page, { author: false })).toContain('class="h-card owner"');
  });

  test('a bare profile renders only the name, with nothing empty', () => {
    const html = ownerCard({ displayName: 'Chris', bio: null, websiteUrl: null, photoUrl: null, meLinks: [] }, page, {
      author: false,
    });
    expect(html).not.toMatch(/<img|<ul|p-note|rel="me/);
    expect(html).not.toContain('href=""');
    expect(parse(html).items[0]!.properties).toEqual({ name: ['Chris'], url: [page], uid: [page] });
  });

  test('every value is escaped: a quote in a URL cannot leave its attribute', () => {
    const html = ownerCard(
      {
        displayName: '<b>Chris</b>',
        bio: null,
        websiteUrl: 'https://chris.example/"onmouseover="x',
        photoUrl: 'https://chris.example/a.jpg"onerror="x',
        meLinks: ['https://m.example/<script>'],
      },
      page,
      { author: false },
    );
    expect(html).not.toMatch(/<b>|<script>|"onmouseover=|"onerror=/);
    expect(html).toContain('&quot;onmouseover=&quot;x');
    expect(html).toContain('&lt;b&gt;Chris&lt;/b&gt;');
  });
});

describe('esc', () => {
  test('escapes every HTML-significant character', () => {
    expect(esc(`<script>alert("x&y")</script>'`)).toBe(
      '&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;&#39;',
    );
  });

  test('leaves plain text alone', () => {
    expect(esc('plain text, no entities')).toBe('plain text, no entities');
  });
});

describe('escMultiline', () => {
  test('escapes first, then renders newlines as <br>', () => {
    expect(escMultiline('a<b\nc & d')).toBe('a&lt;b<br>\nc &amp; d');
    expect(escMultiline('crlf\r\nline')).toBe('crlf<br>\nline');
  });
});

describe('layout', () => {
  test('escapes the title and produces a complete document', () => {
    const html = layout({ title: '<Evil> & Co', body: '<p>hello</p>' });
    expect(html).toContain('<title>&lt;Evil&gt; &amp; Co</title>');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<p>hello</p>');
    expect(html).toContain('prefers-color-scheme: dark');
  });
});
