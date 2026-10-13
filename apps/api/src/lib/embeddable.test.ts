import { describe, expect, test } from 'vitest';
import { frameBlock } from './embeddable.js';

const APP = 'https://reader.example.com';
const PAGE = 'https://status.example.org/incidents/1';

const block = (headers: Record<string, string | string[]>, app = APP, page = PAGE) =>
  frameBlock(headers, app, page);

describe('X-Frame-Options', () => {
  test('no header: the page may show in a frame', () => {
    expect(block({})).toBeNull();
  });

  test('DENY and SAMEORIGIN forbid it, in any letter case', () => {
    expect(block({ 'x-frame-options': 'DENY' })).toBe('x-frame-options');
    expect(block({ 'x-frame-options': 'deny' })).toBe('x-frame-options');
    expect(block({ 'x-frame-options': 'SAMEORIGIN' })).toBe('x-frame-options');
  });

  test('SAMEORIGIN allows a page on our own origin', () => {
    expect(block({ 'x-frame-options': 'SAMEORIGIN' }, APP, `${APP}/u/chris`)).toBeNull();
  });

  test('the obsolete ALLOW-FROM is ignored, as browsers do', () => {
    expect(block({ 'x-frame-options': 'ALLOW-FROM https://other.example' })).toBeNull();
  });

  test('a repeated header counts when any value forbids it', () => {
    expect(block({ 'x-frame-options': ['SAMEORIGIN', 'SAMEORIGIN'] })).toBe('x-frame-options');
    expect(block({ 'x-frame-options': 'SAMEORIGIN, DENY' })).toBe('x-frame-options');
  });
});

describe('Content-Security-Policy frame-ancestors', () => {
  const csp = (value: string) => ({ 'content-security-policy': value });

  test("'none' and 'self' forbid another origin", () => {
    expect(block(csp("frame-ancestors 'none'"))).toBe('frame-ancestors');
    expect(block(csp("default-src 'self'; frame-ancestors 'self'; base-uri 'self'"))).toBe(
      'frame-ancestors',
    );
  });

  test('* and a matching scheme allow it', () => {
    expect(block(csp('frame-ancestors *'))).toBeNull();
    expect(block(csp('frame-ancestors https:'))).toBeNull();
    expect(block(csp('frame-ancestors http:'))).toBe('frame-ancestors');
  });

  test('a host source allows only our host', () => {
    expect(block(csp('frame-ancestors https://reader.example.com'))).toBeNull();
    expect(block(csp('frame-ancestors reader.example.com'))).toBeNull();
    expect(block(csp('frame-ancestors *.example.com'))).toBeNull();
    expect(block(csp('frame-ancestors https://other.example.com'))).toBe('frame-ancestors');
    expect(block(csp('frame-ancestors https://reader.example.com:8443'))).toBe('frame-ancestors');
  });

  test('a policy with no frame-ancestors says nothing about frames', () => {
    expect(block(csp("default-src 'self'; frame-src 'none'"))).toBeNull();
  });

  test('with frame-ancestors present, X-Frame-Options is ignored', () => {
    expect(
      block({ 'content-security-policy': 'frame-ancestors *', 'x-frame-options': 'DENY' }),
    ).toBeNull();
  });

  test('every policy must allow it', () => {
    expect(
      block({ 'content-security-policy': ['frame-ancestors *', "frame-ancestors 'none'"] }),
    ).toBe('frame-ancestors');
    expect(block(csp("frame-ancestors *, frame-ancestors 'self'"))).toBe('frame-ancestors');
  });
});

describe('the status pages from a real feed', () => {
  test.each([
    ['AWS health', { 'x-frame-options': 'deny' }, 'x-frame-options'],
    [
      'Cloudflare status',
      { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" },
      'frame-ancestors',
    ],
    [
      'OpenAI status',
      { 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'" },
      'frame-ancestors',
    ],
    ['Slack status', {}, null],
  ])('%s', (_name, headers, expected) => {
    expect(block(headers)).toBe(expected);
  });
});
