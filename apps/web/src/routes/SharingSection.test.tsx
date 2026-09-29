import type { ProfileDto } from '@rss/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SharingSection } from './SettingsPage';

// #44: the switches in Sharing save at once, as in Preferences. The text
// fields wait for their own Save button.

const profile: ProfileDto = {
  slug: 'chris',
  title: null,
  bio: null,
  visibility: 'off',
  shareUrl: null,
  blogrollEnabled: false,
  blogrollUrl: null,
  websiteUrl: null,
  photoUrl: null,
  meLinks: [],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({ ...profile, ...JSON.parse(String(init?.body ?? '{}')) }),
  }) as Response);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(['profile'], profile);
  render(
    <QueryClientProvider client={qc}>
      <SharingSection />
    </QueryClientProvider>,
  );
}
const puts = () =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([, init]) => JSON.parse(String(init.body)));

test('a visibility change saves at once, with only that field', async () => {
  renderSection();
  fireEvent.click(screen.getByRole('button', { name: 'This instance' }));
  await waitFor(() => expect(puts()).toEqual([{ visibility: 'instance' }]));
  expect(screen.getByRole('button', { name: 'This instance' })).toHaveAttribute('aria-pressed', 'true');
});

test('the blogroll switch saves at once', async () => {
  renderSection();
  fireEvent.click(screen.getByRole('checkbox', { name: /Public blogroll/ }));
  await waitFor(() => expect(puts()).toEqual([{ blogrollEnabled: true }]));
});

test('a failed save puts the old visibility back and says why', async () => {
  fetchMock.mockImplementation(async () =>
    ({ ok: false, status: 500, json: async () => ({ error: 'boom', message: 'Server down' }) }) as Response,
  );
  renderSection();
  fireEvent.click(screen.getByRole('button', { name: 'Public web' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true'),
  );
  expect(screen.getByText(/Server down|Could not save sharing settings/)).toBeInTheDocument();
});

test('the text fields wait for "Save page details", which sends only them', async () => {
  renderSection();
  fireEvent.change(screen.getByPlaceholderText(/A line about you/), { target: { value: 'Hi' } });
  expect(puts()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Save page details' }));
  await waitFor(() =>
    expect(puts()).toEqual([
      { slug: 'chris', title: null, bio: 'Hi', websiteUrl: null, photoUrl: null, meLinks: [] },
    ]),
  );
});

// SPEC-026: the IndieWeb identity fields.

function renderWith(over: Partial<ProfileDto>) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(['profile'], { ...profile, ...over });
  render(
    <QueryClientProvider client={qc}>
      <SharingSection />
    </QueryClientProvider>,
  );
}

test('the identity fields show the saved values and save with the page details', async () => {
  renderWith({ websiteUrl: 'https://chris.example', meLinks: ['https://mastodon.example/@chris'] });
  expect(screen.getByRole('textbox', { name: 'Your website' })).toHaveValue('https://chris.example');
  expect(screen.getByRole('textbox', { name: 'Other profiles' })).toHaveValue('https://mastodon.example/@chris');

  fireEvent.change(screen.getByRole('textbox', { name: 'Photo' }), {
    target: { value: 'https://chris.example/me.jpg' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Other profiles' }), {
    target: { value: 'https://mastodon.example/@chris\n\nhttps://github.com/chris\n' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save page details' }));
  await waitFor(() => expect(puts()).toHaveLength(1));
  expect(puts()[0]).toMatchObject({
    websiteUrl: 'https://chris.example',
    photoUrl: 'https://chris.example/me.jpg',
    meLinks: ['https://mastodon.example/@chris', 'https://github.com/chris'],
  });
});

test('a bad profile line is named, and nothing is sent', () => {
  renderSection();
  fireEvent.change(screen.getByRole('textbox', { name: 'Other profiles' }), {
    target: { value: 'https://mastodon.example/@chris\nnot a url' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save page details' }));
  expect(screen.getByText('Line 2 is not a web address.')).toBeInTheDocument();
  expect(puts()).toEqual([]);
});

const verifyHint = () => screen.getByText(/To show this page as verified on Mastodon/);

test('the Mastodon hint names the public page: the blogroll when shares are off', () => {
  renderWith({ shareUrl: null, blogrollUrl: 'https://reader.example/u/chris/blogroll' });
  expect(within(verifyHint()).getByRole('link')).toHaveAttribute(
    'href',
    'https://reader.example/u/chris/blogroll',
  );
});

test('the fields carry their hints as descriptions, not in their names', () => {
  renderSection();
  expect(screen.getByRole('textbox', { name: 'Photo' })).toHaveAccessibleDescription(
    /https address of a square image/,
  );
  expect(screen.getByRole('textbox', { name: 'Other profiles' })).toHaveAccessibleDescription(
    /One address per line, up to 8/,
  );
});

test('with no public page, the hint says to turn one on', () => {
  renderSection();
  expect(screen.getByText(/Turn on public shares or the public blogroll first/)).toBeInTheDocument();
});

test('the share page wins over the blogroll in the hint', () => {
  renderWith({
    shareUrl: 'https://reader.example/u/chris',
    blogrollUrl: 'https://reader.example/u/chris/blogroll',
  });
  expect(within(verifyHint()).getByRole('link')).toHaveAttribute('href', 'https://reader.example/u/chris');
});
