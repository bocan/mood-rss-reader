import type { ArticleFilters } from '@/hooks/use-articles';
import { useMarkRead, useMarkUnread, type MarkReadScope } from './articles';
import { notify } from './notify';

/** How long the Undo button stays on the mark-all-read toast. */
export const UNDO_MARK_READ_MS = 10_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The "older than" choices beside Mark all read (#26). */
export const OLDER_THAN = [
  { label: 'Older than 1 day', ms: DAY_MS },
  { label: 'Older than 1 week', ms: 7 * DAY_MS },
] as const;

/**
 * Whether Mark all read is on offer for the list in view. The top bar, the
 * phone menu, and the `a` key all ask this, so they agree. Never during a
 * search: the mark covers the whole scope, not only the results.
 */
export function offersMarkAllRead(view: {
  filters: Pick<ArticleFilters, 'starred' | 'shared' | 'attention'>;
  communityOpen: boolean;
  isSearching: boolean;
  /** The scope's unread count; null when it has none (Starred, Shared). */
  unread: number | null;
}): boolean {
  const { filters } = view;
  if (filters.starred || filters.shared || filters.attention) return false;
  if (view.communityOpen || view.isSearching) return false;
  return (view.unread ?? 0) > 0;
}

/** A `before` cutoff for an "older than" choice, from now. */
export function olderThan(ms: number, now = Date.now()): string {
  return new Date(now - ms).toISOString();
}

/**
 * Mark all read for a scope, with Undo in place of a confirm (#26). The
 * toast counts exactly what the server marked, and Undo restores exactly
 * those articles. The top bar and the row menus use this, so they behave
 * the same.
 */
export function useMarkAllRead() {
  const markRead = useMarkRead();
  const markUnread = useMarkUnread();

  return (scope: MarkReadScope, label: string) =>
    markRead.mutate(scope, {
      // Failures toast through the mutation cache (lib/queryClient.ts).
      onSuccess: ({ markedIds }) => {
        const n = markedIds.length;
        if (n === 0) {
          notify.info(`Nothing to mark as read in ${label}.`);
          return;
        }
        notify.success(`Marked ${n} ${n === 1 ? 'article' : 'articles'} as read in ${label}.`, {
          duration: UNDO_MARK_READ_MS,
          action: { label: 'Undo', onClick: () => markUnread.mutate(markedIds) },
        });
      },
    });
}
