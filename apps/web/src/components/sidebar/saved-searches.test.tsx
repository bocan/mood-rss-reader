import type { SavedSearchDto } from '@rss/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SavedSearchList } from './saved-searches';

// SPEC-025: saved searches in the sidebar.

const search = (id: string, name: string, q = name.toLowerCase()): SavedSearchDto => ({
  id,
  name,
  q,
  feedId: null,
  folderId: null,
  starred: false,
  unread: null,
  position: 0,
  createdAt: '',
});

// A small fake of the API: it keeps the list, so the reload after a rename or
// a delete gets `{ items }` as the real GET /searches does.
let stored: SavedSearchDto[];
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  stored = [];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const id = String(url).split('/').pop();
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      return { ok: true, status: 200, json: async () => ({ items: stored }) } as Response;
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(String(init!.body)) as Partial<SavedSearchDto>;
      stored = stored.map((s) => (s.id === id ? { ...s, ...patch } : s));
    }
    if (method === 'DELETE') stored = stored.filter((s) => s.id !== id);
    return { ok: true, status: 204, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderList(items: SavedSearchDto[], activeId: string | null = null) {
  stored = items;
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(['saved-searches'], { items });
  const onOpen = vi.fn();
  const view = render(
    <QueryClientProvider client={qc}>
      <SavedSearchList activeId={activeId} onOpen={onOpen} itemClass={(a) => (a ? 'active' : 'idle')} />
    </QueryClientProvider>,
  );
  return { onOpen, view };
}
const openMenu = (name: string) => {
  const trigger = screen.getByRole('button', { name: `Saved search actions for ${name}` });
  act(() => trigger.focus());
  fireEvent.keyDown(trigger, { key: 'Enter' });
};
const sent = (method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([url, init]) => ({ url: String(url), body: init.body ? JSON.parse(String(init.body)) : undefined }));

test('nothing at all when there are no saved searches', () => {
  const { view } = renderList([]);
  expect(view.container).toBeEmptyDOMElement();
});

test('a heading and one row per search; a click opens it', () => {
  const pg = search('s1', 'Postgres');
  const { onOpen } = renderList([pg, search('s2', 'Wasm')]);
  expect(screen.getByRole('heading', { name: 'Saved searches' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Postgres' }));
  expect(onOpen).toHaveBeenCalledWith(pg);
  expect(screen.getByRole('button', { name: 'Postgres' })).toHaveAttribute('title', 'Search for "postgres"');
});

test('the open search is marked', () => {
  renderList([search('s1', 'Postgres'), search('s2', 'Wasm')], 's2');
  expect(screen.getByRole('button', { name: 'Wasm' })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('button', { name: 'Wasm' })).toHaveClass('active');
  expect(screen.getByRole('button', { name: 'Postgres' })).not.toHaveAttribute('aria-current');
});

test('Rename from the menu saves the new name', async () => {
  renderList([search('s1', 'Postgres')]);
  openMenu('Postgres');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
  const input = await screen.findByDisplayValue('Postgres');
  fireEvent.change(input, { target: { value: 'PG news' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(sent('PATCH')).toEqual([{ url: '/api/searches/s1', body: { name: 'PG news' } }]));
  expect(screen.getByRole('button', { name: 'PG news' })).toBeInTheDocument();
});

test('Delete asks first', async () => {
  const confirmMock = vi.fn(() => false);
  vi.stubGlobal('confirm', confirmMock);
  renderList([search('s1', 'Postgres')]);
  openMenu('Postgres');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  expect(confirmMock).toHaveBeenCalledWith('Delete the saved search "Postgres"?');
  expect(sent('DELETE')).toEqual([]);

  confirmMock.mockReturnValue(true);
  openMenu('Postgres');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await waitFor(() => expect(sent('DELETE')).toEqual([{ url: '/api/searches/s1', body: undefined }]));
  // The reload shows the list without it.
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Postgres' })).not.toBeInTheDocument());
});
