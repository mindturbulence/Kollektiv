import React, { useState } from 'react';
import { motion } from 'motion/react';
import { PanelLine, ScanLine, pageVariants, pageHeaderVariants, pageBodyVariants } from './AnimatedPanels';
import type { LoraInfo } from '../services/generationBackend';
import { getLoraPreviewCandidates } from '../services/a1111Service';
import type { LLMSettings } from '../types';

interface ExtraNetworksPanelProps {
  /** False when the active backend has no LoRA/embedding listing API (e.g. ComfyUI). */
  supported: boolean;
  settings: LLMSettings;
  loras: LoraInfo[];
  loadingLoras: boolean;
  embeddings: string[];
  loadingEmbeddings: boolean;
  onRefreshLoras: () => void;
  onRefreshEmbeddings: () => void;
  onInsertLora: (lora: LoraInfo) => void;
  onInsertEmbedding: (name: string) => void;
}

type NetworkTab = 'lora' | 'ti';

/** A1111 names loras/embeddings by their path relative to the models dir
 * (e.g. "SDXL/characters/foo"), so the folder structure the user organized
 * on disk is already encoded in the name — split on "/" to recover it. */
function groupByFolder<T>(items: T[], getName: (item: T) => string): { folder: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = getName(item);
    const slash = name.lastIndexOf('/');
    const folder = slash === -1 ? '' : name.slice(0, slash);
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder)!.push(item);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([folder, items]) => ({ folder, items }));
}

/** Label shown on the card: just the leaf segment — the folder header above
 * it already conveys the category, repeating the full path would be noise. */
const leafName = (name: string): string => {
  const slash = name.lastIndexOf('/');
  return slash === -1 ? name : name.slice(slash + 1);
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`flex-1 h-full text-[10px] font-black uppercase tracking-widest transition-colors ${
      active ? 'text-primary' : 'text-base-content/30 hover:text-base-content/60'
    }`}
  >
    {children}
  </button>
);

/** Tries each candidate preview URL in order, advancing on load error — A1111
 * doesn't expose "does this preview exist", so the client has to probe. */
const NetworkThumbnail: React.FC<{ candidates: string[]; alt: string }> = ({ candidates, alt }) => {
  const [idx, setIdx] = useState(0);
  if (idx >= candidates.length) {
    return <span className="text-base-content/10 text-2xl select-none">◈</span>;
  }
  return (
    <img
      src={candidates[idx]}
      onError={() => setIdx((i) => i + 1)}
      alt={alt}
      className="w-full h-full object-cover"
    />
  );
};

/** Grid tile: square thumbnail (or a placeholder glyph) with the label below —
 * same uppercase-tracking language as RefinerSlots.tsx's PropertyCard, but a
 * bounded card instead of a full-width divided row, sized for a scrolling
 * grid of many items rather than ~6 modifier rows. */
const NetworkCard: React.FC<{ label: string; title: string; onClick: () => void; thumbCandidates?: string[] }> = ({ label, title, onClick, thumbCandidates }) => (
  <div
    onClick={onClick}
    title={title}
    className="group flex flex-col rounded border border-base-content/10 overflow-hidden cursor-pointer select-none hover:border-primary/40 hover:bg-primary/5 transition-colors"
  >
    <div className="w-full aspect-square bg-base-content/5 flex items-center justify-center overflow-hidden">
      {thumbCandidates?.length ? <NetworkThumbnail candidates={thumbCandidates} alt={label} /> : <span className="text-base-content/10 text-2xl select-none">◈</span>}
    </div>
    <div className="px-2 py-1.5">
      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-base-content/70 group-hover:text-primary break-words line-clamp-2">
        {label}
      </span>
    </div>
  </div>
);

