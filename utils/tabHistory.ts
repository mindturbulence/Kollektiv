import type { ActiveTab } from '../types';

const KEY = 'kollektiv.tabHistory';
const MAX = 20;

function read(): ActiveTab[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? (v as ActiveTab[]) : [];
  } catch {
    return [];
  }
}

/** Most-recent-first list of distinct tabs; call on every committed navigation. */
export function recordTabVisit(tab: ActiveTab): void {
  const next = [tab, ...read().filter(t => t !== tab)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* storage full or blocked — history is best-effort */ }
}

/** Recently used tools for Home's "Resume" row. Excludes shell pages by default. */
export function getRecentTabs(
  limit = 6,
  exclude: readonly string[] = ['dashboard', 'settings', 'assistant'],
): ActiveTab[] {
  return read().filter(t => !exclude.includes(t)).slice(0, limit);
}

/** The most recent tab other than `current` — e.g. where to return after a live session. */
export function getPreviousTab(current: ActiveTab): ActiveTab | null {
  return read().find(t => t !== current) ?? null;
}
