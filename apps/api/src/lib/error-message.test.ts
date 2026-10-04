import { DrizzleQueryError } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { errorMessage, MAX_ERROR_LENGTH } from './error-message.js';

test('a plain error keeps its message', () => {
  expect(errorMessage(new Error('HTTP 404'))).toBe('HTTP 404');
});

test('a thrown string is used as it is', () => {
  expect(errorMessage('socket hang up')).toBe('socket hang up');
});

test('a failed query gives the database error, not the SQL and its params', () => {
  const body = '<p>' + 'x'.repeat(100_000) + '</p>';
  const err = new DrizzleQueryError(
    'insert into "articles" ("content_html") values ($1)',
    [body],
    new Error('could not write init file: No space left on device'),
  );
  expect(errorMessage(err)).toBe('could not write init file: No space left on device');
});

test('a failed query with no cause still comes back short', () => {
  const err = new DrizzleQueryError('insert into "articles" values ($1)', ['x'.repeat(100_000)]);
  expect(errorMessage(err).length).toBe(MAX_ERROR_LENGTH);
});

test('a long message is cut, and the cut shows', () => {
  const message = errorMessage(new Error('y'.repeat(MAX_ERROR_LENGTH * 2)));
  expect(message).toHaveLength(MAX_ERROR_LENGTH);
  expect(message.endsWith('…')).toBe(true);
});
