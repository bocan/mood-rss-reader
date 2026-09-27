/** What the tracker needs from an IntersectionObserver entry for one row. */
export interface RowEntry {
  isIntersecting: boolean;
  /** boundingClientRect.bottom, in viewport pixels. */
  bottom: number;
  /** boundingClientRect.height; 0 when the row is not rendered (display: none). */
  height: number;
}

export interface ScrollReadTracker {
  /** Feed one observer entry for a row; `rootTop` is the list's top edge. */
  update: (id: string, entry: RowEntry, rootTop: number) => void;
  /** Send whatever is queued now (scope change, unmount). */
  flushNow: () => void;
}

/** Most ids one mark-read request takes (the API caps it too). */
export const SCROLL_READ_BATCH = 200;

/**
 * Mark read on scroll (#17). A row counts once it was on screen and then left
 * over the TOP edge of the list: rows that were never seen, or that left over
 * the bottom edge, are never marked. Marked ids are batched: at most one
 * request per `delayMs`, however fast the scroll.
 *
 * `isRead` is true only for an article known to be read. An id it does not
 * know is not read: on a scope change the list is already the new one when
 * the queue is sent, and the rows scrolled past in the old list must still go.
 */
export function createScrollReadTracker({
  isRead,
  flush,
  delayMs = 500,
}: {
  isRead: (id: string) => boolean;
  flush: (ids: string[]) => void;
  delayMs?: number;
}): ScrollReadTracker {
  const seen = new Set<string>();
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flushNow = () => {
    clearTimeout(timer);
    timer = undefined;
    // Re-check: the item may have been marked read some other way meanwhile.
    const ids = [...pending].filter((id) => !isRead(id));
    pending.clear();
    for (let i = 0; i < ids.length; i += SCROLL_READ_BATCH) {
      flush(ids.slice(i, i + SCROLL_READ_BATCH));
    }
  };

  return {
    update(id, entry, rootTop) {
      // A hidden list (reader open over the cards) says nothing about scrolling.
      if (entry.height === 0) return;
      if (entry.isIntersecting) {
        seen.add(id);
        return;
      }
      if (!seen.has(id) || entry.bottom > rootTop || isRead(id)) return;
      pending.add(id);
      timer ??= setTimeout(flushNow, delayMs);
    },
    flushNow,
  };
}
