import { useEffect, useRef, useState } from 'react';

/**
 * List view opens the top article by itself, so the reading column never
 * shows an empty "Select an article" page.
 *
 * - Once per list: a new scope, filter, sort or view. When the reader closes
 *   the article, the same list does not open it again.
 * - Not when an article is already open (a deep link), or while `enabled` is
 *   false (cards or magazine, the community pane, or a screen too narrow for
 *   the reading column).
 * - The app opened it, not the reader, so it is not marked read while it
 *   shows (`autoOpenedId`, for ReadingPane's deferMarkRead). It is marked
 *   when the reader moves on to another article (`onMovedOn`). `claim` is for
 *   when the reader picks it on purpose (a click or Enter on it): from then on
 *   it is an ordinary opening.
 */
export function useAutoOpenTop({
  enabled,
  listKey,
  firstId,
  selectedId,
  open,
  onMovedOn,
}: {
  enabled: boolean;
  /** Changes when the list is a different list. */
  listKey: string;
  /** The top article of the list on screen, once it has loaded. */
  firstId: string | undefined;
  selectedId: string | null;
  /** Open an article without a new history entry. */
  open: (id: string) => void;
  onMovedOn: (id: string) => void;
}): { autoOpenedId: string | null; claim: (id: string) => void } {
  const [autoOpenedId, setAutoOpenedId] = useState<string | null>(null);
  const doneFor = useRef<string | null>(null);
  // True once the URL shows the auto-opened article: until then, an empty
  // selection only means the open has not landed yet.
  const shown = useRef(false);

  useEffect(() => {
    if (!enabled || doneFor.current === listKey) return;
    if (selectedId) {
      doneFor.current = listKey;
      return;
    }
    if (!firstId) return;
    doneFor.current = listKey;
    shown.current = false;
    setAutoOpenedId(firstId);
    open(firstId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `open` is a fresh closure each render
  }, [enabled, listKey, firstId, selectedId]);

  useEffect(() => {
    if (!autoOpenedId) return;
    if (selectedId === autoOpenedId) {
      shown.current = true;
      return;
    }
    if (!shown.current) return;
    // Another article: the reader has seen this one. Closed: not counted.
    if (selectedId) onMovedOn(autoOpenedId);
    shown.current = false;
    setAutoOpenedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onMovedOn` is a fresh closure each render
  }, [selectedId, autoOpenedId]);

  const claim = (id: string) => {
    if (id === autoOpenedId) {
      shown.current = false;
      setAutoOpenedId(null);
    }
  };

  return { autoOpenedId, claim };
}
