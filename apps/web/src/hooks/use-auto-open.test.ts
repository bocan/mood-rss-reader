import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useAutoOpenTop } from './use-auto-open';

type Props = Parameters<typeof useAutoOpenTop>[0];

function setup(initial: Partial<Props> = {}) {
  const open = vi.fn();
  const onMovedOn = vi.fn();
  const base: Props = {
    enabled: true,
    listKey: 'list:feed-1',
    firstId: 'a1',
    selectedId: null,
    open,
    onMovedOn,
    ...initial,
  };
  const hook = renderHook((p: Props) => useAutoOpenTop(p), { initialProps: base });
  let props = base;
  const update = (next: Partial<Props>) => {
    props = { ...props, ...next };
    hook.rerender(props);
  };
  return { hook, open, onMovedOn, update };
}

test('opens the top article of a new list, once', () => {
  const { hook, open, update } = setup();
  expect(open).toHaveBeenCalledExactlyOnceWith('a1');
  expect(hook.result.current.autoOpenedId).toBe('a1');

  // The open lands, then the reader closes it: the same list does not reopen it.
  update({ selectedId: 'a1' });
  update({ selectedId: null });
  expect(open).toHaveBeenCalledOnce();
});

test('another list opens its own top article', () => {
  const { open, update } = setup();
  update({ selectedId: 'a1' });
  update({ listKey: 'list:feed-2', firstId: 'b1', selectedId: null });
  expect(open).toHaveBeenLastCalledWith('b1');
});

test('waits for the list to load', () => {
  const { open, update } = setup({ firstId: undefined });
  expect(open).not.toHaveBeenCalled();
  update({ firstId: 'a1' });
  expect(open).toHaveBeenCalledExactlyOnceWith('a1');
});

test('does nothing while disabled (cards, magazine, narrow screen), and opens once enabled', () => {
  const { open, update } = setup({ enabled: false });
  expect(open).not.toHaveBeenCalled();
  update({ enabled: true });
  expect(open).toHaveBeenCalledExactlyOnceWith('a1');
});

test('leaves an article that is already open (a deep link) alone, also after it closes', () => {
  const { open, update } = setup({ selectedId: 'a7' });
  update({ selectedId: null });
  expect(open).not.toHaveBeenCalled();
});

test('moving on to another article marks the auto-opened one, and ends its hold', () => {
  const { hook, onMovedOn, update } = setup();
  update({ selectedId: 'a1' });
  update({ selectedId: 'a2' });
  expect(onMovedOn).toHaveBeenCalledExactlyOnceWith('a1');
  expect(hook.result.current.autoOpenedId).toBeNull();
});

test('closing the auto-opened article does not mark it', () => {
  const { hook, onMovedOn, update } = setup();
  update({ selectedId: 'a1' });
  update({ selectedId: null });
  expect(onMovedOn).not.toHaveBeenCalled();
  expect(hook.result.current.autoOpenedId).toBeNull();
});

test('the hold stays while the open has not reached the URL yet', () => {
  const { hook, onMovedOn } = setup();
  // selectedId is still null: the open is on its way.
  expect(hook.result.current.autoOpenedId).toBe('a1');
  expect(onMovedOn).not.toHaveBeenCalled();
});

test('a click or Enter on the auto-opened article makes it an ordinary opening', () => {
  const { hook, onMovedOn, update } = setup();
  update({ selectedId: 'a1' });
  act(() => hook.result.current.claim('a1'));
  expect(hook.result.current.autoOpenedId).toBeNull();
  // Already counted as opened by the pane, so moving on marks nothing more.
  update({ selectedId: 'a2' });
  expect(onMovedOn).not.toHaveBeenCalled();
});

test('claiming another article leaves the hold alone', () => {
  const { hook, update } = setup();
  update({ selectedId: 'a1' });
  act(() => hook.result.current.claim('a2'));
  expect(hook.result.current.autoOpenedId).toBe('a1');
});
