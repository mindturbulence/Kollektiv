import { describe, it, expect, beforeEach } from 'vitest';
import { recordTabVisit, getRecentTabs, getPreviousTab } from './tabHistory';

describe('tabHistory', () => {
  beforeEach(() => localStorage.clear());

  it('keeps distinct tabs, most recent first', () => {
    recordTabVisit('crafter');
    recordTabVisit('gallery');
    recordTabVisit('crafter');
    expect(getRecentTabs(10, [])).toEqual(['crafter', 'gallery']);
  });

  it('excludes shell pages and caps the list', () => {
    for (const t of ['dashboard', 'crafter', 'assistant', 'gallery', 'refiner'] as const) recordTabVisit(t);
    expect(getRecentTabs(2)).toEqual(['refiner', 'gallery']);
  });

  it('returns the previous tab other than the current one', () => {
    recordTabVisit('gallery');
    recordTabVisit('assistant');
    expect(getPreviousTab('assistant')).toBe('gallery');
    localStorage.clear();
    expect(getPreviousTab('assistant')).toBeNull();
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('kollektiv.tabHistory', '{nope');
    expect(getRecentTabs()).toEqual([]);
    recordTabVisit('crafter');
    expect(getRecentTabs()).toEqual(['crafter']);
  });
});
