import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ShortcutsOverlay } from './ShortcutsOverlay';
import { SHORTCUTS } from '@/lib/shortcuts/registry';

test('renders nothing when closed', () => {
  const { container } = render(<ShortcutsOverlay open={false} onOpenChange={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

test('renders exactly one row per registry entry, so help cannot drift', () => {
  render(<ShortcutsOverlay open onOpenChange={vi.fn()} />);
  expect(document.querySelectorAll('[data-shortcut-row]')).toHaveLength(SHORTCUTS.length);
});

test('shows every group heading and renders a chord as two keys', () => {
  render(<ShortcutsOverlay open onOpenChange={vi.fn()} />);
  for (const group of new Set(SHORTCUTS.map((s) => s.group))) {
    expect(screen.getByText(group)).toBeInTheDocument();
  }
  // The g-then-g chord is rendered with a "then" separator.
  expect(screen.getByText('then')).toBeInTheDocument();
  expect(screen.getByText('Jump to top')).toBeInTheDocument();
});

test('a chord that repeats a key renders both keys, with no React warning', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<ShortcutsOverlay open onOpenChange={vi.fn()} />);
  const row = screen.getByText('Jump to top').closest('[data-shortcut-row]')!;
  expect([...row.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['g', 'g']);
  // React reports a duplicate key through console.error.
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});
