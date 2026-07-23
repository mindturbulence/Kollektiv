import React, { useState } from 'react';
import { useResearch } from '../contexts/ResearchContext';
import { AddSourceModal } from './AddSourceModal';
import { CloseIcon, PlusIcon, BookOpenIcon } from './icons';
import { researchVault } from '../services/researchVaultService';
import { fileSystemManager } from '../utils/fileUtils';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const ResearchSourcesPanel: React.FC = () => {
  const { sources, removeSource, projectSlug } = useResearch();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  if (!projectSlug) return null;

  const openPreview = async (path: string) => {
    setPreviewFile(path);
    setPreviewLoading(true);
    setPreviewContent('');
    try {
      const fileName = path.replace(/^sources\//, '');
      const content = await researchVault.sources.readContent(projectSlug, fileName, fileSystemManager);
      setPreviewContent(content);
    } catch (e: any) {
      setPreviewContent(`Error loading source: ${e?.message || e}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="w-96 flex-shrink-0 border-r border-white/5 flex flex-col bg-base-200/20">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <span className="text-sm font-mono uppercase tracking-wider opacity-50">
          Sources
        </span>
        <span className="text-xs font-mono text-primary/60 tabular-nums">{sources.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5">
        {sources.length === 0 ? (
          <div className="text-center p-4 text-sm font-mono opacity-30">
            No sources yet.
          </div>
        ) : (
          sources.map(s => (
            <div
              key={s.path}
              className="group flex items-center justify-between px-2.5 py-2 rounded cursor-pointer hover:bg-base-300/40 text-sm border border-transparent hover:border-white/5 transition-all"
            >
              <button
                onClick={() => openPreview(s.path)}
                className="flex items-center gap-2.5 truncate text-base-content/70 hover:text-base-content min-w-0"
              >
                <BookOpenIcon className="w-3.5 h-3.5 shrink-0 text-primary/40" />
                <span className="truncate">{s.title}</span>
              </button>
              <button
                onClick={() => removeSource(s.path.replace('sources/', ''))}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-error/40 hover:text-error transition-all shrink-0"
                aria-label="Remove source"
              >
                <CloseIcon className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="p-2 border-t border-white/5">
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full btn btn-xs btn-ghost rounded-none text-primary/60 hover:text-primary gap-1.5 font-mono tracking-wider"
        >
          <PlusIcon className="w-3.5 h-3.5" /> ADD SOURCE
        </button>
      </div>
      <AddSourceModal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      {previewFile && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-base-300/50 backdrop-blur-sm p-8"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="bg-base-200 border border-white/10 max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
              <span className="text-sm font-mono uppercase tracking-wider opacity-70 truncate">
                {previewFile.replace(/^sources\//, '')}
              </span>
              <button onClick={() => setPreviewFile(null)} className="opacity-50 hover:opacity-100" aria-label="Close preview">
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              {previewLoading ? (
                <div className="text-sm font-mono opacity-40">Loading…</div>
              ) : (
                <div className="prose prose-base prose-invert max-w-none">
                  <Markdown remarkPlugins={[remarkGfm]}>{previewContent}</Markdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
