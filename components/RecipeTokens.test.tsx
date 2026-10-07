import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FontChips, PaletteStrip, TagPills, shortDate } from './RecipeTokens';

describe('RecipeTokens', () => {
  afterEach(() => cleanup());

  it('PaletteStrip renders one labelled swatch per colour', () => {
    render(<PaletteStrip palette={['#635bff', '#ffffff']} />);
    const a = screen.getByRole('img', { name: '#635bff' });
    expect(a.style.backgroundColor).toBe('rgb(99, 91, 255)');
    expect(a.getAttribute('title')).toBe('#635bff');
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it.each([[undefined], [[]]])('PaletteStrip and FontChips render nothing for %j', (v) => {
    const { container } = render(<><PaletteStrip palette={v} /><FontChips fonts={v} /></>);
    expect(container.innerHTML).toBe('');
  });

  it('FontChips renders one chip per font', () => {
    render(<FontChips fonts={['Inter / 56px', 'Fraunces / 20px']} />);
    expect(screen.getByText('Inter / 56px')).toBeTruthy();
    expect(screen.getByText('Fraunces / 20px')).toBeTruthy();
  });

  it('TagPills caps at 3 with +N and renders nothing without tags', () => {
    const { container, rerender } = render(<TagPills tags={['a', 'b', 'c', 'd', 'e']} />);
    expect(screen.getByText('c')).toBeTruthy();
    expect(screen.queryByText('d')).toBeNull();
    expect(screen.getByText('+2')).toBeTruthy();
    rerender(<TagPills tags={['a', 'b', 'c']} />);
    expect(screen.queryByText(/^\+/)).toBeNull();
    rerender(<TagPills tags={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('shortDate formats a real timestamp and returns empty for NaN', () => {
    const ms = Date.UTC(2026, 9, 6, 12);
    expect(shortDate(ms)).toBe(new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    expect(shortDate(NaN)).toBe('');
  });
});
