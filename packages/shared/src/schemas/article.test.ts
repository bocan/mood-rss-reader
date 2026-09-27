import { describe, expect, test } from 'vitest';
import { MARK_UNREAD_MAX, markUnreadSchema } from './article.js';

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

describe('markUnreadSchema', () => {
  test('takes up to MARK_UNREAD_MAX ids, and refuses one more', () => {
    expect(markUnreadSchema.safeParse({ articleIds: ids(MARK_UNREAD_MAX) }).success).toBe(true);
    expect(markUnreadSchema.safeParse({ articleIds: ids(MARK_UNREAD_MAX + 1) }).success).toBe(false);
  });
  test('a full batch fits in the default Fastify 1 MiB body limit', () => {
    const body = JSON.stringify({ articleIds: ids(MARK_UNREAD_MAX) });
    expect(body.length).toBeLessThan(1024 * 1024);
  });
});
