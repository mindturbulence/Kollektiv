import type { GalleryItem, GalleryCategory } from '../types';

// ── Types ─────────────────────────────────────────────────────────────

export interface TagFrequency {
  tag: string;
  count: number;
}

export interface CategoryDistribution {
  categoryId: string | 'uncategorized';
  categoryName: string;
  count: number;
}

export interface SourceDistribution {
  source: string;
  count: number;
}

export interface TimelineBucket {
  /** ISO year-month string, e.g. "2026-07". */
  period: string;
  count: number;
}

export interface PromptWordFrequency {
  word: string;
  count: number;
}

export interface ModelUsage {
  model: string;
  count: number;
}

export interface GalleryStats {
  totalItems: number;
  imageCount: number;
  videoCount: number;
  pinnedCount: number;
  tagFrequency: TagFrequency[];
  categoryDistribution: CategoryDistribution[];
  sourceDistribution: SourceDistribution[];
  modelUsage: ModelUsage[];
  timeline: TimelineBucket[];
  promptWordFrequency: PromptWordFrequency[];
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Known AI model keywords to extract from prompt/sources text. */
const KNOWN_MODELS = [
  'imagen', 'veo', 'nano banana', 'gemini',
  'midjourney', 'mj', 'niji',
  'sdxl', 'sd 3', 'sd3', 'stable diffusion', 'flux',
  'dall-e', 'dalle',
  'kandinsky', 'deepseek', 'firecrawl',
  'pika', 'runway', 'kling', 'hailuo', 'minimax',
  'luma', 'ray', 'sora', 'pia',
] as const;

/** Stopwords for prompt word frequency analysis. */
const PROMPT_STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
  'was', 'had', 'has', 'its', 'his', 'her', 'our', 'your', 'their',
  'that', 'this', 'with', 'from', 'what', 'which', 'will', 'been',
  'have', 'were', 'they', 'them', 'some', 'very', 'just', 'also',
  'about', 'over', 'would', 'could', 'should', 'each', 'more', 'most',
  'other', 'such', 'only', 'own', 'same', 'too', 'than', 'then',
  'into', 'upon', 'after', 'before', 'between', 'through', 'during',
  'without', 'within', 'along', 'around', 'among', 'across',
  'light', 'dark', 'color', 'high', 'full', 'like', 'make',
]);

// ── Stats computation ─────────────────────────────────────────────────

/**
 * Compute gallery statistics from items and categories.
 */
export function computeGalleryStats(
  items: GalleryItem[],
  categories: GalleryCategory[],
  pinnedIds: string[],
): GalleryStats {
  const totalItems = items.length;
  const imageCount = items.filter((i) => i.type === 'image').length;
  const videoCount = items.filter((i) => i.type === 'video').length;
  const pinnedCount = pinnedIds.length;

  // ── Tag frequency ──
  const tagMap = new Map<string, number>();
  for (const item of items) {
    if (item.tags) {
      for (const tag of item.tags) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }
  }
  const tagFrequency: TagFrequency[] = [...tagMap.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  // ── Category distribution ──
  const catMap = new Map<string, number>();
  for (const item of items) {
    const catId = item.categoryId || '__uncategorized__';
    catMap.set(catId, (catMap.get(catId) || 0) + 1);
  }
  const categoryDistribution: CategoryDistribution[] = [...catMap.entries()]
    .map(([catId, count]) => ({
      categoryId: catId === '__uncategorized__' ? 'uncategorized' : catId,
      categoryName:
        catId === '__uncategorized__'
          ? 'Uncategorized'
          : categories.find((c) => c.id === catId)?.name || 'Unknown',
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Source distribution ──
  const sourceMap = new Map<string, number>();
  for (const item of items) {
    if (item.sources) {
      for (const src of item.sources) {
        sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
      }
    }
  }
  const sourceDistribution: SourceDistribution[] = [...sourceMap.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  // ── Model usage (extracted from prompt + sources text) ──
  const modelMap = new Map<string, number>();
  for (const item of items) {
    const haystack = [item.prompt || '', ...(item.sources || [])]
      .join(' ')
      .toLowerCase();
    for (const model of KNOWN_MODELS) {
      if (haystack.includes(model)) {
        modelMap.set(model, (modelMap.get(model) || 0) + 1);
      }
    }
  }
  const modelUsage: ModelUsage[] = [...modelMap.entries()]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count);

  // ── Timeline (monthly buckets) ──
  const timelineMap = new Map<string, number>();
  for (const item of items) {
    const d = new Date(item.createdAt);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    timelineMap.set(period, (timelineMap.get(period) || 0) + 1);
  }
  const timeline: TimelineBucket[] = [...timelineMap.entries()]
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => a.period.localeCompare(b.period));

  // ── Prompt word frequency ──
  const wordMap = new Map<string, number>();
  for (const item of items) {
    if (!item.prompt) continue;
    const words = item.prompt
      .toLowerCase()
      .split(/[^a-z0-9äöüß]+/)
      .filter((w) => w.length >= 4 && !PROMPT_STOP_WORDS.has(w));
    for (const word of words) {
      wordMap.set(word, (wordMap.get(word) || 0) + 1);
    }
  }
  const promptWordFrequency: PromptWordFrequency[] = [...wordMap.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  return {
    totalItems,
    imageCount,
    videoCount,
    pinnedCount,
    tagFrequency,
    categoryDistribution,
    sourceDistribution,
    modelUsage,
    timeline,
    promptWordFrequency,
  };
}
