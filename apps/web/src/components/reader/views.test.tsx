import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ArticleListItem } from '@/hooks/use-articles';
import { CardsView, ListView, MagazineView, type ViewProps } from './views';

const ARTICLE: ArticleListItem = {
  id: 'a1',
  feedId: 'f1',
  title: 'Hello',
  url: 'https://example.com/hello',
  author: null,
  summary: 'An excerpt',
  imageUrl: null,
  publishedAt: null,
  read: false,
  starred: false,
};

function renderView(View: (p: ViewProps) => React.ReactNode, article = ARTICLE, withToggle = true) {
  const onSelect = vi.fn();
  const onToggle = vi.fn();
  render(
    <View
      items={[article]}
      feeds={{ f1: { name: 'Feed', faviconUrl: null } }}
      selectedId={null}
      focusedId={null}
      onSelect={onSelect}
      registerRow={() => () => {}}
      onToggle={withToggle ? onToggle : undefined}
    />,
  );
  return { onSelect, onToggle };
}

const VIEWS = [
  ['list', ListView],
  ['cards', CardsView],
  ['magazine', MagazineView],
] as const;

describe.each(VIEWS)('%s row quick actions (#32)', (_name, View) => {
  test('star and read toggle act without opening the article', () => {
    const { onSelect, onToggle } = renderView(View);
    fireEvent.click(screen.getByRole('button', { name: 'Star' }));
    expect(onToggle).toHaveBeenLastCalledWith(ARTICLE, { starred: true });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    expect(onToggle).toHaveBeenLastCalledWith(ARTICLE, { read: true });
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('the labels follow the current state', () => {
    const { onToggle } = renderView(View, { ...ARTICLE, read: true, starred: true });
    fireEvent.click(screen.getByRole('button', { name: 'Unstar' }));
    expect(onToggle).toHaveBeenLastCalledWith(expect.anything(), { starred: false });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as unread' }));
    expect(onToggle).toHaveBeenLastCalledWith(expect.anything(), { read: false });
  });

  test('open original is a new-tab link, and has no link without a URL', () => {
    const { onSelect } = renderView(View);
    const link = screen.getByRole('link', { name: 'Open original in a new tab' });
    expect(link).toHaveAttribute('href', ARTICLE.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    fireEvent.click(link);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('keyboard focus shows the actions, not hover only', () => {
    renderView(View);
    const bar = screen.getByRole('button', { name: 'Star' }).parentElement!;
    expect(bar).toHaveClass('opacity-0', 'focus-within:opacity-100', 'pointer-coarse:opacity-100');
  });

  test('touch screens get a menu with the same actions', () => {
    const { onSelect, onToggle } = renderView(View);
    const trigger = screen.getByRole('button', { name: 'Article actions' });
    expect(trigger).toHaveClass('hidden', 'pointer-coarse:inline-flex');
    // jsdom closes a Radix menu on the window blur that a first focus fires.
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Open original/ })).toHaveAttribute(
      'href',
      ARTICLE.url,
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Star/ }));
    expect(onToggle).toHaveBeenLastCalledWith(ARTICLE, { starred: true });
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('a click on the row itself still opens the article', () => {
    const { onSelect, onToggle } = renderView(View);
    fireEvent.click(screen.getByText('Hello'));
    expect(onSelect).toHaveBeenCalledWith(ARTICLE);
    expect(onToggle).not.toHaveBeenCalled();
  });

  test('no actions without a toggle handler', () => {
    renderView(View, ARTICLE, false);
    expect(screen.queryByRole('button', { name: 'Star' })).toBeNull();
  });
});

// A read tile steps back as a whole, so read and unread tell apart at a glance.
describe.each(VIEWS)('%s read tiles', (_name, View) => {
  const tile = () => screen.getByText('Hello').closest('button')!;

  test('an unread tile is at full strength', () => {
    renderView(View);
    expect(tile()).toHaveAttribute('data-read', 'false');
    expect(tile()).not.toHaveClass('opacity-50');
  });

  test('a read tile is dimmed', () => {
    renderView(View, { ...ARTICLE, read: true });
    expect(tile()).toHaveAttribute('data-read', 'true');
    expect(tile()).toHaveClass('opacity-50', 'grayscale');
  });

  // The pointer and the focus are still on the tile after "Mark as read".
  test('a read tile stays dimmed under the pointer or with focus inside', () => {
    renderView(View, { ...ARTICLE, read: true });
    expect(tile().className).not.toMatch(/group-(hover|focus-within)\/row:opacity-100/);
  });

  test('a focused read tile is dimmed like the others, and its ring is not', () => {
    render(
      <View
        items={[{ ...ARTICLE, read: true }]}
        feeds={{ f1: { name: 'Feed', faviconUrl: null } }}
        selectedId={null}
        focusedId="a1"
        onSelect={vi.fn()}
        registerRow={() => () => {}}
      />,
    );
    expect(tile()).toHaveClass('opacity-50');
    expect(tile()).not.toHaveClass('ring-2');
    expect(screen.getByRole('option')).toHaveClass('ring-2');
  });

  test('the open tile is not dimmed, read or not', () => {
    render(
      <View
        items={[{ ...ARTICLE, read: true }]}
        feeds={{ f1: { name: 'Feed', faviconUrl: null } }}
        selectedId="a1"
        focusedId={null}
        onSelect={vi.fn()}
        registerRow={() => () => {}}
      />,
    );
    expect(tile()).not.toHaveClass('opacity-50');
  });
});
