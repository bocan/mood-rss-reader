import { DrizzleQueryError } from 'drizzle-orm';

/** Longest error text stored on a feed row or sent back from an import. */
export const MAX_ERROR_LENGTH = 500;

/**
 * The message to store or show for a failed feed fetch. A DrizzleQueryError's
 * own message is the whole SQL statement plus every parameter (whole article
 * bodies, so megabytes for a big podcast), which buries the real problem.
 * Take the database's own error from `cause` instead. The result is capped,
 * so one odd error cannot fill a database row or a screen.
 */
export function errorMessage(err: unknown): string {
  const root = err instanceof DrizzleQueryError && err.cause instanceof Error ? err.cause : err;
  const message = (root instanceof Error ? root.message : String(root)).trim();
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH - 1)}…` : message;
}
