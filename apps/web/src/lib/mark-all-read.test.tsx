import { MARK_UNREAD_MAX } from '@rss/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { registerMutationDefaults } from './articles';
import { offersMarkAllRead, olderThan, useMarkAllRead } from './mark-all-read';

// #26: Mark all read offers Undo, which restores exactly what it marked.

let qc: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
let marked: string[];

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  registerMutationDefaults(qc);
  qc.setQueryData(['feeds'], { items: [] });
  qc.setQueryData(['counts'], { feeds: [], folders: [], total: 0 });
  marked = ['a1', 'a2'];
  fetchMock = vi.fn(async (url: string) =>
    url.endsWith('/mark-read')
      ? ({ ok: true, status: 200, json: async () => ({ markedIds: marked }) } as Response)
      : ({ ok: true, status: 204 } as Response),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  toast.dismiss();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const call = (path: string) =>
  fetchMock.mock.calls.find(([url]) => String(url).endsWith(path));

test('the toast counts what the server marked, and Undo sends exactly those ids', async () => {
  render(<Toaster />);
  const { result } = renderHook(() => useMarkAllRead(), { wrapper });

  act(() => result.current({ feedId: 'f1' }, 'Dave Rupert'));
  expect(await screen.findByText('Marked 2 articles as read in Dave Rupert.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(call('/mark-unread')).toBeDefined());
  expect(JSON.parse(call('/mark-unread')![1].body)).toEqual({ articleIds: ['a1', 'a2'] });
});

test('Undo of more than one batch sends every id, in batches the API takes', async () => {
  marked = Array.from({ length: MARK_UNREAD_MAX * 2 + 5 }, (_, i) => `a${i}`);
  render(<Toaster />);
  const { result } = renderHook(() => useMarkAllRead(), { wrapper });

  act(() => result.current({}, 'All items'));
  fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
  const batches = () =>
    fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith('/mark-unread'))
      .map(([, init]) => JSON.parse(init.body).articleIds as string[]);
  await waitFor(() => expect(batches()).toHaveLength(3));
  expect(batches().map((b) => b.length)).toEqual([MARK_UNREAD_MAX, MARK_UNREAD_MAX, 5]);
  expect(batches().flat()).toEqual(marked);
});

test('when nothing changed, it says so and offers no Undo', async () => {
  marked = [];
  render(<Toaster />);
  const { result } = renderHook(() => useMarkAllRead(), { wrapper });

  act(() => result.current({}, 'All items'));
  expect(await screen.findByText('Nothing to mark as read in All items.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
});

describe('offersMarkAllRead', () => {
  const view = {
    filters: {},
    communityOpen: false,
    isSearching: false,
    unread: 3,
    listHasUnread: true,
  };

  test('a scope with unread articles offers it', () => {
    expect(offersMarkAllRead(view)).toBe(true);
    expect(offersMarkAllRead({ ...view, unread: 0, listHasUnread: false })).toBe(false);
  });
  test('unread Skim articles in the list count, though the scope count leaves them out', () => {
    expect(offersMarkAllRead({ ...view, unread: 0, listHasUnread: true })).toBe(true);
  });
  test('never during a search, where it would mark the whole scope, not the results', () => {
    expect(offersMarkAllRead({ ...view, isSearching: true })).toBe(false);
  });
  test('not for Starred, Shared, or Community', () => {
    expect(offersMarkAllRead({ ...view, filters: { starred: true } })).toBe(false);
    expect(offersMarkAllRead({ ...view, filters: { shared: true } })).toBe(false);
    expect(offersMarkAllRead({ ...view, communityOpen: true })).toBe(false);
  });
  test('Must read has an unread count, so it offers it too', () => {
    const mustRead = { ...view, filters: { attention: 'precious' as const } };
    expect(offersMarkAllRead(mustRead)).toBe(true);
  });
});

test('"older than" sends a before cutoff that far back', () => {
  const now = Date.parse('2026-09-26T12:00:00.000Z');
  expect(olderThan(24 * 60 * 60 * 1000, now)).toBe('2026-09-25T12:00:00.000Z');
});
