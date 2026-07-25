import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { loadGalleryItems, loadCategories, loadPinnedItemIds } from '../utils/galleryStorage';
import { computeGalleryStats } from '../utils/galleryAnalytics';
import type { GalleryStats } from '../utils/galleryAnalytics';
import { audioService } from '../services/audioService';

interface GalleryStatsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const GalleryStatsPanel: React.FC<GalleryStatsPanelProps> = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState<GalleryStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [items, categories, pinnedIds] = await Promise.all([
        loadGalleryItems(),
        loadCategories(),
        loadPinnedItemIds(),
      ]);
      setStats(computeGalleryStats(items, categories, pinnedIds));
    } catch (e) {
      console.error('Failed to load gallery stats:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 420, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="h-full overflow-hidden border-l border-base-content/10 bg-base-100/60 backdrop-blur-xl flex-shrink-0 relative"
        >
          <div className="w-[420px] h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-base-content/10 flex-shrink-0">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                GALLERY ANALYTICS
              </span>
              <button
                onClick={() => { audioService.playClick(); onClose(); }}
                className="btn btn-xs btn-ghost rounded-none tracking-widest text-base-content/40 hover:text-error text-[9px]"
              >
                CLOSE
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoading && !stats && (
                <div className="flex items-center justify-center py-16">
                  <span className="loading loading-spinner loading-sm opacity-30" />
                </div>
              )}

              {stats && (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-2">
                    <SummaryCard label="Total" value={stats.totalItems} />
                    <SummaryCard label="Images" value={stats.imageCount} />
                    <SummaryCard label="Videos" value={stats.videoCount} />
                    <SummaryCard label="Pinned" value={stats.pinnedCount} />
                    <SummaryCard
                      label="Categories"
                      value={stats.categoryDistribution.length}
                    />
                    <SummaryCard
                      label="Tags Used"
                      value={stats.tagFrequency.length}
                    />
                  </div>

                  {/* Model usage */}
                  {stats.modelUsage.length > 0 && (
                    <Section title="MODEL USAGE">
                      <BarList items={stats.modelUsage.map(m => ({
                        label: m.model,
                        value: m.count,
                        max: stats.modelUsage[0].count,
                      }))} />
                    </Section>
                  )}

                  {/* Source distribution */}
                  {stats.sourceDistribution.length > 0 && (
                    <Section title="SOURCES">
                      <BarList items={stats.sourceDistribution.map(s => ({
                        label: s.source,
                        value: s.count,
                        max: stats.sourceDistribution[0].count,
                      }))} />
                    </Section>
                  )}

                  {/* Category distribution */}
                  {stats.categoryDistribution.length > 0 && (
                    <Section title="CATEGORIES">
                      <BarList items={stats.categoryDistribution.map(c => ({
                        label: c.categoryName,
                        value: c.count,
                        max: stats.categoryDistribution[0].count,
                      }))} />
                    </Section>
                  )}

                  {/* Tag frequency (top 20) */}
                  {stats.tagFrequency.length > 0 && (
                    <Section title="TOP TAGS">
                      <TagList items={stats.tagFrequency.slice(0, 20)} />
                    </Section>
                  )}

                  {/* Timeline */}
                  {stats.timeline.length > 0 && (
                    <Section title="TIMELINE">
                      <TimelineChart buckets={stats.timeline} />
                    </Section>
                  )}

                  {/* Prompt word frequency (top 15) */}
                  {stats.promptWordFrequency.length > 0 && (
                    <Section title="TOP PROMPT WORDS">
                      <TagList items={stats.promptWordFrequency.map(w => ({
                        tag: w.word,
                        count: w.count,
                      }))} />
                    </Section>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

// ── Sub-components ────────────────────────────────────────────────────

const SummaryCard: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="bg-base-200/30 border border-base-content/10 p-3 flex flex-col items-center">
    <span className="text-lg font-bold font-mono text-base-content">{value}</span>
    <span className="text-[8px] font-mono uppercase tracking-widest text-base-content/40 mt-0.5">
      {label}
    </span>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 block">
      {title}
    </span>
    <div className="bg-base-200/20 border border-base-content/5 p-3 space-y-1.5">
      {children}
    </div>
  </div>
);

interface BarItem {
  label: string;
  value: number;
  max: number;
}

const BarList: React.FC<{ items: BarItem[] }> = ({ items }) => (
  <div className="space-y-1">
    {items.map((item, i) => (
      <div key={i} className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-base-content/70 w-28 truncate flex-shrink-0" title={item.label}>
          {item.label}
        </span>
        <div className="flex-1 h-3 bg-base-300/30 relative overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(item.value / item.max) * 100}%` }}
            transition={{ duration: 0.6, delay: i * 0.03, ease: 'easeOut' }}
            className="absolute inset-y-0 left-0 bg-primary/50"
          />
        </div>
        <span className="text-[10px] font-mono text-base-content/40 w-6 text-right flex-shrink-0">
          {item.value}
        </span>
      </div>
    ))}
  </div>
);

const TagList: React.FC<{ items: { tag: string; count: number }[] }> = ({ items }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((item, i) => (
      <span
        key={i}
        className="text-[9px] font-mono px-2 py-0.5 border border-base-content/10 bg-base-200/40 text-base-content/70"
      >
        {item.tag}
        <span className="text-base-content/30 ml-1">×{item.count}</span>
      </span>
    ))}
  </div>
);

const TimelineChart: React.FC<{ buckets: { period: string; count: number }[] }> = ({ buckets }) => {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className="flex items-end gap-0.5 h-20">
      {buckets.map((bucket, i) => (
        <div
          key={i}
          className="flex-1 flex flex-col items-center gap-0.5 group relative"
        >
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${(bucket.count / maxCount) * 100}%` }}
            transition={{ duration: 0.4, delay: i * 0.02, ease: 'easeOut' }}
            className="w-full bg-primary/40 hover:bg-primary/60 transition-colors min-h-[2px]"
          />
          <span className="text-[7px] font-mono text-base-content/20 -rotate-45 origin-left whitespace-nowrap absolute bottom-0 translate-y-full left-1/2 -translate-x-1/2">
            {bucket.period.slice(-2)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default GalleryStatsPanel;