const ExtraNetworksPanel: React.FC<ExtraNetworksPanelProps> = ({
  supported,
  settings,
  loras,
  loadingLoras,
  embeddings,
  loadingEmbeddings,
  onRefreshLoras,
  onRefreshEmbeddings,
  onInsertLora,
  onInsertEmbedding,
}) => {
  const [activeTab, setActiveTab] = useState<NetworkTab>('lora');
  const loading = activeTab === 'lora' ? loadingLoras : loadingEmbeddings;
  const onRefresh = activeTab === 'lora' ? onRefreshLoras : onRefreshEmbeddings;

  return (
    <motion.aside
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="w-[34rem] shrink-0 h-full min-h-0 hidden lg:flex flex-col relative p-[3px] corner-frame overflow-visible"
    >
      <PanelLine position="top" delay={0.8} />
      <PanelLine position="bottom" delay={0.9} />
      <PanelLine position="left" delay={1.0} />
      <PanelLine position="right" delay={1.1} />
      <ScanLine delay={4.5} />
      <div className="flex flex-col h-full w-full overflow-visible relative z-10 bg-base-100/40 backdrop-blur-xl panel-transparent">
        {supported ? (
          <>
            <motion.header
              variants={pageHeaderVariants}
              initial="hidden"
              animate="visible"
              className="h-16 flex items-stretch flex-shrink-0 bg-base-100/80 backdrop-blur-md p-2 gap-1.5 panel-header overflow-visible relative z-[800]"
            >
              <TabButton active={activeTab === 'lora'} onClick={() => setActiveTab('lora')}>LoRA</TabButton>
              <TabButton active={activeTab === 'ti'} onClick={() => setActiveTab('ti')}>Textual Inversion</TabButton>
              <button
                onClick={onRefresh}
                disabled={loading}
                className="font-sf-mono text-[9px] tracking-widest text-base-content/40 hover:text-base-content transition-all bg-base-100/5 disabled:opacity-20 px-2 hover:bg-base-100/10 shrink-0"
                title={`Refresh ${activeTab === 'lora' ? 'LoRA' : 'textual inversion'} list from backend`}
              >
                {loading ? '...' : 'REFRESH'}
              </button>
            </motion.header>
            <motion.div
              variants={pageBodyVariants}
              initial="hidden"
              animate="visible"
              className="flex-grow overflow-y-auto custom-scrollbar p-3"
            >
              {loading ? (
                <p className="text-[10px] text-base-content/20 italic p-6 text-center">Loading…</p>
              ) : activeTab === 'lora' ? (
                loras.length === 0 ? (
                  <p className="text-[10px] text-base-content/20 italic p-6 text-center">No LoRAs found.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {groupByFolder(loras, (l) => l.alias).map(({ folder, items }) => (
                      <React.Fragment key={folder || '(root)'}>
                        {folder && (
                          <div className="col-span-3 text-[9px] font-black uppercase tracking-widest text-base-content/40 pt-2 first:pt-0 pb-1 truncate" title={folder}>
                            {folder}
                          </div>
                        )}
                        {items.map((lora) => (
                          <NetworkCard
                            key={lora.name}
                            label={leafName(lora.alias)}
                            title={`Insert <lora:${lora.alias}:1> into the prompt${folder ? ` — ${folder}` : ''}`}
                            onClick={() => onInsertLora(lora)}
                            thumbCandidates={lora.path ? getLoraPreviewCandidates(lora.path, settings) : undefined}
                          />
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                )
              ) : embeddings.length === 0 ? (
                <p className="text-[10px] text-base-content/20 italic p-6 text-center">No embeddings found.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {groupByFolder(embeddings, (name) => name).map(({ folder, items }) => (
                    <React.Fragment key={folder || '(root)'}>
                      {folder && (
                        <div className="col-span-3 text-[9px] font-black uppercase tracking-widest text-base-content/40 pt-2 first:pt-0 pb-1 truncate" title={folder}>
                          {folder}
                        </div>
                      )}
                      {items.map((name) => (
                        <NetworkCard
                          key={name}
                          label={leafName(name)}
                          title={`Insert "${name}" into the prompt${folder ? ` — ${folder}` : ''}`}
                          onClick={() => onInsertEmbedding(name)}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        ) : (
          <>
            <motion.header
              variants={pageHeaderVariants}
              initial="hidden"
              animate="visible"
              className="h-16 flex items-center flex-shrink-0 bg-base-100/80 backdrop-blur-md px-4 panel-header overflow-visible relative z-[800]"
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Extra Networks</span>
            </motion.header>
            <motion.div
              variants={pageBodyVariants}
              initial="hidden"
              animate="visible"
              className="flex-grow p-6"
            >
              <p className="text-[10px] text-base-content/25 leading-relaxed">
                LoRA and textual-inversion browsing needs the A1111/Forge API — not available for this backend.
              </p>
            </motion.div>
          </>
        )}
      </div>
      <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
      <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
      <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
      <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
    </motion.aside>
  );
};

export default ExtraNetworksPanel;
