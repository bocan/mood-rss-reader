import { FIREHOSE_EXPIRY_DAYS } from '@rss/shared';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';

// FIREHOSE_EXPIRY_DAYS (SPEC-022) is purely a query-time predicate: no state
// rows are ever written, so the window is retroactive and reversible by
// re-tiering. Interpolated as a bound parameter at every SQL site that uses it.

/**
 * True when an article's sort key (coalesce(published_at, fetched_at)) is
 * past the firehose expiry window.
 *
 * The expiry rule, at every site: an article of a firehose subscription past
 * the window counts as read while the user has NO state row for it. Once they
 * have one (read, unread, starred, shared), its read flag wins, so a mark
 * unread sticks: in SQL, coalesce(state.read, expired).
 */
export function pastFirehoseExpiry(sortTs: SQL): SQL {
  return sql`(${sortTs} < now() - make_interval(days => ${FIREHOSE_EXPIRY_DAYS}))`;
}

/**
 * Per-feed unread counts for a user. A missing article_states row means unread,
 * so the left join + coalesce counts never-touched articles, except expired
 * items of a firehose subscription (SPEC-022; see pastFirehoseExpiry).
 * count(...)::int deserializes as a number, not a bigint string.
 */
export async function getUnreadCountsByFeed(
  userId: string,
): Promise<{ feedId: string; attention: string; unreadCount: number }[]> {
  const rows = (await db.execute(sql`
    select s.feed_id as "feedId",
           s.attention,
           count(a.id) filter (
             where not coalesce(
               st.read,
               s.attention = 'firehose'
                 and ${pastFirehoseExpiry(sql`coalesce(a.published_at, a.fetched_at)`)}
             )
           )::int as "unreadCount"
    from subscriptions s
    join articles a on a.feed_id = s.feed_id
    left join article_states st
      on st.article_id = a.id and st.user_id = s.user_id
    where s.user_id = ${userId}::uuid
    group by s.feed_id, s.attention
  `)) as unknown as { feedId: string; attention: string; unreadCount: number }[];

  return rows.map((r) => ({
    feedId: r.feedId,
    attention: r.attention,
    unreadCount: Number(r.unreadCount),
  }));
}
